/**
 * Mutating Kubernetes actions used to actually remediate an alert.
 *
 * Everything here changes a live cluster, so the set is deliberately small and
 * biased toward the reversible: a rollout restart, a pod delete the controller
 * will recreate, a replica count change. Deleting workloads, draining nodes and
 * editing RBAC are NOT here — those belong to a human with a change window.
 *
 * Each action reports `risk` and `reversible` so the approval step can tell an
 * operator what they are agreeing to, and returns a `verify` command they can
 * run themselves afterwards.
 */

const k8s = require('@kubernetes/client-node');

function getClients() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return {
    core: kc.makeApiClient(k8s.CoreV1Api),
    apps: kc.makeApiClient(k8s.AppsV1Api),
  };
}

const unwrap = (res) => (res && res.body) || res || {};

/** Walk ownerReferences from a pod up to the Deployment/StatefulSet/DaemonSet. */
async function resolveOwner(namespace, name, kind = 'pod') {
  const { core, apps } = getClients();
  let targetKind = String(kind || 'pod').toLowerCase();
  let targetName = name;

  if (targetKind !== 'pod') return { kind: targetKind, name: targetName };

  const pod = unwrap(await core.readNamespacedPod(name, namespace));
  const owner = (pod.metadata?.ownerReferences || [])[0];
  if (!owner) return { kind: 'pod', name, bare: true };

  if (owner.kind === 'ReplicaSet') {
    const rs = unwrap(await apps.readNamespacedReplicaSet(owner.name, namespace));
    const rsOwner = (rs.metadata?.ownerReferences || [])[0];
    if (rsOwner) return { kind: rsOwner.kind.toLowerCase(), name: rsOwner.name };
    return { kind: 'replicaset', name: owner.name };
  }
  return { kind: owner.kind.toLowerCase(), name: owner.name };
}

const PATCH_OPTS = {
  headers: { 'Content-Type': 'application/strategic-merge-patch+json' },
};

function patchArgs(name, namespace, patch) {
  return [name, namespace, patch, undefined, undefined, undefined, undefined, undefined, PATCH_OPTS];
}

async function patchWorkload(kind, name, namespace, patch) {
  const { apps } = getClients();
  const args = patchArgs(name, namespace, patch);
  if (kind === 'deployment') return unwrap(await apps.patchNamespacedDeployment(...args));
  if (kind === 'statefulset') return unwrap(await apps.patchNamespacedStatefulSet(...args));
  if (kind === 'daemonset') return unwrap(await apps.patchNamespacedDaemonSet(...args));
  throw new Error(`Cannot patch kind '${kind}' — supported: deployment, statefulset, daemonset.`);
}

/**
 * Rolling restart: the same thing `kubectl rollout restart` does — stamp a new
 * annotation on the pod template so the controller rolls pods one at a time.
 * Safe on anything with more than one replica; brief downtime at replicas=1.
 */
async function restartWorkload({ namespace, name, kind = 'pod' }) {
  const owner = await resolveOwner(namespace, name, kind);
  if (owner.bare) {
    throw new Error(`Pod ${name} has no controller, so a restart would not recreate it. Delete it only if you have a manifest to reapply.`);
  }
  const stamp = new Date().toISOString();
  await patchWorkload(owner.kind, owner.name, namespace, {
    spec: { template: { metadata: { annotations: { 'aiops.restartedAt': stamp } } } },
  });
  return {
    action: 'restart_workload',
    target: `${owner.kind}/${owner.name}`,
    namespace,
    detail: `Rolling restart triggered at ${stamp}`,
    verify: `kubectl -n ${namespace} rollout status ${owner.kind}/${owner.name}`,
  };
}

/**
 * Delete one pod and let its controller recreate it. The narrowest blast radius
 * available for a single stuck replica.
 */
async function deletePod({ namespace, name }) {
  const { core } = getClients();
  const pod = unwrap(await core.readNamespacedPod(name, namespace));
  if (!(pod.metadata?.ownerReferences || []).length) {
    throw new Error(`Pod ${name} is not managed by a controller — deleting it would remove it permanently.`);
  }
  await core.deleteNamespacedPod(name, namespace);
  return {
    action: 'delete_pod',
    target: `pod/${name}`,
    namespace,
    detail: 'Pod deleted; its controller will recreate it.',
    verify: `kubectl -n ${namespace} get pod -w | grep ${name.split('-').slice(0, -2).join('-') || name}`,
  };
}

/** Change replica count — the fix for a workload scaled below what it needs. */
async function scaleWorkload({ namespace, name, kind = 'deployment', replicas }) {
  const target = Number(replicas);
  if (!Number.isInteger(target) || target < 0 || target > 100) {
    throw new Error(`Refusing to scale to '${replicas}' — give a whole number between 0 and 100.`);
  }
  const owner = await resolveOwner(namespace, name, kind);
  if (owner.kind === 'daemonset') {
    throw new Error('A DaemonSet runs one pod per node and cannot be scaled by replica count.');
  }
  await patchWorkload(owner.kind, owner.name, namespace, { spec: { replicas: target } });
  return {
    action: 'scale_workload',
    target: `${owner.kind}/${owner.name}`,
    namespace,
    detail: `Replicas set to ${target}`,
    verify: `kubectl -n ${namespace} get ${owner.kind} ${owner.name}`,
  };
}

/**
 * Delete a PersistentVolumeClaim that never bound, so its controller recreates
 * it from the current template.
 *
 * This is the fix for a PVC created against a StorageClass that no longer
 * exists (or was wrong) once the owning template has been corrected: the claim
 * itself is stale, and nothing can rebind it in place because
 * `spec.storageClassName` is immutable.
 *
 * ⚠ It refuses unless the claim is Pending AND has no `volumeName`. A BOUND PVC
 * holds real data and deleting it can destroy that data permanently — an
 * unbound one never provisioned storage, so there is nothing to lose. That
 * check is the entire safety case for this action; do not relax it.
 */
async function deleteUnboundPvc({ namespace, name }) {
  const { core } = getClients();
  const pvc = unwrap(await core.readNamespacedPersistentVolumeClaim(name, namespace));

  const phase = pvc.status?.phase;
  const bound = Boolean(pvc.spec?.volumeName);
  if (phase !== 'Pending' || bound) {
    throw new Error(
      `Refusing to delete PVC ${name}: it is ${phase}${bound ? ` and bound to ${pvc.spec.volumeName}` : ''}. `
      + 'Only an unbound, Pending claim can be deleted safely — a bound claim holds data.'
    );
  }

  await core.deleteNamespacedPersistentVolumeClaim(name, namespace);
  return {
    action: 'delete_unbound_pvc',
    target: `pvc/${name}`,
    namespace,
    detail: `Unbound PVC deleted (was requesting storageClass "${pvc.spec?.storageClassName || 'none'}"); `
      + 'its controller will recreate it from the current template.',
    verify: `kubectl -n ${namespace} get pvc ${name} -w`,
  };
}

/**
 * What each action is, for the approval prompt. `mutating` drives whether an
 * operator is asked at all.
 */
const ACTIONS = {
  restart_workload: {
    run: restartWorkload,
    mutating: true,
    risk: 'medium',
    reversible: true,
    summary: ({ namespace, name }) => `Rolling-restart the controller owning ${name} in ns/${namespace}`,
  },
  delete_pod: {
    run: deletePod,
    mutating: true,
    risk: 'medium',
    reversible: true,
    summary: ({ namespace, name }) => `Delete pod ${name} in ns/${namespace} and let its controller recreate it`,
  },
  delete_unbound_pvc: {
    run: deleteUnboundPvc,
    mutating: true,
    risk: 'medium',
    reversible: true,
    summary: ({ namespace, name }) => `Delete the unbound PersistentVolumeClaim ${name} in ns/${namespace} so its controller recreates it`,
  },
  scale_workload: {
    run: scaleWorkload,
    mutating: true,
    risk: 'high',
    reversible: true,
    summary: ({ namespace, name, replicas }) => `Scale ${name} in ns/${namespace} to ${replicas} replicas`,
  },
};

function describeAction(action, params) {
  const def = ACTIONS[action];
  if (!def) return null;
  return {
    action,
    summary: def.summary(params || {}),
    risk: def.risk,
    reversible: def.reversible,
    mutating: def.mutating,
    params,
  };
}

async function runAction(action, params) {
  const def = ACTIONS[action];
  if (!def) throw new Error(`Unknown action '${action}'. Available: ${Object.keys(ACTIONS).join(', ')}`);
  return def.run(params || {});
}

module.exports = {
  ACTIONS, describeAction, runAction,
  restartWorkload, deletePod, scaleWorkload, deleteUnboundPvc, resolveOwner,
};

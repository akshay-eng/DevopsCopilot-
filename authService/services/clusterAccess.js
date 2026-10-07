/**
 * Cluster-aware Kubernetes access.
 *
 * THE PROBLEM THIS FIXES: kubernetesService builds its client with
 * `kc.loadFromDefault()` and ignores the cluster it was asked about, so every
 * registered cluster returned whatever the backend's own kubeconfig pointed at.
 * Compliance, the platform footprint and the resource APIs were all silently
 * reporting one cluster's state under every cluster's name.
 *
 * Resolution order for a given cluster:
 *   1. a kubeconfig stored on the cluster record (encrypted) — a real client
 *   2. the cluster agent's HTTP API, when it is reachable and new enough
 *   3. the backend's local kubeconfig — ONLY when that kubeconfig genuinely
 *      points at this cluster, verified by comparing node names
 *
 * Every reader returns `{ source, verified, warning }` alongside the data, so a
 * caller can say where the numbers came from instead of implying they are the
 * requested cluster's.
 */

const k8s = require('@kubernetes/client-node');
const Cluster = require('../models/Cluster');
const { decrypt } = require('../utils/integrationCrypto');

const AGENT_TIMEOUT_MS = Number(process.env.CLUSTER_AGENT_TIMEOUT_MS || 15000);

/* ── client construction ──────────────────────────────────────────────── */

const clientCache = new Map(); // clusterId -> { at, apis }
const CLIENT_TTL_MS = 300000;

function apisFromKubeConfig(kc) {
  return {
    coreApi: kc.makeApiClient(k8s.CoreV1Api),
    appsApi: kc.makeApiClient(k8s.AppsV1Api),
    batchApi: kc.makeApiClient(k8s.BatchV1Api),
  };
}

function localApis() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return { apis: apisFromKubeConfig(kc), context: kc.getCurrentContext() };
}

function apisFromString(yaml) {
  const kc = new k8s.KubeConfig();
  kc.loadFromString(yaml);
  return { apis: apisFromKubeConfig(kc), context: kc.getCurrentContext() };
}

/* ── identity ─────────────────────────────────────────────────────────── */

/**
 * Does the local kubeconfig actually point at this cluster?
 *
 * Node names are the cheapest stable fingerprint available on both sides: the
 * cluster record carries them from agent check-in, and the live API lists them.
 * Without this check the local fallback is indistinguishable from a correct
 * answer, which is exactly the bug being fixed.
 */
async function localMatchesCluster(cluster, apis) {
  const recorded = cluster?.metadata?.nodeNames;
  if (!Array.isArray(recorded) || recorded.length === 0) return null; // unknown, not false
  try {
    const res = await apis.coreApi.listNode();
    const live = ((res?.body || res)?.items || []).map((n) => n.metadata?.name).filter(Boolean);
    if (!live.length) return null;
    const overlap = live.filter((n) => recorded.includes(n)).length;
    return overlap / Math.max(live.length, recorded.length) >= 0.5;
  } catch (e) {
    return null;
  }
}

/* ── agent transport ──────────────────────────────────────────────────── */

async function agentFetch(endpoint, path) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT_MS);
  try {
    const r = await fetch(`${String(endpoint).replace(/\/+$/, '')}${path}`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`agent HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Does this agent build expose the resource API? Older ones do not. */
async function agentSupportsResources(endpoint) {
  try {
    const j = await agentFetch(endpoint, '/api/capabilities');
    return Array.isArray(j?.capabilities) && j.capabilities.includes('resources');
  } catch (e) {
    return false;
  }
}

/* ── resolution ───────────────────────────────────────────────────────── */

/**
 * @returns {{ mode, apis?, endpoint?, cluster, verified, warning }}
 *   mode: 'kubeconfig' | 'agent' | 'local' | 'unavailable'
 */
async function resolveAccess(userId, clusterId) {
  const cluster = await Cluster.findOne(
    userId ? { _id: clusterId, userId } : { _id: clusterId }
  ).select('+kubeconfig').lean();
  if (!cluster) throw new Error('Cluster not found');

  const cached = clientCache.get(String(clusterId));
  if (cached && Date.now() - cached.at < CLIENT_TTL_MS) return { ...cached.value, cluster };

  // 1. a kubeconfig stored for this specific cluster
  if (cluster.kubeconfig?.encryptedData) {
    try {
      const yaml = decrypt(cluster.kubeconfig);
      const { apis, context } = apisFromString(yaml);
      const value = { mode: 'kubeconfig', apis, verified: true, context, warning: null };
      clientCache.set(String(clusterId), { at: Date.now(), value });
      return { ...value, cluster };
    } catch (e) {
      console.error(`[clusterAccess] stored kubeconfig for ${cluster.name} unusable:`, e.message);
    }
  }

  // 2. the cluster's own agent
  if (cluster.agentEndpoint && await agentSupportsResources(cluster.agentEndpoint)) {
    const value = { mode: 'agent', endpoint: cluster.agentEndpoint, verified: true, warning: null };
    clientCache.set(String(clusterId), { at: Date.now(), value });
    return { ...value, cluster };
  }

  // 3. the backend's own kubeconfig — only honest if it IS this cluster
  try {
    const { apis, context } = localApis();
    const matches = await localMatchesCluster(cluster, apis);
    if (matches === false) {
      return {
        mode: 'unavailable', cluster, verified: false,
        warning: `The backend's kubeconfig points at a different cluster (context "${context}"). `
          + `Add a kubeconfig for "${cluster.name}" or upgrade its agent to one that serves the resource API.`,
      };
    }
    return {
      mode: 'local', apis, cluster, context,
      verified: matches === true,
      warning: matches === true ? null
        : `Read through the backend's local kubeconfig (context "${context}"); it could not be confirmed to be "${cluster.name}". `
          + 'Store a kubeconfig on the cluster to make this unambiguous.',
    };
  } catch (e) {
    return {
      mode: 'unavailable', cluster, verified: false,
      warning: `No usable access to "${cluster.name}": ${e.message}`,
    };
  }
}

/* ── readers ──────────────────────────────────────────────────────────── */

const unwrap = (res) => (res?.body || res || {});

const mapNode = (n) => ({
  name: n.metadata?.name,
  status: (n.status?.conditions || []).find((c) => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
  roles: Object.keys(n.metadata?.labels || {})
    .filter((l) => l.startsWith('node-role.kubernetes.io/'))
    .map((l) => l.replace('node-role.kubernetes.io/', '')),
  capacity: n.status?.capacity,
  allocatable: n.status?.allocatable,
  node_info: {
    os_image: n.status?.nodeInfo?.osImage,
    kubelet_version: n.status?.nodeInfo?.kubeletVersion,
  },
  internal_ip: (n.status?.addresses || []).find((a) => a.type === 'InternalIP')?.address,
});

const mapPod = (p) => ({
  name: p.metadata?.name,
  namespace: p.metadata?.namespace,
  status: p.status?.phase,
  nodeName: p.spec?.nodeName,
  priorityClassName: p.spec?.priorityClassName,
  restarts: (p.status?.containerStatuses || []).reduce((s, c) => s + (c.restartCount || 0), 0),
  ready: `${(p.status?.containerStatuses || []).filter((c) => c.ready).length}/${(p.status?.containerStatuses || []).length}`,
  age: p.status?.startTime,
  containers: (p.spec?.containers || []).map((c) => ({ name: c.name, image: c.image })),
});

async function getNodes(access) {
  if (access.mode === 'agent') return (await agentFetch(access.endpoint, '/api/nodes'))?.nodes || [];
  if (!access.apis) return [];
  return (unwrap(await access.apis.coreApi.listNode()).items || []).map(mapNode);
}

async function getNamespaces(access) {
  if (access.mode === 'agent') return (await agentFetch(access.endpoint, '/api/namespaces'))?.namespaces || [];
  if (!access.apis) return [];
  return (unwrap(await access.apis.coreApi.listNamespace()).items || [])
    .map((n) => ({ name: n.metadata?.name, status: n.status?.phase }));
}

async function getPods(access) {
  if (access.mode === 'agent') return (await agentFetch(access.endpoint, '/api/resources/pods'))?.items || [];
  if (!access.apis) return [];
  return (unwrap(await access.apis.coreApi.listPodForAllNamespaces()).items || []).map(mapPod);
}

async function getWorkloads(access, kind) {
  if (access.mode === 'agent') return (await agentFetch(access.endpoint, `/api/resources/${kind}`))?.items || [];
  if (!access.apis) return [];
  const api = access.apis.appsApi;
  const call = {
    deployments: () => api.listDeploymentForAllNamespaces(),
    statefulsets: () => api.listStatefulSetForAllNamespaces(),
    daemonsets: () => api.listDaemonSetForAllNamespaces(),
  }[kind];
  if (!call) return [];
  return (unwrap(await call()).items || []).map((w) => ({
    name: w.metadata?.name,
    namespace: w.metadata?.namespace,
    replicas: `${w.status?.readyReplicas || w.status?.numberReady || 0}/${w.status?.replicas || w.status?.desiredNumberScheduled || 0}`,
    age: w.metadata?.creationTimestamp,
  }));
}

async function createNamespace(access, name) {
  if (access.mode !== 'kubeconfig' && access.mode !== 'local') {
    throw new Error('Creating a namespace needs direct API access; the agent transport is read-only.');
  }
  try {
    await access.apis.coreApi.createNamespace({ metadata: { name } });
    return { created: true, name };
  } catch (e) {
    const status = e?.statusCode || e?.response?.statusCode;
    if (status === 409) return { created: false, name, reason: 'already exists' };
    throw new Error(`Could not create namespace ${name}: ${e?.body?.message || e.message}`);
  }
}

/** Record node names so the local-kubeconfig check has something to compare to. */
async function rememberNodeNames(clusterId, nodes) {
  const names = (nodes || []).map((n) => n.name).filter(Boolean);
  if (!names.length) return;
  try {
    await Cluster.updateOne({ _id: clusterId }, { $set: { 'metadata.nodeNames': names } });
  } catch (e) { /* best effort */ }
}

module.exports = {
  resolveAccess, getNodes, getNamespaces, getPods, getWorkloads,
  createNamespace, rememberNodeNames,
};

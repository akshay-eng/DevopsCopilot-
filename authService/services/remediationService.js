/**
 * Remediation Service
 *
 * Drives the "Remediate" action for a vulnerability:
 *   1. Log a change request (ServiceNow if the `snow` integration is configured,
 *      otherwise a local synthetic ticket so the flow still works in dev).
 *   2. Compute the fix (roll the affected container to a fixed image tag).
 *   3. Optionally apply the patch to the owning workload.
 *
 * These functions are also exposed as agent tools (the Pi agent calls the same
 * code), so the agentic and button-driven paths stay identical.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const k8s = require('@kubernetes/client-node');
const { getIntegrationConfig } = require('../utils/integrationCrypto');

function getClients() {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();
  return { core: kc.makeApiClient(k8s.CoreV1Api), apps: kc.makeApiClient(k8s.AppsV1Api) };
}
const unwrap = (res) => (res && res.body) || res || {};

/** Minimal JSON HTTP client (no extra deps) for the ServiceNow Table API. */
function httpJson(method, urlStr, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (_) { parsed = data; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, body: parsed });
        else reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode, body: parsed }));
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('ServiceNow request timed out')));
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Create a change request describing the remediation.
 * Uses ServiceNow if configured; otherwise returns a local ticket.
 */
async function createChangeRequest(userId, { resource, vulnerabilities, plan }) {
  const cveList = vulnerabilities.slice(0, 20).map((v) => v.id).join(', ');
  const shortDescription = `Remediate ${vulnerabilities.length} vulnerabilit${vulnerabilities.length === 1 ? 'y' : 'ies'} in ${resource.kind}/${resource.name}`;
  const description = [
    `Namespace: ${resource.namespace}`,
    `Workload: ${resource.kind}/${resource.name}`,
    `Container: ${plan.container || 'n/a'}`,
    `Current image: ${plan.currentImage || 'n/a'}`,
    `Proposed image: ${plan.targetImage || '(upgrade base image)'}`,
    ``,
    `CVEs: ${cveList}${vulnerabilities.length > 20 ? ' …' : ''}`,
    ``,
    `Raised automatically by AIOps DevOps Copilot vulnerability remediation.`,
  ].join('\n');

  const snow = await getIntegrationConfig(userId, 'snow');
  if (snow && snow.instance_url && snow.username && snow.password) {
    try {
      const base = snow.instance_url.replace(/\/+$/, '');
      const auth = 'Basic ' + Buffer.from(`${snow.username}:${snow.password}`).toString('base64');
      const { body } = await httpJson('POST', `${base}/api/now/table/change_request`, {
        headers: { Authorization: auth },
        body: {
          short_description: shortDescription,
          description,
          category: 'Software',
          type: 'normal',
          risk: vulnerabilities.some((v) => v.severity === 'CRITICAL') ? '2' : '3',
          impact: '2',
        },
      });
      const rec = body?.result || {};
      return {
        system: 'servicenow',
        number: rec.number,
        sysId: rec.sys_id,
        url: rec.sys_id ? `${base}/nav_to.do?uri=change_request.do?sys_id=${rec.sys_id}` : base,
        shortDescription,
      };
    } catch (e) {
      console.error('ServiceNow change request failed:', e.message);
      return { system: 'servicenow', error: e.message, shortDescription, number: null };
    }
  }

  // Fallback local ticket so the flow is demoable without ServiceNow.
  return {
    system: 'local',
    number: `CHG-LOCAL-${Date.now().toString().slice(-6)}`,
    sysId: null,
    url: null,
    shortDescription,
    note: 'No ServiceNow integration configured — created a local change record.',
  };
}

/** Build a remediation plan from the selected vulnerabilities. */
function buildPlan({ container, currentImage, targetImage, vulnerabilities }) {
  // If a target image was not supplied, suggest bumping to the highest fixed
  // package version referenced by the CVEs (surfaced to the user as guidance).
  const fixable = vulnerabilities.filter((v) => v.fixable);
  return {
    container,
    currentImage,
    targetImage: targetImage || null,
    fixableCount: fixable.length,
    unfixableCount: vulnerabilities.length - fixable.length,
    steps: [
      'Open a change request for the remediation.',
      targetImage
        ? `Patch ${container} image → ${targetImage}.`
        : 'Rebuild/upgrade the base image to pick up fixed package versions, then set the new tag.',
      'Roll the workload and re-scan to confirm the CVEs are cleared.',
    ],
  };
}

/**
 * Patch a workload's container image (strategic merge patch).
 * Resolves pods to their owning Deployment/StatefulSet/DaemonSet.
 */
async function applyImagePatch({ namespace, kind, name, container, image }) {
  const { core, apps } = getClients();
  let targetKind = (kind || '').toLowerCase();
  let targetName = name;

  if (targetKind === 'pod') {
    const pod = unwrap(await core.readNamespacedPod(name, namespace));
    const owner = (pod.metadata?.ownerReferences || [])[0];
    if (owner?.kind === 'ReplicaSet') {
      const rs = unwrap(await apps.readNamespacedReplicaSet(owner.name, namespace));
      const rsOwner = (rs.metadata?.ownerReferences || [])[0];
      if (rsOwner) { targetKind = rsOwner.kind.toLowerCase(); targetName = rsOwner.name; }
      else { targetKind = 'replicaset'; targetName = owner.name; }
    } else if (owner) {
      targetKind = owner.kind.toLowerCase();
      targetName = owner.name;
    } else {
      throw new Error('Bare pod has no controller to patch; recreate the pod with a fixed image.');
    }
  }

  const patch = { spec: { template: { spec: { containers: [{ name: container, image }] } } } };
  const options = { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } };
  const args = [targetName, namespace, patch, undefined, undefined, undefined, undefined, undefined, options];

  if (targetKind === 'deployment') await apps.patchNamespacedDeployment(...args);
  else if (targetKind === 'statefulset') await apps.patchNamespacedStatefulSet(...args);
  else if (targetKind === 'daemonset') await apps.patchNamespacedDaemonSet(...args);
  else throw new Error(`Cannot patch image on kind '${targetKind}'.`);

  return { patchedKind: targetKind, patchedName: targetName, container, image };
}

/**
 * Full remediation entrypoint used by the route and the agent.
 * @param apply if true, actually patch the workload; else ticket + plan only.
 */
async function remediate(userId, { resource, vulnerabilities, container, currentImage, targetImage, apply = false }) {
  const steps = [];
  const plan = buildPlan({ container, currentImage, targetImage, vulnerabilities });

  const ticket = await createChangeRequest(userId, { resource, vulnerabilities, plan });
  steps.push({
    label: 'Change request',
    status: ticket.error ? 'failed' : 'done',
    detail: ticket.error ? ticket.error : `${ticket.number || 'created'} (${ticket.system})`,
    ticket,
  });

  let patchResult = null;
  if (apply && targetImage && container) {
    try {
      patchResult = await applyImagePatch({ ...resource, container, image: targetImage });
      steps.push({ label: 'Apply patch', status: 'done', detail: `${patchResult.patchedKind}/${patchResult.patchedName} → ${targetImage}` });
    } catch (e) {
      steps.push({ label: 'Apply patch', status: 'failed', detail: e.message });
    }
  } else {
    steps.push({
      label: 'Apply patch',
      status: 'skipped',
      detail: targetImage ? 'Approval required to apply.' : 'No fixed image tag available — upgrade base image first.',
    });
  }

  steps.push({ label: 'Re-scan', status: 'pending', detail: 'Trivy Operator will re-scan on its next cycle to confirm the fix.' });

  return {
    resource,
    plan,
    ticket,
    patchResult,
    steps,
    startedAt: new Date().toISOString(),
  };
}

module.exports = { remediate, createChangeRequest, applyImagePatch, buildPlan };

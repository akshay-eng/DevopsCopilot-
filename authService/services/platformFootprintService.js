/**
 * What this platform costs the cluster it monitors.
 *
 * An observability stack that quietly eats a node's worth of RAM is a problem
 * the operator deserves to see, so this reports the health AND the resource
 * footprint of everything the Helm chart installs — agent, Prometheus, Trivy,
 * OpenCost — using live usage from Prometheus rather than requests alone.
 *
 * Requests say what was reserved; usage says what is really consumed. Both are
 * returned because the gap between them is the interesting part.
 */

const clusterAccess = require('./clusterAccess');

const PROMETHEUS_URL = (process.env.PROMETHEUS_URL || 'http://localhost:9090').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.PROM_TIMEOUT_MS || 20000);

/**
 * The components this platform installs, matched by namespace and/or a name
 * pattern. Declared here so adding a component to the chart means adding one
 * line, not editing query strings.
 */
const COMPONENTS = [
  { id: 'cluster-agent', label: 'Cluster Agent', namespaces: ['devopscopilot'], match: /cluster-agent|devopscopilot/i, chart: 'devopscopilot' },
  { id: 'prometheus', label: 'Prometheus & exporters', namespaces: ['monitoring'], match: /prometheus|node-exporter|kube-state-metrics|alertmanager/i, chart: 'monitoring' },
  { id: 'trivy', label: 'Trivy Operator', namespaces: ['trivy-system'], match: /trivy/i, chart: 'vulnerabilityScanning' },
  { id: 'opencost', label: 'OpenCost', namespaces: ['opencost'], match: /opencost/i, chart: 'costMonitoring' },
  { id: 'network-monitor', label: 'Network Monitor', namespaces: ['network-monitor'], match: /network-monitor/i, chart: 'networkMonitor' },
  { id: 'alert-webhook', label: 'Alert Webhook', namespaces: ['alerts'], match: /alert-webhook/i, chart: 'alerting' },
];

const promQuery = async (query) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const u = new URL(`${PROMETHEUS_URL}/api/v1/query`);
    u.searchParams.set('query', query);
    const r = await fetch(u.toString(), { signal: ctrl.signal });
    if (!r.ok) throw new Error(`prometheus ${r.status}`);
    const j = await r.json();
    return j?.data?.result || [];
  } finally { clearTimeout(t); }
};

/** `result` rows keyed by a label, summed. */
const byLabel = (rows, label) => {
  const out = {};
  for (const row of rows || []) {
    const k = row.metric?.[label];
    if (!k) continue;
    const v = Number(row.value?.[1]);
    if (Number.isFinite(v)) out[k] = (out[k] || 0) + v;
  }
  return out;
};

const parseCpu = (v) => {
  if (!v) return 0;
  const s = String(v);
  return /m$/.test(s) ? (parseInt(s, 10) || 0) / 1000 : parseFloat(s) || 0;
};
const parseMemBytes = (v) => {
  if (!v) return 0;
  const s = String(v); const n = parseFloat(s) || 0;
  if (/Ki$/i.test(s)) return n * 1024;
  if (/Mi$/i.test(s)) return n * 1048576;
  if (/Gi$/i.test(s)) return n * 1073741824;
  return n;
};

const round = (v, dp = 2) => Math.round((Number(v) || 0) * 10 ** dp) / 10 ** dp;

/**
 * @returns per-component health + footprint, and the fleet share it represents.
 */
async function getPlatformFootprint({ userId, clusterId } = {}) {
  let access = null;
  if (clusterId) {
    access = await clusterAccess.resolveAccess(userId, clusterId);
    if (access.mode === 'unavailable') {
      return { available: false, reason: access.warning, dataSource: { mode: access.mode, verified: false } };
    }
  } else {
    // No cluster named: fall back to the local kubeconfig, and say so.
    const k8s = require('@kubernetes/client-node');
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    access = {
      mode: 'local', verified: false, context: kc.getCurrentContext(),
      apis: {
        coreApi: kc.makeApiClient(k8s.CoreV1Api),
        appsApi: kc.makeApiClient(k8s.AppsV1Api),
        batchApi: kc.makeApiClient(k8s.BatchV1Api),
      },
      warning: 'No cluster specified — read through the backend\'s local kubeconfig.',
    };
  }

  const [podsRaw, nodesRaw] = await Promise.all([
    clusterAccess.getPods(access).catch(() => []),
    clusterAccess.getNodes(access).catch(() => []),
  ]);

  // Live usage by pod. If Prometheus is unavailable these come back empty and
  // the response says so rather than reporting zero usage as fact.
  let cpuByPod = {};
  let memByPod = {};
  let promOk = true;
  try {
    const [cpuRows, memRows] = await Promise.all([
      promQuery('sum by (pod) (rate(container_cpu_usage_seconds_total{container!="",container!="POD"}[5m]))'),
      promQuery('sum by (pod) (container_memory_working_set_bytes{container!="",container!="POD"})'),
    ]);
    cpuByPod = byLabel(cpuRows, 'pod');
    memByPod = byLabel(memRows, 'pod');
  } catch (e) { promOk = false; }

  const components = COMPONENTS.map((c) => {
    const pods = podsRaw.filter((p) => {
      const inNs = c.namespaces.includes(p.namespace);
      return inNs || (c.match.test(String(p.name || '')) && !COMPONENTS.some(
        (o) => o.id !== c.id && o.namespaces.includes(p.namespace)
      ));
    });
    if (!pods.length) {
      return {
        id: c.id, label: c.label, chart: c.chart, installed: false,
        pods: [], podCount: 0, running: 0, restarts: 0,
        cpuCores: 0, memoryBytes: 0, status: 'not-installed',
      };
    }

    let cpu = 0; let mem = 0; let restarts = 0; let running = 0;
    const detail = pods.map((p) => {
      const pc = cpuByPod[p.name] || 0;
      const pm = memByPod[p.name] || 0;
      cpu += pc; mem += pm;
      restarts += Number(p.restarts) || 0;
      // Succeeded is a finished job pod (Trivy creates one per scan), not a
      // failure — counting it as unhealthy would cry wolf on every scan.
      if (p.status === 'Running' || p.status === 'Succeeded') running += 1;
      return {
        name: p.name, namespace: p.namespace, status: p.status,
        ready: p.ready, restarts: Number(p.restarts) || 0,
        cpuCores: round(pc, 4), memoryBytes: Math.round(pm),
        node: p.nodeName,
      };
    });

    const unhealthy = pods.length - running;
    const notReady = detail.filter((d) => d.status !== 'Running' && d.status !== 'Succeeded');
    return {
      id: c.id, label: c.label, chart: c.chart, installed: true,
      namespaces: [...new Set(pods.map((p) => p.namespace))],
      podCount: pods.length, running, restarts,
      cpuCores: round(cpu, 4),
      memoryBytes: Math.round(mem),
      memoryMi: round(mem / 1048576, 1),
      status: unhealthy > 0 ? 'degraded' : restarts > 10 ? 'unstable' : 'healthy',
      // Name what is wrong, so the UI does not just say "degraded".
      issues: notReady.map((d) => `${d.name} is ${d.status}`),
      pods: detail.sort((a, b) => b.memoryBytes - a.memoryBytes),
    };
  });

  const installed = components.filter((c) => c.installed);
  const totalCpu = installed.reduce((s, c) => s + c.cpuCores, 0);
  const totalMem = installed.reduce((s, c) => s + c.memoryBytes, 0);
  const totalPods = installed.reduce((s, c) => s + c.podCount, 0);

  const fleetCpu = nodesRaw.reduce((s, n) => s + parseCpu(n.capacity?.cpu), 0);
  const fleetMem = nodesRaw.reduce((s, n) => s + parseMemBytes(n.capacity?.memory), 0);

  return {
    available: true,
    dataSource: {
      mode: access.mode, verified: !!access.verified,
      context: access.context || null, warning: access.warning || null,
    },
    promAvailable: promOk && (Object.keys(cpuByPod).length > 0 || Object.keys(memByPod).length > 0),
    components,
    totals: {
      pods: totalPods,
      cpuCores: round(totalCpu, 3),
      memoryBytes: totalMem,
      memoryMi: round(totalMem / 1048576, 1),
      memoryGi: round(totalMem / 1073741824, 2),
      restarts: installed.reduce((s, c) => s + c.restarts, 0),
      unhealthy: installed.filter((c) => c.status !== 'healthy').length,
    },
    fleet: {
      cpuCores: round(fleetCpu, 2),
      memoryBytes: fleetMem,
      memoryGi: round(fleetMem / 1073741824, 1),
      nodes: nodesRaw.length,
      totalPods: podsRaw.length,
    },
    share: {
      cpuPct: fleetCpu ? round((totalCpu / fleetCpu) * 100, 2) : null,
      memoryPct: fleetMem ? round((totalMem / fleetMem) * 100, 2) : null,
      podPct: podsRaw.length ? round((totalPods / podsRaw.length) * 100, 1) : null,
    },
  };
}

module.exports = { getPlatformFootprint, COMPONENTS };

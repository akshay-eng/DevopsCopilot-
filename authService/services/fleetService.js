/**
 * Fleet-wide rollup: one call that describes EVERY connected cluster.
 *
 * The Trends page used to make the operator pick a cluster from a dropdown and
 * then showed one cluster's numbers. This returns the whole estate, with each
 * row carrying its `cluster`, so the UI can group or split by cluster without a
 * separate "by cluster" variant of each dataset.
 *
 * Honesty rules carried through from the per-cluster services:
 *  - a cluster the backend cannot verifiably read is listed in `unreachable`
 *    with the reason, never silently folded into the totals;
 *  - Prometheus-derived history is bounded by retention, which is reported;
 *  - cost comes from a configured price list, not a bill.
 */

const Cluster = require('../models/Cluster');
const Alert = require('../models/Alert');
const clusterAccess = require('./clusterAccess');
const { getCostSummary } = require('./costService');
const { retentionHours } = require('./clusterHistoryService');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (v, dp = 2) => Math.round(num(v) * 10 ** dp) / 10 ** dp;

const parseCpu = (v) => {
  if (!v) return 0;
  const s = String(v);
  return /m$/.test(s) ? (parseInt(s, 10) || 0) / 1000 : parseFloat(s) || 0;
};
const parseMemGi = (v) => {
  if (!v) return 0;
  const s = String(v); const n = parseFloat(s) || 0;
  if (/Ki$/i.test(s)) return n / 1048576;
  if (/Mi$/i.test(s)) return n / 1024;
  if (/Gi$/i.test(s)) return n;
  if (/Ti$/i.test(s)) return n * 1024;
  return n / 1073741824;
};
const days = (iso) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);

const parseImageRef = (ref = '') => {
  const noDigest = String(ref).split('@')[0];
  const slash = noDigest.lastIndexOf('/');
  const last = noDigest.slice(slash + 1);
  const colon = last.lastIndexOf(':');
  const tag = colon > -1 ? last.slice(colon + 1) : 'latest';
  const repo = colon > -1 ? noDigest.slice(0, noDigest.length - (last.length - colon)) : noDigest;
  return { repo, tag };
};

/** Read one cluster's Kubernetes state; never throws. */
async function readCluster(userId, cluster) {
  const id = String(cluster._id);
  const base = { id, name: cluster.name, status: cluster.status };
  let access;
  try {
    access = await clusterAccess.resolveAccess(userId, id);
  } catch (e) {
    return { ...base, reachable: false, reason: e.message };
  }
  if (access.mode === 'unavailable') {
    return { ...base, reachable: false, reason: access.warning };
  }

  const safe = (fn) => fn().catch(() => []);
  const [nodes, namespaces, pods, deployments, statefulsets] = await Promise.all([
    safe(() => clusterAccess.getNodes(access)),
    safe(() => clusterAccess.getNamespaces(access)),
    safe(() => clusterAccess.getPods(access)),
    safe(() => clusterAccess.getWorkloads(access, 'deployments')),
    safe(() => clusterAccess.getWorkloads(access, 'statefulsets')),
  ]);

  return {
    ...base,
    reachable: true,
    verified: !!access.verified,
    accessMode: access.mode,
    nodes, namespaces, pods,
    workloads: [
      ...deployments.map((w) => ({ ...w, kind: 'Deployment' })),
      ...statefulsets.map((w) => ({ ...w, kind: 'StatefulSet' })),
    ],
  };
}

/** Flatten every cluster's rows into fleet datasets the AI composer can query. */
function buildDatasets(read) {
  const pods = [];
  const nodes = [];
  const workloads = [];
  const images = new Map();

  for (const c of read) {
    if (!c.reachable) continue;
    for (const n of c.nodes || []) {
      nodes.push({
        cluster: c.name,
        name: n.name,
        status: n.status,
        role: (n.roles || []).join(',') || 'worker',
        cpuCores: parseCpu(n.capacity?.cpu),
        memoryGi: round(parseMemGi(n.capacity?.memory), 1),
        podCount: num(n.pod_count),
        podCapacity: num(n.capacity?.pods),
      });
    }
    for (const p of c.pods || []) {
      const [r, t] = String(p.ready || '').includes('/')
        ? String(p.ready).split('/').map(Number) : [0, 0];
      pods.push({
        cluster: c.name,
        namespace: p.namespace,
        name: p.name,
        status: p.status,
        node: p.nodeName,
        restarts: num(p.restarts),
        ageDays: days(p.age),
        ready: t > 0 ? r >= t : true,
      });
      for (const ct of p.containers || []) {
        if (!ct.image) continue;
        const { repo, tag } = parseImageRef(ct.image);
        const key = `${repo}:${tag}`;
        const e = images.get(key) || { cluster: c.name, image: repo, tag, count: 0, floating: tag === 'latest' };
        e.count += 1;
        images.set(key, e);
      }
    }
    for (const w of c.workloads || []) {
      const [r, d] = String(w.replicas || '').includes('/')
        ? String(w.replicas).split('/').map(Number) : [0, 0];
      workloads.push({
        cluster: c.name, namespace: w.namespace, name: w.name, kind: w.kind,
        ready: r, desired: d, degraded: d > 0 && r < d, ageDays: days(w.age),
      });
    }
  }
  // The agent does not report pods-per-node, so derive it from the pod list.
  // Without this every node reads 0% utilised while the fleet total says 47/330.
  const perNode = new Map();
  for (const p of pods) {
    if (!p.node) continue;
    const k = `${p.cluster}|${p.node}`;
    perNode.set(k, (perNode.get(k) || 0) + 1);
  }
  for (const n of nodes) {
    if (!n.podCount) n.podCount = perNode.get(`${n.cluster}|${n.name}`) || 0;
  }

  return { pods, nodes, workloads, images: [...images.values()] };
}

/**
 * @returns everything the fleet dashboard renders, in one payload.
 */
async function getFleetOverview(userId, { hours = 24 } = {}) {
  const clusters = await Cluster.find({ userId }).select('name status createdAt').lean();

  // Everything below is independent, so it all goes in ONE wave. Cost and
  // vulnerabilities used to be awaited afterwards, which stacked OpenCost's and
  // Trivy's latency on top of the cluster reads — that is what left the page
  // sitting on "Reading every cluster".
  const [read, alertAgg, retention, cost, vuln] = await Promise.all([
    Promise.all(clusters.map((c) => readCluster(userId, c))),
    alertRollup(userId, hours),
    retentionHours().catch(() => null),
    getCostSummary({ window: hours <= 1 ? '1h' : hours <= 24 ? '24h' : '7d', userId })
      .catch(() => ({ installed: false })),
    vulnRollup(userId).catch(() => ({ installed: false })),
  ]);

  const datasets = buildDatasets(read);
  const reachable = read.filter((c) => c.reachable);
  const unreachable = read.filter((c) => !c.reachable)
    .map((c) => ({ id: c.id, name: c.name, status: c.status, reason: c.reason }));

  const capacity = datasets.nodes.reduce((a, n) => ({
    cpu: a.cpu + n.cpuCores,
    memory: a.memory + n.memoryGi,
    podSlots: a.podSlots + n.podCapacity,
  }), { cpu: 0, memory: 0, podSlots: 0 });

  const podPhase = datasets.pods.reduce((a, p) => {
    const k = p.status || 'Unknown';
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    window: { hours, retentionHours: retention, truncated: !!retention && hours > retention },

    clusters: {
      total: clusters.length,
      reachable: reachable.length,
      verified: reachable.filter((c) => c.verified).length,
      list: reachable.map((c) => ({
        id: c.id, name: c.name, status: c.status, verified: c.verified, accessMode: c.accessMode,
        nodes: (c.nodes || []).length,
        nodesReady: (c.nodes || []).filter((n) => n.status === 'Ready').length,
        pods: (c.pods || []).length,
        podsRunning: (c.pods || []).filter((p) => p.status === 'Running').length,
        namespaces: (c.namespaces || []).length,
        workloads: (c.workloads || []).length,
        restarts: (c.pods || []).reduce((s, p) => s + num(p.restarts), 0),
        cpuCores: round((c.nodes || []).reduce((s, n) => s + parseCpu(n.capacity?.cpu), 0), 1),
        memoryGi: round((c.nodes || []).reduce((s, n) => s + parseMemGi(n.capacity?.memory), 0), 1),
      })),
      unreachable,
    },

    totals: {
      nodes: datasets.nodes.length,
      nodesReady: datasets.nodes.filter((n) => n.status === 'Ready').length,
      pods: datasets.pods.length,
      podsRunning: podPhase.Running || 0,
      podsNotReady: datasets.pods.filter((p) => !p.ready).length,
      namespaces: new Set(datasets.pods.map((p) => `${p.cluster}/${p.namespace}`)).size,
      workloads: datasets.workloads.length,
      workloadsDegraded: datasets.workloads.filter((w) => w.degraded).length,
      restarts: datasets.pods.reduce((s, p) => s + p.restarts, 0),
      images: datasets.images.length,
      imagesFloating: datasets.images.filter((i) => i.floating).length,
      cpuCores: round(capacity.cpu, 1),
      memoryGi: round(capacity.memory, 1),
      podSlots: capacity.podSlots,
      podSlotsUsed: datasets.pods.length,
    },

    podPhase,
    alerts: alertAgg,
    vulnerabilities: vuln,
    cost: cost?.installed ? {
      installed: true,
      currency: cost.currency,
      monthly: cost.totals.monthly,
      daily: cost.totals.daily,
      measured: cost.totals.total,
      coveredHours: cost.coveredHours,
      efficiency: cost.efficiency,
      wasteMonthly: cost.efficiency != null ? round((cost.totals.monthly * (100 - cost.efficiency)) / 100, 2) : null,
      byNamespace: (cost.namespaces || []).slice(0, 15),
      pricingSource: cost.pricingSource,
    } : { installed: false, reason: cost?.reason },

    datasets,
  };
}

/** Alert aggregates, already fleet-wide because alerts carry clusterName. */
async function alertRollup(userId, hours) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const match = { userId: String(userId), receivedAt: { $gte: since } };

  const [bySeverity, byCluster, byNamespace, topAlerts, overTime] = await Promise.all([
    Alert.aggregate([{ $match: match }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
    Alert.aggregate([{ $match: match }, { $group: { _id: { c: '$clusterName', s: '$severity' }, count: { $sum: 1 } } }]),
    Alert.aggregate([{ $match: match }, { $group: { _id: '$namespace', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
    Alert.aggregate([{ $match: match }, { $group: { _id: '$alertname', count: { $sum: 1 }, severity: { $first: '$severity' } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
    Alert.aggregate([
      { $match: match },
      { $group: { _id: { $substr: ['$receivedAt', 0, 13] }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const sev = (s) => (['critical', 'high'].includes(s) ? 'critical' : ['warning', 'medium'].includes(s) ? 'warning' : 'info');
  const severityTotals = bySeverity.reduce((a, r) => {
    a[sev(r._id)] = (a[sev(r._id)] || 0) + r.count;
    return a;
  }, { critical: 0, warning: 0, info: 0 });

  const clusterMap = {};
  for (const r of byCluster) {
    const name = r._id.c || 'unknown';
    clusterMap[name] = clusterMap[name] || { cluster: name, critical: 0, warning: 0, info: 0, total: 0 };
    clusterMap[name][sev(r._id.s)] += r.count;
    clusterMap[name].total += r.count;
  }

  return {
    total: Object.values(severityTotals).reduce((a, b) => a + b, 0),
    severity: severityTotals,
    byCluster: Object.values(clusterMap).sort((a, b) => b.total - a.total),
    byNamespace: byNamespace.map((r) => ({ namespace: r._id || 'unknown', count: r.count })),
    top: topAlerts.map((r) => ({ alertname: r._id, count: r.count, severity: r.severity })),
    overTime: overTime.map((r) => ({ hour: `${r._id}:00`, count: r.count })),
  };
}

/** Vulnerability rollup, degrading cleanly when Trivy is absent. */
async function vulnRollup(userId) {
  const vulnerabilityService = require('./vulnerabilityService');
  const s = await vulnerabilityService.getClusterSummary();
  if (!s || s.installed === false) return { installed: false, reason: s?.reason };
  return {
    installed: true,
    totals: s.totals,
    byNamespace: (s.byNamespace || []).slice(0, 15),
    topImages: (s.topImages || []).slice(0, 15),
    scannedWorkloads: s.scannedWorkloads,
  };
}

module.exports = { getFleetOverview, buildDatasets };

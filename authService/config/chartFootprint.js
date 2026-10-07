/**
 * What installing this platform costs a cluster.
 *
 * Shown during onboarding so an operator can decide BEFORE installing, rather
 * than discovering it afterwards. Two numbers are given for each component
 * because they answer different questions:
 *
 *   requests  — what the scheduler reserves, i.e. capacity you stop being able
 *               to give to anything else the moment you install
 *   limits    — the worst case it can ever consume
 *
 * Values mirror helm/devopscopilot/values.yaml. Keep them in step: this file is
 * what the UI promises, values.yaml is what actually gets applied.
 */

const COMPONENTS = [
  {
    id: 'cluster-agent', label: 'Cluster Agent', required: true,
    valuesKey: 'agent', replicas: 1, kind: 'Deployment',
    requests: { cpu: 0.1, memoryMi: 256 }, limits: { cpu: 0.5, memoryMi: 512 },
    note: 'Watches resources and streams them to the platform. Always installed.',
  },
  {
    id: 'prometheus', label: 'Prometheus', required: false,
    valuesKey: 'monitoring.prometheus', replicas: 1, kind: 'Deployment',
    requests: { cpu: 0.1, memoryMi: 256 }, limits: { cpu: 0.5, memoryMi: 512 },
    // Default is emptyDir, so nothing is claimed from a StorageClass unless
    // persistence is turned on — worth stating, as it is the only PVC here.
    storage: { enabled: false, sizeGi: 5, note: 'emptyDir by default; set monitoring.prometheus.persistence.enabled=true for a 5Gi PVC' },
    note: 'Metrics for alerts, trends and cost. 12h retention by default.',
  },
  {
    id: 'node-exporter', label: 'Node Exporter', required: false,
    valuesKey: 'monitoring.nodeExporter', perNode: true, kind: 'DaemonSet',
    requests: { cpu: 0.01, memoryMi: 32 }, limits: { cpu: 0.1, memoryMi: 128 },
    note: 'One pod per node — multiply by your node count.',
  },
  {
    id: 'kube-state-metrics', label: 'kube-state-metrics', required: false,
    valuesKey: 'monitoring.kubeStateMetrics', replicas: 1, kind: 'Deployment',
    requests: { cpu: 0.01, memoryMi: 24 }, limits: { cpu: 0.1, memoryMi: 64 },
    note: 'Object-level metrics: pod phases, replica counts, capacity.',
  },
  {
    id: 'trivy-operator', label: 'Trivy Operator', required: false,
    valuesKey: 'trivyOperator', replicas: 1, kind: 'Deployment',
    requests: { cpu: 0.1, memoryMi: 128 }, limits: { cpu: 0.5, memoryMi: 500 },
    note: 'Vulnerability scanning. Also runs short-lived scan Jobs that consume CPU in bursts.',
  },
  {
    id: 'opencost', label: 'OpenCost', required: false,
    valuesKey: 'costMonitoring', replicas: 1, kind: 'Deployment',
    requests: { cpu: 0.05, memoryMi: 150 }, limits: { cpu: 0.5, memoryMi: 500 },
    note: 'Cost allocation. Reuses the Prometheus above — no second one is installed.',
  },
];

/**
 * @param {number} nodeCount  for DaemonSet components
 * @param {string[]} enabled  component ids to include; omit for required-only
 */
function computeFootprint({ nodeCount = 3, enabled = null } = {}) {
  const chosen = COMPONENTS.filter((c) => c.required || (enabled ? enabled.includes(c.id) : false));

  const rows = chosen.map((c) => {
    const copies = c.perNode ? Math.max(1, nodeCount) : (c.replicas || 1);
    return {
      id: c.id, label: c.label, kind: c.kind, required: !!c.required, note: c.note,
      copies,
      requests: { cpu: +(c.requests.cpu * copies).toFixed(3), memoryMi: c.requests.memoryMi * copies },
      limits: { cpu: +(c.limits.cpu * copies).toFixed(3), memoryMi: c.limits.memoryMi * copies },
      storage: c.storage || null,
    };
  });

  const sum = (pick) => rows.reduce((a, r) => ({
    cpu: a.cpu + pick(r).cpu, memoryMi: a.memoryMi + pick(r).memoryMi,
  }), { cpu: 0, memoryMi: 0 });

  const requests = sum((r) => r.requests);
  const limits = sum((r) => r.limits);
  const pods = rows.reduce((a, r) => a + r.copies, 0);
  const pvcGi = rows.reduce((a, r) => a + (r.storage?.enabled ? (r.storage.sizeGi || 0) : 0), 0);

  return {
    nodeCount,
    components: rows,
    pods,
    requests: { cpu: +requests.cpu.toFixed(2), memoryMi: requests.memoryMi, memoryGi: +(requests.memoryMi / 1024).toFixed(2) },
    limits: { cpu: +limits.cpu.toFixed(2), memoryMi: limits.memoryMi, memoryGi: +(limits.memoryMi / 1024).toFixed(2) },
    persistentStorageGi: pvcGi,
    // What it actually used on a real install, which is far below the reserved
    // figure — operators size on requests but live with usage.
    measuredReference: {
      cluster: '3 nodes, 40 vCPU, 94 Gi',
      pods: 16,
      cpuCores: 0.42,
      memoryGi: 0.97,
      sharePct: { cpu: 1.1, memory: 1.0, pods: 34 },
      note: 'Measured on a running install with all components enabled. Actual usage sits well under the reserved requests.',
    },
  };
}

module.exports = { COMPONENTS, computeFootprint };

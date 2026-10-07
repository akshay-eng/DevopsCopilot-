/**
 * Cluster compliance policy catalog.
 *
 * Each rule declares its own shape (`params`), so the Settings UI renders the
 * form from this file and a user defines their baseline without any code
 * change — the same manifest-driven approach as config/integrationRegistry.js.
 *
 * A rule's `evaluate(ctx, params)` returns:
 *   { status: 'pass' | 'fail' | 'warn' | 'unknown',
 *     summary, evidence[], remediable, remediation{ steps[], manual? } }
 *
 * `ctx` is { nodes, namespaces, pods, deployments, daemonsets, cluster }.
 *
 * Honesty rule for authors: when something genuinely cannot be fixed, say so in
 * `remediation.manual` rather than offering a button that will not work.
 */

const KUBE_SYSTEM_CONTROL_PLANE = ['kube-apiserver', 'kube-scheduler', 'kube-controller-manager', 'etcd'];

const cores = (v) => {
  if (!v) return 0;
  const s = String(v);
  // Kubernetes reports CPU either as whole cores ("8") or millicores ("8000m").
  if (/m$/.test(s)) return (parseInt(s, 10) || 0) / 1000;
  return parseFloat(s) || 0;
};

const gib = (v) => {
  if (!v) return 0;
  const s = String(v);
  const n = parseFloat(s) || 0;
  if (/Ki$/i.test(s)) return n / 1048576;
  if (/Mi$/i.test(s)) return n / 1024;
  if (/Gi$/i.test(s)) return n;
  if (/Ti$/i.test(s)) return n * 1024;
  if (/K$/.test(s)) return n / 1e6 * 1.048576;
  if (/M$/.test(s)) return n / 1e3 * 1.048576;
  if (/G$/.test(s)) return n * 1.073741824;
  return n / 1073741824; // bare bytes
};

const isControlPlane = (node) => (node.roles || [])
  .some((r) => /control-plane|master/i.test(String(r)));

const RULES = {
  // ───────────────────────────── Topology ─────────────────────────────
  control_plane_count: {
    id: 'control_plane_count',
    name: 'Control-plane node count',
    category: 'Topology',
    description: 'The cluster has the expected number of control-plane (master) nodes.',
    params: [
      { name: 'expected', label: 'Expected control-plane nodes', type: 'number', default: 1, required: true },
      { name: 'mode', label: 'Comparison', type: 'select', options: ['exactly', 'at least'], default: 'exactly' },
    ],
    evaluate(ctx, p) {
      const masters = ctx.nodes.filter(isControlPlane);
      const expected = Number(p.expected) || 1;
      const ok = p.mode === 'at least' ? masters.length >= expected : masters.length === expected;
      return {
        status: ok ? 'pass' : 'fail',
        summary: `${masters.length} control-plane node(s); policy wants ${p.mode === 'at least' ? '≥' : ''}${expected}`,
        evidence: masters.map((n) => ({ name: n.name, detail: (n.roles || []).join(', ') || 'control-plane' })),
        remediable: false,
        remediation: {
          manual: masters.length < expected
            ? 'Join additional control-plane nodes with `kubeadm join --control-plane`. Node count cannot be changed from this platform.'
            : 'Remove the surplus control-plane node by draining and `kubeadm reset` on it. Not performed automatically — it is destructive.',
        },
      };
    },
  },

  min_node_count: {
    id: 'min_node_count',
    name: 'Minimum node count',
    category: 'Topology',
    description: 'The cluster has at least this many Ready nodes.',
    params: [{ name: 'minimum', label: 'Minimum Ready nodes', type: 'number', default: 3, required: true }],
    evaluate(ctx, p) {
      const ready = ctx.nodes.filter((n) => n.status === 'Ready');
      const min = Number(p.minimum) || 1;
      return {
        status: ready.length >= min ? 'pass' : 'fail',
        summary: `${ready.length} of ${ctx.nodes.length} node(s) Ready; policy wants at least ${min}`,
        evidence: ctx.nodes.map((n) => ({ name: n.name, detail: n.status })),
        remediable: false,
        remediation: { manual: 'Add worker nodes to the cluster, or investigate why existing nodes are NotReady.' },
      };
    },
  },

  // ───────────────────────────── Capacity ─────────────────────────────
  min_node_resources: {
    id: 'min_node_resources',
    name: 'Minimum node compute',
    category: 'Capacity',
    description: 'Every node meets a minimum CPU and memory size.',
    params: [
      { name: 'minCpu', label: 'Minimum vCPU per node', type: 'number', default: 2, required: true },
      { name: 'minMemoryGi', label: 'Minimum memory per node (Gi)', type: 'number', default: 8, required: true },
      { name: 'scope', label: 'Applies to', type: 'select', options: ['all nodes', 'workers only'], default: 'all nodes' },
    ],
    evaluate(ctx, p) {
      const minCpu = Number(p.minCpu) || 0;
      const minMem = Number(p.minMemoryGi) || 0;
      const scoped = p.scope === 'workers only' ? ctx.nodes.filter((n) => !isControlPlane(n)) : ctx.nodes;
      if (!scoped.length) {
        return { status: 'unknown', summary: 'No nodes matched this scope.', evidence: [], remediable: false };
      }
      const undersized = [];
      const evidence = scoped.map((n) => {
        const c = cores(n.capacity?.cpu);
        const m = Math.round(gib(n.capacity?.memory) * 10) / 10;
        const bad = c < minCpu || m < minMem;
        if (bad) undersized.push(n.name);
        return { name: n.name, detail: `${c} vCPU · ${m} Gi`, ok: !bad };
      });
      return {
        status: undersized.length ? 'fail' : 'pass',
        summary: undersized.length
          ? `${undersized.length} of ${scoped.length} node(s) below ${minCpu} vCPU / ${minMem} Gi`
          : `All ${scoped.length} node(s) meet ${minCpu} vCPU / ${minMem} Gi`,
        evidence,
        remediable: false,
        remediation: {
          manual: 'Resize the underlying machines. Node hardware cannot be changed from inside the cluster — '
            + 'on a cloud provider replace the node pool, on bare metal add RAM/CPU and restart the kubelet.',
        },
      };
    },
  },

  // ───────────────────────────── Namespaces ─────────────────────────────
  required_namespaces: {
    id: 'required_namespaces',
    name: 'Required namespaces exist',
    category: 'Namespaces',
    description: 'Namespaces the platform depends on are present — e.g. monitoring.',
    params: [
      {
        name: 'namespaces', label: 'Required namespaces', type: 'list',
        default: ['monitoring'], required: true,
        help: 'One per line. Checked for existence only.',
      },
    ],
    evaluate(ctx, p) {
      const want = (Array.isArray(p.namespaces) ? p.namespaces : String(p.namespaces || '').split(/[\n,]/))
        .map((s) => String(s).trim()).filter(Boolean);
      const have = new Set(ctx.namespaces.map((n) => n.name || n));
      const missing = want.filter((n) => !have.has(n));
      return {
        status: missing.length ? 'fail' : 'pass',
        summary: missing.length ? `Missing: ${missing.join(', ')}` : `All ${want.length} required namespace(s) present`,
        evidence: want.map((n) => ({ name: n, detail: have.has(n) ? 'present' : 'missing', ok: have.has(n) })),
        // Creating a namespace is safe and reversible, so this one is automatable.
        remediable: missing.length > 0,
        remediationAction: { type: 'create_namespaces', namespaces: missing },
        remediation: { steps: missing.map((n) => `kubectl create namespace ${n}`) },
      };
    },
  },

  // ───────────────────────────── Workload placement ────────────────────
  critical_pod_priority: {
    id: 'critical_pod_priority',
    name: 'Critical pods are prioritised',
    category: 'Workload placement',
    description: 'Core Kubernetes pods carry a system PriorityClass so the scheduler evicts them last.',
    params: [
      {
        name: 'namespace', label: 'Namespace holding core components', type: 'text',
        default: 'kube-system', required: true,
      },
      {
        name: 'priorityClasses', label: 'Accepted priority classes', type: 'list',
        default: ['system-cluster-critical', 'system-node-critical'],
      },
    ],
    evaluate(ctx, p) {
      const ns = p.namespace || 'kube-system';
      const accepted = new Set(Array.isArray(p.priorityClasses) ? p.priorityClasses
        : String(p.priorityClasses || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean));
      const pods = ctx.pods.filter((x) => (x.namespace || '') === ns);
      if (!pods.length) {
        return { status: 'unknown', summary: `No pods found in ${ns}.`, evidence: [], remediable: false };
      }
      // priorityClassName is not in the list payload, so this reports what it
      // can see and marks the rest unknown rather than guessing.
      const known = pods.filter((x) => x.priorityClassName !== undefined);
      if (!known.length) {
        return {
          status: 'unknown',
          summary: `Cannot verify: the resource API does not return priorityClassName for the ${pods.length} pod(s) in ${ns}.`,
          evidence: [],
          remediable: false,
          remediation: { manual: `Check manually: kubectl get pods -n ${ns} -o custom-columns=NAME:.metadata.name,PRIORITY:.spec.priorityClassName` },
        };
      }
      const bad = known.filter((x) => !accepted.has(x.priorityClassName));
      return {
        status: bad.length ? 'warn' : 'pass',
        summary: bad.length ? `${bad.length} pod(s) in ${ns} without an accepted priority class` : `All inspected pods in ${ns} are prioritised`,
        evidence: bad.slice(0, 20).map((x) => ({ name: x.name, detail: x.priorityClassName || 'none' })),
        remediable: false,
        remediation: { manual: `Set priorityClassName on the owning workload, e.g. system-cluster-critical.` },
      };
    },
  },

  isolate_core_components: {
    id: 'isolate_core_components',
    name: 'Core components in a dedicated namespace',
    category: 'Workload placement',
    description: 'Cluster-critical add-ons run in a namespace you control, separate from kube-system.',
    params: [
      { name: 'namespace', label: 'Target namespace', type: 'text', default: 'kube-critical', required: true },
      {
        name: 'workloads', label: 'Workloads that must live there', type: 'list',
        default: [], help: 'Names (or prefixes) of add-on workloads, e.g. coredns, metrics-server. Leave blank to only check the namespace exists.',
      },
    ],
    evaluate(ctx, p) {
      const target = p.namespace || 'kube-critical';
      const exists = ctx.namespaces.some((n) => (n.name || n) === target);
      const want = (Array.isArray(p.workloads) ? p.workloads
        : String(p.workloads || '').split(/[\n,]/)).map((s) => String(s).trim()).filter(Boolean);

      const evidence = [];
      let misplaced = 0;
      for (const w of want) {
        const matches = ctx.pods.filter((x) => String(x.name || '').startsWith(w));
        const outside = matches.filter((x) => (x.namespace || '') !== target);
        // Control-plane static pods are managed by the kubelet from manifests on
        // disk and simply cannot be relocated — report them as such instead of
        // counting them against the score.
        const immovable = matches.filter((x) => KUBE_SYSTEM_CONTROL_PLANE.some((c) => String(x.name).startsWith(c)));
        if (!matches.length) {
          evidence.push({ name: w, detail: 'not found', ok: true });
        } else if (immovable.length) {
          evidence.push({ name: w, detail: 'control-plane static pod — cannot be moved', ok: true });
        } else if (outside.length) {
          misplaced += 1;
          evidence.push({ name: w, detail: `in ${[...new Set(outside.map((x) => x.namespace))].join(', ')}`, ok: false });
        } else {
          evidence.push({ name: w, detail: `in ${target}`, ok: true });
        }
      }

      if (!exists) {
        return {
          status: 'fail',
          summary: `Namespace ${target} does not exist`,
          evidence,
          remediable: true,
          remediationAction: { type: 'create_namespaces', namespaces: [target] },
          remediation: { steps: [`kubectl create namespace ${target}`] },
        };
      }
      return {
        status: misplaced ? 'warn' : 'pass',
        summary: misplaced ? `${misplaced} workload(s) not in ${target}` : `Namespace ${target} exists and the listed workloads are in place`,
        evidence,
        remediable: false,
        remediation: {
          manual: misplaced
            ? `Redeploy the affected add-ons into ${target}. Moving a running pod between namespaces means recreating it, `
              + 'so this is deliberately not automated — core add-ons going down takes the cluster with them.'
            : undefined,
        },
      };
    },
  },

  // ───────────────────────────── Platform ─────────────────────────────
  platform_agent_healthy: {
    id: 'platform_agent_healthy',
    name: 'Platform components healthy',
    category: 'Platform',
    description: 'The components this platform installs during onboarding are running.',
    params: [
      {
        name: 'components', label: 'Expected components', type: 'list',
        default: ['cluster-agent'],
        help: 'Matched against the app.kubernetes.io/component label of the Helm release.',
      },
    ],
    evaluate(ctx) {
      // Our own pods are identified by the Helm chart's naming, so look for them
      // by name rather than relying on labels the list API may not return.
      const ours = ctx.pods.filter((x) => /devopscopilot|cluster-agent/i.test(String(x.name || '')));
      if (!ours.length) {
        return {
          status: 'fail',
          summary: 'No platform agent pods found in this cluster',
          evidence: [],
          remediable: false,
          remediation: { manual: 'Install the Helm chart: helm install devopscopilot ./helm/devopscopilot' },
        };
      }
      const unhealthy = ours.filter((x) => x.status !== 'Running');
      return {
        status: unhealthy.length ? 'fail' : 'pass',
        summary: unhealthy.length
          ? `${unhealthy.length} of ${ours.length} platform pod(s) not Running`
          : `All ${ours.length} platform pod(s) Running`,
        evidence: ours.map((x) => ({ name: x.name, detail: `${x.namespace} · ${x.status}`, ok: x.status === 'Running' })),
        remediable: false,
        remediation: { manual: 'Check logs: kubectl logs -n <namespace> <pod>' },
      };
    },
  },
};

/** The default baseline applied when a cluster is onboarded with no policy set. */
const DEFAULT_POLICY = [
  { rule: 'control_plane_count', params: { expected: 1, mode: 'exactly' }, severity: 'high' },
  { rule: 'min_node_count', params: { minimum: 2 }, severity: 'medium' },
  { rule: 'min_node_resources', params: { minCpu: 2, minMemoryGi: 8, scope: 'all nodes' }, severity: 'high' },
  { rule: 'required_namespaces', params: { namespaces: ['monitoring'] }, severity: 'medium' },
  { rule: 'platform_agent_healthy', params: {}, severity: 'high' },
];

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

/** Public catalog for the policy editor (no functions). */
function publicCatalog() {
  return Object.values(RULES).map((r) => ({
    id: r.id, name: r.name, category: r.category, description: r.description,
    params: (r.params || []).map((p) => ({ ...p })),
  }));
}

module.exports = { RULES, DEFAULT_POLICY, SEVERITIES, publicCatalog, cores, gib, isControlPlane };

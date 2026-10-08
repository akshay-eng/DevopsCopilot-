/**
 * Per-panel AI recommendations for the fleet dashboard.
 *
 * ONE TOPIC PER PANEL. This is the whole point of the file.
 *
 * Panels used to share topics — three cards asked `cluster_health`, two asked
 * `utilisation` — so opening "Cost by namespace" and "Node utilisation" returned
 * word-for-word the same answer, and the dashboard looked like it ignored which
 * card you clicked. Each panel now has:
 *
 *   slice(f)    ONLY the data that panel draws. A topic that can see the whole
 *               fleet writes about the whole fleet, which is how every answer
 *               ends up sounding the same.
 *   facts(f)    a deterministic reading of that same slice, so the panel says
 *               something true even with no model, and an AI claim can be
 *               checked against the numbers printed beside it.
 *   question    what this panel specifically wants to know, phrased with an
 *               explicit exclusion so the model cannot drift back into generic
 *               cluster advice.
 *
 * ⚠ If you add a panel, give it its own entry. Reusing a neighbour's topic is
 * exactly what caused the duplicate-answer problem.
 */

const ai = require('./aiService');

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const n = (v) => Number(v) || 0;
const short = (s, len = 60) => String(s || '').slice(-len);

/** Strip pod suffixes so advice can name the workload, not a doomed replica. */
const workloadOf = (pod) => String(pod || '').replace(/-[a-z0-9]{6,10}(-[a-z0-9]{5})?$/, '');

const TOPICS = {
  // ── Pods active ────────────────────────────────────────────────────────
  pod_health: {
    title: 'Pod readiness',
    question:
      'Why are pods not running, and what should be done about the specific pods that are Pending or not ready? '
      + 'Write only about pod lifecycle state. Do NOT discuss cost, vulnerabilities, nodes or alert volume.',
    slice: (f) => ({
      totals: {
        pods: f.totals?.pods, running: f.totals?.podsRunning,
        notReady: f.totals?.podsNotReady,
      },
      phase: f.podPhase,
      problemPods: (f.datasets?.pods || [])
        .filter((p) => !p.ready || (p.status && p.status !== 'Running'))
        .slice(0, 15)
        .map((p) => ({ pod: p.name, namespace: p.namespace, status: p.status, ready: p.ready, ageDays: p.ageDays })),
    }),
    facts: (f) => {
      const t = f.totals || {};
      const phase = f.podPhase || {};
      const out = [`${n(t.podsRunning)} of ${n(t.pods)} pods are Running (${pct(t.podsRunning, t.pods)}%).`];
      if (phase.Pending) out.push(`${phase.Pending} pod(s) are Pending — unschedulable, or waiting on an image or volume.`);
      if (phase.Failed) out.push(`${phase.Failed} pod(s) are in Failed state.`);
      if (t.podsNotReady) out.push(`${t.podsNotReady} pod(s) are running but failing their readiness probe.`);
      if (out.length === 1) out.push('No pod is Pending, Failed or failing readiness.');
      return out;
    },
  },

  // ── Cluster health ─────────────────────────────────────────────────────
  cluster_connectivity: {
    title: 'Cluster connectivity',
    question:
      'Can every registered cluster actually be read, and what should be done about any that cannot? '
      + 'Write only about cluster reachability and credential/agent verification. '
      + 'Do NOT discuss pods, cost, vulnerabilities or alerts.',
    slice: (f) => ({
      registered: f.clusters?.total,
      reachable: f.clusters?.reachable,
      verified: f.clusters?.verified,
      clusters: (f.clusters?.list || []).map((c) => ({
        name: c.name, verified: c.verified, nodes: c.nodes, nodesReady: c.nodesReady,
      })),
      unreachable: (f.clusters?.unreachable || []).map((u) => ({ name: u.name, reason: u.reason })),
    }),
    facts: (f) => {
      const c = f.clusters || {};
      const out = [`${n(c.reachable)} of ${n(c.total)} registered clusters are readable; ${n(c.verified)} are identity-verified.`];
      (c.unreachable || []).forEach((u) =>
        out.push(`"${u.name}" cannot be read (${u.reason}), so it is absent from every number on this dashboard.`));
      const unver = (c.list || []).filter((x) => !x.verified);
      if (unver.length) out.push(`${unver.length} cluster(s) answer but failed node-fingerprint verification: ${unver.map((x) => x.name).join(', ')}.`);
      if (out.length === 1) out.push('Every registered cluster is reachable and verified.');
      return out;
    },
  },

  // ── Overall uptime ─────────────────────────────────────────────────────
  availability: {
    title: 'Composite availability',
    question:
      'Which of the three availability components (node readiness, pod readiness, workload replicas) is dragging the '
      + 'composite number down, and what single change would raise it most? '
      + 'Write only about availability arithmetic. Do NOT discuss cost, vulnerabilities or alert volume.',
    slice: (f) => ({
      nodeReadiness: { ready: f.totals?.nodesReady, total: f.totals?.nodes },
      podReadiness: { running: f.totals?.podsRunning, total: f.totals?.pods },
      workloadReplicas: { healthy: n(f.totals?.workloads) - n(f.totals?.workloadsDegraded), total: f.totals?.workloads },
      degraded: (f.datasets?.workloads || []).filter((w) => w.degraded)
        .slice(0, 10).map((w) => ({ name: w.name, namespace: w.namespace, ready: w.ready, desired: w.desired })),
    }),
    facts: (f) => {
      const t = f.totals || {};
      const parts = [
        ['nodes', pct(t.nodesReady, t.nodes)],
        ['pods', pct(t.podsRunning, t.pods)],
        ['workloads', pct(n(t.workloads) - n(t.workloadsDegraded), t.workloads)],
      ];
      const worst = [...parts].sort((a, b) => a[1] - b[1])[0];
      return [
        `Node readiness ${parts[0][1]}%, pod readiness ${parts[1][1]}%, workload replicas ${parts[2][1]}%.`,
        `The ${worst[0]} component is lowest at ${worst[1]}%, so it sets the composite figure.`,
      ];
    },
  },

  // ── Node health ────────────────────────────────────────────────────────
  node_health: {
    title: 'Node health',
    question:
      'Are any nodes NotReady or close to their pod-slot ceiling, and is placement balanced across them? '
      + 'Write only about node condition and scheduling headroom. Do NOT discuss cost, images or vulnerabilities.',
    slice: (f) => ({
      nodes: (f.datasets?.nodes || []).slice(0, 12).map((x) =>
        `${x.name} (${x.cluster}) ${x.status} role=${x.role} ${x.cpuCores}vCPU ${x.memoryGi}Gi pods=${x.podCount}/${x.podCapacity}`),
      totals: { nodes: f.totals?.nodes, ready: f.totals?.nodesReady },
    }),
    facts: (f) => {
      const nodes = f.datasets?.nodes || [];
      const out = [];
      const notReady = nodes.filter((x) => x.status !== 'Ready');
      if (notReady.length) out.push(`${notReady.length} node(s) are NotReady: ${notReady.map((x) => x.name).join(', ')}.`);
      const tight = nodes.filter((x) => x.podCapacity && pct(x.podCount, x.podCapacity) >= 80);
      if (tight.length) out.push(`${tight.length} node(s) are above 80% of their pod-slot capacity.`);
      if (nodes.length > 1) {
        const counts = nodes.map((x) => x.podCount);
        const max = Math.max(...counts); const min = Math.min(...counts);
        if (max - min > Math.max(5, max * 0.5)) {
          out.push(`Placement is uneven: ${max} pods on the busiest node vs ${min} on the quietest.`);
        }
      }
      if (!out.length) out.push(`All ${nodes.length} node(s) are Ready with scheduling headroom.`);
      return out;
    },
  },

  // ── Current failures ───────────────────────────────────────────────────
  failures: {
    title: 'Active failures',
    question:
      'What is failing RIGHT NOW and in what order should it be tackled? Name the specific failed pods and degraded '
      + 'workloads. Write only about current failures. Do NOT discuss cost, images, vulnerabilities or capacity planning.',
    slice: (f) => ({
      failed: n(f.podPhase?.Failed),
      pending: n(f.podPhase?.Pending),
      degradedCount: f.totals?.workloadsDegraded,
      failedPods: (f.datasets?.pods || [])
        .filter((p) => ['Failed', 'Pending', 'CrashLoopBackOff', 'Unknown'].includes(p.status))
        .slice(0, 12).map((p) => ({ pod: p.name, namespace: p.namespace, status: p.status, restarts: p.restarts })),
      degradedWorkloads: (f.datasets?.workloads || []).filter((w) => w.degraded)
        .slice(0, 12).map((w) => ({ name: w.name, kind: w.kind, namespace: w.namespace, ready: w.ready, desired: w.desired })),
    }),
    facts: (f) => {
      const phase = f.podPhase || {};
      const degraded = (f.datasets?.workloads || []).filter((w) => w.degraded);
      const out = [];
      if (phase.Failed) out.push(`${phase.Failed} pod(s) are Failed.`);
      if (phase.Pending) out.push(`${phase.Pending} pod(s) are Pending.`);
      if (degraded.length) {
        out.push(`${degraded.length} workload(s) are below desired replicas: ${degraded.slice(0, 4).map((w) => `${w.name} (${w.ready}/${w.desired})`).join(', ')}.`);
      }
      if (!out.length) out.push('Nothing is currently failed, pending or below desired replicas.');
      return out;
    },
  },

  // ── Image restarts ─────────────────────────────────────────────────────
  restarts: {
    title: 'Restart churn',
    question:
      'Which containers keep restarting and why might they be crash-looping? Name the worst offenders and give a '
      + 'diagnostic next step for each. Write only about restart behaviour. Do NOT discuss cost, vulnerabilities, '
      + 'nodes or image tagging policy.',
    slice: (f) => ({
      totalRestarts: f.totals?.restarts,
      worst: (f.datasets?.pods || []).filter((p) => p.restarts > 0)
        .sort((a, b) => b.restarts - a.restarts).slice(0, 12)
        .map((p) => ({ pod: p.name, workload: workloadOf(p.name), namespace: p.namespace, restarts: p.restarts, status: p.status, ageDays: p.ageDays })),
    }),
    facts: (f) => {
      const restarting = (f.datasets?.pods || []).filter((p) => p.restarts > 0)
        .sort((a, b) => b.restarts - a.restarts);
      if (!restarting.length) return ['No container has restarted in this window.'];
      const out = [`${n(f.totals?.restarts)} restart(s) across ${restarting.length} pod(s).`];
      out.push(`Worst: ${restarting[0].name} with ${restarting[0].restarts} restart(s) in ns/${restarting[0].namespace}.`);
      const churn = restarting.filter((p) => p.restarts >= 5);
      if (churn.length) out.push(`${churn.length} pod(s) have 5+ restarts, which usually means a crash loop rather than a one-off.`);
      return out;
    },
  },

  // ── Vulnerabilities ────────────────────────────────────────────────────
  security: {
    title: 'Vulnerability exposure',
    question:
      'Which images carry the most serious exposure and in what order should they be patched? '
      + 'Write only about vulnerabilities. Do NOT discuss cost, restarts, capacity or alert volume.',
    slice: (f) => ({
      installed: f.vulnerabilities?.installed,
      totals: f.vulnerabilities?.totals,
      scannedWorkloads: f.vulnerabilities?.scannedWorkloads,
      worstImages: (f.vulnerabilities?.topImages || []).slice(0, 8)
        .map((i) => ({ image: short(i.image), total: i.total, critical: i.critical })),
      worstNamespaces: (f.vulnerabilities?.byNamespace || []).slice(0, 6),
    }),
    facts: (f) => {
      const v = f.vulnerabilities || {};
      if (!v.installed) return ['Vulnerability scanning is not reporting, so exposure is unknown rather than zero.'];
      const t = v.totals || {};
      const out = [`${n(t.total)} findings across ${n(v.scannedWorkloads)} scanned workloads.`];
      if (t.critical) out.push(`${t.critical} are critical — the ones with known exploits.`);
      const worst = (v.topImages || [])[0];
      if (worst) out.push(`Most affected image: ${worst.image} with ${worst.total} findings.`);
      if (t.unknown) out.push(`${t.unknown} findings carry no severity rating and are easy to overlook.`);
      return out;
    },
  },

  // ── Node utilisation ───────────────────────────────────────────────────
  node_capacity: {
    title: 'Scheduling capacity',
    question:
      'How much scheduling headroom is left per node, and is the fleet over- or under-provisioned in POD SLOTS? '
      + 'Write only about pod-slot capacity and placement. Do NOT mention money, cost, efficiency percentages '
      + 'or namespace spend — a separate panel covers cost.',
    slice: (f) => ({
      podSlots: { used: f.totals?.podSlotsUsed, total: f.totals?.podSlots },
      perNode: (f.datasets?.nodes || []).slice(0, 12).map((x) =>
        `${x.name} ${x.podCount}/${x.podCapacity} slots (${pct(x.podCount, x.podCapacity)}%) ${x.cpuCores}vCPU ${x.memoryGi}Gi`),
    }),
    facts: (f) => {
      const t = f.totals || {};
      const nodes = f.datasets?.nodes || [];
      const out = [`${pct(t.podSlotsUsed, t.podSlots)}% of ${n(t.podSlots)} pod slots are in use (${n(t.podSlotsUsed)} pods).`];
      const busiest = [...nodes].sort((a, b) => pct(b.podCount, b.podCapacity) - pct(a.podCount, a.podCapacity))[0];
      if (busiest) out.push(`Busiest node is ${busiest.name} at ${pct(busiest.podCount, busiest.podCapacity)}% of its slots.`);
      if (nodes.length && pct(t.podSlotsUsed, t.podSlots) < 25) {
        out.push('Slot usage this low means the ceiling is nowhere near binding — the constraint, if any, is CPU or memory, not slot count.');
      }
      return out;
    },
  },

  // ── Cost by namespace ──────────────────────────────────────────────────
  cost: {
    title: 'Cost and waste',
    question:
      'Where is money being spent and which namespace wastes the most? Give actions that reduce SPEND, with figures. '
      + 'Write only about cost. Do NOT discuss pod slots, node counts, restarts or vulnerabilities.',
    slice: (f) => ({
      installed: f.cost?.installed,
      monthly: f.cost?.monthly,
      wasteMonthly: f.cost?.wasteMonthly,
      efficiency: f.cost?.efficiency,
      byNamespace: (f.cost?.byNamespace || []).slice(0, 10)
        .map((x) => ({ namespace: x.name, monthlyCost: x.totalCost, efficiency: x.efficiency })),
      note: 'Costs come from a configured price list, not a cloud invoice. Buckets whose '
        + 'name starts with __ (e.g. __unmounted__) are OpenCost accounting buckets, not real namespaces.',
    }),
    facts: (f) => {
      const c = f.cost || {};
      if (!c.installed) return ['Cost data is not available, so spend cannot be judged.'];
      const out = [
        `Run-rate $${Math.round(n(c.monthly))}/month, of which about $${Math.round(n(c.wasteMonthly))} is reserved but idle.`,
      ];
      if (c.efficiency != null) out.push(`Measured efficiency ${c.efficiency}%.`);
      // __unmounted__ is an OpenCost accounting bucket, not a real namespace —
      // calling it "the least efficient namespace" sends people chasing a ghost.
      const real = (c.byNamespace || []).filter((x) => x.efficiency != null && !/^__/.test(x.name));
      const worst = [...real].sort((a, b) => a.efficiency - b.efficiency)[0];
      if (worst) out.push(`Least efficient real namespace: ${worst.name} at ${worst.efficiency}%.`);
      const biggest = [...(c.byNamespace || [])].sort((a, b) => n(b.totalCost) - n(a.totalCost))[0];
      if (biggest) out.push(`Largest spender: ${biggest.name} at $${Number(biggest.totalCost).toFixed(2)} in this window.`);
      return out;
    },
  },

  // ── Alert pressure ─────────────────────────────────────────────────────
  alerts: {
    title: 'Alert load and noise',
    question:
      'Is this alert volume signal or noise, and which specific rules should be tuned, inhibited or routed differently? '
      + 'Write only about alerting. Do NOT discuss cost, images, capacity or vulnerabilities.',
    slice: (f) => ({
      total: f.alerts?.total,
      severity: f.alerts?.severity,
      byCluster: (f.alerts?.byCluster || []).slice(0, 6),
      topSignatures: (f.alerts?.top || []).slice(0, 10),
      byNamespace: (f.alerts?.byNamespace || []).slice(0, 8),
    }),
    facts: (f) => {
      const a = f.alerts || {};
      if (!a.total) return ['No alerts in this window.'];
      const out = [`${n(a.total)} alerts, ${n(a.severity?.critical)} critical.`];
      const top = (a.top || [])[0];
      if (top) {
        const share = pct(top.count, a.total);
        out.push(`"${top.alertname}" alone is ${share}% of all alerts (${top.count}).`);
        if (share > 30) out.push('One signature dominating this heavily is a tuning or inhibition problem, not that many real incidents.');
      }
      const ns = (a.byNamespace || [])[0];
      if (ns) out.push(`Noisiest namespace: ${ns.namespace} with ${ns.count}.`);
      return out;
    },
  },

  // ── Pods by namespace ──────────────────────────────────────────────────
  namespace_distribution: {
    title: 'Workload distribution',
    question:
      'How is workload spread across namespaces, and does the shape suggest anything worth acting on (a namespace '
      + 'carrying too much, missing isolation, leftover sprawl)? Write only about distribution across namespaces. '
      + 'Do NOT discuss cost, vulnerabilities, restarts or node capacity.',
    slice: (f) => {
      const byNs = {};
      (f.datasets?.pods || []).forEach((p) => {
        const k = p.namespace || 'unknown';
        byNs[k] = byNs[k] || { pods: 0, notReady: 0 };
        byNs[k].pods += 1;
        if (!p.ready) byNs[k].notReady += 1;
      });
      const wl = {};
      (f.datasets?.workloads || []).forEach((w) => { wl[w.namespace] = (wl[w.namespace] || 0) + 1; });
      return {
        namespaces: Object.entries(byNs)
          .sort((a, b) => b[1].pods - a[1].pods).slice(0, 12)
          .map(([name, v]) => ({ namespace: name, pods: v.pods, notReady: v.notReady, workloads: wl[name] || 0 })),
        totalNamespaces: f.totals?.namespaces,
      };
    },
    facts: (f) => {
      const byNs = {};
      (f.datasets?.pods || []).forEach((p) => { byNs[p.namespace] = (byNs[p.namespace] || 0) + 1; });
      const sorted = Object.entries(byNs).sort((a, b) => b[1] - a[1]);
      if (!sorted.length) return ['No pods are reporting a namespace.'];
      const total = sorted.reduce((s, [, v]) => s + v, 0);
      const out = [`${sorted.length} namespaces hold ${total} pods.`];
      out.push(`Largest: ${sorted[0][0]} with ${sorted[0][1]} pods (${pct(sorted[0][1], total)}% of the fleet).`);
      const singles = sorted.filter(([, v]) => v === 1).length;
      if (singles > 2) out.push(`${singles} namespaces hold a single pod each, which is often leftover sprawl.`);
      return out;
    },
  },

  // ── Image hygiene ──────────────────────────────────────────────────────
  image_hygiene: {
    title: 'Image hygiene',
    question:
      'Which images run on floating tags and what is the reproducibility risk? Name the specific images and give a '
      + 'pinning plan. Write only about image tags and provenance. Do NOT discuss CVEs, restarts, cost or capacity.',
    slice: (f) => ({
      distinct: f.totals?.images,
      floating: f.totals?.imagesFloating,
      floatingImages: (f.datasets?.images || []).filter((i) => i.floating)
        .slice(0, 12).map((i) => ({ image: short(i.image), tag: i.tag, containers: i.count })),
      pinnedExamples: (f.datasets?.images || []).filter((i) => !i.floating)
        .slice(0, 5).map((i) => ({ image: short(i.image), tag: i.tag })),
    }),
    facts: (f) => {
      const t = f.totals || {};
      const floating = (f.datasets?.images || []).filter((i) => i.floating);
      if (!t.images) return ['No container images are reporting.'];
      const out = [`${n(t.images)} distinct images; ${n(t.imagesFloating)} run on a floating tag (${pct(t.imagesFloating, t.images)}%).`];
      if (floating.length) {
        out.push(`Floating examples: ${floating.slice(0, 3).map((i) => `${i.image}:${i.tag}`).join(', ')}.`);
        out.push('A floating tag means the running code cannot be identified from the manifest, so a rollout is not reproducible and a rollback is not guaranteed.');
      } else {
        out.push('Every image is pinned to an immutable tag.');
      }
      return out;
    },
  },
};

/**
 * @param topic one of TOPICS
 * @param fleet the fleet overview payload
 */
async function advise(topic, fleet) {
  const def = TOPICS[topic];
  if (!def) throw new Error(`Unknown advice topic: ${topic}`);

  const facts = def.facts(fleet) || [];

  if (!ai.available()) {
    return {
      topic, title: def.title, facts, source: 'facts-only',
      summary: 'The analysis model is not reachable, so these are the facts without suggested actions.',
      recommendations: [],
    };
  }

  const context = {
    observed: def.slice(fleet),
    deterministicFindings: facts,
  };

  try {
    const r = await ai.recommend({
      title: `${def.title}. ${def.question} `
        + 'Reference the actual cluster, namespace, pod or image names in the data. '
        + 'Do not suggest collecting data that is already present, and do not invent names.',
      context,
      maxItems: 4,
      maxTokens: 6000,
      // The reasoning model thinks before it answers and the bigger slices
      // routinely pass 120s. A panel that waits is better than one that lies.
      timeout: 300000,
    });
    return {
      topic, title: def.title, facts,
      summary: r.summary,
      recommendations: r.recommendations || [],
      source: r.source === 'ai' ? 'ai' : 'facts-only',
      modelNote: r.source === 'unparsed'
        ? 'The model replied but did not return usable actions for this panel; the facts below are still accurate.'
        : undefined,
      model: r.source === 'ai' ? ai.LLM_MODEL : undefined,
    };
  } catch (e) {
    return {
      topic, title: def.title, facts, source: 'facts-only',
      summary: `The model could not produce recommendations (${e.message}).`,
      recommendations: [],
    };
  }
}

module.exports = { advise, TOPICS: Object.keys(TOPICS) };

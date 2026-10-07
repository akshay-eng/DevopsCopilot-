/**
 * Alert analysis — turns raw enrichment (metrics, logs, events, describe) into
 * an actionable verdict:
 *
 *   • Is this an INFRASTRUCTURE or an APPLICATION problem (or config/capacity/
 *     external dependency)?
 *   • What is the root cause, and what evidence supports it?
 *   • What exactly do I do to fix it, and how do I stop it recurring?
 *
 * A deterministic classifier runs first so there is always a defensible answer
 * with cited signals; the LLM then writes the narrative RCA and steps. If the
 * model is unreachable the deterministic output still stands on its own.
 */

const ai = require('./aiService');

const CATEGORIES = {
  INFRASTRUCTURE: 'infrastructure',
  APPLICATION: 'application',
  CONFIGURATION: 'configuration',
  CAPACITY: 'capacity',
  DEPENDENCY: 'external-dependency',
};

/**
 * Signal table. Each rule contributes weight to a category and records WHY,
 * so the verdict is explainable rather than a black box.
 */
const SIGNALS = [
  // ── Infrastructure: nodes, control plane, storage, networking ────────────
  { re: /node(notready|down)|kubenode|kubelet|nodeunreachable/i, cat: 'INFRASTRUCTURE', w: 3, why: 'Alert targets a node/kubelet rather than a workload' },
  { re: /diskpressure|outofdisk|filesystem|nodefilesystem/i, cat: 'INFRASTRUCTURE', w: 3, why: 'Node filesystem/disk exhaustion' },
  { re: /clocknotsync|ntp|timesync/i, cat: 'INFRASTRUCTURE', w: 3, why: 'Host time synchronisation fault' },
  { re: /apiserver|etcd|scheduler|controllermanager|controlplane/i, cat: 'INFRASTRUCTURE', w: 3, why: 'Control-plane component affected' },
  { re: /networkunavailable|cni|calico|flannel|kubeproxy/i, cat: 'INFRASTRUCTURE', w: 3, why: 'Cluster networking layer affected' },
  { re: /persistentvolume|pvc|volume.*(fail|pending)|storageclass/i, cat: 'INFRASTRUCTURE', w: 2, why: 'Persistent storage provisioning/attachment issue' },
  { re: /memorypressure|pidpressure/i, cat: 'INFRASTRUCTURE', w: 2, why: 'Node-level resource pressure' },

  // ── Application: the workload's own code/runtime ─────────────────────────
  { re: /crashloop/i, cat: 'APPLICATION', w: 3, why: 'Container repeatedly exits after start — process-level failure' },
  { re: /oomkill|outofmemory/i, cat: 'APPLICATION', w: 2, why: 'Process exceeded its memory limit (leak or under-sizing)' },
  { re: /5\d\d|internalservererror|errorrate|http.*error/i, cat: 'APPLICATION', w: 3, why: 'Application returning server errors' },
  { re: /latency|slowrequest|responsetime|apdex/i, cat: 'APPLICATION', w: 2, why: 'Application response-time degradation' },
  { re: /readiness|liveness.*(fail|probe)/i, cat: 'APPLICATION', w: 2, why: 'Application health probe failing' },
  { re: /exception|panic|stacktrace|nullpointer|segfault/i, cat: 'APPLICATION', w: 3, why: 'Unhandled error in application code' },

  // ── Configuration ────────────────────────────────────────────────────────
  { re: /imagepull|errimage|invalidimagename/i, cat: 'CONFIGURATION', w: 3, why: 'Image reference or registry credentials are wrong' },
  { re: /createcontainerconfigerror|failedmount|configmap|secret.*(missing|notfound)/i, cat: 'CONFIGURATION', w: 3, why: 'Missing/invalid ConfigMap, Secret or mount' },
  { re: /rbac|forbidden|unauthorized|serviceaccount/i, cat: 'CONFIGURATION', w: 2, why: 'Permission/RBAC misconfiguration' },

  // ── Capacity / scheduling ────────────────────────────────────────────────
  { re: /throttl/i, cat: 'CAPACITY', w: 3, why: 'CPU throttling against the configured limit' },
  { re: /failedscheduling|unschedulable|insufficient/i, cat: 'CAPACITY', w: 3, why: 'Scheduler cannot place the pod — insufficient resources' },
  { re: /replicamismatch|notallreplicas|deploymentreplicas/i, cat: 'CAPACITY', w: 2, why: 'Desired replicas not satisfied' },

  // ── External dependency ──────────────────────────────────────────────────
  { re: /connectionrefused|connectexception|timeout.*(socket|connect)|upstream|dns|resolve/i, cat: 'DEPENDENCY', w: 2, why: 'Failure reaching an external/downstream dependency' },
  { re: /database|postgres|mysql|oracle|mongo|redis|kafka/i, cat: 'DEPENDENCY', w: 2, why: 'Backing datastore involved' },
];

/** Evidence pulled from metrics — separates "app used too much" from "node ran out". */
function metricSignals(enrichment) {
  const out = [];
  const m = enrichment?.metrics || {};
  const last = (series) => {
    const arr = Array.isArray(series) ? series : series?.points || [];
    const v = arr.length ? arr[arr.length - 1] : null;
    return typeof v === 'number' ? v : (v?.value != null ? Number(v.value) : null);
  };

  const memLimit = Number(m.memoryLimitBytes || m.memory_limit || 0);
  const memUsed = last(m.memory);
  if (memLimit > 0 && memUsed > 0) {
    const pct = (memUsed / memLimit) * 100;
    if (pct > 90) out.push({ cat: 'APPLICATION', w: 3, why: `Memory at ${pct.toFixed(0)}% of its configured limit — the workload itself is the constraint` });
    else if (pct < 50) out.push({ cat: 'INFRASTRUCTURE', w: 1, why: `Memory only ${pct.toFixed(0)}% of limit — the workload was not memory-starved, look outside it` });
  }

  const cpu = last(m.cpu);
  if (cpu != null && cpu > 0.9) out.push({ cat: 'CAPACITY', w: 2, why: `CPU usage ~${cpu.toFixed(2)} cores sustained — near/over allocation` });

  return out;
}

/** Evidence pulled from container logs. */
function logSignals(enrichment) {
  const out = [];
  const logs = String(enrichment?.logs?.text || enrichment?.logs || '');
  if (!logs) return out;
  const tail = logs.slice(-6000);

  const checks = [
    { re: /panic:|fatal error|segmentation fault|stack trace|traceback/i, cat: 'APPLICATION', w: 3, why: 'Logs contain an application crash/stack trace' },
    { re: /out of memory|oomkill|cannot allocate memory/i, cat: 'APPLICATION', w: 3, why: 'Logs show memory exhaustion inside the container' },
    { re: /connection refused|no route to host|i\/o timeout|dial tcp/i, cat: 'DEPENDENCY', w: 3, why: 'Logs show failures connecting to a dependency' },
    { re: /permission denied|forbidden|unauthorized|401|403/i, cat: 'CONFIGURATION', w: 2, why: 'Logs show permission/credential failures' },
    { re: /no such file|not found.*config|missing.*(env|secret)/i, cat: 'CONFIGURATION', w: 2, why: 'Logs show missing configuration/files' },
  ];
  for (const c of checks) if (c.re.test(tail)) out.push({ cat: c.cat, w: c.w, why: c.why });
  return out;
}

/**
 * Deterministic classification with cited evidence.
 */
function classify(alert, enrichment) {
  const haystack = [
    alert?.alertname, alert?.message, alert?.description,
    alert?.annotations?.description, alert?.annotations?.summary,
    JSON.stringify(alert?.labels || {}),
  ].filter(Boolean).join(' ');

  const hits = [
    ...SIGNALS.filter((s) => s.re.test(haystack)).map(({ cat, w, why }) => ({ cat, w, why })),
    ...metricSignals(enrichment),
    ...logSignals(enrichment),
  ];

  if (!hits.length) {
    return { category: 'unknown', confidence: 0, signals: [], scores: {} };
  }

  const scores = {};
  for (const h of hits) scores[h.cat] = (scores[h.cat] || 0) + h.w;
  const [topCat, topScore] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const total = Object.values(scores).reduce((s, v) => s + v, 0);

  return {
    category: CATEGORIES[topCat] || 'unknown',
    confidence: Math.round((topScore / total) * 100),
    signals: hits.filter((h) => h.cat === topCat).map((h) => h.why),
    otherSignals: hits.filter((h) => h.cat !== topCat).map((h) => `${CATEGORIES[h.cat]}: ${h.why}`),
    scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [CATEGORIES[k] || k, v])),
  };
}

/** Compact the enrichment so the model sees signal, not noise. */
function summariseEnrichment(enrichment) {
  if (!enrichment) return 'No enrichment data available.';
  const parts = [];
  const m = enrichment.metrics || {};
  if (m.cpu || m.memory) {
    parts.push(`Metrics (10 min before alert): cpu points=${(m.cpu || []).length}, memory points=${(m.memory || []).length}` +
      (m.memoryLimitBytes ? `, memory limit=${(m.memoryLimitBytes / 1048576).toFixed(0)}Mi` : ''));
  }
  const logs = String(enrichment.logs?.text || enrichment.logs || '');
  if (logs) parts.push(`Container logs (tail):\n${logs.slice(-2500)}`);
  const d = enrichment.data || {};
  if (d.events) parts.push(`Kubernetes events:\n${String(d.events).slice(-1500)}`);
  if (d.describe) parts.push(`kubectl describe (excerpt):\n${String(d.describe).slice(-1500)}`);
  return parts.join('\n\n') || 'No enrichment data available.';
}

/**
 * Full analysis: deterministic verdict + AI narrative RCA and remediation.
 */
async function analyzeAlert(alert, enrichment) {
  const verdict = classify(alert, enrichment);

  const sys = `You are an SRE doing incident triage on a Kubernetes alert.
Respond with ONLY JSON:
{"classification":"infrastructure|application|configuration|capacity|external-dependency",
 "confidence":0-100,
 "summary":"one sentence a manager can read",
 "rootCause":"what actually went wrong and WHY, referencing the evidence",
 "evidence":["concrete observations from the data provided"],
 "resolutionSteps":[{"step":"imperative action","detail":"command or specifics","risk":"none|low|medium|high"}],
 "preventive":["how to stop it recurring"],
 "escalateTo":"platform|application-team|network|dba|none"}
Rules:
- Decide infrastructure vs application deliberately: infrastructure = node/control-plane/storage/network/host; application = the workload's own code, memory, probes or errors.
- Ground every claim in the supplied metrics/logs/events. If evidence is thin, say so in rootCause and lower confidence.
- resolutionSteps must be specific and ordered (real kubectl/commands where possible), not generic advice.
- No markdown, no prose outside the JSON.`;

  const user = [
    `Alert: ${alert?.alertname || 'unknown'}`,
    `Severity: ${alert?.severity || 'unknown'} | Status: ${alert?.status || 'unknown'}`,
    `Namespace: ${alert?.namespace || 'n/a'} | Pod: ${alert?.pod || 'n/a'} | Node: ${alert?.node || alert?.labels?.node || 'n/a'}`,
    `Message: ${alert?.message || alert?.annotations?.description || alert?.description || 'n/a'}`,
    '',
    `Heuristic pre-classification: ${verdict.category} (${verdict.confidence}% of weighted signals)`,
    verdict.signals.length ? `Supporting signals: ${verdict.signals.join('; ')}` : '',
    verdict.otherSignals?.length ? `Competing signals: ${verdict.otherSignals.join('; ')}` : '',
    '',
    summariseEnrichment(enrichment),
  ].filter(Boolean).join('\n');

  const raw = await ai.chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 3000 });
  const parsed = ai.extractJson(raw);

  if (parsed?.rootCause && Array.isArray(parsed.resolutionSteps)) {
    return {
      ...parsed,
      // Keep the deterministic verdict alongside so the UI can show both and
      // a reviewer can see when the model disagreed with the signals.
      heuristic: { classification: verdict.category, confidence: verdict.confidence, signals: verdict.signals },
      source: 'ai',
      analyzedAt: new Date().toISOString(),
    };
  }

  // Deterministic-only fallback — still genuinely useful.
  return {
    classification: verdict.category,
    confidence: verdict.confidence,
    summary: verdict.category === 'unknown'
      ? 'Not enough signal to classify this alert automatically.'
      : `Classified as a ${verdict.category} problem based on ${verdict.signals.length} matching signal(s).`,
    rootCause: verdict.signals.length
      ? `Weighted signal analysis points to ${verdict.category}: ${verdict.signals.join('; ')}.`
      : 'No matching signals — inspect the pod logs and recent events manually.',
    evidence: verdict.signals,
    resolutionSteps: fallbackSteps(verdict.category, alert),
    preventive: [],
    escalateTo: verdict.category === 'infrastructure' ? 'platform' : verdict.category === 'application' ? 'application-team' : 'none',
    heuristic: { classification: verdict.category, confidence: verdict.confidence, signals: verdict.signals },
    source: 'heuristic',
    analyzedAt: new Date().toISOString(),
  };
}

function fallbackSteps(category, alert) {
  const ns = alert?.namespace || '<namespace>';
  const pod = alert?.pod && alert.pod !== 'N/A' ? alert.pod : '<pod>';
  const base = {
    infrastructure: [
      { step: 'Check node condition', detail: `kubectl describe node <node> | grep -A6 Conditions`, risk: 'none' },
      { step: 'Inspect kubelet health', detail: 'systemctl status kubelet; journalctl -u kubelet --since "30 min ago"', risk: 'none' },
      { step: 'Cordon and drain if the node is faulty', detail: 'kubectl cordon <node> && kubectl drain <node> --ignore-daemonsets --delete-emptydir-data', risk: 'high' },
    ],
    application: [
      { step: 'Read the failing container logs', detail: `kubectl logs -n ${ns} ${pod} --previous --tail=200`, risk: 'none' },
      { step: 'Check restart reason and exit code', detail: `kubectl describe pod -n ${ns} ${pod} | grep -A8 "Last State"`, risk: 'none' },
      { step: 'Roll back or fix the workload', detail: `kubectl rollout undo deployment/<deploy> -n ${ns}`, risk: 'medium' },
    ],
    configuration: [
      { step: 'Verify image/registry reference', detail: `kubectl describe pod -n ${ns} ${pod} | grep -i image`, risk: 'none' },
      { step: 'Confirm referenced ConfigMaps/Secrets exist', detail: `kubectl get cm,secret -n ${ns}`, risk: 'none' },
      { step: 'Correct the manifest and redeploy', detail: 'Patch the workload with the fixed reference', risk: 'medium' },
    ],
    capacity: [
      { step: 'Compare usage against limits', detail: `kubectl top pod -n ${ns} ${pod}`, risk: 'none' },
      { step: 'Check why scheduling failed', detail: `kubectl describe pod -n ${ns} ${pod} | grep -A10 Events`, risk: 'none' },
      { step: 'Raise limits or add capacity', detail: 'Adjust requests/limits, or scale the node pool', risk: 'medium' },
    ],
    'external-dependency': [
      { step: 'Test connectivity from inside the pod', detail: `kubectl exec -n ${ns} ${pod} -- nc -zv <host> <port>`, risk: 'none' },
      { step: 'Verify DNS resolution', detail: `kubectl exec -n ${ns} ${pod} -- nslookup <host>`, risk: 'none' },
      { step: 'Check the dependency’s own health/status page', detail: 'Confirm whether the downstream service is degraded', risk: 'none' },
    ],
  };
  return base[category] || [
    { step: 'Inspect recent events', detail: `kubectl get events -n ${ns} --sort-by=.lastTimestamp | tail -20`, risk: 'none' },
    { step: 'Read container logs', detail: `kubectl logs -n ${ns} ${pod} --tail=200`, risk: 'none' },
  ];
}

module.exports = { analyzeAlert, classify, CATEGORIES, summariseEnrichment };

/**
 * Robusta-style root-cause investigation for an alert.
 *
 * Produces the shape the Timeline drawer renders:
 *   dataSources[]  — the evidence actually gathered, each with its real content
 *   keyFindings[]  — short factual bullets, each traceable to a data source
 *   conclusion     — narrative root cause + ranked possible causes
 *   appOrInfra     — application vs infrastructure, with reasoning
 *   relatedLogs    — the log lines that justify the conclusion
 *   resolutionSteps[] / preventive[]
 *
 * The LLM is this platform's own model (qwopus via vLLM, see aiService). The
 * previous implementation gated analysis on ANTHROPIC_API_KEY, which is never
 * set here, so every investigation silently degraded to a generic heuristic —
 * that is why the panel "showed some details that didn't make sense".
 *
 * Evidence is gathered first and always returned, so the drawer shows real
 * kubectl output even when the model is unavailable.
 */

const ai = require('./aiService');

/* ── evidence shaping ─────────────────────────────────────────────────── */

const trim = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more chars)` : s);

/**
 * Turn the enrichment blob into named, inspectable data sources.
 * Each entry mirrors a tool a human would have run by hand.
 */
function buildDataSources(alert, enrichment = {}) {
  const e = enrichment.data || enrichment || {};
  const out = [];

  const push = (id, title, content, meta) => {
    if (content === undefined || content === null) return;
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    if (!text || text === '{}' || text === '[]') return;
    out.push({ id, title: title || id, content: trim(text, 12000), ...(meta || {}) });
  };

  if (e.configChanges) push('fetch_configuration_changes', 'Configuration changes', e.configChanges);

  if (e.describe) {
    const d = e.describe;
    // A describe dump is what an engineer reads first; keep it recognisable.
    const lines = [];
    if (d.metadata) {
      lines.push(`Name:            ${d.metadata.name || alert.pod || '-'}`);
      lines.push(`Namespace:       ${d.metadata.namespace || alert.namespace || '-'}`);
      if (d.spec?.priorityClassName) lines.push(`Priority Class:  ${d.spec.priorityClassName}`);
      if (d.spec?.serviceAccountName) lines.push(`Service Account: ${d.spec.serviceAccountName}`);
      if (d.spec?.nodeName) lines.push(`Node:            ${d.spec.nodeName}`);
      if (d.status?.startTime) lines.push(`Start Time:      ${d.status.startTime}`);
      if (d.metadata.labels) {
        lines.push('Labels:');
        Object.entries(d.metadata.labels).slice(0, 10).forEach(([k, v]) => lines.push(`                 ${k}=${v}`));
      }
      if (d.status?.phase) lines.push(`Status:          ${d.status.phase}`);
      if (d.status?.podIP) lines.push(`IP:              ${d.status.podIP}`);
    }
    (d.status?.containerStatuses || []).forEach((cs) => {
      const state = Object.keys(cs.state || {})[0] || 'unknown';
      const reason = cs.state?.[state]?.reason;
      const exitCode = cs.state?.[state]?.exitCode ?? cs.lastState?.terminated?.exitCode;
      lines.push('');
      lines.push(`Container:       ${cs.name}`);
      lines.push(`  State:         ${state}${reason ? ` (${reason})` : ''}`);
      if (exitCode !== undefined) lines.push(`  Exit Code:     ${exitCode}`);
      lines.push(`  Restarts:      ${cs.restartCount ?? 0}`);
      lines.push(`  Ready:         ${cs.ready}`);
      if (cs.image) lines.push(`  Image:         ${cs.image}`);
    });
    push('kubectl_describe', 'kubectl describe', lines.join('\n') || d);
  }

  if (e.resource || e.get) push('kubectl_get_by_name', 'kubectl get', e.resource || e.get);

  const logBlock = (containers) => (containers || [])
    .map((c) => {
      const body = c.lines?.length ? c.lines.join('\n')
        : (c.errors || []).join('\n');
      return body ? `===== container: ${c.name} =====\n${body}` : '';
    })
    .filter(Boolean).join('\n\n');

  if (e.previousLogs?.containers) {
    push('kubectl_previous_logs_all_containers', 'Previous container logs', logBlock(e.previousLogs.containers));
  }
  if (e.currentLogs?.containers) {
    push('kubectl_logs_all_containers', 'Container logs', logBlock(e.currentLogs.containers));
  }
  if (e.events?.events) {
    push('kubectl_get_events', 'Kubernetes events',
      e.events.events.map((ev) => `${ev.lastTimestamp || ev.eventTime || ''}  ${ev.type}  ${ev.reason}  ${ev.message}`).join('\n'));
  }
  if (e.cpuMetrics && !e.cpuMetrics.error) push('prometheus_cpu', 'CPU metrics', e.cpuMetrics);
  if (e.memoryMetrics && !e.memoryMetrics.error) push('prometheus_memory', 'Memory metrics', e.memoryMetrics);
  if (e.promRules || e.prometheusRules) push('list_prometheus_rules', 'Prometheus rules', e.promRules || e.prometheusRules);

  return out;
}

/** The log lines most likely to explain the failure. */
function pickRelatedLogs(enrichment = {}) {
  const e = enrichment.data || enrichment || {};
  const pools = [e.currentLogs?.containers, e.previousLogs?.containers].filter(Boolean);
  const lines = [];
  for (const containers of pools) {
    for (const c of containers) {
      (c.errors || []).forEach((l) => lines.push(l));
      if (lines.length >= 12) break;
    }
  }
  if (!lines.length) {
    for (const containers of pools) {
      for (const c of containers) {
        (c.lines || []).slice(-6).forEach((l) => lines.push(l));
      }
    }
  }
  return lines.slice(0, 12);
}

/* ── deterministic analysis (always computed) ─────────────────────────── */

/**
 * Facts derived from evidence without the model. These are returned even when
 * the LLM answers, so the panel never shows an unsupported claim.
 */
function deterministicFindings(alert, enrichment = {}) {
  const e = enrichment.data || enrichment || {};
  const findings = [];
  const signals = { restarts: 0, oom: false, crashLoop: false, connRefused: false, imagePull: false, probe: false };

  const cs = e.describe?.status?.containerStatuses || [];
  for (const c of cs) {
    const state = Object.keys(c.state || {})[0];
    const reason = c.state?.[state]?.reason || c.lastState?.terminated?.reason;
    const exitCode = c.state?.[state]?.exitCode ?? c.lastState?.terminated?.exitCode;
    if (c.restartCount) signals.restarts = Math.max(signals.restarts, c.restartCount);
    if (/CrashLoopBackOff/i.test(reason || '')) signals.crashLoop = true;
    if (/OOMKilled/i.test(reason || '')) signals.oom = true;
    if (/ImagePullBackOff|ErrImagePull/i.test(reason || '')) signals.imagePull = true;
    if (reason || c.restartCount) {
      findings.push(`Container \`${c.name}\` is ${state}${reason ? ` (${reason})` : ''}`
        + `${c.restartCount ? `, with ${c.restartCount} restart${c.restartCount === 1 ? '' : 's'} so far` : ''}`
        + `${exitCode !== undefined ? `. Last exit code ${exitCode}` : ''}.`);
    }
    if (c.image) findings.push(`The container is running image \`${c.image}\`.`);
  }

  const logs = pickRelatedLogs(enrichment);
  const joined = logs.join('\n');
  if (/connection refused|connect: connection refused/i.test(joined)) signals.connRefused = true;
  if (/i\/o timeout|context deadline exceeded/i.test(joined)) signals.connRefused = true;
  if (/probe failed|readiness probe|liveness probe/i.test(joined)) signals.probe = true;

  const firstErr = logs.find((l) => /error|fatal|refused|timeout|exception/i.test(l));
  if (firstErr) findings.push(`Container logs show: "${firstErr.trim().slice(0, 240)}"`);

  if (e.memoryMetrics?.oomRisk) signals.oom = true;
  if (e.memoryMetrics && !e.memoryMetrics.error && e.memoryMetrics.limitBytes) {
    const pct = Math.round((e.memoryMetrics.currentBytes / e.memoryMetrics.limitBytes) * 100);
    if (Number.isFinite(pct)) findings.push(`Memory is at ${pct}% of its configured limit.`);
  }
  if (e.cpuMetrics?.spikeDetected) findings.push('A CPU spike was detected around the alert window.');
  if (e.configChanges?.length) findings.push(`${e.configChanges.length} configuration change(s) were recorded near the alert time.`);

  return { findings, signals, logs };
}

/** Infrastructure vs application, with the reason stated. */
function classify(alert, signals) {
  const name = String(alert.alertname || '');
  if (signals.connRefused) {
    return {
      verdict: 'infrastructure',
      reasoning: 'The workload cannot reach a dependency — the logs show refused or timed-out connections rather than an '
        + 'application-level exception. That points at networking, service availability or DNS rather than the code.',
    };
  }
  if (signals.oom) {
    return {
      verdict: 'infrastructure',
      reasoning: 'The container is being killed for exceeding its memory limit. This is a capacity/limits problem, '
        + 'though a genuine application leak can be the underlying driver.',
    };
  }
  if (signals.imagePull) {
    return { verdict: 'configuration', reasoning: 'The image cannot be pulled — a registry, tag or credentials problem, not running code.' };
  }
  if (/Node|Kubelet|Disk|Memory|CPU|Network/i.test(name) && !signals.crashLoop) {
    return { verdict: 'infrastructure', reasoning: `The alert "${name}" is raised against node-level resources rather than a workload.` };
  }
  if (signals.crashLoop) {
    return {
      verdict: 'application',
      reasoning: 'The container starts and then exits repeatedly with no external dependency failure in its logs, '
        + 'which usually means the process itself is failing at start-up.',
    };
  }
  return { verdict: 'unknown', reasoning: 'The gathered evidence does not clearly separate an application fault from an infrastructure one.' };
}

/* ── LLM narrative ────────────────────────────────────────────────────── */

async function llmNarrative(alert, dataSources, det) {
  const evidence = dataSources
    .map((d) => `--- ${d.id} ---\n${trim(d.content, 2500)}`)
    .join('\n\n');

  const prompt = `You are an SRE investigating a Kubernetes alert. Use ONLY the evidence below.

ALERT
  name:      ${alert.alertname}
  severity:  ${alert.severity || 'unknown'}
  status:    ${alert.status || 'unknown'}
  namespace: ${alert.namespace || '-'}
  pod:       ${alert.pod || '-'}
  cluster:   ${alert.clusterName || alert.clusterId || '-'}
  summary:   ${alert.annotations?.description || alert.annotations?.summary || alert.message || '-'}

EVIDENCE
${evidence || '(no enrichment was captured for this alert)'}

Return ONLY JSON:
{
  "keyFindings": ["short factual bullet grounded in the evidence", "..."],
  "rootCause": "one paragraph naming the most likely cause and the evidence for it",
  "possibleCauses": [{"title":"short name","detail":"why this could explain it"}],
  "appOrInfra": {"verdict":"application|infrastructure|configuration|external-dependency|unknown","reasoning":"why"},
  "resolutionSteps": [{"step":"imperative action","detail":"what it does","command":"kubectl ... (optional)","risk":"low|medium|high"}],
  "preventive": ["how to stop it recurring"]
}

Rules: never invent pod names, images, IPs or numbers that are not in the evidence.
If the evidence is insufficient, say so in rootCause and keep arrays short.`;

  const raw = await ai.chat(
    [{ role: 'system', content: 'You are a precise SRE. Output strict JSON only, no prose, no markdown fences.' },
      { role: 'user', content: prompt }],
    { maxTokens: 3000, temperature: 0.1 }
  );
  const parsed = ai.extractJson(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('model did not return usable JSON');
  return parsed;
}

/* ── entry point ──────────────────────────────────────────────────────── */

async function investigate(alert, enrichment = {}) {
  const dataSources = buildDataSources(alert, enrichment);
  const det = deterministicFindings(alert, enrichment);
  const heuristicClass = classify(alert, det.signals);

  const base = {
    alertname: alert.alertname,
    dataSources,
    relatedLogs: det.logs,
    keyFindings: det.findings,
    appOrInfra: heuristicClass,
    investigatedAt: new Date().toISOString(),
  };

  if (!ai.available()) {
    return {
      ...base,
      source: 'heuristic',
      modelNote: 'The analysis model is not reachable, so this is derived from the gathered evidence alone.',
      rootCause: det.findings.length
        ? `Based on the evidence gathered: ${det.findings[0]}`
        : 'Not enough evidence was captured for this alert to determine a cause.',
      possibleCauses: [],
      resolutionSteps: [],
      preventive: [],
    };
  }

  try {
    const llm = await llmNarrative(alert, dataSources, det);
    return {
      ...base,
      source: 'ai',
      model: ai.LLM_MODEL,
      // Deterministic findings lead; the model's additions follow. A finding we
      // derived ourselves is always traceable to a data source, the model's may
      // not be, so they are not silently merged into one list.
      keyFindings: [...det.findings, ...(Array.isArray(llm.keyFindings) ? llm.keyFindings : [])]
        .filter((v, i, a) => a.indexOf(v) === i).slice(0, 10),
      rootCause: llm.rootCause || base.rootCause,
      possibleCauses: Array.isArray(llm.possibleCauses) ? llm.possibleCauses.slice(0, 6) : [],
      appOrInfra: llm.appOrInfra?.verdict
        ? { ...llm.appOrInfra, heuristic: heuristicClass.verdict }
        : heuristicClass,
      resolutionSteps: Array.isArray(llm.resolutionSteps) ? llm.resolutionSteps.slice(0, 8) : [],
      preventive: Array.isArray(llm.preventive) ? llm.preventive.slice(0, 6) : [],
    };
  } catch (e) {
    return {
      ...base,
      source: 'heuristic',
      modelNote: `The model could not complete this investigation (${e.message}); showing what the evidence supports.`,
      rootCause: det.findings.length ? `Based on the evidence gathered: ${det.findings[0]}` : 'Insufficient evidence.',
      possibleCauses: [],
      resolutionSteps: [],
      preventive: [],
    };
  }
}

/**
 * Follow-up chat, grounded in the same investigation.
 * The evidence and the prior analysis are both in context, so the answer is
 * about THIS alert rather than generic Kubernetes advice.
 */
async function followUp(alert, enrichment, analysis, question, history = []) {
  if (!ai.available()) {
    throw new Error('The analysis model is not reachable, so follow-up questions cannot be answered right now.');
  }
  const dataSources = analysis?.dataSources || buildDataSources(alert, enrichment);
  const evidence = dataSources.map((d) => `--- ${d.id} ---\n${trim(d.content, 1800)}`).join('\n\n');

  const system = `You are an SRE assistant answering questions about one specific Kubernetes alert.
Ground every answer in the evidence provided. If the evidence does not answer the question, say so plainly
and name what would need to be collected. Be concise. Use markdown. Never invent names, numbers or IPs.`;

  const context = `ALERT: ${alert.alertname} (${alert.severity || '?'}) in ${alert.namespace || '?'}${alert.pod ? ` / pod ${alert.pod}` : ''}

PRIOR ANALYSIS
root cause: ${analysis?.rootCause || '(none yet)'}
classification: ${analysis?.appOrInfra?.verdict || 'unknown'}
key findings:
${(analysis?.keyFindings || []).map((f) => `- ${f}`).join('\n') || '- none'}

EVIDENCE
${evidence || '(none captured)'}`;

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: context },
    ...history.slice(-6).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
    { role: 'user', content: String(question) },
  ];

  const answer = await ai.chat(messages, { maxTokens: 1800, temperature: 0.2 });
  return { answer: String(answer || '').trim(), model: ai.LLM_MODEL };
}

module.exports = { investigate, followUp, buildDataSources, deterministicFindings, classify };

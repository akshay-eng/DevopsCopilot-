/**
 * Writes the human-readable story of a correlated incident.
 *
 * Correlation produces structure — alert names, pods, namespaces, a root-cause
 * score, a causal chain. None of that tells an on-call engineer what is wrong in
 * a sentence, and a ServiceNow incident whose description is a field dump is
 * what people mean when they say the incident "has no proper description".
 *
 * Written ONCE per incident and stored. The same incident re-observed must not
 * read differently each pass, and re-asking the model for an answer that cannot
 * have changed is pure latency. Callers force a rewrite explicitly.
 *
 * The template path is not a stub: with no model at all it still produces a
 * correct, specific description from the same evidence.
 */

const ai = require('./aiService');

const n = (v) => Number(v) || 0;

/** Order severities worst-first so the headline leads with the worst thing. */
const SEV_RANK = { critical: 0, high: 1, warning: 2, medium: 3, low: 4, info: 5, none: 6, unknown: 7 };

function worstSeverity(severities = {}) {
  return Object.keys(severities)
    .filter((s) => severities[s] > 0)
    .sort((a, b) => (SEV_RANK[a] ?? 9) - (SEV_RANK[b] ?? 9))[0] || 'unknown';
}

function duration(timeRange = {}) {
  const s = n(timeRange.durationSeconds);
  if (!s) return null;
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 172800) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/** A short, specific name — "what broke, where" — never a generic label. */
function buildTitle(inc) {
  const names = inc.alertNames || [];
  const nss = inc.namespaces || [];
  const where = nss.length === 1 ? `ns/${nss[0]}` : nss.length > 1 ? `${nss.length} namespaces` : '';
  const sev = worstSeverity(inc.severities);
  const sevPrefix = sev === 'critical' ? 'Critical: ' : '';

  if (names.length === 0) return `${sevPrefix}Correlated incident${where ? ` in ${where}` : ''}`;
  if (names.length === 1) return `${sevPrefix}${names[0]}${where ? ` in ${where}` : ''}`;

  // Several distinct alerts: name the family if they share one, else count them.
  const fam = (inc.families || [])[0];
  const lead = names[0];
  if (fam && (inc.families || []).length === 1) {
    return `${sevPrefix}${fam} failure${where ? ` in ${where}` : ''} — ${names.length} related alerts`;
  }
  return `${sevPrefix}${lead} +${names.length - 1} related${where ? ` in ${where}` : ''}`;
}

/**
 * The facts, as prose. Used verbatim when there is no model, and handed to the
 * model as grounding when there is — so the AI version cannot drift from what
 * actually happened.
 */
function buildTemplate(inc) {
  const lines = [];
  const conds = n(inc.conditionCount) || (inc.alertNames || []).length;
  const occ = n(inc.occurrenceCount) || n(inc.alertCount);
  const nss = inc.namespaces || [];
  const pods = inc.pods || [];
  const dur = duration(inc.timeRange);
  const sev = worstSeverity(inc.severities);

  const firing = n(inc.statuses?.firing);
  const state = firing > 0 ? `still firing` : `no longer firing`;

  lines.push(
    `${conds} distinct alert condition${conds === 1 ? '' : 's'}`
    + `${occ > conds ? ` (${occ} notifications)` : ''} correlated into one incident`
    + `${nss.length ? ` across ${nss.length === 1 ? `namespace ${nss[0]}` : `${nss.length} namespaces: ${nss.join(', ')}`}` : ''}`
    + `${dur ? `, spanning ${dur}` : ''}. Worst severity ${sev}; ${state}.`
  );

  if (inc.alertNames?.length) {
    lines.push('', `Alerts: ${inc.alertNames.join(', ')}.`);
  }

  if (inc.rootCause?.pod) {
    const rc = inc.rootCause;
    lines.push(
      '',
      `Most likely origin: ${rc.pod}${rc.namespace ? ` in ns/${rc.namespace}` : ''}`
      + `${rc.score != null ? ` (confidence score ${Number(rc.score).toFixed(2)})` : ''}.`
      + `${rc.anomalySummary ? ` ${rc.anomalySummary}` : ''}`
    );
    if (rc.anomalousMetrics?.length) {
      lines.push(`Anomalous metrics: ${rc.anomalousMetrics.join(', ')}.`);
    }
  }

  if (inc.causalChain?.length) {
    lines.push('', 'Causal chain:');
    inc.causalChain.slice(0, 6).forEach((c) => {
      lines.push(`  ${c.role || 'affected'}: ${c.pod}${c.anomaly ? ` — ${c.anomaly}` : ''}`);
    });
  }

  if (inc.evidence?.length) {
    lines.push('', 'Evidence:');
    inc.evidence.slice(0, 8).forEach((e) => lines.push(`  - ${e}`));
  }

  if (pods.length) {
    lines.push('', `Affected pods (${pods.length}): ${pods.slice(0, 12).join(', ')}${pods.length > 12 ? ', …' : ''}`);
  }
  if (inc.nodes?.length) {
    lines.push(`Nodes: ${inc.nodes.join(', ')}.`);
  }
  if (inc.downstreamImpact?.length) {
    lines.push('', `Downstream impact: ${inc.downstreamImpact.slice(0, 8).join(', ')}.`);
  }

  return lines.join('\n');
}

/**
 * @param inc a CorrelatedIncident (document or plain object)
 * @returns {{title, description, source}}
 */
async function describe(inc) {
  const title = buildTitle(inc);
  const template = buildTemplate(inc);

  if (!ai.available()) return { title, description: template, source: 'template' };

  const context = {
    alertNames: inc.alertNames || [],
    namespaces: inc.namespaces || [],
    pods: (inc.pods || []).slice(0, 20),
    nodes: inc.nodes || [],
    workloads: (inc.workloads || []).slice(0, 15),
    families: inc.families || [],
    severities: inc.severities || {},
    statuses: inc.statuses || {},
    distinctConditions: n(inc.conditionCount),
    totalNotifications: n(inc.occurrenceCount),
    durationSeconds: n(inc.timeRange?.durationSeconds),
    rootCause: inc.rootCause || {},
    causalChain: (inc.causalChain || []).slice(0, 8),
    evidence: (inc.evidence || []).slice(0, 10),
    downstreamImpact: (inc.downstreamImpact || []).slice(0, 8),
  };

  try {
    const r = await ai.summarise({
      title:
        'Write the incident record for this correlated Kubernetes incident. '
        + 'Return JSON: {"title":"one line, under 110 chars, names the failing component and where",'
        + '"description":"3-6 short paragraphs: what is happening, the likely origin and why the '
        + 'evidence points there, the blast radius, and what to check first"}. '
        + 'Use ONLY the facts given — never invent pod names, numbers or causes. '
        + 'Write for an on-call engineer who has not seen this before.',
      context,
      maxTokens: 6000,
      timeout: 300000,
    });

    if (r?.title && r?.description) {
      return {
        title: String(r.title).slice(0, 200),
        // Keep the structured evidence under the narrative: the prose explains,
        // the appendix is what someone verifies against.
        description: `${r.description}\n\n--- Correlated evidence ---\n${template}`,
        source: 'ai',
      };
    }
  } catch (e) {
    console.warn('[NARRATIVE] model failed, using template:', e.message);
  }

  return { title, description: template, source: 'template' };
}

/**
 * Fill in title/description if absent. Returns true when it changed the doc.
 * @param force rewrite even if one already exists (the "regenerate" path)
 */
async function ensureNarrative(inc, { force = false } = {}) {
  if (!force && inc.title && inc.description) return false;
  const { title, description, source } = await describe(inc);
  inc.title = title;
  inc.description = description;
  inc.narrativeSource = source;
  inc.narrativeAt = new Date();
  return true;
}

module.exports = { describe, ensureNarrative, buildTitle, buildTemplate, worstSeverity };

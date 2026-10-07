/**
 * Natural language → dashboard widget.
 *
 * The AI COMPOSES a visualisation rather than picking one from a menu. Instead
 * of choosing among a handful of pre-baked `dataSource` ids, the model emits a
 * small query: which dataset, how to group it, what to measure, how to filter,
 * sort and split into series. The frontend evaluates that against real fleet
 * rows, so a request like "critical vulnerabilities per cluster, stacked by
 * severity, top 10" produces a chart nobody wrote a rule for.
 *
 * 🔑 Why the old version always felt rules-based:
 *   - it read TRENDS_LLM_URL / VLLM_URL, neither of which is set here, so the
 *     LLM branch returned null before making a request; and
 *   - it asked for max_tokens: 220 from a REASONING model, which spends its
 *     budget on the reasoning trace and then returns content: null.
 * Both meant it silently fell through to the keyword mapper every single time.
 * It now goes through aiService, which owns the correct endpoint and budget.
 */

const crypto = require('crypto');
const ai = require('./aiService');

const WIDGET_TYPES = [
  'stat', 'line', 'area', 'bar', 'stackedBar', 'horizontalBar',
  'donut', 'radar', 'funnel', 'treemap', 'scatter', 'table',
];

/**
 * Datasets are fleet-wide: every row carries `cluster`, so any of these can be
 * grouped or split by cluster without a separate "by cluster" variant.
 */
const DATASETS = {
  alerts: {
    describe: 'One row per alert occurrence across every connected cluster.',
    fields: ['cluster', 'namespace', 'severity', 'status', 'alertname', 'pod', 'node', 'time'],
    metrics: ['count'],
  },
  vulnerabilities: {
    describe: 'One row per vulnerability finding across the fleet.',
    fields: ['cluster', 'namespace', 'severity', 'image', 'workload', 'package', 'fixable', 'cve'],
    metrics: ['count'],
  },
  pods: {
    describe: 'One row per pod across the fleet.',
    fields: ['cluster', 'namespace', 'status', 'node', 'workload', 'image', 'restarts', 'ageDays'],
    metrics: ['count', 'restarts', 'ageDays'],
  },
  nodes: {
    describe: 'One row per node across the fleet.',
    fields: ['cluster', 'name', 'status', 'role', 'cpuCores', 'memoryGi', 'podCount', 'podCapacity'],
    metrics: ['count', 'cpuCores', 'memoryGi', 'podCount'],
  },
  workloads: {
    describe: 'Deployments and statefulsets across the fleet.',
    fields: ['cluster', 'namespace', 'name', 'kind', 'ready', 'desired', 'degraded', 'ageDays'],
    metrics: ['count', 'desired', 'ready'],
  },
  cost: {
    describe: 'Cost allocation rows (per namespace / workload / node).',
    fields: ['cluster', 'namespace', 'workload', 'node', 'cpuCost', 'ramCost', 'totalCost', 'efficiency'],
    metrics: ['totalCost', 'cpuCost', 'ramCost', 'efficiency', 'count'],
  },
  compliance: {
    describe: 'Compliance check results per cluster.',
    fields: ['cluster', 'rule', 'category', 'severity', 'status'],
    metrics: ['count'],
  },
};

const AGGS = ['count', 'sum', 'avg', 'max', 'min'];
const SORTS = ['value_desc', 'value_asc', 'label_asc', 'label_desc', 'time_asc'];

const uid = () => `w-${crypto.randomBytes(4).toString('hex')}`;

/* ── validation ───────────────────────────────────────────────────────── */

const clampInt = (v, lo, hi, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

/**
 * Coerce whatever the model returned into a spec the renderer can trust.
 * Anything unrecognised is dropped rather than passed through, so a bad field
 * name cannot reach the evaluator.
 */
function validateSpec(raw = {}) {
  const ds = DATASETS[raw.dataset] ? raw.dataset : 'alerts';
  const meta = DATASETS[ds];
  const field = (f) => (meta.fields.includes(f) ? f : null);

  const type = WIDGET_TYPES.includes(raw.type) ? raw.type : 'bar';
  const agg = AGGS.includes(raw.agg) ? raw.agg : 'count';
  const metric = agg === 'count'
    ? 'count'
    : (meta.metrics.includes(raw.metric) ? raw.metric : 'count');

  const filters = Array.isArray(raw.filters) ? raw.filters
    .map((f) => ({
      field: field(f.field),
      op: ['eq', 'ne', 'in', 'contains', 'gt', 'gte', 'lt', 'lte'].includes(f.op) ? f.op : 'eq',
      value: f.value,
    }))
    .filter((f) => f.field && f.value !== undefined && f.value !== null)
    .slice(0, 5) : [];

  return {
    id: raw.id || uid(),
    type,
    dataset: ds,
    groupBy: type === 'stat' ? null : (field(raw.groupBy) || field(meta.fields[1]) || meta.fields[0]),
    splitBy: field(raw.splitBy) || null,          // -> stacked / multi-series
    metric,
    agg,
    filters,
    sort: SORTS.includes(raw.sort) ? raw.sort : 'value_desc',
    limit: clampInt(raw.limit, 1, 50, 10),
    title: String(raw.title || '').slice(0, 80) || 'Custom widget',
    subtitle: raw.subtitle ? String(raw.subtitle).slice(0, 140) : undefined,
    // Fleet-wide unless the model explicitly scoped to one cluster via filters.
    scope: 'fleet',
  };
}

/* ── AI composition ───────────────────────────────────────────────────── */

function catalogPrompt() {
  return Object.entries(DATASETS).map(([k, v]) => {
    return `- ${k}: ${v.describe}\n    fields: ${v.fields.join(', ')}\n    numeric metrics: ${v.metrics.join(', ')}`;
  }).join('\n');
}

async function llmSpec(prompt, context = {}) {
  if (!ai.available()) return null;

  const counts = context.counts && Object.keys(context.counts).length
    ? `\nRows currently available per dataset (0 means there is NO data — do not choose it):\n${
      Object.entries(context.counts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : '';
  const clusters = Array.isArray(context.clusters) && context.clusters.length
    ? `\nConnected clusters: ${context.clusters.join(', ')}`
    : '';

  const sys = `You design ONE dashboard widget by composing a query. Output strict JSON only.

DATASETS (all rows are fleet-wide and every row has a "cluster" field):
${catalogPrompt()}${counts}${clusters}

Output JSON:
{
  "type": one of ${WIDGET_TYPES.join('|')},
  "dataset": one of ${Object.keys(DATASETS).join('|')},
  "groupBy": a field to group rows by (omit for type "stat"),
  "splitBy": optional second field -> stacked bars / multiple series,
  "agg": one of ${AGGS.join('|')},
  "metric": numeric field when agg is not "count",
  "filters": [{"field":"...","op":"eq|ne|in|contains|gt|gte|lt|lte","value":...}],
  "sort": one of ${SORTS.join('|')},
  "limit": number,
  "title": short human title,
  "subtitle": one short clarifying line
}

Guidance:
- "across clusters" / "per cluster" / "fleet" -> groupBy "cluster", or splitBy "cluster" when something else is already grouped.
- Ranking words (top, worst, noisiest, most) -> horizontalBar, sort value_desc.
- Over time / trend -> line or area with groupBy "time".
- Share / proportion / breakdown -> donut.
- A single number -> type "stat" with no groupBy.
- Severity words like "critical" are FILTERS, not groupings: {"field":"severity","op":"eq","value":"critical"}.
- Never choose a dataset whose row count is 0.
- Pick the dataset by SUBJECT, not by convenience: "vulnerabilities"/"CVE" -> vulnerabilities,
  "alerts"/"firing" -> alerts, "cost"/"spend" -> cost, "restarts"/"pods" -> pods. Never answer a
  vulnerability question with alert data.
- Do NOT add a cluster filter unless the user named a specific cluster. Fleet-wide is the default.
- "stacked" means set splitBy, not just type.

Worked examples:
user: compare critical vulnerabilities across every cluster as a stacked bar
{"type":"stackedBar","dataset":"vulnerabilities","groupBy":"cluster","splitBy":"severity","agg":"count","filters":[{"field":"severity","op":"eq","value":"critical"}],"sort":"value_desc","limit":10,"title":"Critical vulnerabilities by cluster"}

user: top 5 noisiest namespaces
{"type":"horizontalBar","dataset":"alerts","groupBy":"namespace","agg":"count","filters":[],"sort":"value_desc","limit":5,"title":"Noisiest namespaces"}

user: memory cost per cluster over the fleet
{"type":"bar","dataset":"cost","groupBy":"cluster","agg":"sum","metric":"ramCost","filters":[],"sort":"value_desc","limit":10,"title":"Memory cost by cluster"}

Respond with the JSON object only — no prose, no markdown fence.`;

  try {
    const raw = await ai.chat(
      [{ role: 'system', content: sys }, { role: 'user', content: prompt }],
      // Generous budget: the on-prem model is a reasoning model and a small cap
      // gets consumed entirely by its trace, returning empty content.
      { maxTokens: 1800, temperature: 0 }
    );
    const parsed = ai.extractJson(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { ...validateSpec(parsed), source: 'ai', model: ai.LLM_MODEL };
  } catch (e) {
    console.error('[nlpWidget] model failed:', e.message);
    return null;
  }
}

/* ── deterministic fallback ───────────────────────────────────────────── */

/**
 * Used only when the model is unreachable. Deliberately simple: its job is to
 * keep the feature usable offline, not to imitate the model.
 */
function heuristicSpec(prompt) {
  const p = String(prompt || '').toLowerCase();
  const dataset = /vuln|cve|security/.test(p) ? 'vulnerabilities'
    : /cost|spend|\$|budget/.test(p) ? 'cost'
      : /node/.test(p) ? 'nodes'
        : /pod|container|restart/.test(p) ? 'pods'
          : /deployment|workload|replica/.test(p) ? 'workloads'
            : /complian|policy|baseline/.test(p) ? 'compliance'
              : 'alerts';

  const groupBy = /per cluster|across (all )?clusters?|by cluster|fleet/.test(p) ? 'cluster'
    : /namespace/.test(p) ? 'namespace'
      : /node/.test(p) ? 'node'
        : /over time|trend|timeline/.test(p) ? 'time'
          : /severity|critical|warning/.test(p) ? 'severity'
            : DATASETS[dataset].fields[1];

  const type = /donut|pie|share|proportion/.test(p) ? 'donut'
    : /over time|trend|timeline/.test(p) ? 'line'
      : /stacked/.test(p) ? 'stackedBar'
        : /top|worst|rank|most|noisiest/.test(p) ? 'horizontalBar'
          : /total|how many|count of/.test(p) && !/by |per /.test(p) ? 'stat'
            : 'bar';

  const filters = [];
  if (/\bcritical\b/.test(p)) filters.push({ field: 'severity', op: 'eq', value: 'critical' });
  else if (/\bhigh\b/.test(p)) filters.push({ field: 'severity', op: 'eq', value: 'high' });

  return {
    ...validateSpec({ type, dataset, groupBy, filters, sort: 'value_desc', limit: 10, title: '' }),
    source: 'heuristic',
  };
}

/**
 * Legacy `dataSource` id for the existing renderer.
 *
 * TrendsWidget still binds on `spec.dataSource`; until it learns to evaluate
 * the composed query it would show "No data" for every AI-built widget. Mapping
 * the common (dataset, groupBy) pairs back keeps those widgets rendering, and
 * anything without a mapping is marked so the UI can say why rather than
 * silently drawing an empty chart.
 */
const LEGACY_SOURCE = {
  'alerts|time': 'alerts_over_time',
  'alerts|severity': 'alerts_by_severity',
  'alerts|namespace': 'alerts_by_namespace',
  'alerts|cluster': 'alerts_by_cluster',
  'alerts|alertname': 'alerts_top',
  'vulnerabilities|severity': 'vuln_by_severity',
  'vulnerabilities|namespace': 'vuln_by_namespace',
  'vulnerabilities|image': 'vuln_top_images',
};

function withLegacySource(spec) {
  if (spec.type === 'stat') {
    spec.dataSource = spec.dataset === 'vulnerabilities' ? 'vuln_summary' : 'alerts_summary';
    return spec;
  }
  const key = `${spec.dataset}|${spec.groupBy}`;
  const legacy = LEGACY_SOURCE[key];
  if (legacy) spec.dataSource = legacy;
  else spec.needsEvaluator = true; // the renderer cannot bind this one yet
  return spec;
}

/* ── entry point ──────────────────────────────────────────────────────── */

/**
 * @param prompt  natural language request
 * @param context { counts: {dataset: rowCount}, clusters: [names] }
 */
async function generateWidget(prompt, context = {}) {
  const spec = (await llmSpec(prompt, context)) || heuristicSpec(prompt);

  // Refuse honestly when the chosen dataset genuinely has no rows.
  const counts = context.counts || {};
  if (Object.keys(counts).length && !counts[spec.dataset]) {
    const alt = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    if (!alt) {
      return {
        possible: false,
        prompt,
        reason: 'There is no data in any dataset yet, so nothing can be plotted.',
      };
    }
    return {
      possible: false,
      prompt,
      requested: spec.dataset,
      reason: `There are no ${spec.dataset} rows to plot. ${alt[0]} has ${alt[1]} rows if you want that instead.`,
    };
  }

  if (!spec.title || spec.title === 'Custom widget') {
    const what = spec.agg === 'count' ? spec.dataset : `${spec.agg} ${spec.metric}`;
    spec.title = spec.groupBy ? `${what} by ${spec.groupBy}` : `Total ${what}`;
  }

  return { ...withLegacySource(spec), possible: true, prompt, createdAt: new Date().toISOString() };
}

module.exports = {
  generateWidget, validateSpec, withLegacySource, LEGACY_SOURCE, DATASETS, WIDGET_TYPES, AGGS, SORTS, heuristicSpec,
};

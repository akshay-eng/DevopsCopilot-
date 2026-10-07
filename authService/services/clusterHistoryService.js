/**
 * Historical cluster metrics from Prometheus.
 *
 * The resource API only ever reports CURRENT state, so the Trends Kubernetes tab
 * had no time dimension at all. Prometheus has one — but only as far back as its
 * retention window, which on a default install is far shorter than the 7D/30D the
 * UI offers. Every response therefore carries the detected retention so the client
 * can say what it cannot show instead of drawing an empty chart.
 */

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';
const TIMEOUT_MS = Number(process.env.PROM_TIMEOUT_MS || 20000);

const fetchJson = async (url) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`prometheus ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
};

/** "12h" / "15d" / "0s" (meaning unlimited) -> hours. */
const parseRetention = (s) => {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([smhdwy])$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = { s: 1 / 3600, m: 1 / 60, h: 1, d: 24, w: 168, y: 8760 }[m[2].toLowerCase()];
  const hours = n * mult;
  return hours > 0 ? hours : null; // 0 means "no time-based limit"
};

let retentionCache = { at: 0, hours: null };
const retentionHours = async () => {
  if (Date.now() - retentionCache.at < 300000) return retentionCache.hours;
  let hours = null;
  try {
    const j = await fetchJson(`${PROMETHEUS_URL}/api/v1/status/runtimeinfo`);
    hours = parseRetention(j?.data?.storageRetention);
  } catch (e) { /* fall through — unknown retention is not fatal */ }
  retentionCache = { at: Date.now(), hours };
  return hours;
};

const queryRange = async (query, start, end, step) => {
  const u = new URL(`${PROMETHEUS_URL}/api/v1/query_range`);
  u.searchParams.set('query', query);
  u.searchParams.set('start', String(start));
  u.searchParams.set('end', String(end));
  u.searchParams.set('step', String(step));
  const j = await fetchJson(u.toString());
  if (j?.status !== 'success') throw new Error(j?.error || 'query failed');
  return j.data?.result || [];
};

/** A single unlabelled series -> [{t, v}] with nulls dropped. */
const single = (result) => (result?.[0]?.values || [])
  .map(([t, v]) => ({ t: t * 1000, v: Number(v) }))
  .filter((p) => Number.isFinite(p.v));

/** A `by (label)` result -> { [labelValue]: [{t, v}] }. */
const byLabel = (result, label) => {
  const out = {};
  (result || []).forEach((s) => {
    const key = s.metric?.[label];
    if (!key) return;
    out[key] = (s.values || []).map(([t, v]) => ({ t: t * 1000, v: Number(v) })).filter((p) => Number.isFinite(p.v));
  });
  return out;
};

const QUERIES = {
  cpuUsedCores: 'sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))',
  cpuCapacityCores: 'sum(kube_node_status_allocatable{resource="cpu"})',
  memUsedBytes: 'sum(container_memory_working_set_bytes{container!=""})',
  memCapacityBytes: 'sum(kube_node_status_allocatable{resource="memory"})',
  podsTotal: 'count(kube_pod_info)',
  nodesReady: 'count(kube_node_status_condition{condition="Ready",status="true"} == 1)',
  restarts: 'sum(increase(kube_pod_container_status_restarts_total[30m]))',
};

/**
 * @param hours how far back the caller asked for
 * @returns { available, retentionHours, requestedHours, effectiveHours, truncated, step, series }
 */
async function getClusterHistory(hours = 24) {
  const requested = Math.max(1, Math.min(720, Number(hours) || 24));
  const retention = await retentionHours();

  // Never ask Prometheus for a window it cannot answer — it returns a
  // near-empty series that looks like "the cluster was idle", not "no data".
  const effective = retention ? Math.min(requested, retention) : requested;
  const end = Math.floor(Date.now() / 1000);
  const start = end - Math.round(effective * 3600);
  const step = Math.max(60, Math.round((effective * 3600) / 120)); // ~120 points

  const keys = Object.keys(QUERIES);
  const settled = await Promise.allSettled(keys.map((k) => queryRange(QUERIES[k], start, end, step)));

  const raw = {};
  const failed = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') raw[keys[i]] = r.value;
    else failed.push(keys[i]);
  });

  if (failed.length === keys.length) {
    return {
      available: false,
      reason: 'Prometheus is not reachable from the backend.',
      retentionHours: retention, requestedHours: requested, series: {},
    };
  }

  let phases = {};
  try {
    phases = byLabel(await queryRange('sum by (phase) (kube_pod_status_phase)', start, end, step), 'phase');
  } catch (e) { /* optional */ }

  // Utilisation is a ratio of two series; align on the used-series timestamps so
  // a missing capacity sample drops the point rather than inventing a spike.
  const ratio = (usedKey, capKey) => {
    const used = single(raw[usedKey]);
    const cap = single(raw[capKey]);
    if (!used.length || !cap.length) return [];
    const capAt = new Map(cap.map((p) => [p.t, p.v]));
    let last = cap[0].v;
    return used.map((p) => {
      if (capAt.has(p.t)) last = capAt.get(p.t);
      return last > 0 ? { t: p.t, v: Math.round((p.v / last) * 1000) / 10 } : null;
    }).filter(Boolean);
  };

  const latest = (arr) => (arr.length ? arr[arr.length - 1].v : null);
  const cpuPct = ratio('cpuUsedCores', 'cpuCapacityCores');
  const memPct = ratio('memUsedBytes', 'memCapacityBytes');

  return {
    available: true,
    retentionHours: retention,
    requestedHours: requested,
    effectiveHours: Math.round(effective * 10) / 10,
    truncated: !!retention && requested > retention,
    step,
    failedQueries: failed,
    current: {
      cpuPct: latest(cpuPct),
      memPct: latest(memPct),
      cpuUsedCores: latest(single(raw.cpuUsedCores)),
      cpuCapacityCores: latest(single(raw.cpuCapacityCores)),
      memUsedBytes: latest(single(raw.memUsedBytes)),
      memCapacityBytes: latest(single(raw.memCapacityBytes)),
      pods: latest(single(raw.podsTotal)),
      nodesReady: latest(single(raw.nodesReady)),
    },
    series: {
      cpuPct, memPct,
      cpuUsedCores: single(raw.cpuUsedCores),
      memUsedBytes: single(raw.memUsedBytes),
      pods: single(raw.podsTotal),
      nodesReady: single(raw.nodesReady),
      restarts: single(raw.restarts),
      phases,
    },
  };
}

module.exports = { getClusterHistory, parseRetention, retentionHours };

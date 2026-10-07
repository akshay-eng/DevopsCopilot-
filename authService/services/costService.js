/**
 * Kubernetes cost, from OpenCost.
 *
 * OpenCost (CNCF, the open-source core of Kubecost) is queried over its HTTP
 * allocation API. Two things matter for reading the numbers honestly:
 *
 *  1. On a bare-metal cluster there is no cloud billing API, so every figure
 *     derives from the custom price list in the opencost-pricing ConfigMap.
 *     `pricingSource` is reported on every response so the UI can say so
 *     rather than implying the numbers came from an invoice.
 *
 *  2. OpenCost computes allocations from Prometheus, so its history is bounded
 *     by Prometheus retention — which on this cluster is 12h. A "30d" window
 *     therefore returns far less than 30 days. The retention is reported
 *     alongside, and `truncated` is set when the ask exceeds it.
 */

const { retentionHours } = require('./clusterHistoryService');
const { getIntegrationConfig } = require('../utils/integrationCrypto');
const { request, authHeaders, cleanHeaders } = require('./connectors/http');

const ENV_URL = (process.env.OPENCOST_URL || '').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.OPENCOST_TIMEOUT_MS || 25000);
const CURRENCY = process.env.COST_CURRENCY || 'USD';

/**
 * Both products speak the same allocation model but mount it at a different
 * path, so the provider is resolved once and the path comes from here.
 */
const PROVIDERS = {
  opencost: { label: 'OpenCost', allocationPath: '/allocation/compute' },
  kubecost: { label: 'Kubecost', allocationPath: '/model/allocation' },
};

/**
 * Where to get cost from, in priority order:
 *   1. the OpenCost integration saved in the UI
 *   2. the Kubecost integration saved in the UI
 *   3. OPENCOST_URL from the environment
 *
 * Returning the whole config (not just the URL) means the integration's auth
 * and TLS settings — CA certificate, skip-verify — apply to cost calls too.
 */
async function resolveProvider(userId) {
  for (const id of ['opencost', 'kubecost']) {
    if (!userId) break;
    let cfg = null;
    try { cfg = await getIntegrationConfig(userId, id); } catch (e) { /* fall through */ }
    const url = (cfg?.url || '').replace(/\/+$/, '');
    if (url) {
      return { id, ...PROVIDERS[id], url, cfg, source: 'integration' };
    }
  }
  if (ENV_URL) {
    return { id: 'opencost', ...PROVIDERS.opencost, url: ENV_URL, cfg: {}, source: 'environment' };
  }
  return null;
}

/** GET through the connector layer so auth + TLS policy are honoured. */
const fetchJson = async (provider, path) => {
  let headers = {};
  if (provider.cfg && provider.cfg.auth_method && provider.cfg.auth_method !== 'none') {
    try {
      headers = cleanHeaders(await authHeaders(provider.cfg));
    } catch (e) { /* these endpoints are usually unauthenticated */ }
  }
  return request('GET', `${provider.url}${path}`, {
    headers, timeout: TIMEOUT_MS, tls: provider.cfg || {}, label: provider.id,
  });
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (v, dp = 4) => Math.round(num(v) * 10 ** dp) / 10 ** dp;

/** Windows OpenCost accepts, mapped to hours so we can compare with retention. */
const WINDOWS = { '1h': 1, '24h': 24, '2d': 48, '7d': 168, '30d': 720 };
const normaliseWindow = (w) => (WINDOWS[w] ? w : '24h');

/**
 * OpenCost returns `data` as an array of allocation sets (one per step), each a
 * map of name -> allocation. Flatten to one map, summing across steps.
 */
function flattenAllocations(data) {
  const sets = Array.isArray(data) ? data : [data].filter(Boolean);
  const out = {};
  for (const set of sets) {
    if (!set || typeof set !== 'object') continue;
    for (const [name, a] of Object.entries(set)) {
      if (!a || typeof a !== 'object') continue;
      const key = name || '__unallocated__';
      if (!out[key]) {
        out[key] = {
          name: key, cpuCost: 0, ramCost: 0, gpuCost: 0, pvCost: 0, networkCost: 0,
          totalCost: 0, cpuCoreHours: 0, ramByteHours: 0, efficiency: null, _effSamples: [],
        };
      }
      const o = out[key];
      o.cpuCost += num(a.cpuCost);
      o.ramCost += num(a.ramCost);
      o.gpuCost += num(a.gpuCost);
      o.pvCost += num(a.pvCost);
      o.networkCost += num(a.networkCost);
      o.cpuCoreHours += num(a.cpuCoreHours);
      o.ramByteHours += num(a.ramByteHours);
      // OpenCost reports totalCost on newer builds; older ones only have parts.
      o.totalCost += num(a.totalCost) || (num(a.cpuCost) + num(a.ramCost) + num(a.gpuCost) + num(a.pvCost) + num(a.networkCost));
      if (Number.isFinite(Number(a.totalEfficiency))) o._effSamples.push(Number(a.totalEfficiency));
    }
  }
  return Object.values(out).map((o) => {
    const eff = o._effSamples.length
      ? o._effSamples.reduce((s, v) => s + v, 0) / o._effSamples.length
      : null;
    delete o._effSamples;
    return {
      ...o,
      cpuCost: round(o.cpuCost), ramCost: round(o.ramCost), gpuCost: round(o.gpuCost),
      pvCost: round(o.pvCost), networkCost: round(o.networkCost), totalCost: round(o.totalCost),
      cpuCoreHours: round(o.cpuCoreHours, 2),
      ramGbHours: round(o.ramByteHours / 1073741824, 2),
      efficiency: eff == null ? null : Math.round(eff * 1000) / 10,
    };
  }).sort((a, b) => b.totalCost - a.totalCost);
}

/**
 * Short-lived cache in front of the allocation API.
 *
 * Each OpenCost aggregation takes ~1.5-3s, and the Cost page needs several of
 * them across two endpoints — so an uncached page load spent ~10s re-asking for
 * numbers that only move as fast as Prometheus scrapes. In-flight requests are
 * shared too, so the summary and cluster endpoints loading together issue one
 * query rather than two.
 */
const CACHE_TTL_MS = Number(process.env.COST_CACHE_TTL_MS || 60000);
// Past the TTL a value is stale but still worth serving while a refresh runs;
// past this it is too old to show at all. Without it every cache expiry would
// hand some unlucky viewer the full ~5s wait again.
const CACHE_STALE_MS = Number(process.env.COST_CACHE_STALE_MS || 600000);
const allocCache = new Map(); // key -> { at, value } | { inflight }

async function allocation(provider, window, aggregate) {
  const w = normaliseWindow(window);
  const key = `${provider.id}|${provider.url}|${w}|${aggregate}`;

  const path = `${provider.allocationPath}?window=${encodeURIComponent(w)}&aggregate=${encodeURIComponent(aggregate)}`;
  const load = () => {
    const inflight = (async () => {
      const body = await fetchJson(provider, path);
      const value = flattenAllocations(body?.data);
      allocCache.set(key, { at: Date.now(), value });
      return value;
    })();
    const prev = allocCache.get(key);
    // Keep the old value alongside the in-flight call so a background refresh
    // never blanks the cache for concurrent readers.
    allocCache.set(key, { ...(prev && prev.value !== undefined ? prev : {}), inflight });
    inflight.catch(() => {
      const cur = allocCache.get(key);
      if (cur && cur.value !== undefined) allocCache.set(key, { at: cur.at, value: cur.value });
      else allocCache.delete(key); // never cache a failure
    });
    return inflight;
  };

  const hit = allocCache.get(key);
  const age = hit && hit.at ? Date.now() - hit.at : Infinity;

  if (hit && hit.value !== undefined && age <= CACHE_TTL_MS) return hit.value;   // fresh
  if (hit && hit.inflight && hit.value === undefined) return hit.inflight;        // first load, in flight
  if (hit && hit.value !== undefined && age <= CACHE_STALE_MS) {
    if (!hit.inflight) load();   // refresh behind the scenes
    return hit.value;            // serve stale immediately
  }
  return load();
}

/**
 * The EFFECTIVE unit rates, derived from the allocations themselves.
 *
 * OpenCost 1.x exposes no pricing endpoint (/getConfigs is a Kubecost API and
 * 404s here), and reading the ConfigMap would only show what was *configured*,
 * not what was *applied*. Dividing cost by consumption gives the rate actually
 * in force, which is what someone checking the arithmetic wants to see.
 */
function effectiveRates(rows) {
  const t = rows.reduce((a, r) => ({
    cpuCost: a.cpuCost + r.cpuCost, coreHours: a.coreHours + r.cpuCoreHours,
    ramCost: a.ramCost + r.ramCost, gbHours: a.gbHours + r.ramGbHours,
  }), { cpuCost: 0, coreHours: 0, ramCost: 0, gbHours: 0 });
  return {
    cpuPerCoreHour: t.coreHours ? round(t.cpuCost / t.coreHours, 6) : null,
    ramPerGbHour: t.gbHours ? round(t.ramCost / t.gbHours, 6) : null,
    currency: CURRENCY,
    derived: true,
  };
}

/**
 * @returns a shape the dashboard can render without further arithmetic, or
 *          `{ installed: false, reason }` when OpenCost is not reachable.
 */
async function getCostSummary({ window = '24h', userId } = {}) {
  const w = normaliseWindow(window);
  const requestedHours = WINDOWS[w];

  const provider = await resolveProvider(userId);
  if (!provider) {
    return {
      installed: false,
      configured: false,
      reason: 'No cost provider is configured. Add an OpenCost or Kubecost integration '
        + '(Integrations > Cost) with its URL, or set OPENCOST_URL in the backend environment.',
    };
  }

  // All four in parallel: namespaces used to be awaited first, which added a
  // whole round trip to every page load for no reason.
  const [nsResult, controllers, clusterRows, retention] = await Promise.all([
    allocation(provider, w, 'namespace').then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })),
    allocation(provider, w, 'controller').catch(() => []),
    allocation(provider, w, 'cluster').catch(() => []),
    // Only the retention number is needed here, not a full history fetch.
    retentionHours().catch(() => null),
  ]);

  if (!nsResult.ok) {
    return {
      installed: false,
      configured: true,
      provider: provider.id,
      providerLabel: provider.label,
      providerSource: provider.source,
      reason: `${provider.label} at ${provider.url} did not answer: ${nsResult.e.message}`,
      opencostUrl: provider.url,
    };
  }
  const namespaces = nsResult.v;
  const rates = effectiveRates(namespaces);

  const total = namespaces.reduce((s, n) => s + n.totalCost, 0);
  const split = namespaces.reduce((acc, n) => ({
    cpu: acc.cpu + n.cpuCost, ram: acc.ram + n.ramCost, gpu: acc.gpu + n.gpuCost,
    pv: acc.pv + n.pvCost, network: acc.network + n.networkCost,
  }), { cpu: 0, ram: 0, gpu: 0, pv: 0, network: 0 });

  const truncated = !!retention && requestedHours > retention;
  // Only project a rate when the window is actually covered by data.
  const coveredHours = truncated ? retention : requestedHours;
  const hourly = coveredHours ? total / coveredHours : 0;

  // Take efficiency from OpenCost's own CLUSTER aggregation rather than rolling
  // up namespaces. Its cluster figure is not any weighted mean of the namespace
  // ones (it accounts for idle capacity differently), so computing our own here
  // produced a headline number that contradicted the per-cluster row for the
  // same window. One source, one answer.
  const clusterEff = clusterRows.filter((c) => c.efficiency != null && c.totalCost > 0);
  const effWeight = clusterEff.reduce((a, c) => a + c.totalCost, 0);
  const avgEfficiency = effWeight
    ? Math.round((clusterEff.reduce((a, c) => a + c.efficiency * c.totalCost, 0) / effWeight) * 10) / 10
    : null;

  return {
    installed: true,
    configured: true,
    provider: provider.id,
    providerLabel: provider.label,
    // 'integration' = read from the saved UI config, 'environment' = OPENCOST_URL
    providerSource: provider.source,
    opencostUrl: provider.url,
    currency: rates?.currency || CURRENCY,
    window: w,
    requestedHours,
    retentionHours: retention,
    truncated,
    coveredHours,
    // Bare metal means these came from the ConfigMap, not an invoice. Say so.
    pricingSource: 'custom-price-list',
    pricing: rates,
    totals: {
      total: round(total, 2),
      hourly: round(hourly, 4),
      daily: round(hourly * 24, 2),
      monthly: round(hourly * 730, 2),
      ...Object.fromEntries(Object.entries(split).map(([k, v]) => [k, round(v, 2)])),
    },
    efficiency: avgEfficiency,
    namespaces,
    controllers: controllers.slice(0, 25),
  };
}

/**
 * Per-cluster cost.
 *
 * OpenCost reports whichever cluster it is installed on, under the CLUSTER_ID it
 * was deployed with. The platform can have several clusters registered, and a
 * cluster with no OpenCost instance has no cost data — there is no way to infer
 * it. So this returns two lists and lets the UI say which is which, rather than
 * attributing one cluster's spend to all of them.
 *
 * A registered cluster is matched to a reported one by name (case-insensitive),
 * or explicitly via `cluster_id` on the cost integration.
 */
async function getClusterCosts({ window = '24h', userId } = {}) {
  const w = normaliseWindow(window);
  const provider = await resolveProvider(userId);

  // Registered clusters are worth listing even when no provider exists, so the
  // page can still show the fleet and explain what is missing.
  let registered = [];
  try {
    const Cluster = require('../models/Cluster');
    registered = await Cluster.find(userId ? { userId } : {})
      .select('name status createdAt').lean();
  } catch (e) { /* listing clusters is a nicety */ }

  if (!provider) {
    return {
      configured: false,
      reason: 'No cost provider is configured. Add an OpenCost or Kubecost integration '
        + '(Integrations > Cost), or set OPENCOST_URL in the backend environment.',
      clusters: [],
      unreported: registered.map((c) => ({ id: String(c._id), name: c.name, status: c.status })),
    };
  }

  const [byCluster, byNode, byNamespace, retention] = await Promise.all([
    allocation(provider, w, 'cluster').catch(() => []),
    allocation(provider, w, 'node').catch(() => []),
    // Cached, so this is usually the same call the summary endpoint just made.
    allocation(provider, w, 'namespace').catch(() => []),
    retentionHours().catch(() => null),
  ]);

  const nodes = byNode.filter((n) => n.name && n.totalCost >= 0 && n.name !== '__unallocated__');
  const namespaces = byNamespace.filter((n) => n.totalCost > 0);

  const truncated = !!retention && WINDOWS[w] > retention;
  const coveredHours = truncated ? retention : WINDOWS[w];

  const mappedName = (provider.cfg && provider.cfg.cluster_id) || null;
  const matched = new Set();

  const clusters = byCluster.map((c) => {
    // Only one cluster reports, so every node and namespace belongs to it;
    // with several, OpenCost labels them and this still holds per entry.
    const single = byCluster.length === 1;
    const link = registered.find((r) => {
      const nameMatch = String(r.name || '').toLowerCase() === String(c.name || '').toLowerCase();
      const explicit = mappedName && String(r._id) === String(mappedName);
      return nameMatch || explicit;
    });
    if (link) matched.add(String(link._id));

    const eff = c.efficiency;
    const hourly = coveredHours ? c.totalCost / coveredHours : 0;
    return {
      reportedAs: c.name,
      registeredId: link ? String(link._id) : null,
      registeredName: link ? link.name : null,
      status: link ? link.status : null,
      totalCost: c.totalCost,
      cpuCost: c.cpuCost,
      ramCost: c.ramCost,
      pvCost: c.pvCost,
      networkCost: c.networkCost,
      cpuCoreHours: c.cpuCoreHours,
      ramGbHours: c.ramGbHours,
      efficiency: eff,
      hourly: round(hourly, 4),
      daily: round(hourly * 24, 2),
      monthly: round(hourly * 730, 2),
      wasteMonthly: eff == null ? null : round((hourly * 730 * (100 - eff)) / 100, 2),
      nodes: single ? nodes : [],
      namespaces: single ? namespaces : [],
      nodeCount: single ? nodes.length : null,
      namespaceCount: single ? namespaces.length : null,
    };
  });

  return {
    configured: true,
    provider: provider.id,
    providerLabel: provider.label,
    providerSource: provider.source,
    providerUrl: provider.url,
    currency: CURRENCY,
    window: w,
    retentionHours: retention,
    truncated,
    coveredHours,
    clusters,
    // Registered clusters with no cost data at all. Naming them is the honest
    // alternative to silently showing one cluster's spend as the whole fleet.
    unreported: registered
      .filter((r) => !matched.has(String(r._id)))
      .map((r) => ({ id: String(r._id), name: r.name, status: r.status })),
  };
}

module.exports = { getCostSummary, getClusterCosts, allocation, effectiveRates, resolveProvider, WINDOWS };

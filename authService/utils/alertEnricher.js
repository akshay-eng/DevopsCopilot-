/**
 * Alert Enricher — queries Prometheus for pod/node metrics at alert time.
 *
 * Runs inline when an alert is saved (fire-and-forget, non-blocking).
 * Captures CPU, memory, and network for the 10 minutes BEFORE the alert fired.
 * Results are saved to the Alert document's `enrichment.metrics` field.
 */

const Cluster = require('../models/Cluster');

// Cache cluster → URLs mapping (avoid DB lookup every alert)
const clusterUrlCache = new Map(); // clusterId → { promUrl, agentUrl, expiresAt }
const CACHE_TTL = 5 * 60 * 1000;

async function getClusterUrls(clusterId) {
  const cached = clusterUrlCache.get(clusterId);
  if (cached && Date.now() < cached.expiresAt) return cached;

  const cluster = await Cluster.findById(clusterId).lean();
  if (!cluster) return null;

  const agentEndpoint = cluster.agentEndpoint || cluster.agentUrl || '';
  // For Prometheus, use the K3s node IP (not 127.0.0.1 if agent is port-forwarded)
  const promHost = '192.168.1.5';
  const promUrl = cluster.prometheusUrl || `http://${promHost}:32738`;
  const resolvedAgentUrl = agentEndpoint || `http://${promHost}:8080`;

  const entry = { promUrl, agentUrl: resolvedAgentUrl, expiresAt: Date.now() + CACHE_TTL };
  clusterUrlCache.set(clusterId, entry);
  return entry;
}

// Backwards compat
async function getPrometheusUrl(clusterId) {
  const urls = await getClusterUrls(clusterId);
  return urls ? urls.promUrl : null;
}

/**
 * Query Prometheus with a timeout
 */
async function promQuery(promUrl, query, time) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const params = new URLSearchParams({ query });
    if (time) params.set('time', time);
    const url = `${promUrl}/api/v1/query?${params}`;
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();
    if (data.status === 'success') return data.data.result;
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Query Prometheus range (for timeline data)
 */
async function promQueryRange(promUrl, query, start, end, step = '30s') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const params = new URLSearchParams({ query, start: String(start), end: String(end), step });
    const url = `${promUrl}/api/v1/query_range?${params}`;
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();
    if (data.status === 'success') return data.data.result;
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch pod logs from the cluster agent
 */
async function fetchPodLogs(agentUrl, namespace, pod, { tail = 400, previous = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const params = new URLSearchParams({ namespace, pod, tail: String(tail), previous: String(previous) });
    const url = `${agentUrl}/api/pods/logs?${params}`;
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();
    return data.lines || [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract timeline values from Prometheus range result
 */
function extractTimeline(results, labelFilter = {}) {
  for (const r of results) {
    const match = Object.entries(labelFilter).every(([k, v]) => r.metric[k] === v);
    if (!match && Object.keys(labelFilter).length) continue;

    return (r.values || []).map(([ts, val]) => ({
      t: Math.round(ts * 1000),
      v: parseFloat(val) || 0
    }));
  }
  return [];
}

/**
 * Enrich a pod-related alert with metrics from Prometheus.
 * Returns enrichment object or null if no metrics available.
 */
async function enrichPodAlert({ clusterId, namespace, pod, alertname, receivedAt }) {
  const clusterUrls = await getClusterUrls(clusterId);
  if (!clusterUrls) return { metrics: null, logs: null, reason: 'no_cluster_urls' };

  const { promUrl, agentUrl } = clusterUrls;
  const alertTime = new Date(receivedAt).getTime() / 1000; // unix seconds
  const tenMinBefore = alertTime - 600;

  // Extract container name from pod (best effort)
  const podFilter = pod && pod !== 'N/A' ? pod : null;
  if (!podFilter && !namespace) return { metrics: null, logs: null, reason: 'no_pod_or_namespace' };

  // Build label selector
  const podSelector = podFilter ? `, pod="${podFilter}"` : '';
  const nsSelector = namespace ? `namespace="${namespace}"` : '';

  // Run all queries in parallel: metrics + logs
  const queries = [
    // CPU usage (cores) over 10 min before alert
    promQueryRange(
      promUrl,
      `rate(container_cpu_usage_seconds_total{${nsSelector}${podSelector}, container!="", container!="POD"}[1m])`,
      tenMinBefore, alertTime, '30s'
    ),
    // Memory working set (bytes)
    promQueryRange(
      promUrl,
      `container_memory_working_set_bytes{${nsSelector}${podSelector}, container!="", container!="POD"}`,
      tenMinBefore, alertTime, '30s'
    ),
    // Network receive bytes/sec
    promQueryRange(
      promUrl,
      `rate(container_network_receive_bytes_total{${nsSelector}${podSelector}}[1m])`,
      tenMinBefore, alertTime, '30s'
    ),
    // Network transmit bytes/sec
    promQueryRange(
      promUrl,
      `rate(container_network_transmit_bytes_total{${nsSelector}${podSelector}}[1m])`,
      tenMinBefore, alertTime, '30s'
    ),
    // Configured memory limit (cAdvisor) — needed to judge real OOM risk
    promQuery(
      promUrl,
      `container_spec_memory_limit_bytes{${nsSelector}${podSelector}, container!="", container!="POD"}`,
      alertTime
    ),
  ];

  // Fetch pod logs if we have a specific pod
  if (podFilter) {
    queries.push(
      fetchPodLogs(agentUrl, namespace || 'default', podFilter, { tail: 400 })
    );
  } else {
    queries.push(Promise.resolve([]));
  }

  const [cpuTimeline, memTimeline, netRxTimeline, netTxTimeline, memLimitResult, podLogs] = await Promise.all(queries);

  const cpu = extractTimeline(cpuTimeline);
  const mem = extractTimeline(memTimeline);
  const netRx = extractTimeline(netRxTimeline);
  const netTx = extractTimeline(netTxTimeline);

  const hasData = cpu.length > 0 || mem.length > 0;
  const hasLogs = podLogs.length > 0;

  if (!hasData && !hasLogs) {
    return {
      metrics: null,
      logs: null,
      reason: 'no_metrics_captured',
      message: `No metrics found for pod ${podFilter || 'in ' + namespace} — pod may have failed before metrics were scraped.`
    };
  }

  // Compute summary stats
  const cpuValues = cpu.map(p => p.v);
  const memValues = mem.map(p => p.v);
  const currentMemBytes = memValues[memValues.length - 1] || 0;

  // cAdvisor reports a huge sentinel value (~2^63) when no limit is configured —
  // treat anything above 1PB as "no real limit" rather than flagging false OOM risk.
  const memLimitRaw = memLimitResult?.[0]?.value?.[1];
  const memLimitBytes = memLimitRaw ? parseFloat(memLimitRaw) : null;
  const hasRealMemLimit = memLimitBytes && memLimitBytes > 0 && memLimitBytes < 1e15;

  return {
    metrics: hasData ? {
      cpu: {
        timeline: cpu,
        current: cpuValues[cpuValues.length - 1] || 0,
        max: Math.max(...cpuValues, 0),
        avg: cpuValues.length ? cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length : 0,
        spikeDetected: cpuValues.some(v => v > 0.8),
      },
      memory: {
        timeline: mem,
        currentBytes: currentMemBytes,
        maxBytes: Math.max(...memValues, 0),
        avg: memValues.length ? memValues.reduce((a, b) => a + b, 0) / memValues.length : 0,
        limitBytes: hasRealMemLimit ? memLimitBytes : null,
        oomRisk: hasRealMemLimit ? currentMemBytes > 0.9 * memLimitBytes : false,
      },
      network: {
        rxTimeline: netRx,
        txTimeline: netTx,
        receiveBytesSec: netRx.length ? netRx[netRx.length - 1].v : 0,
        transmitBytesSec: netTx.length ? netTx[netTx.length - 1].v : 0,
      },
      capturedAt: new Date().toISOString(),
      windowMinutes: 10,
      alertTime: receivedAt,
    } : null,
    logs: hasLogs ? podLogs.slice(-400) : null,
    reason: hasData ? 'ok' : (hasLogs ? 'logs_only' : 'no_data'),
    message: !hasData && hasLogs ? `No metrics found, but captured ${podLogs.length} log lines for ${podFilter}.` : undefined,
  };
}

/**
 * Enrich an alert (called after saving to MongoDB).
 * Non-blocking — errors are caught and logged.
 */
async function enrichAlert(alertDoc) {
  const { clusterId, namespace, pod, alertname, receivedAt, _id } = alertDoc;

  // Only enrich pod-related alerts or alerts with a namespace
  const isPodRelated = pod && pod !== 'N/A';
  const hasNamespace = namespace && namespace !== 'N/A';
  if (!isPodRelated && !hasNamespace) return;

  try {
    const result = await enrichPodAlert({ clusterId, namespace, pod, alertname, receivedAt });

    // Save enrichment to the alert document.
    // IMPORTANT: use dot-notation $set, not a full `enrichment: {...}` replace —
    // alert-webhook-service writes 'enrichment.data' (kubectl describe, logs, events,
    // Prometheus rules) via a separate Kafka-driven pipeline. A full-object $set here
    // would silently wipe that out if this runs after it (default enrichment is null,
    // so the field must first be initialized to {} before dot-notation can apply).
    const Alert = require('../models/Alert');
    await Alert.findOneAndUpdate(
      { _id, enrichment: null },
      { $set: { enrichment: {} } }
    ).catch(() => {});
    await Alert.findByIdAndUpdate(_id, {
      $set: {
        'enrichment.metrics': result.metrics,
        'enrichment.logs': result.logs,
        'enrichment.metricsStatus': result.reason,
        'enrichment.metricsMessage': result.message || null,
        'enrichment.metricsEnrichedAt': new Date().toISOString(),
      }
    });

    const logCount = result.logs ? result.logs.length : 0;
    if (result.metrics) {
      console.log(`[ENRICH] ${alertname} | ${pod || namespace} | cpu=${result.metrics.cpu.timeline.length} mem=${result.metrics.memory.timeline.length} pts | logs=${logCount}`);
    } else {
      console.log(`[ENRICH] ${alertname} | ${pod || namespace} | ${result.reason}: ${result.message || 'no data'} | logs=${logCount}`);
    }
  } catch (err) {
    console.error(`[ENRICH] Failed for ${alertname}:`, err.message);
  }
}

module.exports = { enrichAlert, enrichPodAlert };

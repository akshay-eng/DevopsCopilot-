/**
 * Milvus vector store.
 *
 * Wraps the Milvus REST v2 API for the collections the platform owns:
 *   - ServiceNow tickets ingested by the pipeline (incidents / change requests)
 *   - Correlated incidents produced by the Alert Correlation Engine
 *
 * The Pi agent searches these so it can cite prior tickets when diagnosing.
 */

const { embed, DIM } = require('./embeddingService');
const { getIntegrationConfig } = require('../utils/integrationCrypto');

const INCIDENT_COLLECTION = process.env.MILVUS_INCIDENT_COLLECTION || 'aiops_correlated_incidents';

function baseUrl(cfg) {
  if (!cfg?.host) throw new Error('Milvus is not configured. Add it in Settings → Integrations.');
  const host = String(cfg.host).replace(/\/+$/, '').replace(/^https?:\/\//i, '');
  return `http://${host}:${cfg.port || 19530}/v2/vectordb`;
}

function headers(cfg) {
  const h = { 'Content-Type': 'application/json' };
  if (cfg.username && cfg.password) {
    h.Authorization = `Bearer ${cfg.username}:${cfg.password}`;
  } else if (cfg.token) {
    h.Authorization = `Bearer ${cfg.token}`;
  }
  return h;
}

async function call(cfg, path, body, { timeout = 30000 } = {}) {
  const url = `${baseUrl(cfg)}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST', headers: headers(cfg),
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    const host = `${String(cfg.host).replace(/^https?:\/\//i, '')}:${cfg.port || 19530}`;
    throw new Error(
      e.name === 'TimeoutError'
        ? `Milvus at ${host} did not respond within ${timeout}ms.`
        : `Milvus at ${host} is unreachable — is the Milvus service running? (${e.message})`
    );
  }
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`Milvus HTTP ${res.status}: ${text.slice(0, 200)}`);
  // Milvus returns {code, message} on logical errors
  if (json.code && json.code !== 0 && json.code !== 200) {
    throw new Error(`Milvus error ${json.code}: ${json.message || 'unknown'}`);
  }
  return json;
}

async function milvusConfig(userId) {
  const cfg = await getIntegrationConfig(userId, 'milvus');
  if (!cfg) throw new Error('Milvus is not connected. Add it in Settings → Integrations.');
  return cfg;
}

/** Create the collection if missing (quick-setup schema: id, vector, dynamic fields). */
async function ensureCollection(cfg, name) {
  try {
    const list = await call(cfg, '/collections/list', {});
    if ((list.data || []).includes(name)) return false;
  } catch { /* fall through to create */ }
  await call(cfg, '/collections/create', {
    collectionName: name,
    dimension: DIM,
    metricType: 'COSINE',
    autoId: true,
    enableDynamicField: true,
  }, { timeout: 20000 });
  return true;
}

/**
 * Insert records. Each record must have `text`; everything else is stored as a
 * dynamic field. Vectors are generated here — this is what was missing before.
 */
async function insert(cfg, name, records, { batchSize = 50 } = {}) {
  if (!records.length) return 0;
  await ensureCollection(cfg, name);

  let inserted = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const vectors = await embed(batch.map((r) => r.text || ''));
    const data = batch.map((r, k) => ({ ...r, vector: vectors[k] }));
    await call(cfg, '/entities/insert', { collectionName: name, data });
    inserted += batch.length;
  }
  return inserted;
}

/**
 * Semantic search returning the stored metadata of the nearest records.
 * `outputFields: ['*']` by default because collections created outside this
 * platform (e.g. the ServiceNow history loaded by servicenow-mcp) have their
 * own schemas — naming fields that don't exist makes Milvus reject the query.
 * `annsField` covers collections whose vector column isn't the default name.
 */
async function search(cfg, name, queryText, { topK = 5, outputFields, annsField } = {}) {
  const [vector] = await embed([queryText]);
  const body = {
    collectionName: name,
    data: [vector],
    limit: Math.min(topK, 25),
    outputFields: outputFields || ['*'],
    ...(annsField ? { annsField } : {}),
  };
  const res = await call(cfg, '/entities/search', body);
  return (res.data || []).map((hit) => ({
    score: typeof hit.distance === 'number' ? Number(hit.distance.toFixed(4)) : hit.score,
    ...Object.fromEntries(Object.entries(hit).filter(([k]) => !['distance', 'id'].includes(k))),
  }));
}

async function listCollections(cfg) {
  const r = await call(cfg, '/collections/list', {});
  return r.data || [];
}

// ---- correlated incidents --------------------------------------------------

/** Flatten a CorrelatedIncident doc into searchable text + metadata. */
function incidentToRecord(doc) {
  const text = [
    `Root cause: ${doc.rootCause?.pod || 'unknown'} in namespace ${doc.rootCause?.namespace || 'unknown'}`,
    `Alerts: ${(doc.alertNames || []).join(', ')}`,
    `Pods: ${(doc.pods || []).join(', ')}`,
    `Namespaces: ${(doc.namespaces || []).join(', ')}`,
    `Anomaly: ${doc.rootCause?.anomalySummary || ''}`,
    `Evidence: ${(doc.evidence || []).join(' | ')}`,
    `Causal chain: ${(doc.causalChain || []).map((c) => `${c.role}:${c.pod}`).join(' -> ')}`,
    doc.changeRequest?.plan ? `Remediation: ${doc.changeRequest.plan}` : '',
  ].filter(Boolean).join('\n');

  return {
    text,
    source_table: 'correlated_incident',
    number: doc.snowIncident?.number || String(doc._id),
    short_description: `${doc.rootCause?.pod || 'Correlated'}: ${(doc.alertNames || []).slice(0, 3).join(', ')}`.slice(0, 200),
    state: doc.status || 'active',
    priority: String(Object.keys(doc.severities || {})[0] || ''),
    category: 'correlated_incident',
    sys_id: String(doc._id),
    sys_created_on: (doc.firstSeenAt || doc.createdAt || new Date()).toISOString?.() || '',
    change_request: doc.changeRequest?.number || '',
    root_cause_pod: doc.rootCause?.pod || '',
    namespace: doc.rootCause?.namespace || '',
    alert_count: doc.alertCount || 0,
  };
}

async function indexCorrelatedIncidents(userId, docs) {
  if (!docs.length) return { indexed: 0, collection: INCIDENT_COLLECTION };
  const cfg = await milvusConfig(userId);
  const n = await insert(cfg, INCIDENT_COLLECTION, docs.map(incidentToRecord));
  return { indexed: n, collection: INCIDENT_COLLECTION };
}

async function searchIncidents(userId, query, topK = 5) {
  const cfg = await milvusConfig(userId);
  return search(cfg, INCIDENT_COLLECTION, query, {
    topK,
    outputFields: ['text', 'number', 'short_description', 'state', 'category', 'sys_id', 'change_request', 'root_cause_pod', 'namespace', 'alert_count', 'sys_created_on'],
  });
}

/** Search whichever ticket collections the user's pipelines created. */
async function searchTickets(userId, query, { topK = 5, collection } = {}) {
  const cfg = await milvusConfig(userId);
  let targets = [];
  if (collection) targets = [collection];
  else {
    const all = await listCollections(cfg);
    targets = all.filter((c) => c !== INCIDENT_COLLECTION);
    if (!targets.length) throw new Error('No ticket collections found in Milvus. Run a pipeline (Pipelines page) to ingest ServiceNow tickets first.');
  }

  const results = [];
  for (const c of targets.slice(0, 6)) {
    try {
      let hits;
      try {
        hits = await search(cfg, c, query, { topK });
      } catch (first) {
        // Externally-created collections name their vector column `embedding`.
        hits = await search(cfg, c, query, { topK, annsField: 'embedding' });
      }
      results.push(...hits.map((h) => ({ ...h, collection: c })));
    } catch (e) {
      // Dimension mismatch or unreadable collection — skip, don't fail the search.
      if (/dim/i.test(e.message)) console.warn(`[vector] skipping ${c}: ${e.message.slice(0, 120)}`);
    }
  }
  results.sort((a, b) => (b.score || 0) - (a.score || 0));
  return results.slice(0, topK);
}

module.exports = {
  ensureCollection, insert, search, listCollections, milvusConfig,
  indexCorrelatedIncidents, searchIncidents, searchTickets, incidentToRecord,
  INCIDENT_COLLECTION,
};

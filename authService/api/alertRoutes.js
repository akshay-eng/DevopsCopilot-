const express = require('express');
const router = express.Router();
const axios = require('axios');
const Alert = require('../models/Alert');
const { protect } = require('../middleware/auth');

let io;
router.setSocketIO = (socketIO) => { io = socketIO; };

// ─── In-memory cache for timeline-grouped results ─────────────────────────────
// Stale-while-revalidate: serve stale data instantly, rebuild in background.
const timelineGroupedCache = new Map(); // key → { data, expiresAt, stale }
const inflightQueries     = new Map(); // key → Promise (request coalescing)
const TIMELINE_CACHE_TTL  = 5 * 60 * 1000; // 5 minutes
const getTimelineGroupedCacheKey = (userId, hours, clusterId) =>
  `${userId}:${hours}:${clusterId || '_'}`;

// Mark stale instead of deleting — next request gets instant stale response
const invalidateTimelineGroupedCache = (userId) => {
  for (const [key, entry] of timelineGroupedCache.entries()) {
    if (key.startsWith(userId + ':')) entry.stale = true;
  }
};
router.invalidateTimelineGroupedCache = invalidateTimelineGroupedCache;

// Core query — extracted so endpoint and background warmer share the same code
async function runTimelineGroupedQuery(matchStage, parsedHours) {
  // Metadata-only aggregation (~20ms). No $push — NodePort can't handle
  // transferring 1900+ embedded docs without 30s+ latency.
  // Frontend synthesizes occurrence dots from firstSeen/lastSeen/count.
  const groups = await Alert.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id:        '$alertname',
        name:       { $first: '$alertname' },
        severity:   { $first: '$severity' },
        clusterId:  { $first: '$clusterId' },
        clusterName:{ $first: '$clusterName' },
        namespace:  { $first: '$namespace' },
        count:      { $sum: 1 },
        firstSeen:  { $min: '$receivedAt' },
        lastSeen:   { $max: '$receivedAt' },
        status: {
          $max: { $cond: [{ $eq: ['$status', 'firing'] }, 'z_firing', 'resolved'] }
        },
        message:     { $first: '$message' },
        description: { $first: '$description' },
        summary:     { $first: '$summary' },
        pod:         { $first: '$pod' },
        resolvedCount: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
      }
    },
    { $addFields: { status: { $cond: [{ $eq: ['$status', 'z_firing'] }, 'firing', 'resolved'] } } },
    { $sort: { status: -1, lastSeen: -1 } }
  ]);

  return {
    success: true,
    groups,
    timeRange: {
      hours: parsedHours,
      since: parsedHours > 0 ? new Date(Date.now() - parsedHours * 3_600_000) : null,
      until: new Date()
    }
  };
}

// Called by server.js after saving a new alert — proactively rebuilds cache
// Warms both 24h (frontend default) and 48h keys.
const warmTimelineGroupedCache = (userId) => {
  for (const hours of [24, 48]) {
    const cacheKey = getTimelineGroupedCacheKey(userId, hours, undefined);
    if (inflightQueries.has(cacheKey)) continue; // already rebuilding
    const matchStage = { userId, receivedAt: { $gte: new Date(Date.now() - hours * 3_600_000).toISOString() } };
    const promise = runTimelineGroupedQuery(matchStage, hours)
      .then(data => {
        timelineGroupedCache.set(cacheKey, { data, expiresAt: Date.now() + TIMELINE_CACHE_TTL, stale: false });
        return data;
      })
      .catch(() => null)
      .finally(() => inflightQueries.delete(cacheKey));
    inflightQueries.set(cacheKey, promise);
  }
};
router.warmTimelineGroupedCache = warmTimelineGroupedCache;

/**
 * GET /api/alerts/all
 * Fetch ALL alerts with pagination and caching for infinite scroll
 *
 * This endpoint is optimized for loading all alerts sequentially:
 * - Uses in-memory caching to avoid repeated DB queries
 * - Returns 50 alerts per page by default
 * - Supports filter parameters (clusterId, severity, status)
 * - Cache invalidates after 5 minutes or when new alerts arrive
 *
 * Query params:
 * - skip: Number of alerts to skip (default: 0)
 * - limit: Max alerts to return (default: 50, max: 100)
 * - clusterId: Filter by cluster
 * - severity: Filter by severity
 * - status: Filter by status
 * - forceRefresh: Set to 'true' to bypass cache
 */
router.get('/all', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { skip = 0, limit = 50, clusterId, severity, status } = req.query;

    const parsedSkip = parseInt(skip) || 0;
    const parsedLimit = Math.min(parseInt(limit) || 50, 100);

    // MongoDB is the authoritative, complete record. The in-memory alertBuffer only ever
    // holds alerts genuinely new since this process started (Kafka replays of pre-existing
    // docs are explicitly skipped — see server.js), so it can never be trusted as a full
    // substitute for a DB read: treating "buffer non-empty" as "buffer complete" caused
    // most history to silently disappear from this endpoint as soon as a single new alert
    // arrived after a restart.
    const query = { userId };
    if (clusterId) query.clusterId = clusterId;
    if (severity) query.severity = severity;
    if (status) query.status = status;

    let dbAlerts = [];
    let totalCount = 0;
    try {
      dbAlerts = await Alert.find(query)
        .sort({ createdAt: -1 })
        .skip(parsedSkip)
        .limit(parsedLimit)
        .maxTimeMS(30000)
        .lean();
      totalCount = dbAlerts.length < parsedLimit ? parsedSkip + dbAlerts.length : await Alert.countDocuments(query).maxTimeMS(15000);
    } catch (dbErr) {
      console.warn(`[ALERTS] MongoDB query timed out for /all: ${dbErr.message}`);
    }

    const paginatedAlerts = dbAlerts.map(a => ({
      clusterId: a.clusterId,
      severity: a.severity,
      alertname: a.alertname,
      namespace: a.namespace,
      pod: a.pod,
      node: a.node,
      message: a.message,
      labels: a.labels,
      annotations: a.annotations,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      receivedAt: a.receivedAt
    }));

    console.log(`[ALERTS] Returning ${paginatedAlerts.length}/${totalCount} MongoDB alerts for user ${userId}`);

    res.json({
      success: true,
      alerts: paginatedAlerts,
      pagination: {
        total: totalCount,
        limit: parsedLimit,
        skip: parsedSkip,
        hasMore: (parsedSkip + paginatedAlerts.length) < totalCount
      }
    });

  } catch (error) {
    console.error('[ERROR] Failed to fetch all alerts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alerts', message: error.message });
  }
});

/**
 * POST /api/alerts/cache/invalidate
 * Manually invalidate cache for a user
 * Useful when new alerts arrive via Socket.IO
 */
router.post('/cache/invalidate', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // Remove all cache entries for this user
    const keysToDelete = [];
    for (const key of alertCache.keys()) {
      if (key.startsWith(userId)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => alertCache.delete(key));

    console.log(`[CACHE INVALIDATED] Cleared ${keysToDelete.length} cache entries for user ${userId}`);

    res.json({
      success: true,
      message: 'Cache invalidated',
      entriesCleared: keysToDelete.length
    });

  } catch (error) {
    console.error('[ERROR] Failed to invalidate cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to invalidate cache',
      message: error.message
    });
  }
});

/**
 * POST /api/alerts/resolve
 * Manually resolve all firing occurrences of an alert (acknowledge/resolve from the UI).
 * Mirrors the resolution the Alertmanager webhook performs automatically — see
 * kafka/consumer.js's handling of status === 'resolved'.
 *
 * Body: { clusterId, alertname, namespace? }
 */
router.post('/resolve', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { clusterId, alertname, namespace } = req.body;

    if (!clusterId || !alertname) {
      return res.status(400).json({ success: false, error: 'clusterId and alertname are required' });
    }

    const endsAt = new Date().toISOString();
    const filter = { userId, clusterId, alertname, status: 'firing' };
    if (namespace) filter.namespace = namespace;

    const result = await Alert.updateMany(filter, {
      $set: { status: 'resolved', endsAt, receivedAt: new Date().toISOString() }
    });

    invalidateTimelineGroupedCache(userId);

    if (io) {
      io.to(`user-${userId}`).emit('alert-resolved', { clusterId, alertname, namespace, endsAt });
    }

    console.log(`[RESOLVE] ${alertname} | ${clusterId} | ${result.modifiedCount} occurrence(s) resolved by user ${userId}`);

    res.json({ success: true, modifiedCount: result.modifiedCount, endsAt });
  } catch (error) {
    console.error('[ERROR] Failed to resolve alert:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve alert', message: error.message });
  }
});

/**
 * GET /api/alerts/recent
 * Fetch recent alerts with pagination
 *
 * Query params:
 * - hours: Number of hours to look back (default: 48)
 * - limit: Max alerts to return (default: 100, max: 500)
 * - skip: Number of alerts to skip for pagination (default: 0)
 * - clusterId: Filter by cluster
 * - severity: Filter by severity
 * - status: Filter by status (default: all)
 */
router.get('/recent', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { hours = 48, limit = 100, skip = 0, clusterId, severity, status } = req.query;

    const parsedLimit = Math.min(parseInt(limit) || 100, 500);
    const parsedSkip = parseInt(skip) || 0;
    const parsedHours = hours !== undefined ? parseInt(hours) : 48;

    // MongoDB is the authoritative, complete record — see comment in /all above for why
    // the in-memory alertBuffer cannot be trusted as a substitute once it's merely non-empty.
    console.log(`[ALERTS] Reading from MongoDB for user ${userId} (hours=${parsedHours})`);
    const query = { userId };

    // Use createdAt (proper Date field) for time filtering
    if (parsedHours > 0) {
      query.createdAt = { $gte: new Date(Date.now() - parsedHours * 60 * 60 * 1000) };
    }
    if (clusterId) query.clusterId = clusterId;
    if (severity) query.severity = severity;
    if (status) query.status = status;

    let dbAlerts = [];
    let totalCount = 0;
    try {
      dbAlerts = await Alert.find(query)
        .sort({ createdAt: -1 })
        .skip(parsedSkip)
        .limit(parsedLimit)
        .maxTimeMS(30000)
        .lean();
      totalCount = dbAlerts.length < parsedLimit ? parsedSkip + dbAlerts.length : await Alert.countDocuments(query).maxTimeMS(15000);
    } catch (dbErr) {
      console.warn(`[ALERTS] MongoDB query timed out for /recent: ${dbErr.message}`);
    }

    const mappedAlerts = dbAlerts.map(a => ({
      clusterId: a.clusterId,
      severity: a.severity,
      alertname: a.alertname,
      namespace: a.namespace,
      pod: a.pod,
      node: a.node,
      message: a.message,
      labels: a.labels,
      annotations: a.annotations,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      receivedAt: a.receivedAt
    }));

    console.log(`[ALERTS] Returning ${mappedAlerts.length}/${totalCount} MongoDB recent alerts for user ${userId}`);

    res.json({
      success: true,
      alerts: mappedAlerts,
      pagination: {
        total: totalCount,
        limit: parsedLimit,
        skip: parsedSkip,
        hasMore: (parsedSkip + mappedAlerts.length) < totalCount
      },
      timeRange: {
        hours: parsedHours,
        since: parsedHours > 0 ? new Date(Date.now() - parsedHours * 60 * 60 * 1000) : null,
        until: new Date()
      }
    });
  } catch (error) {
    console.error('[ERROR] Failed to fetch recent alerts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alerts', message: error.message });
  }
});

/**
 * GET /api/alerts/historical
 * Fetch historical alerts before a specific timestamp
 *
 * Query params:
 * - before: Timestamp (required) - fetch alerts before this time
 * - limit: Max alerts to return (default: 100, max: 200)
 * - clusterId: Filter by cluster
 * - severity: Filter by severity
 */
router.get('/historical', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { before, limit = 100, clusterId, severity } = req.query;

    if (!before) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: before'
      });
    }

    // Validate timestamp
    const beforeTimestamp = parseInt(before);
    if (isNaN(beforeTimestamp)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timestamp format'
      });
    }

    const parsedLimit = Math.min(parseInt(limit) || 100, 200);

    // MongoDB is the authoritative, complete record — see comment in /all above for why
    // the in-memory alertBuffer cannot be trusted as a substitute (it previously made
    // "Load More" silently return nothing once the buffer didn't contain full history).
    const query = { userId, createdAt: { $lt: new Date(beforeTimestamp) } };
    if (clusterId) query.clusterId = clusterId;
    if (severity) query.severity = severity;

    const dbAlerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .maxTimeMS(30000)
      .lean();

    const alerts = dbAlerts.map(a => ({
      clusterId: a.clusterId,
      severity: a.severity,
      alertname: a.alertname,
      namespace: a.namespace,
      pod: a.pod,
      node: a.node,
      message: a.message,
      labels: a.labels,
      annotations: a.annotations,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      receivedAt: a.receivedAt
    }));

    res.json({
      success: true,
      alerts,
      count: alerts.length,
      hasMore: alerts.length === parsedLimit,
      before: new Date(beforeTimestamp)
    });
  } catch (error) {
    console.error('[ERROR] Failed to fetch historical alerts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch historical alerts', message: error.message });
  }
});

/**
 * GET /api/alerts/stats
 * Get alert statistics
 *
 * Query params:
 * - hours: Time range (default: 24)
 * - clusterId: Filter by cluster
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { hours = 24, clusterId } = req.query;
    const parsedHours = parseInt(hours) || 24;

    const since = new Date(Date.now() - parsedHours * 60 * 60 * 1000);

    const query = { userId, createdAt: { $gte: since } };
    if (clusterId) query.clusterId = clusterId;

    // Aggregate statistics
    const stats = await Alert.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            severity: '$severity',
            status: '$status'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    // Format stats
    const formatted = {
      total: 0,
      bySeverity: {},
      byStatus: {}
    };

    stats.forEach(stat => {
      formatted.total += stat.count;

      if (!formatted.bySeverity[stat._id.severity]) {
        formatted.bySeverity[stat._id.severity] = 0;
      }
      formatted.bySeverity[stat._id.severity] += stat.count;

      if (!formatted.byStatus[stat._id.status]) {
        formatted.byStatus[stat._id.status] = 0;
      }
      formatted.byStatus[stat._id.status] += stat.count;
    });

    res.json({
      success: true,
      stats: formatted,
      timeRange: { hours: parsedHours, since, until: new Date() }
    });
  } catch (error) {
    console.error('[ERROR] Failed to fetch alert stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

/**
 * DELETE /api/alerts/prune
 * Manually prune old resolved alerts
 * (MongoDB TTL will auto-delete after 30 days, but this allows manual cleanup)
 *
 * Body:
 * - olderThanHours: Delete resolved alerts older than X hours (default: 168 = 7 days)
 */
router.delete('/prune', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { olderThanHours = 168 } = req.body; // Default: 7 days

    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const result = await Alert.deleteMany({
      userId,
      status: 'resolved',
      createdAt: { $lt: cutoffTime }
    });

    res.json({
      success: true,
      deleted: result.deletedCount,
      cutoffTime
    });
  } catch (error) {
    console.error('[ERROR] Failed to prune alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to prune alerts',
      message: error.message
    });
  }
});

/**
 * GET /api/alerts/enrichment/:alertname
 * Fetch enrichment data for a specific alert (REST fallback for Socket.IO)
 *
 * Query params:
 * - clusterId: Filter by cluster
 */
/**
 * POST /api/alerts/analyze/:id — AI triage for one alert.
 * Returns: infrastructure vs application classification (with cited signals),
 * root-cause narrative, ordered resolution steps and preventive measures.
 * Cached on the alert doc; pass { refresh: true } to recompute.
 */
router.post('/analyze/:id', protect, async (req, res) => {
  try {
    const Alert = require('../models/Alert');
    const analysis = require('../services/alertAnalysisService');

    const alert = await Alert.findOne({ _id: req.params.id, userId: req.user._id });
    if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });

    if (alert.enrichment?.analysis && !req.body?.refresh) {
      return res.json({ success: true, cached: true, analysis: alert.enrichment.analysis });
    }

    const result = await analysis.analyzeAlert(alert.toObject(), alert.enrichment || {});
    // dot-notation so we never clobber enrichment.metrics/logs/data
    await Alert.updateOne({ _id: alert._id }, { $set: { 'enrichment.analysis': result } });

    res.json({ success: true, cached: false, analysis: result });
  } catch (error) {
    console.error('Alert analyze error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/** POST /api/alerts/analyze — analyse an ad-hoc alert payload (used by the agent). */
router.post('/analyze', protect, async (req, res) => {
  try {
    const analysis = require('../services/alertAnalysisService');
    const { alert, enrichment } = req.body || {};
    if (!alert?.alertname) return res.status(400).json({ success: false, error: 'alert.alertname is required' });
    const result = await analysis.analyzeAlert(alert, enrichment || {});
    res.json({ success: true, analysis: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/enrichment/:alertname', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { alertname } = req.params;
    const { clusterId } = req.query;

    // First check in-memory buffer
    const userBuf = req.app.locals.alertBuffer.get(userId) || [];
    const buffered = userBuf.find(a =>
      a.alertname === alertname && (!clusterId || a.clusterId === clusterId)
    );

    if (buffered?.enrichment) {
      return res.json({ success: true, enrichment: buffered.enrichment, status: 'complete' });
    }

    // Fallback to MongoDB
    const query = { userId, alertname };
    if (clusterId) query.clusterId = clusterId;

    const alert = await Alert.findOne(query)
      .sort({ receivedAt: -1 })
      .select('enrichment alertname namespace pod clusterId')
      .lean();

    if (!alert || !alert.enrichment) {
      return res.json({ success: true, enrichment: null, status: 'pending' });
    }

    res.json({ success: true, enrichment: alert.enrichment, status: 'complete' });
  } catch (error) {
    console.error('[ENRICHMENT] Fetch failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts/root-cause
 * Robusta-style investigation of an alert: the evidence that was gathered, key
 * findings, root cause, app-vs-infra verdict, related logs and next steps.
 *
 * Uses THIS platform's model (qwopus via aiService). The previous version gated
 * analysis on ANTHROPIC_API_KEY, which is never set in this deployment, so it
 * always fell through to a generic heuristic.
 *
 * Body: { alert, enrichment?, refresh? }
 */
router.post('/root-cause', protect, async (req, res) => {
  try {
    const { alert, enrichment, refresh } = req.body || {};
    if (!alert) {
      return res.status(400).json({ success: false, error: 'Missing alert data' });
    }

    const Alert = require('../models/Alert');
    const rootCause = require('../services/rootCauseService');

    // Prefer the stored alert: it carries the enrichment collected at alert
    // time, which the client usually does not have.
    let doc = null;
    if (alert._id) {
      doc = await Alert.findOne({ _id: alert._id, userId: req.user._id }).lean().catch(() => null);
    }
    if (!doc && alert.alertname) {
      doc = await Alert.findOne({
        userId: req.user._id,
        alertname: alert.alertname,
        ...(alert.namespace ? { namespace: alert.namespace } : {}),
        ...(alert.pod ? { pod: alert.pod } : {}),
      }).sort({ receivedAt: -1 }).lean().catch(() => null);
    }

    const subject = doc || alert;
    const enr = enrichment || doc?.enrichment || alert.enrichment || {};

    if (doc?.enrichment?.rootCause && !refresh) {
      return res.json({ success: true, cached: true, analysis: doc.enrichment.rootCause });
    }

    const analysis = await rootCause.investigate(subject, enr);

    if (doc?._id) {
      // dot-notation so metrics/logs/data/analysis are never clobbered
      await Alert.updateOne({ _id: doc._id }, { $set: { 'enrichment.rootCause': analysis } }).catch(() => {});
    }

    res.json({ success: true, cached: false, analysis });
  } catch (error) {
    console.error('Root cause error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts/root-cause/follow-up
 * Chat about one alert, grounded in its evidence and prior analysis.
 * Body: { alert, question, history? }
 */
router.post('/root-cause/follow-up', protect, async (req, res) => {
  try {
    const { alert, question, history } = req.body || {};
    if (!alert || !question) {
      return res.status(400).json({ success: false, error: 'alert and question are required' });
    }

    const Alert = require('../models/Alert');
    const rootCause = require('../services/rootCauseService');

    let doc = null;
    if (alert._id) doc = await Alert.findOne({ _id: alert._id, userId: req.user._id }).lean().catch(() => null);
    if (!doc && alert.alertname) {
      doc = await Alert.findOne({
        userId: req.user._id, alertname: alert.alertname,
        ...(alert.namespace ? { namespace: alert.namespace } : {}),
        ...(alert.pod ? { pod: alert.pod } : {}),
      }).sort({ receivedAt: -1 }).lean().catch(() => null);
    }

    const subject = doc || alert;
    const enr = doc?.enrichment || alert.enrichment || {};
    const prior = doc?.enrichment?.rootCause || alert.analysis || null;

    const r = await rootCause.followUp(subject, enr, prior, question, Array.isArray(history) ? history : []);
    res.json({ success: true, ...r });
  } catch (error) {
    console.error('Follow-up error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/alerts/timeline-grouped ────────────────────────────────────────
router.get('/timeline-grouped', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { hours, clusterId, severity } = req.query;
    const parsedHours = (hours !== undefined && !isNaN(parseInt(hours))) ? parseInt(hours) : 48;
    const cacheKey = getTimelineGroupedCacheKey(userId, parsedHours, clusterId);
    const cached = timelineGroupedCache.get(cacheKey);

    // 1. Fresh cache — serve immediately (skip if 0 groups: treat as cold-start miss)
    if (cached && !cached.stale && Date.now() < cached.expiresAt && cached.data?.groups?.length > 0) {
      return res.json({ ...cached.data, cached: true });
    }

    // 2. Stale cache — serve instantly and rebuild in background
    if (cached && cached.stale) {
      if (!inflightQueries.has(cacheKey)) {
        const matchStage = buildMatchStage(userId, parsedHours, clusterId, severity);
        const promise = runTimelineGroupedQuery(matchStage, parsedHours)
          .then(data => {
            if (!severity) timelineGroupedCache.set(cacheKey, { data, expiresAt: Date.now() + TIMELINE_CACHE_TTL, stale: false });
            return data;
          })
          .catch(() => null)
          .finally(() => inflightQueries.delete(cacheKey));
        inflightQueries.set(cacheKey, promise);
      }
      return res.json({ ...cached.data, cached: true, stale: true });
    }

    // 3. No cache — coalesce duplicate requests, then wait for result
    if (!inflightQueries.has(cacheKey)) {
      const matchStage = buildMatchStage(userId, parsedHours, clusterId, severity);
      const promise = runTimelineGroupedQuery(matchStage, parsedHours)
        .then(data => {
          if (!severity) timelineGroupedCache.set(cacheKey, { data, expiresAt: Date.now() + TIMELINE_CACHE_TTL, stale: false });
          return data;
        })
        .finally(() => inflightQueries.delete(cacheKey));
      inflightQueries.set(cacheKey, promise);
    }
    let data = await inflightQueries.get(cacheKey);
    // If warmer populated cache but promise resolved to null, read from cache
    if (!data) {
      const fromCache = timelineGroupedCache.get(cacheKey);
      data = fromCache?.data || { success: true, groups: [], timeRange: { hours: parsedHours, since: null, until: new Date() } };
    }
    res.json(data);
  } catch (error) {
    console.error('[TIMELINE-GROUPED] Failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

function buildMatchStage(userId, parsedHours, clusterId, severity) {
  const m = { userId };
  if (parsedHours > 0) m.receivedAt = { $gte: new Date(Date.now() - parsedHours * 3_600_000).toISOString() };
  if (clusterId) m.clusterId = clusterId;
  if (severity)  m.severity  = severity;
  return m;
}

// ─── GET /api/alerts/history/:alertname ─────────────────────────────────────
// Fetch detailed occurrences for a specific alert (used by the side panel).
// Much faster than loading all details in the timeline-grouped response.
router.get('/history/:alertname', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { alertname } = req.params;
    const { hours, limit = 30 } = req.query;
    const parsedHours = (hours !== undefined && !isNaN(parseInt(hours))) ? parseInt(hours) : 48;

    const match = { userId, alertname };
    if (parsedHours > 0) match.receivedAt = { $gte: new Date(Date.now() - parsedHours * 3_600_000).toISOString() };

    const parsedLimit = Math.min(parseInt(limit) || 200, 500);
    const docs = await Alert.aggregate([
      { $match: match },
      { $sort: { receivedAt: -1 } },
      { $limit: parsedLimit },
      { $project: { alertname: 1, receivedAt: 1, status: 1, severity: 1, message: 1, summary: 1, namespace: 1, pod: 1, clusterId: 1, clusterName: 1, enrichment: 1 } }
    ]);

    res.json({ success: true, alertname, occurrences: docs });
  } catch (error) {
    console.error('[ALERT-HISTORY] Failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Trends endpoint ────────────────────────────────────────────────────────
// Uses sequential lightweight aggregations (no $facet, no $push).
// Each aggregation is small and fast (~40ms). Total: ~200ms.
router.get('/trends', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { hours = 24, clusterId } = req.query;
    const parsedHours = parseInt(hours) || 24;

    const since = new Date(Date.now() - parsedHours * 3_600_000).toISOString();
    const prevSince = new Date(Date.now() - parsedHours * 2 * 3_600_000).toISOString();

    const match = { userId, receivedAt: { $gte: since } };
    if (clusterId) match.clusterId = clusterId;
    const prevMatch = { userId, receivedAt: { $gte: prevSince, $lt: since } };
    if (clusterId) prevMatch.clusterId = clusterId;

    const isCrit = s => s === 'critical' || s === 'high';
    const isWarn = s => s === 'warning' || s === 'medium';

    // Q1: Summary — group by severity+status (tiny result, ~40ms)
    const summaryAgg = await Alert.aggregate([
      { $match: match },
      { $group: { _id: { s: '$severity', st: '$status' }, count: { $sum: 1 } } }
    ]);
    let total = 0, criticalCount = 0, warningCount = 0, infoCount = 0, firing = 0, resolved = 0;
    summaryAgg.forEach(r => {
      total += r.count;
      if (isCrit(r._id.s)) criticalCount += r.count;
      else if (isWarn(r._id.s)) warningCount += r.count;
      else infoCount += r.count;
      if (r._id.st === 'firing') firing += r.count; else resolved += r.count;
    });

    // Q2: Previous period severity counts (tiny, ~40ms)
    const prevAgg = await Alert.aggregate([
      { $match: prevMatch },
      { $group: { _id: '$severity', count: { $sum: 1 } } }
    ]);
    let prevTotal = 0, prevCritical = 0, prevWarning = 0, prevInfo = 0;
    prevAgg.forEach(r => {
      prevTotal += r.count;
      if (isCrit(r._id)) prevCritical += r.count;
      else if (isWarn(r._id)) prevWarning += r.count;
      else prevInfo += r.count;
    });

    // Q3: Top alerts + by-cluster + by-namespace + by-pod — one aggregation grouping by alertname (~50ms)
    const topAgg = await Alert.aggregate([
      { $match: match },
      { $group: {
        _id: '$alertname', count: { $sum: 1 },
        severity: { $first: '$severity' }, status: { $first: '$status' },
        lastSeen: { $max: '$receivedAt' }, namespace: { $first: '$namespace' },
        pod: { $first: '$pod' }, clusterId: { $first: '$clusterId' },
        clusterName: { $first: '$clusterName' },
      }},
      { $sort: { count: -1 } }
    ]);
    const topAlerts = topAgg.slice(0, 10).map(a => ({
      alertname: a._id, count: a.count, severity: a.severity,
      lastSeen: a.lastSeen, namespace: a.namespace,
      clusterId: a.clusterId, clusterName: a.clusterName, status: a.status
    }));

    // Q4: By cluster (~40ms)
    const clusterAgg = await Alert.aggregate([
      { $match: match },
      { $group: {
        _id: { cid: '$clusterId', cn: '$clusterName' }, count: { $sum: 1 },
        critical: { $sum: { $cond: [{ $in: ['$severity', ['critical', 'high']] }, 1, 0] } },
        warning:  { $sum: { $cond: [{ $in: ['$severity', ['warning', 'medium']] }, 1, 0] } },
        info:     { $sum: { $cond: [{ $in: ['$severity', ['info', 'low']] }, 1, 0] } }
      }},
      { $sort: { count: -1 } }, { $limit: 10 }
    ]);
    const byCluster = clusterAgg.map(c => ({
      clusterId: c._id.cid, clusterName: c._id.cn || c._id.cid,
      count: c.count, critical: c.critical, warning: c.warning, info: c.info
    }));

    // Q5: By namespace (~40ms)
    const nsAgg = await Alert.aggregate([
      { $match: match },
      { $group: {
        _id: '$namespace', count: { $sum: 1 },
        critical: { $sum: { $cond: [{ $in: ['$severity', ['critical', 'high']] }, 1, 0] } },
        warning:  { $sum: { $cond: [{ $in: ['$severity', ['warning', 'medium']] }, 1, 0] } },
        info:     { $sum: { $cond: [{ $in: ['$severity', ['info', 'low']] }, 1, 0] } }
      }},
      { $sort: { count: -1 } }, { $limit: 10 }
    ]);
    const byNamespace = nsAgg.map(n => ({
      namespace: n._id || 'unknown', count: n.count,
      critical: n.critical, warning: n.warning, info: n.info
    }));

    // Q6: By pod (~40ms)
    const podAgg = await Alert.aggregate([
      { $match: { ...match, pod: { $nin: [null, 'N/A', ''] } } },
      { $group: {
        _id: '$pod', count: { $sum: 1 },
        severity: { $first: '$severity' }, namespace: { $first: '$namespace' }
      }},
      { $sort: { count: -1 } }, { $limit: 10 }
    ]);
    const byPod = podAgg.map(p => ({
      pod: p._id, count: p.count, severity: p.severity, namespace: p.namespace
    }));

    // Q7: Over time — fetch only receivedAt + severity (minimal projection, ~50ms)
    const timeDocs = await Alert.find(match, { receivedAt: 1, severity: 1, _id: 0 }).lean();

    let bucketMinutes;
    if (parsedHours <= 6) bucketMinutes = 15;
    else if (parsedHours <= 24) bucketMinutes = 60;
    else if (parsedHours <= 72) bucketMinutes = 180;
    else bucketMinutes = 360;
    const bucketMs = bucketMinutes * 60 * 1000;
    const startMs = Date.now() - parsedHours * 3_600_000;

    // Sort and bucket
    timeDocs.sort((a, b) => (a.receivedAt > b.receivedAt ? 1 : -1));
    const overTime = [];
    let di = 0;
    for (let t = startMs; t < Date.now(); t += bucketMs) {
      const bStart = new Date(t).toISOString();
      const bEnd = new Date(t + bucketMs).toISOString();
      let crit = 0, warn = 0, inf = 0;
      while (di < timeDocs.length && timeDocs[di].receivedAt < bStart) di++;
      let j = di;
      while (j < timeDocs.length && timeDocs[j].receivedAt < bEnd) {
        if (isCrit(timeDocs[j].severity)) crit++;
        else if (isWarn(timeDocs[j].severity)) warn++;
        else inf++;
        j++;
      }
      overTime.push({ time: bStart, total: crit + warn + inf, critical: crit, warning: warn, info: inf });
    }

    // Q8: Recent 20
    const recentAlerts = await Alert.find(match)
      .sort({ receivedAt: -1 }).limit(20)
      .select('alertname severity status namespace pod clusterId clusterName receivedAt')
      .lean();

    res.json({
      success: true,
      timeRange: { hours: parsedHours, since, until: new Date().toISOString() },
      summary: {
        total, criticalCount, warningCount, infoCount, firing, resolved,
        delta: {
          total: total - prevTotal, critical: criticalCount - prevCritical,
          warning: warningCount - prevWarning, info: infoCount - prevInfo
        }
      },
      topAlerts, byCluster, byNamespace, byPod, overTime, recentAlerts
    });
  } catch (error) {
    console.error('[TRENDS] Failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/for-correlation
 * Dedicated endpoint for the correlation engine — always reads from MongoDB.
 */
router.get('/for-correlation', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { hours = 48, clusterId, limit = 500 } = req.query;
    const parsedHours = parseInt(hours) || 48;
    const parsedLimit = Math.min(parseInt(limit) || 500, 1000);

    const query = { userId };
    if (parsedHours > 0) {
      query.createdAt = { $gte: new Date(Date.now() - parsedHours * 3600000) };
    }
    if (clusterId) query.clusterId = clusterId;

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .select('alertname severity status pod namespace clusterId receivedAt startsAt endsAt message userId')
      .maxTimeMS(90000)
      .lean();

    const mapped = alerts.map(a => ({
      _id: a._id?.toString(),
      clusterId: a.clusterId,
      severity: a.severity,
      alertname: a.alertname,
      namespace: a.namespace,
      pod: a.pod,
      node: a.node,
      message: a.message,
      labels: a.labels,
      annotations: a.annotations,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      receivedAt: a.receivedAt,
      userId: a.userId,
    }));

    res.json({ success: true, alerts: mapped });
  } catch (error) {
    console.error('[ALERTS] for-correlation error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

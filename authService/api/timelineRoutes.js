/**
 * Timeline API Routes
 *
 * Provides unified timeline endpoints that merge alerts and K8s changes
 * for comprehensive timeline visualization
 */

const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const K8sChange = require('../models/K8sChange');
const { protect } = require('../middleware/auth');

/**
 * GET /api/timeline/events
 * Unified timeline: alerts + changes merged by timestamp
 *
 * Query params:
 * - hours: Time range (default: 48)
 * - limit: Max items to return (default: 100, max: 200)
 * - skip: Pagination offset (default: 0)
 * - clusterId: Filter by cluster
 * - namespace: Filter by namespace
 */
router.get('/events', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { hours = 48, limit = 100, skip = 0, clusterId, namespace } = req.query;

    const parsedHours = parseInt(hours) || 48;
    const parsedLimit = Math.min(parseInt(limit) || 100, 200);
    const parsedSkip = parseInt(skip) || 0;

    // Build time filter
    const timeFilter = parsedHours > 0
      ? { $gte: new Date(Date.now() - parsedHours * 3600000).toISOString() }
      : undefined;

    // Query alerts
    const alertQuery = { userId };
    if (timeFilter) alertQuery.receivedAt = timeFilter;
    if (clusterId) alertQuery.clusterId = clusterId;
    if (namespace) alertQuery.namespace = namespace;

    const alerts = await Alert.find(alertQuery)
      .sort({ receivedAt: -1 })
      .lean();

    // Query changes
    const changeQuery = { userId };
    if (timeFilter) changeQuery.timestamp = timeFilter;
    if (clusterId) changeQuery.clusterId = clusterId;
    if (namespace) changeQuery.namespace = namespace;

    const changes = await K8sChange.find(changeQuery)
      .sort({ timestamp: -1 })
      .lean();

    // Merge and sort by timestamp
    const merged = [
      ...alerts.map(a => ({
        type: 'alert',
        ...a,
        _sortTime: new Date(a.receivedAt || a.startsAt || a.createdAt).getTime()
      })),
      ...changes.map(c => ({
        type: 'change',
        ...c,
        _sortTime: new Date(c.timestamp || c.createdAt).getTime()
      }))
    ];

    merged.sort((a, b) => b._sortTime - a._sortTime);

    // Paginate
    const paginated = merged.slice(parsedSkip, parsedSkip + parsedLimit);

    res.json({
      success: true,
      events: paginated,
      pagination: {
        total: merged.length,
        limit: parsedLimit,
        skip: parsedSkip,
        hasMore: (parsedSkip + paginated.length) < merged.length
      },
      summary: {
        totalAlerts: alerts.length,
        totalChanges: changes.length,
        totalEvents: merged.length
      }
    });

  } catch (error) {
    console.error('[TIMELINE] Failed to fetch events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/timeline/changes
 * Changes only with filtering
 *
 * Query params:
 * - hours: Time range (default: 48)
 * - limit: Max items to return (default: 100)
 * - skip: Pagination offset (default: 0)
 * - clusterId: Filter by cluster
 * - namespace: Filter by namespace
 * - resourceType: Filter by resource type (deployment, configmap, etc.)
 */
router.get('/changes', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { hours = 48, limit = 100, skip = 0, clusterId, namespace, resourceType } = req.query;

    const parsedHours = parseInt(hours) || 48;
    const parsedLimit = Math.min(parseInt(limit) || 100, 200);
    const parsedSkip = parseInt(skip) || 0;

    const query = { userId };

    // Time filter
    if (parsedHours > 0) {
      const sinceDate = new Date(Date.now() - parsedHours * 3600000);
      query.timestamp = { $gte: sinceDate.toISOString() };
    }

    // Optional filters
    if (clusterId) query.clusterId = clusterId;
    if (namespace) query.namespace = namespace;
    if (resourceType) query.resourceType = resourceType;

    const changes = await K8sChange.find(query)
      .sort({ timestamp: -1 })
      .limit(parsedLimit)
      .skip(parsedSkip)
      .lean();

    const total = await K8sChange.countDocuments(query);

    res.json({
      success: true,
      changes,
      pagination: {
        total,
        limit: parsedLimit,
        skip: parsedSkip,
        hasMore: (parsedSkip + changes.length) < total
      }
    });

  } catch (error) {
    console.error('[TIMELINE] Failed to fetch changes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/timeline/correlations/:alertId
 * Get correlated changes for a specific alert
 *
 * Looks for changes in the same namespace that occurred within +/- 15 minutes
 */
router.get('/correlations/:alertId', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { alertId } = req.params;

    // Find the alert
    const alert = await Alert.findOne({ _id: alertId, userId }).lean();

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    // Find changes in same namespace within +/- 15 minutes
    const alertTime = new Date(alert.receivedAt || alert.startsAt);
    const fifteenMinBefore = new Date(alertTime.getTime() - 15 * 60 * 1000).toISOString();
    const fifteenMinAfter = new Date(alertTime.getTime() + 15 * 60 * 1000).toISOString();

    const correlatedChanges = await K8sChange.find({
      userId,
      clusterId: alert.clusterId,
      namespace: alert.namespace,
      timestamp: { $gte: fifteenMinBefore, $lte: fifteenMinAfter }
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();

    res.json({
      success: true,
      alert: {
        id: alert._id,
        alertname: alert.alertname,
        namespace: alert.namespace,
        receivedAt: alert.receivedAt || alert.startsAt
      },
      correlatedChanges,
      timeWindow: {
        start: fifteenMinBefore,
        end: fifteenMinAfter
      }
    });

  } catch (error) {
    console.error('[TIMELINE] Failed to fetch correlations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/timeline/changes/resource/:resourceType/:resourceName
 * Get change history for a specific resource
 *
 * Query params:
 * - clusterId: Required
 * - limit: Max items to return (default: 10)
 */
router.get('/changes/resource/:resourceType/:resourceName', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { resourceType, resourceName } = req.params;
    const { clusterId, limit = 10 } = req.query;

    if (!clusterId) {
      return res.status(400).json({ success: false, error: 'clusterId is required' });
    }

    const changes = await K8sChange.getByResource(
      userId,
      clusterId,
      resourceType,
      resourceName,
      parseInt(limit) || 10
    );

    res.json({
      success: true,
      resourceType,
      resourceName,
      changes
    });

  } catch (error) {
    console.error('[TIMELINE] Failed to fetch resource changes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

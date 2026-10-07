const express = require('express');
const mongoose = require('mongoose');
const Cluster = require('../models/Cluster');
const NetworkTraffic = require('../models/NetworkTraffic');
const { protect } = require('../middleware/auth');
const { getTrafficBuffer, getServiceMapData, setCaptureState, getCaptureState, getFlowSummaries, getWorkloadReport } = require('../kafka/consumer');

const router = express.Router();

// Validate :id param
router.param('id', (req, res, next, id) => {
  if (!id || id === 'undefined' || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'Valid Cluster ID is required' });
  }
  next();
});

// @route   GET /api/clusters/:id/network/traffic
// @desc    Get real-time traffic events from in-memory buffer
// @access  Private
router.get('/:id/network/traffic', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    const { page = 1, limit = 50, method, status, source, ns } = req.query;
    const userId = req.user._id.toString();
    const clusterId = req.params.id;

    let events = getTrafficBuffer(userId, clusterId);

    // Apply filters
    if (method) events = events.filter(e => e.http?.method === method.toUpperCase());
    if (status) events = events.filter(e => e.http?.status === parseInt(status));
    if (source) events = events.filter(e =>
      e.src?.pod?.includes(source) || e.src?.svc?.includes(source)
    );
    if (ns) events = events.filter(e => e.src?.ns === ns || e.dst?.ns === ns);

    // Paginate
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedEvents = events.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      clusterId,
      events: paginatedEvents,
      total: events.length,
      page: parseInt(page),
      limit: parseInt(limit),
      captureEnabled: getCaptureState(userId, clusterId)
    });
  } catch (error) {
    console.error('Get network traffic error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch network traffic' });
  }
});

// @route   GET /api/clusters/:id/network/service-map
// @desc    Get aggregated service dependency graph (5-min window)
// @access  Private
router.get('/:id/network/service-map', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    const { ns } = req.query;
    const userId = req.user._id.toString();
    const clusterId = req.params.id;
    const serviceMap = getServiceMapData(userId, clusterId);

    // Filter by namespace if provided
    if (ns) {
      serviceMap.nodes = serviceMap.nodes.filter(n => n.namespace === ns);
      const nodeIds = new Set(serviceMap.nodes.map(n => n.id));
      serviceMap.links = serviceMap.links.filter(l =>
        nodeIds.has(l.source) || nodeIds.has(l.target)
      );
    }

    res.json({
      success: true,
      clusterId,
      ...serviceMap,
      window: '5m'
    });
  } catch (error) {
    console.error('Get service map error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch service map' });
  }
});

// @route   POST /api/clusters/:id/network/capture
// @desc    Toggle traffic capture on/off
// @access  Private
router.post('/:id/network/capture', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    const { enabled } = req.body;
    const userId = req.user._id.toString();
    const clusterId = req.params.id;

    setCaptureState(userId, clusterId, enabled !== false);

    res.json({
      success: true,
      captureEnabled: getCaptureState(userId, clusterId)
    });
  } catch (error) {
    console.error('Toggle capture error:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle capture' });
  }
});

// @route   GET /api/clusters/:id/network/traffic/history
// @desc    Get historical traffic from MongoDB
// @access  Private
router.get('/:id/network/traffic/history', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    const { limit = 100, skip = 0, since, method, status, ns } = req.query;
    const userId = req.user._id.toString();
    const clusterId = req.params.id;

    const events = await NetworkTraffic.getRecent(userId, clusterId, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      since,
      method,
      status: status ? parseInt(status) : undefined,
      ns
    });

    res.json({ success: true, clusterId, events, total: events.length });
  } catch (error) {
    console.error('Get traffic history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch traffic history' });
  }
});

// @route   GET /api/clusters/:id/network/flows
// @desc    Get L4 flow summaries (aggregated by connection pair)
// @access  Private
router.get('/:id/network/flows', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    const { ns, limit = 100, source: dataSource = 'realtime', since } = req.query;
    const userId = req.user._id.toString();
    const clusterId = req.params.id;

    let flows;
    if (dataSource === 'history') {
      flows = await NetworkTraffic.getFlowSummaries(userId, clusterId, {
        ns, limit: parseInt(limit), since
      });
    } else {
      flows = getFlowSummaries(userId, clusterId, { ns, limit: parseInt(limit) });
    }

    res.json({
      success: true,
      clusterId,
      flows,
      total: flows.length,
      source: dataSource
    });
  } catch (error) {
    console.error('Get flows error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch flow summaries' });
  }
});

// @route   GET /api/clusters/:id/network/report
// @desc    Get workload report with traffic summaries per service/pod
// @access  Private
router.get('/:id/network/report', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    const { ns } = req.query;
    const userId = req.user._id.toString();
    const clusterId = req.params.id;

    const workloads = getWorkloadReport(userId, clusterId, { ns });
    const serviceMap = getServiceMapData(userId, clusterId);

    const summary = {
      totalWorkloads: workloads.length,
      totalBytes: workloads.reduce((sum, w) => sum + w.traffic.totalBytes, 0),
      totalFlows: workloads.reduce((sum, w) => sum + w.connectionCount, 0),
      healthyCount: workloads.filter(w => w.health.status === 'healthy').length,
      degradedCount: workloads.filter(w => w.health.status === 'degraded').length,
      idleCount: workloads.filter(w => w.health.status === 'idle').length,
      namespaces: [...new Set(workloads.map(w => w.namespace))]
    };

    // Filter service map by namespace if specified
    let filteredMap = serviceMap;
    if (ns) {
      const filteredNodes = serviceMap.nodes.filter(n => n.namespace === ns);
      const nodeIds = new Set(filteredNodes.map(n => n.id));
      filteredMap = {
        nodes: filteredNodes,
        links: serviceMap.links.filter(l => nodeIds.has(l.source) || nodeIds.has(l.target))
      };
    }

    res.json({
      success: true,
      clusterId,
      summary,
      workloads,
      serviceMap: filteredMap
    });
  } catch (error) {
    console.error('Get workload report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate workload report' });
  }
});

// @route   GET /api/clusters/:id/network/timeline-errors
// @desc    Get network error groups for timeline chart (4xx, 5xx status codes)
// @access  Private
router.get('/:id/network/timeline-errors', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    const { hours = 24 } = req.query;
    const userId = req.user._id.toString();
    const clusterId = req.params.id;
    const since = new Date(Date.now() - hours * 3600000);

    const groups = await NetworkTraffic.aggregate([
      {
        $match: {
          userId,
          clusterId,
          timestamp: { $gte: since },
          'http.status': { $gte: 400 }
        }
      },
      {
        $group: {
          _id: {
            method: '$http.method',
            path: '$http.path',
            status: '$http.status'
          },
          count: { $sum: 1 },
          firstSeen: { $min: '$timestamp' },
          lastSeen: { $max: '$timestamp' },
          srcPod: { $first: '$src.pod' },
          srcNs: { $first: '$src.ns' },
          dstPod: { $first: '$dst.pod' },
          dstNs: { $first: '$dst.ns' },
          dstSvc: { $first: '$dst.svc' },
          avgLatency: { $avg: '$http.latency_ms' }
        }
      },
      { $sort: { lastSeen: -1 } },
      { $limit: 50 },
      {
        $project: {
          _id: 0,
          method: '$_id.method',
          path: '$_id.path',
          status: '$_id.status',
          count: 1,
          firstSeen: 1,
          lastSeen: 1,
          srcPod: 1, srcNs: 1,
          dstPod: 1, dstNs: 1, dstSvc: 1,
          avgLatency: { $round: ['$avgLatency', 0] }
        }
      }
    ]);

    res.json({ success: true, groups });
  } catch (error) {
    console.error('Get timeline network errors:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch network error groups' });
  }
});

module.exports = router;

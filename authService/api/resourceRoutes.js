const express = require('express');
const Cluster = require('../models/Cluster');
const { protect } = require('../middleware/auth');
const k8sService = require('../services/kubernetesService');
const { getClusterHistory } = require('../services/clusterHistoryService');

const mongoose = require('mongoose');
const router = express.Router();

// Validate :id param on all routes
router.param('id', (req, res, next, id) => {
  if (!id || id === 'undefined' || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'Valid Cluster ID is required' });
  }
  next();
});

/**
 * Resource Routes for Kubernetes Resources
 *
 * These routes provide access to Kubernetes resources from clusters.
 * Data flows through: Cluster Agent -> Kafka -> Socket.IO -> Frontend
 *
 * For now, these routes provide basic structure and validation.
 * Real-time data will be handled via Socket.IO on the frontend.
 */

// @route   GET /api/clusters/:id/namespaces
// @desc    Get all namespaces in a cluster
// @access  Private
router.get('/:id/namespaces', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Fetch namespaces directly from Kubernetes
    const namespaces = await k8sService.getNamespaces();

    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      items: namespaces
    });
  } catch (error) {
    console.error('Get namespaces error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching namespaces'
    });
  }
});

// @route   GET /api/clusters/:id/nodes
// @desc    Get all nodes in a cluster
// @access  Private
router.get('/:id/nodes', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Fetch nodes directly from Kubernetes
    const nodes = await k8sService.getNodes();

    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      nodes: nodes
    });
  } catch (error) {
    console.error('Get nodes error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching nodes'
    });
  }
});

// @route   GET /api/clusters/:id/nodes/:nodeName/metrics
// @desc    Get node metrics from Prometheus
// @access  Private
router.get('/:id/nodes/:nodeName/metrics', protect, async (req, res) => {
  try {
    const { nodeName } = req.params;
    const { range } = req.query;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Query Prometheus for current metrics
    const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

    // Fetch current metrics
    const queries = {
      cpu: `100 - (avg (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`,
      memory: `100 * (1 - ((node_memory_MemAvailable_bytes or node_memory_MemFree_bytes) / node_memory_MemTotal_bytes))`,
      disk: `100 - ((node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} * 100) / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"})`,
      network_rx: `sum(rate(node_network_receive_bytes_total{device!="lo"}[5m]))`,
      network_tx: `sum(rate(node_network_transmit_bytes_total{device!="lo"}[5m]))`
    };

    const currentMetrics = {};

    for (const [key, query] of Object.entries(queries)) {
      try {
        const response = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.status === 'success' && data.data.result.length > 0) {
          const value = parseFloat(data.data.result[0].value[1]);
          currentMetrics[key === 'cpu' ? 'cpu_percent' : key === 'memory' ? 'memory_percent' : key === 'disk' ? 'disk_percent' : key] = value;
        } else {
          currentMetrics[key === 'cpu' ? 'cpu_percent' : key === 'memory' ? 'memory_percent' : key === 'disk' ? 'disk_percent' : key] = 0;
        }
      } catch (err) {
        console.error(`Error fetching ${key} metric:`, err.message);
        currentMetrics[key === 'cpu' ? 'cpu_percent' : key === 'memory' ? 'memory_percent' : key === 'disk' ? 'disk_percent' : key] = 0;
      }
    }

    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      nodeName,
      range: range || '1h',
      current: currentMetrics,
      history: [] // For 1h range, use the /api/metrics/node endpoint instead
    });
  } catch (error) {
    console.error('Get node metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching node metrics'
    });
  }
});

// @route   GET /api/clusters/:id/resources/:type
// @desc    Get resources by type (pods, deployments, services, etc.)
// @access  Private
router.get('/:id/resources/:type', protect, async (req, res) => {
  try {
    const { type } = req.params;
    const { namespace } = req.query;
    console.log(`📦 Fetching ${type} - Namespace: ${namespace || 'all'}`);

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Validate resource type
    const validTypes = [
      'pods', 'deployments', 'services', 'statefulsets',
      'daemonsets', 'jobs', 'cronjobs'
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid resource type. Valid types: ${validTypes.join(', ')}`
      });
    }

    // Fetch resources directly from Kubernetes
    const resources = await k8sService.getResources(type, namespace);

    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      resourceType: type,
      namespace: namespace || 'all',
      items: resources
    });
  } catch (error) {
    console.error('Get resources error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching resources'
    });
  }
});

// @route   GET /api/clusters/:id/resources/:type/:namespace/:name
// @desc    Get single resource details
// @access  Private
router.get('/:id/resources/:type/:namespace/:name', protect, async (req, res) => {
  try {
    const { type, namespace, name } = req.params;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Fetch resource details from Kubernetes
    const resourceDetails = await k8sService.getResourceDetails(type, namespace, name);

    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      resourceType: type,
      namespace,
      name,
      ...resourceDetails
    });
  } catch (error) {
    console.error('Get resource details error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching resource details',
      message: error.message
    });
  }
});

// @route   GET /api/clusters/:id/pods/:namespace/:name/logs
// @desc    Get pod logs
// @access  Private
router.get('/:id/pods/:namespace/:name/logs', protect, async (req, res) => {
  try {
    const { namespace, name } = req.params;
    const { container, tailLines } = req.query;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Fetch logs from Kubernetes
    const logs = await k8sService.getPodLogs(namespace, name, {
      container,
      tailLines: tailLines ? parseInt(tailLines) : 200
    });

    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      namespace,
      pod: name,
      container: container || 'default',
      logs
    });
  } catch (error) {
    console.error('Get pod logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while accessing pod logs',
      message: error.message
    });
  }
});

// @route   GET /api/clusters/:id/pods/:namespace/:name/metrics
// @desc    Get pod metrics
// @access  Private
router.get('/:id/pods/:namespace/:name/metrics', protect, async (req, res) => {
  try {
    const { namespace, name } = req.params;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // TODO: Integrate with Prometheus for actual metrics
    // For now, return empty arrays - metrics come via Kafka/Socket.IO
    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      namespace,
      pod: name,
      cpu: [],
      memory: [],
      network_receive: [],
      network_transmit: [],
      disk_read: [],
      disk_write: [],
      restarts: [],
      message: 'Metrics are collected via Kafka. Check Redux store for real-time data.'
    });
  } catch (error) {
    console.error('Get pod metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching pod metrics',
      message: error.message
    });
  }
});

// @route   GET /api/clusters/:id/alerts
// @desc    Get cluster alerts
// @access  Private
router.get('/:id/alerts', protect, async (req, res) => {
  try {
    const { severity, namespace } = req.query;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Return info about alerts streaming
    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      alerts: [],
      filters: {
        severity: severity || 'all',
        namespace: namespace || 'all'
      },
      streaming: {
        enabled: true,
        method: 'Socket.IO',
        event: 'alert',
        room: `user-${req.user._id}`
      },
      message: 'Subscribe to Socket.IO event "alert" for real-time alerts'
    });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching alerts'
    });
  }
});

// @route   GET /api/clusters/:id/events
// @desc    Get Kubernetes events
// @access  Private
router.get('/:id/events', protect, async (req, res) => {
  try {
    const { namespace, type } = req.query;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Return info about events streaming
    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      events: [],
      filters: {
        namespace: namespace || 'all',
        type: type || 'all'
      },
      streaming: {
        enabled: true,
        method: 'Socket.IO',
        event: 'k8s-event',
        room: `user-${req.user._id}`
      },
      message: 'Subscribe to Socket.IO event "k8s-event" for real-time Kubernetes events'
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching events'
    });
  }
});

// @route   GET /api/clusters/:id/metrics
// @desc    Get cluster-wide metrics
// @access  Private
router.get('/:id/metrics', protect, async (req, res) => {
  try {
    const { metricType, timeRange } = req.query;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Return info about metrics streaming
    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      metrics: {
        cluster: {
          cpu: { usage: 0, total: 0 },
          memory: { usage: 0, total: 0 },
          pods: { running: 0, pending: 0, failed: 0 }
        },
        nodes: [],
        namespaces: []
      },
      filters: {
        metricType: metricType || 'all',
        timeRange: timeRange || '1h'
      },
      streaming: {
        enabled: true,
        method: 'Socket.IO',
        event: 'metrics-update',
        room: `user-${req.user._id}`
      },
      message: 'Subscribe to Socket.IO event "metrics-update" for real-time cluster metrics'
    });
  } catch (error) {
    console.error('Get cluster metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching cluster metrics'
    });
  }
});

// @route   GET /api/clusters/:id/resources/:type/:namespace/:name/yaml
// @desc    Get resource YAML definition
// @access  Private
router.get('/:id/resources/:type/:namespace/:name/yaml', protect, async (req, res) => {
  try {
    const { type, namespace, name } = req.params;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Fetch YAML from Kubernetes
    const yaml = await k8sService.getResourceYAML(type, namespace, name);

    res.status(200).json({
      success: true,
      clusterId: cluster._id,
      clusterName: cluster.name,
      resourceType: type,
      namespace,
      name,
      yaml
    });
  } catch (error) {
    console.error('Get resource YAML error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching resource YAML'
    });
  }
});

// @route   GET /api/clusters/:id/history
// @desc    Historical cluster metrics from Prometheus (CPU/memory utilisation,
//          pod count, phases, restarts). The resource API is point-in-time only,
//          so this is what gives the Trends Kubernetes tab a time axis.
// @access  Private
router.get('/:id/history', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.id, userId: req.user._id });
    if (!cluster) {
      return res.status(404).json({ success: false, error: 'Cluster not found' });
    }
    const history = await getClusterHistory(req.query.hours);
    res.json({ success: true, ...history });
  } catch (error) {
    console.error('[HISTORY] Failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

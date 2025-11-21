/**
 * Cluster Management Routes
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { authenticate, authenticateAgent } = require('../middleware/authServiceIntegration');
const Cluster = require('../models/Cluster');
const Alert = require('../models/Alert');
const Metric = require('../models/Metric');
const logger = require('../utils/logger');

/**
 * @route   GET /api/clusters
 * @desc    Get all clusters for authenticated user
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const clusters = await Cluster.find({
      userId: req.userId,
      isActive: true,
    }).sort({ createdAt: -1 });

    // Add health status to each cluster
    const clustersWithHealth = clusters.map(cluster => ({
      ...cluster.toObject(),
      isHealthy: cluster.isHealthy(),
    }));

    res.json({
      success: true,
      count: clusters.length,
      clusters: clustersWithHealth,
    });
  } catch (error) {
    logger.error('Error fetching clusters:', error);
    res.status(500).json({ error: 'Failed to fetch clusters' });
  }
});

/**
 * @route   GET /api/clusters/:id
 * @desc    Get specific cluster details
 * @access  Private
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.userId,
      isActive: true,
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    // Get recent metrics
    const recentMetrics = await Metric.findOne({
      clusterId: cluster._id,
    }).sort({ timestamp: -1 });

    // Get active alerts count
    const alertsCount = await Alert.countDocuments({
      clusterId: cluster._id,
      status: 'firing',
    });

    res.json({
      success: true,
      cluster: {
        ...cluster.toObject(),
        isHealthy: cluster.isHealthy(),
        recentMetrics,
        activeAlerts: alertsCount,
      },
    });
  } catch (error) {
    logger.error('Error fetching cluster:', error);
    res.status(500).json({ error: 'Failed to fetch cluster' });
  }
});

/**
 * @route   POST /api/clusters/register
 * @desc    Register a new cluster
 * @access  Private
 */
router.post('/register', authenticate, async (req, res) => {
  try {
    const { name, clusterType, metadata } = req.body;

    if (!name || !clusterType) {
      return res.status(400).json({ error: 'Name and clusterType are required' });
    }

    // Generate unique identifiers
    const agentId = uuidv4();
    const apiKey = crypto.randomBytes(32).toString('base64url');

    // Create cluster
    const cluster = await Cluster.create({
      userId: req.userId,
      agentId,
      name,
      clusterType,
      apiKey, // Will be hashed in pre-save hook
      metadata: metadata || {},
      status: 'pending',
    });

    logger.info(`Cluster registered: ${name}`, {
      userId: req.userId,
      agentId,
    });

    // Return plain API key (only time it's visible)
    res.status(201).json({
      success: true,
      message: 'Cluster registered successfully',
      cluster: {
        id: cluster._id,
        agentId,
        name: cluster.name,
        clusterType: cluster.clusterType,
        status: cluster.status,
      },
      credentials: {
        agentId,
        apiKey, // Plain text - user must save this
        userId: req.userId.toString(),
      },
      helmCommand: generateHelmCommand(cluster, apiKey, req.userId),
    });
  } catch (error) {
    logger.error('Error registering cluster:', error);
    res.status(500).json({ error: 'Failed to register cluster' });
  }
});

/**
 * @route   PUT /api/clusters/:id
 * @desc    Update cluster configuration
 * @access  Private
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, metadata, features, configuration } = req.body;

    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    // Update allowed fields
    if (name) cluster.name = name;
    if (metadata) cluster.metadata = { ...cluster.metadata, ...metadata };
    if (features) cluster.features = { ...cluster.features, ...features };
    if (configuration) cluster.configuration = { ...cluster.configuration, ...configuration };

    await cluster.save();

    logger.info(`Cluster updated: ${cluster.name}`, { clusterId: cluster._id });

    res.json({
      success: true,
      message: 'Cluster updated successfully',
      cluster,
    });
  } catch (error) {
    logger.error('Error updating cluster:', error);
    res.status(500).json({ error: 'Failed to update cluster' });
  }
});

/**
 * @route   DELETE /api/clusters/:id
 * @desc    Delete/deactivate cluster
 * @access  Private
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    // Soft delete
    cluster.isActive = false;
    cluster.status = 'disconnected';
    await cluster.save();

    logger.info(`Cluster deleted: ${cluster.name}`, { clusterId: cluster._id });

    res.json({
      success: true,
      message: 'Cluster deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting cluster:', error);
    res.status(500).json({ error: 'Failed to delete cluster' });
  }
});

/**
 * Agent Routes
 */

/**
 * @route   POST /api/clusters/agent/register
 * @desc    Agent registers itself (called by agent on startup)
 * @access  Agent
 */
router.post('/agent/register', authenticateAgent, async (req, res) => {
  try {
    const { version, kubernetes_version, features } = req.body;

    req.cluster.status = 'connected';
    req.cluster.version = version;
    req.cluster.kubernetesVersion = kubernetes_version;
    req.cluster.lastHeartbeat = new Date();

    if (features) {
      req.cluster.features = { ...req.cluster.features, ...features };
    }

    await req.cluster.save();

    logger.info(`Agent registered: ${req.cluster.name}`, {
      agentId: req.cluster.agentId,
      version,
    });

    res.json({
      success: true,
      message: 'Agent registered successfully',
      cluster: {
        id: req.cluster._id,
        name: req.cluster.name,
        configuration: req.cluster.configuration,
      },
    });
  } catch (error) {
    logger.error('Error in agent registration:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * @route   POST /api/clusters/agent/deregister
 * @desc    Agent deregisters itself (called on shutdown)
 * @access  Agent
 */
router.post('/agent/deregister', authenticateAgent, async (req, res) => {
  try {
    req.cluster.status = 'disconnected';
    await req.cluster.save();

    logger.info(`Agent deregistered: ${req.cluster.name}`, {
      agentId: req.cluster.agentId,
    });

    res.json({
      success: true,
      message: 'Agent deregistered successfully',
    });
  } catch (error) {
    logger.error('Error in agent deregistration:', error);
    res.status(500).json({ error: 'Deregistration failed' });
  }
});

/**
 * Helper function to generate Helm install command
 */
function generateHelmCommand(cluster, apiKey, userId) {
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
  const kafkaBrokers = process.env.KAFKA_BROKERS || 'localhost:9092';

  return `helm install devops-copilot devops-copilot/stack \\
  --namespace devops-copilot \\
  --create-namespace \\
  --set agent.agentId=${cluster.agentId} \\
  --set agent.userId=${userId} \\
  --set agent.apiKey=${apiKey} \\
  --set agent.clusterName=${cluster.name} \\
  --set agent.clusterType=${cluster.clusterType} \\
  --set agent.backendUrl=${backendUrl} \\
  --set kafka.bootstrapServers=${kafkaBrokers} \\
  --set kafka.securityProtocol=PLAINTEXT`;
}

module.exports = router;

const express = require('express');
const Cluster = require('../models/Cluster');
const User = require('../models/User');
const { protect, requireEmailVerification } = require('../middleware/auth');
const { clusterValidation, validate } = require('../middleware/validator');
const { generateHelmCommand, generateHelmValues, generateInstallationInstructions } = require('../utils/helmGenerator');

const router = express.Router();

// @route   POST /api/clusters/register
// @desc    Register a new cluster
// @access  Private
router.post('/register', protect, clusterValidation, validate, async (req, res) => {
  try {
    const { name, clusterType, hasPrometheus, hasGrafana } = req.body;
    const userId = req.user._id;

    // Create cluster
    const cluster = await Cluster.create({
      userId,
      name,
      clusterType,
      monitoringSetup: {
        hasPrometheus: hasPrometheus || false,
        hasGrafana: hasGrafana || false,
        hasLoki: false
      }
    });

    // Prepare credentials
    const credentials = {
      agentId: cluster.agentId,
      apiKey: cluster.apiKey,
      userId: userId.toString(),
      clusterId: cluster._id.toString()
    };

    // Generate Helm command
    const helmCommand = generateHelmCommand(
      { name, clusterType },
      credentials
    );

    // Generate Helm values
    const helmValues = generateHelmValues(
      { name, clusterType },
      credentials
    );

    // Generate installation instructions
    const instructions = generateInstallationInstructions(helmCommand);

    res.status(201).json({
      success: true,
      message: 'Cluster registered successfully',
      cluster: {
        _id: cluster._id,
        name: cluster.name,
        clusterType: cluster.clusterType,
        status: cluster.status,
        createdAt: cluster.createdAt
      },
      credentials: {
        agentId: cluster.agentId,
        apiKey: cluster.apiKey, // Send API key only once during registration
        userId: userId.toString(),
        clusterId: cluster._id.toString()
      },
      helmCommand,
      helmValues,
      instructions
    });
  } catch (error) {
    console.error('Cluster registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during cluster registration'
    });
  }
});

// @route   GET /api/clusters
// @desc    Get all clusters for current user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const clusters = await Cluster.find({ userId: req.user._id })
      .select('-apiKey') // Don't send API key in list
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: clusters.length,
      clusters
    });
  } catch (error) {
    console.error('Get clusters error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching clusters'
    });
  }
});

// @route   GET /api/clusters/:id
// @desc    Get single cluster by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).select('-apiKey');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    res.status(200).json({
      success: true,
      cluster
    });
  } catch (error) {
    console.error('Get cluster error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching cluster'
    });
  }
});

// @route   POST /api/clusters/:id/verify-connection
// @desc    Verify cluster connection (called by agent)
// @access  Public (uses API key authentication)
router.post('/:id/verify-connection', async (req, res) => {
  try {
    const { agentId, apiKey } = req.body;
    const clusterId = req.params.id;

    // Find cluster with API key
    const cluster = await Cluster.findById(clusterId).select('+apiKey');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Verify API key
    if (!cluster.verifyApiKey(apiKey) || cluster.agentId !== agentId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update connection status
    await cluster.updateConnectionStatus('connected');
    cluster.helmInstalled = true;
    cluster.helmInstalledAt = Date.now();
    await cluster.save();

    res.status(200).json({
      success: true,
      message: 'Cluster connection verified successfully'
    });
  } catch (error) {
    console.error('Verify connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during connection verification'
    });
  }
});

// @route   GET /api/clusters/:id/connection-status
// @desc    Check cluster connection status
// @access  Private
router.get('/:id/connection-status', protect, async (req, res) => {
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

    res.status(200).json({
      success: true,
      status: cluster.status,
      helmInstalled: cluster.helmInstalled,
      lastConnectedAt: cluster.lastConnectedAt
    });
  } catch (error) {
    console.error('Connection status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while checking connection status'
    });
  }
});

// @route   DELETE /api/clusters/:id
// @desc    Delete a cluster
// @access  Private
router.delete('/:id', protect, async (req, res) => {
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

    await cluster.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Cluster deleted successfully'
    });
  } catch (error) {
    console.error('Delete cluster error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting cluster'
    });
  }
});

module.exports = router;

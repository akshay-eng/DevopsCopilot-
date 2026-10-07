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
    const { name, clusterType, hasPrometheus, hasGrafana, hasLoki } = req.body;
    const userId = req.user._id;

    // Create cluster
    const cluster = await Cluster.create({
      userId,
      name,
      clusterType,
      monitoringSetup: {
        hasPrometheus: hasPrometheus || false,
        hasGrafana: hasGrafana || false,
        hasLoki: hasLoki || false
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
  console.log('🔍 GET /api/clusters called');
  console.log('User ID:', req.user._id);
  console.log('User object:', { id: req.user.id, _id: req.user._id, email: req.user.email });

  try {
    // First check total clusters in database
    const totalClusters = await Cluster.countDocuments();
    console.log('Total clusters in database:', totalClusters);

    // Get all clusters to inspect their userId values
    const allClusters = await Cluster.find().limit(5);
    console.log('Sample cluster userIds:', allClusters.map(c => ({
      id: c._id,
      name: c.name,
      userId: c.userId,
      userIdType: typeof c.userId
    })));

    // Now query for user's clusters
    const clusters = await Cluster.find({ userId: req.user._id })
      .select('-apiKey') // Don't send API key in list
      .sort({ createdAt: -1 });

    console.log('Clusters found for user:', clusters.length);
    if (clusters.length > 0) {
      console.log('Cluster IDs:', clusters.map(c => ({ id: c._id, name: c.name })));
    }

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
    const { agentId, apiKey, agentEndpoint } = req.body;
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

    // Save agent endpoint if provided
    if (agentEndpoint) {
      cluster.agentEndpoint = agentEndpoint;
    }

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

// @route   POST /api/clusters/agent-checkin
// @desc    Agent reports its endpoint URL (called periodically by the cluster agent)
// @access  Public (uses clusterId + userId for identification)
router.post('/agent-checkin', async (req, res) => {
  try {
    const { clusterId, userId, agentEndpoint } = req.body;

    if (!clusterId || !userId || !agentEndpoint) {
      return res.status(400).json({ success: false, error: 'clusterId, userId, and agentEndpoint are required' });
    }

    const cluster = await Cluster.findOne({ _id: clusterId, userId });
    if (!cluster) {
      return res.status(404).json({ success: false, error: 'Cluster not found for given clusterId and userId' });
    }

    cluster.agentEndpoint = agentEndpoint;
    cluster.status = 'connected';
    cluster.lastConnectedAt = Date.now();
    await cluster.save();

    console.log(`✅ Agent checkin: ${cluster.name} → ${agentEndpoint}`);

    res.status(200).json({ success: true, message: 'Agent endpoint registered' });
  } catch (error) {
    console.error('Agent checkin error:', error);
    res.status(500).json({ success: false, error: 'Server error during agent checkin' });
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

// @route   PUT /api/clusters/:id
// @desc    Update a cluster
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { name, clusterType, hasPrometheus, hasGrafana, hasLoki } = req.body;

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

    // Update fields
    if (name) cluster.name = name;
    if (clusterType) cluster.clusterType = clusterType;

    if (hasPrometheus !== undefined) {
      cluster.monitoringSetup.hasPrometheus = hasPrometheus;
    }
    if (hasGrafana !== undefined) {
      cluster.monitoringSetup.hasGrafana = hasGrafana;
    }
    if (hasLoki !== undefined) {
      cluster.monitoringSetup.hasLoki = hasLoki;
    }

    await cluster.save();

    res.status(200).json({
      success: true,
      message: 'Cluster updated successfully',
      cluster: {
        _id: cluster._id,
        name: cluster.name,
        clusterType: cluster.clusterType,
        status: cluster.status,
        monitoringSetup: cluster.monitoringSetup,
        updatedAt: cluster.updatedAt
      }
    });
  } catch (error) {
    console.error('Update cluster error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating cluster'
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

// @route   GET /api/clusters/:clusterId/topology
// @desc    Get cluster topology for visualization
// @access  Private
router.get('/:clusterId/topology', protect, async (req, res) => {
  console.log('🔍 Topology endpoint called');
  console.log('User:', req.user?.id || req.user?._id);
  console.log('Cluster ID:', req.params.clusterId);

  try {
    const { clusterId } = req.params;

    // Verify cluster belongs to user
    const cluster = await Cluster.findOne({
      _id: clusterId,
      userId: req.user._id
    });

    console.log('Cluster found:', cluster ? 'Yes' : 'No');

    if (!cluster) {
      console.log('❌ Cluster not found for user');
      return res.status(404).json({
        success: false,
        error: 'Cluster not found'
      });
    }

    // Import kubernetes service here to avoid circular dependency issues
    const k8s = require('@kubernetes/client-node');

    // Get Kubernetes client
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);

    const nodes = [];
    const links = [];
    const nodeIds = new Set();

    // Fetch all pods
    const podsResponse = await coreApi.listPodForAllNamespaces();
    const pods = podsResponse.items || [];

    // Fetch all services
    const servicesResponse = await coreApi.listServiceForAllNamespaces();
    const services = servicesResponse.items || [];

    // Fetch all deployments
    const deploymentsResponse = await appsApi.listDeploymentForAllNamespaces();
    const deployments = deploymentsResponse.items || [];

    // Fetch all statefulsets
    const statefulSetsResponse = await appsApi.listStatefulSetForAllNamespaces();
    const statefulSets = statefulSetsResponse.items || [];

    // Fetch all daemonsets
    const daemonSetsResponse = await appsApi.listDaemonSetForAllNamespaces();
    const daemonSets = daemonSetsResponse.items || [];

    // Helper function to check if pod matches selector
    const matchesSelector = (podLabels, selector) => {
      if (!selector || !podLabels) return false;
      return Object.keys(selector).every(key => podLabels[key] === selector[key]);
    };

    // Helper function to determine health status
    const getPodStatus = (pod) => {
      const phase = pod.status.phase;
      if (phase === 'Running') {
        const allReady = pod.status.containerStatuses?.every(c => c.ready) || false;
        return allReady ? 'Healthy' : 'Warning';
      }
      if (phase === 'Pending') return 'Warning';
      if (phase === 'Failed' || phase === 'CrashLoopBackOff') return 'Unhealthy';
      return 'Unknown';
    };

    const getDeploymentStatus = (deployment) => {
      const available = deployment.status.conditions?.find(c => c.type === 'Available')?.status === 'True';
      const replicas = deployment.status.readyReplicas || 0;
      const desired = deployment.spec.replicas || 0;

      if (available && replicas === desired) return 'Healthy';
      if (replicas > 0) return 'Warning';
      return 'Unhealthy';
    };

    // Add Service nodes and link to Pods
    services.forEach(svc => {
      const serviceId = `service-${svc.metadata.namespace}-${svc.metadata.name}`;

      // Skip cluster internal services
      if (svc.metadata.namespace === 'kube-system' ||
        svc.metadata.namespace === 'kube-public' ||
        svc.metadata.namespace === 'kube-node-lease') {
        return;
      }

      nodeIds.add(serviceId);
      nodes.push({
        id: serviceId,
        name: svc.metadata.name,
        type: 'service',
        namespace: svc.metadata.namespace,
        status: 'Healthy',
        labels: svc.metadata.labels || {},
        annotations: svc.metadata.annotations || {}
      });

      // Link service to matching pods
      if (svc.spec.selector) {
        const matchingPods = pods.filter(pod =>
          pod.metadata.namespace === svc.metadata.namespace &&
          matchesSelector(pod.metadata.labels, svc.spec.selector)
        );

        matchingPods.forEach(pod => {
          const podId = `pod-${pod.metadata.namespace}-${pod.metadata.name}`;
          links.push({
            source: serviceId,
            target: podId,
            type: 'targets'
          });
        });
      }
    });

    // Add Deployment nodes and link to Pods
    deployments.forEach(deployment => {
      const deploymentId = `deployment-${deployment.metadata.namespace}-${deployment.metadata.name}`;

      // Skip system namespaces
      if (deployment.metadata.namespace === 'kube-system' ||
        deployment.metadata.namespace === 'kube-public') {
        return;
      }

      nodeIds.add(deploymentId);
      nodes.push({
        id: deploymentId,
        name: deployment.metadata.name,
        type: 'deployment',
        namespace: deployment.metadata.namespace,
        status: getDeploymentStatus(deployment),
        labels: deployment.metadata.labels || {},
        annotations: deployment.metadata.annotations || {}
      });

      // Link deployment to pods
      const matchingPods = pods.filter(pod =>
        pod.metadata.namespace === deployment.metadata.namespace &&
        matchesSelector(pod.metadata.labels, deployment.spec.selector?.matchLabels)
      );

      matchingPods.forEach(pod => {
        const podId = `pod-${pod.metadata.namespace}-${pod.metadata.name}`;
        links.push({
          source: deploymentId,
          target: podId,
          type: 'manages'
        });
      });
    });

    // Add StatefulSet nodes and link to Pods
    statefulSets.forEach(sts => {
      const stsId = `statefulset-${sts.metadata.namespace}-${sts.metadata.name}`;

      if (sts.metadata.namespace === 'kube-system' ||
        sts.metadata.namespace === 'kube-public') {
        return;
      }

      nodeIds.add(stsId);
      nodes.push({
        id: stsId,
        name: sts.metadata.name,
        type: 'statefulset',
        namespace: sts.metadata.namespace,
        status: sts.status.readyReplicas === sts.spec.replicas ? 'Healthy' : 'Warning',
        labels: sts.metadata.labels || {},
        annotations: sts.metadata.annotations || {}
      });

      const matchingPods = pods.filter(pod =>
        pod.metadata.namespace === sts.metadata.namespace &&
        matchesSelector(pod.metadata.labels, sts.spec.selector?.matchLabels)
      );

      matchingPods.forEach(pod => {
        const podId = `pod-${pod.metadata.namespace}-${pod.metadata.name}`;
        links.push({
          source: stsId,
          target: podId,
          type: 'manages'
        });
      });
    });

    // Add DaemonSet nodes and link to Pods
    daemonSets.forEach(ds => {
      const dsId = `daemonset-${ds.metadata.namespace}-${ds.metadata.name}`;

      if (ds.metadata.namespace === 'kube-system' ||
        ds.metadata.namespace === 'kube-public') {
        return;
      }

      nodeIds.add(dsId);
      nodes.push({
        id: dsId,
        name: ds.metadata.name,
        type: 'daemonset',
        namespace: ds.metadata.namespace,
        status: ds.status.numberReady === ds.status.desiredNumberScheduled ? 'Healthy' : 'Warning',
        labels: ds.metadata.labels || {},
        annotations: ds.metadata.annotations || {}
      });

      const matchingPods = pods.filter(pod =>
        pod.metadata.namespace === ds.metadata.namespace &&
        matchesSelector(pod.metadata.labels, ds.spec.selector?.matchLabels)
      );

      matchingPods.forEach(pod => {
        const podId = `pod-${pod.metadata.namespace}-${pod.metadata.name}`;
        links.push({
          source: dsId,
          target: podId,
          type: 'manages'
        });
      });
    });

    // Add Pod nodes (only those not in system namespaces)
    pods.forEach(pod => {
      if (pod.metadata.namespace === 'kube-system' ||
        pod.metadata.namespace === 'kube-public' ||
        pod.metadata.namespace === 'kube-node-lease') {
        return;
      }

      const podId = `pod-${pod.metadata.namespace}-${pod.metadata.name}`;

      nodeIds.add(podId);
      nodes.push({
        id: podId,
        name: pod.metadata.name,
        type: 'pod',
        namespace: pod.metadata.namespace,
        status: getPodStatus(pod),
        labels: pod.metadata.labels || {},
        annotations: pod.metadata.annotations || {}
      });
    });

    console.log(`✅ Topology generated: ${nodes.length} nodes, ${links.length} links`);

    res.status(200).json({
      success: true,
      nodes,
      links
    });
  } catch (error) {
    console.error('❌ Get cluster topology error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cluster topology',
      message: error.message
    });
  }
});

module.exports = router;

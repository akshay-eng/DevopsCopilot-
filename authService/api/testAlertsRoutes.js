/**
 * Test Alerts Routes - For Development/Testing
 *
 * Simulates alert messages being sent via Socket.IO
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

let io; // Socket.IO instance

// Set Socket.IO instance
function setSocketIO(socketIO) {
  io = socketIO;
}

/**
 * @route   POST /api/test-alerts/send
 * @desc    Send test alerts to user's Socket.IO room (for testing)
 * @access  Private
 */
router.post('/send', protect, async (req, res) => {
  try {
    if (!io) {
      return res.status(500).json({
        success: false,
        error: 'Socket.IO not initialized'
      });
    }

    const { clusterId, count = 3 } = req.body;
    const userId = req.user._id.toString();

    console.log(`🧪 TEST ALERTS - Sending ${count} test alerts to user ${userId}`);

    // Get user's clusters
    const Cluster = require('../models/Cluster');
    const clusters = await Cluster.find({ userId: req.user._id });

    if (clusters.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No clusters found. Please add a cluster first.'
      });
    }

    const targetClusterId = clusterId || clusters[0]._id.toString();

    // Sample test alerts
    const testAlerts = [
      {
        clusterId: targetClusterId,
        alertname: 'PodCrashLooping',
        severity: 'critical',
        namespace: 'production',
        pod: 'api-server-pod-123',
        message: 'Pod is crash looping in production namespace',
        labels: {
          app: 'api-server',
          environment: 'production',
          severity: 'critical'
        },
        annotations: {
          summary: 'Critical pod crash in production',
          description: 'The api-server pod has been crash looping for 5 minutes'
        },
        startsAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      },
      {
        clusterId: targetClusterId,
        alertname: 'HighMemoryUsage',
        severity: 'warning',
        namespace: 'default',
        pod: 'worker-pod-456',
        message: 'Memory usage exceeds 80% threshold',
        labels: {
          app: 'worker',
          environment: 'staging',
          severity: 'warning'
        },
        annotations: {
          summary: 'High memory usage detected',
          description: 'Worker pod memory usage is at 85%'
        },
        startsAt: new Date(Date.now() - 1800000).toISOString() // 30 minutes ago
      },
      {
        clusterId: targetClusterId,
        alertname: 'DeploymentScaled',
        severity: 'info',
        namespace: 'default',
        pod: 'N/A',
        message: 'Deployment scaled to 5 replicas',
        labels: {
          app: 'frontend',
          environment: 'production',
          severity: 'info'
        },
        annotations: {
          summary: 'Deployment scaling event',
          description: 'Frontend deployment scaled from 3 to 5 replicas'
        },
        startsAt: new Date(Date.now() - 900000).toISOString() // 15 minutes ago
      },
      {
        clusterId: targetClusterId,
        alertname: 'DiskSpaceWarning',
        severity: 'warning',
        namespace: 'kube-system',
        pod: 'etcd-pod-789',
        message: 'Disk space usage above 75%',
        labels: {
          app: 'etcd',
          environment: 'production',
          severity: 'warning'
        },
        annotations: {
          summary: 'Low disk space warning',
          description: 'Node disk usage is at 78%'
        },
        startsAt: new Date(Date.now() - 7200000).toISOString() // 2 hours ago
      },
      {
        clusterId: targetClusterId,
        alertname: 'HighCPUUsage',
        severity: 'critical',
        namespace: 'production',
        pod: 'database-pod-999',
        message: 'CPU usage exceeds 90% threshold',
        labels: {
          app: 'database',
          environment: 'production',
          severity: 'critical'
        },
        annotations: {
          summary: 'Critical CPU usage',
          description: 'Database pod CPU usage is at 95%'
        },
        startsAt: new Date(Date.now() - 300000).toISOString() // 5 minutes ago
      }
    ];

    const alertsToSend = testAlerts.slice(0, Math.min(count, testAlerts.length));
    const room = `user-${userId}`;

    console.log(`📤 Emitting ${alertsToSend.length} alerts to room: ${room}`);

    let sentCount = 0;
    for (const alert of alertsToSend) {
      io.to(room).emit('alert', alert);
      sentCount++;
      console.log(`  ✅ Sent alert ${sentCount}/${alertsToSend.length}: ${alert.alertname} (${alert.severity})`);
    }

    res.status(200).json({
      success: true,
      message: `Sent ${sentCount} test alerts via Socket.IO`,
      alerts: alertsToSend.map(a => ({
        alertname: a.alertname,
        severity: a.severity,
        namespace: a.namespace
      }))
    });

  } catch (error) {
    console.error('Test alerts error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = {
  router,
  setSocketIO
};

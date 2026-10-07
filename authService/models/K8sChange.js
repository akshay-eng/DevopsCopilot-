const mongoose = require('mongoose');

/**
 * K8sChange Model
 *
 * Stores Kubernetes resource changes (deployments, configmaps, secrets, statefulsets, daemonsets)
 * with diff information for timeline visualization and alert correlation.
 *
 * TTL: 30 days (same as alerts)
 */

const k8sChangeSchema = new mongoose.Schema({
  // User context
  userId: {
    type: String,
    required: true,
    index: true
  },
  clusterId: {
    type: String,
    required: true,
    index: true
  },
  namespace: {
    type: String,
    default: 'default',
    index: true
  },

  // Resource identity
  resourceType: {
    type: String,
    required: true,
    enum: ['deployment', 'configmap', 'secret', 'statefulset', 'daemonset', 'replicaset'],
    index: true
  },
  resourceName: {
    type: String,
    required: true
  },

  // Change details
  action: {
    type: String,
    required: true,
    enum: ['created', 'updated', 'deleted', 'scaled', 'image_updated', 'config_updated']
  },
  summary: {
    type: String,
    required: true
  },
  diff: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Classification
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info'
  },
  labels: {
    type: Map,
    of: String,
    default: {}
  },

  // Timestamps
  timestamp: {
    type: String,
    required: true,
    index: true
  },

  // Correlation
  correlatedAlertIds: [{
    type: String
  }],

  // TTL
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true,
  collection: 'k8s_changes'
});

// Compound indexes for efficient queries
k8sChangeSchema.index({ userId: 1, timestamp: -1 });
k8sChangeSchema.index({ userId: 1, clusterId: 1, timestamp: -1 });
k8sChangeSchema.index({ userId: 1, namespace: 1, timestamp: -1 });
k8sChangeSchema.index({ userId: 1, clusterId: 1, namespace: 1, timestamp: -1 });
k8sChangeSchema.index({ userId: 1, resourceType: 1, timestamp: -1 });

// TTL index: auto-delete documents after 30 days
k8sChangeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

/**
 * Get recent changes with filtering options
 * @param {string} userId
 * @param {object} options - { clusterId, hours, limit, skip, namespace, resourceType }
 * @returns {Promise<Array>}
 */
k8sChangeSchema.statics.getRecent = async function(userId, options = {}) {
  const { clusterId, hours = 48, limit = 100, skip = 0, namespace, resourceType } = options;

  const query = { userId };

  // Time filter
  if (hours > 0) {
    const sinceDate = new Date(Date.now() - hours * 3600000);
    query.timestamp = { $gte: sinceDate.toISOString() };
  }

  // Optional filters
  if (clusterId) query.clusterId = clusterId;
  if (namespace) query.namespace = namespace;
  if (resourceType) query.resourceType = resourceType;

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

/**
 * Find changes in a namespace within a time window (for correlation)
 * @param {string} userId
 * @param {string} clusterId
 * @param {string} namespace
 * @param {string} sinceISO - ISO timestamp
 * @returns {Promise<Array>}
 */
k8sChangeSchema.statics.findCorrelated = async function(userId, clusterId, namespace, sinceISO) {
  return this.find({
    userId,
    clusterId,
    namespace,
    timestamp: { $gte: sinceISO }
  })
  .sort({ timestamp: -1 })
  .limit(20)
  .lean();
};

/**
 * Get changes by resource
 * @param {string} userId
 * @param {string} clusterId
 * @param {string} resourceType
 * @param {string} resourceName
 * @param {number} limit
 * @returns {Promise<Array>}
 */
k8sChangeSchema.statics.getByResource = async function(userId, clusterId, resourceType, resourceName, limit = 10) {
  return this.find({
    userId,
    clusterId,
    resourceType,
    resourceName
  })
  .sort({ timestamp: -1 })
  .limit(limit)
  .lean();
};

module.exports = mongoose.model('K8sChange', k8sChangeSchema, 'k8s_changes');

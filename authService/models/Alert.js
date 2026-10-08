const mongoose = require('mongoose');

/**
 * Alert Model - Stores Prometheus/Alertmanager alerts
 * Auto-expires after 30 days using MongoDB TTL index
 */
const alertSchema = new mongoose.Schema({
  // User & Cluster identification
  // NOTE: userId in alert_history is stored as String, not ObjectId
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
  clusterName: String,

  // Alert details
  alertname: {
    type: String,
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: ['critical', 'high', 'warning', 'medium', 'info', 'low'],
    default: 'info',
    index: true
  },
  namespace: {
    type: String,
    default: 'default',
    index: true
  },
  pod: String,
  node: String,

  // Alert content
  message: String,
  description: String,
  summary: String,

  // Labels & Annotations (from Prometheus)
  labels: {
    type: Map,
    of: String,
    default: {}
  },
  annotations: {
    type: Map,
    of: String,
    default: {}
  },

  // Status tracking
  status: {
    type: String,
    enum: ['firing', 'resolved'],
    default: 'firing',
    index: true
  },

  // Timestamps - stored as strings in alert_history collection
  startsAt: {
    type: String,
    required: true,
    index: true
  },
  endsAt: String,
  receivedAt: {
    type: String,
    index: true
  },

  // Enrichment data (kubectl describe, logs, metrics, events)
  // Populated asynchronously by alert-webhook-service after alert fires
  enrichment: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // How this alert was resolved — written by the agent resolution flow so the
  // alert details can show what was actually done, not just that it closed.
  resolution: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // For TTL expiration
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ userId: 1, receivedAt: -1 }); // Primary query index
alertSchema.index({ userId: 1, clusterId: 1, receivedAt: -1 });
alertSchema.index({ userId: 1, severity: 1, receivedAt: -1 });
alertSchema.index({ userId: 1, alertname: 1, namespace: 1, receivedAt: -1 });
alertSchema.index({ userId: 1, status: 1, receivedAt: -1 });

// TTL index - Auto-delete documents after 30 days
// MongoDB will automatically remove documents where createdAt is older than 30 days
alertSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

// Static method to get recent alerts with pagination
alertSchema.statics.getRecent = async function(userId, options = {}) {
  const {
    clusterId,
    hours = 48,
    limit = 100,
    skip = 0,
    severity,
    status
  } = options;

  const query = { userId };

  // Time filter - use receivedAt for alert_history collection
  // NOTE: receivedAt is stored as ISO string, so we compare strings
  // If hours is 0, load all alerts (no time filter)
  if (hours && hours > 0) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    query.receivedAt = { $gte: since };
  }

  // Optional filters
  if (clusterId) query.clusterId = clusterId;
  if (severity) query.severity = severity;
  if (status) query.status = status;

  return this.find(query)
    .sort({ receivedAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean(); // Use lean() for better performance
};

// Static method to get historical alerts (pagination)
alertSchema.statics.getHistorical = async function(userId, beforeTimestamp, options = {}) {
  const {
    clusterId,
    limit = 100,
    severity
  } = options;

  const query = {
    userId,
    receivedAt: { $lt: new Date(beforeTimestamp).toISOString() }
  };

  if (clusterId) query.clusterId = clusterId;
  if (severity) query.severity = severity;

  return this.find(query)
    .sort({ receivedAt: -1 })
    .limit(limit)
    .lean();
};

// Static method to get alert count
alertSchema.statics.getCount = async function(userId, options = {}) {
  const { clusterId, status, hours } = options;

  const query = { userId };
  if (clusterId) query.clusterId = clusterId;
  if (status) query.status = status;
  // Only apply time filter if hours is explicitly greater than 0
  if (hours && hours > 0) {
    query.receivedAt = { $gte: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() };
  }

  return this.countDocuments(query);
};

// Use the existing 'alert_history' collection instead of creating a new 'alerts' collection
module.exports = mongoose.model('Alert', alertSchema, 'alert_history');

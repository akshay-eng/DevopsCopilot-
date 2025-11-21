/**
 * Alert Model
 */
const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: {
    type: String, // User ID from AuthService
    required: true,
    index: true,
  },
  clusterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cluster',
    required: true,
    index: true,
  },
  agentId: {
    type: String,
    required: true,
    index: true,
  },
  clusterName: {
    type: String,
    required: true,
  },
  alertname: {
    type: String,
    required: true,
    index: true,
  },
  severity: {
    type: String,
    enum: ['critical', 'warning', 'info'],
    default: 'warning',
    index: true,
  },
  status: {
    type: String,
    enum: ['firing', 'resolved', 'acknowledged', 'silenced'],
    default: 'firing',
    index: true,
  },
  fingerprint: {
    type: String,
    required: true,
    index: true,
  },
  labels: {
    type: Map,
    of: String,
  },
  annotations: {
    summary: String,
    description: String,
  },
  startsAt: {
    type: Date,
    required: true,
  },
  endsAt: {
    type: Date,
  },
  resolvedAt: {
    type: Date,
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  acknowledgedAt: {
    type: Date,
  },
  silencedUntil: {
    type: Date,
  },
  count: {
    type: Number,
    default: 1,
  },
  lastOccurrence: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound index for efficient queries
alertSchema.index({ userId: 1, status: 1, severity: 1 });
alertSchema.index({ clusterId: 1, status: 1 });
alertSchema.index({ fingerprint: 1, clusterId: 1 }, { unique: true });

// Update count and last occurrence for duplicate alerts
alertSchema.statics.upsertAlert = async function(alertData) {
  const existing = await this.findOne({
    fingerprint: alertData.fingerprint,
    clusterId: alertData.clusterId,
  });

  if (existing && existing.status === 'firing') {
    // Update existing alert
    existing.count += 1;
    existing.lastOccurrence = new Date();
    existing.annotations = alertData.annotations;
    existing.labels = alertData.labels;
    return await existing.save();
  } else {
    // Create new alert
    return await this.create(alertData);
  }
};

module.exports = mongoose.model('Alert', alertSchema);

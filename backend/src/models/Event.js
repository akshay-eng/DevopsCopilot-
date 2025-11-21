/**
 * Kubernetes Event Model
 */
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  userId: {
    type: String, // User ID from AuthService
    required: true,
    index: true,
  },
  clusterId: {
    type: String, // User ID from AuthService
    ref: 'Cluster',
    required: true,
    index: true,
  },
  agentId: {
    type: String,
    required: true,
  },
  clusterName: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['Normal', 'Warning', 'Error'],
    required: true,
    index: true,
  },
  reason: {
    type: String,
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    default: 1,
  },
  firstTimestamp: {
    type: Date,
  },
  lastTimestamp: {
    type: Date,
    index: true,
  },
  involvedObject: {
    kind: String,
    name: String,
    namespace: String,
    uid: String,
  },
  source: {
    component: String,
    host: String,
  },
  receivedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
eventSchema.index({ clusterId: 1, type: 1, lastTimestamp: -1 });
eventSchema.index({ userId: 1, type: 1, lastTimestamp: -1 });
eventSchema.index({ 'involvedObject.namespace': 1, 'involvedObject.kind': 1 });

// TTL index - remove events older than 7 days
eventSchema.index({ lastTimestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('Event', eventSchema);

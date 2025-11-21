/**
 * Kubernetes Resource Model
 */
const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
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
  kind: {
    type: String,
    required: true,
    index: true,
  },
  eventType: {
    type: String,
    enum: ['ADDED', 'MODIFIED', 'DELETED'],
    required: true,
  },
  name: {
    type: String,
    required: true,
    index: true,
  },
  namespace: {
    type: String,
    default: 'default',
    index: true,
  },
  uid: {
    type: String,
    required: true,
  },
  resourceVersion: String,
  creationTimestamp: Date,
  labels: {
    type: Map,
    of: String,
  },
  annotations: {
    type: Map,
    of: String,
  },
  spec: mongoose.Schema.Types.Mixed,
  status: mongoose.Schema.Types.Mixed,
  isActive: {
    type: Boolean,
    default: true,
  },
  lastSeenAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound unique index
resourceSchema.index({ clusterId: 1, kind: 1, namespace: 1, name: 1 }, { unique: true });
resourceSchema.index({ userId: 1, kind: 1 });

// Update or create resource
resourceSchema.statics.upsertResource = async function(resourceData) {
  const { clusterId, kind, namespace, name } = resourceData;

  if (resourceData.eventType === 'DELETED') {
    // Mark as inactive instead of deleting
    return await this.findOneAndUpdate(
      { clusterId, kind, namespace, name },
      {
        isActive: false,
        lastSeenAt: new Date(),
        ...resourceData
      },
      { new: true, upsert: true }
    );
  }

  return await this.findOneAndUpdate(
    { clusterId, kind, namespace, name },
    {
      ...resourceData,
      isActive: true,
      lastSeenAt: new Date()
    },
    { new: true, upsert: true }
  );
};

module.exports = mongoose.model('Resource', resourceSchema);

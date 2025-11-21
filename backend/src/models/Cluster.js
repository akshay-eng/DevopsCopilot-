/**
 * Cluster Model
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const clusterSchema = new mongoose.Schema({
  userId: {
    type: String, // User ID from AuthService (not a reference)
    required: true,
    index: true,
  },
  agentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  clusterType: {
    type: String,
    enum: ['kubernetes', 'eks', 'gke', 'aks', 'openshift', 'k3s'],
    required: true,
  },
  apiKey: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'connected', 'disconnected', 'error'],
    default: 'pending',
  },
  lastHeartbeat: {
    type: Date,
  },
  version: {
    type: String,
  },
  kubernetesVersion: {
    type: String,
  },
  nodeCount: {
    type: Number,
    default: 0,
  },
  podCount: {
    type: Number,
    default: 0,
  },
  namespaceCount: {
    type: Number,
    default: 0,
  },
  features: {
    metricsCollection: {
      type: Boolean,
      default: true,
    },
    logCollection: {
      type: Boolean,
      default: true,
    },
    eventWatching: {
      type: Boolean,
      default: true,
    },
    resourceWatching: {
      type: Boolean,
      default: true,
    },
    alertWatching: {
      type: Boolean,
      default: true,
    },
  },
  configuration: {
    prometheusUrl: String,
    grafanaUrl: String,
    lokiUrl: String,
    scrapeInterval: {
      type: Number,
      default: 30,
    },
    watchResources: {
      type: [String],
      default: ['pods', 'services', 'deployments', 'nodes', 'namespaces'],
    },
  },
  metadata: {
    region: String,
    cloudProvider: String,
    environment: {
      type: String,
      enum: ['development', 'staging', 'production'],
    },
    tags: [String],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Hash API key before saving
clusterSchema.pre('save', async function(next) {
  if (!this.isModified('apiKey')) return next();

  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.AGENT_API_KEY_SALT_ROUNDS) || 10);
    this.apiKey = await bcrypt.hash(this.apiKey, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare API key method
clusterSchema.methods.compareApiKey = async function(candidateApiKey) {
  return await bcrypt.compare(candidateApiKey, this.apiKey);
};

// Check if cluster is healthy (heartbeat within timeout)
clusterSchema.methods.isHealthy = function() {
  if (!this.lastHeartbeat) return false;
  const timeoutMs = (parseInt(process.env.AGENT_HEARTBEAT_TIMEOUT) || 120) * 1000;
  return (Date.now() - this.lastHeartbeat.getTime()) < timeoutMs;
};

// Update heartbeat
clusterSchema.methods.updateHeartbeat = async function() {
  this.lastHeartbeat = new Date();
  this.status = 'connected';
  await this.save();
};

// Index for user and status queries
clusterSchema.index({ userId: 1, status: 1 });
clusterSchema.index({ agentId: 1 });

module.exports = mongoose.model('Cluster', clusterSchema);

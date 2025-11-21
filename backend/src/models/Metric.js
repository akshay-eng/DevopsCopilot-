/**
 * Metric Model - Time-series data from clusters
 */
const mongoose = require('mongoose');

const metricSchema = new mongoose.Schema({
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
  timestamp: {
    type: Date,
    required: true,
    index: true,
  },
  cluster: {
    nodes: {
      total: Number,
      ready: Number,
      cpuUsage: Number,
      memoryUsage: Number,
    },
    pods: {
      total: Number,
      running: Number,
      pending: Number,
      failed: Number,
      cpuUsage: Number,
      memoryUsage: Number,
    },
    namespaces: {
      total: Number,
    },
    containers: {
      total: Number,
      restarts: Number,
    },
    services: {
      total: Number,
    },
    deployments: {
      total: Number,
      available: Number,
      unavailable: Number,
    },
    persistentVolumes: {
      total: Number,
      bound: Number,
    },
  },
  pods: [{
    namespace: String,
    pod: String,
    cpu: Number,
    memory: Number,
    networkRx: Number,
    networkTx: Number,
  }],
  nodes: [{
    node: String,
    cpu: Number,
    memory: Number,
    disk: Number,
  }],
}, {
  timestamps: false,
  timeseries: {
    timeField: 'timestamp',
    metaField: 'clusterId',
    granularity: 'minutes',
  },
});

// Compound index for time-series queries
metricSchema.index({ clusterId: 1, timestamp: -1 });
metricSchema.index({ userId: 1, timestamp: -1 });

// TTL index - remove metrics older than 30 days
metricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Metric', metricSchema);

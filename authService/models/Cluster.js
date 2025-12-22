const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const clusterSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Please provide a cluster name'],
    trim: true
  },
  clusterType: {
    type: String,
    required: [true, 'Please provide a cluster type'],
    enum: ['aws', 'gcp', 'azure', 'minikube', 'other']
  },
  agentId: {
    type: String,
    unique: true,
    required: true
  },
  apiKey: {
    type: String,
    required: true,
    select: false
  },
  status: {
    type: String,
    enum: ['pending', 'connected', 'disconnected', 'error'],
    default: 'pending'
  },
  lastConnectedAt: {
    type: Date
  },
  helmInstalled: {
    type: Boolean,
    default: false
  },
  helmInstalledAt: {
    type: Date
  },
  monitoringSetup: {
    hasPrometheus: Boolean,
    hasGrafana: Boolean,
    hasLoki: Boolean
  },
  metadata: {
    kubernetesVersion: String,
    nodeCount: Number,
    region: String,
    additionalInfo: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate unique agent ID and API key before saving
clusterSchema.pre('save', async function(next) {
  if (this.isNew) {
    // Generate unique agent ID
    this.agentId = `agent-${uuidv4()}`;

    // Generate secure API key
    this.apiKey = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Method to verify API key
clusterSchema.methods.verifyApiKey = function(apiKey) {
  return this.apiKey === apiKey;
};

// Method to update connection status
clusterSchema.methods.updateConnectionStatus = async function(status) {
  this.status = status;
  if (status === 'connected') {
    this.lastConnectedAt = Date.now();
  }
  await this.save();
};

module.exports = mongoose.model('Cluster', clusterSchema);

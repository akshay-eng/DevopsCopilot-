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
    enum: ['openshift-ocp', 'gke', 'eks', 'aks', 'minikube', 'k3s', 'other']
  },
  agentId: {
    type: String,
    unique: true
  },
  apiKey: {
    type: String,
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
  // Optional per-cluster credentials. Without this the backend can only read
  // whichever cluster its own kubeconfig points at, which is why multi-cluster
  // reads were previously wrong. Encrypted with the same key as integrations
  // and never selected by default.
  kubeconfig: {
    type: {
      iv: String,
      encryptedData: String,
      authTag: String,
    },
    select: false,
    _id: false,
    default: undefined,
  },
  agentEndpoint: {
    type: String,     // e.g. "http://10.0.1.5:8080" — set by agent checkin
    default: ''
  },
  monitoringSetup: {
    hasPrometheus: Boolean,
    hasGrafana: Boolean,
    hasLoki: Boolean
  },
  metadata: {
    kubernetesVersion: String,
    nodeCount: Number,
    // Fingerprint used to confirm that a kubeconfig really points at THIS
    // cluster before its data is attributed here.
    nodeNames: [String],
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
clusterSchema.pre('save', function () {
  if (this.isNew) {
    // Generate unique agent ID
    this.agentId = `agent-${uuidv4()}`;

    // Generate secure API key
    this.apiKey = crypto.randomBytes(32).toString('hex');
  }
});

// Method to verify API key
clusterSchema.methods.verifyApiKey = function (apiKey) {
  return this.apiKey === apiKey;
};

// Method to update connection status
clusterSchema.methods.updateConnectionStatus = async function (status) {
  this.status = status;
  if (status === 'connected') {
    this.lastConnectedAt = Date.now();
  }
  await this.save();
};

module.exports = mongoose.model('Cluster', clusterSchema);

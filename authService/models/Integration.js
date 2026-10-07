const mongoose = require('mongoose');
const { INTEGRATION_IDS } = require('../config/integrationRegistry');

const integrationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    // Modular: valid types come from the integration registry manifest.
    enum: INTEGRATION_IDS,
    index: true
  },
  encryptedConfig: {
    iv: {
      type: String,
      required: true
    },
    encryptedData: {
      type: String,
      required: true
    },
    authTag: {
      type: String,
      required: true
    }
  },
  enabled: {
    type: Boolean,
    default: true
  },
  lastTested: {
    type: Date
  },
  lastUsed: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for userId + type (each user can have one integration per type)
integrationSchema.index({ userId: 1, type: 1 }, { unique: true });

// Update the updatedAt timestamp before saving
integrationSchema.pre('save', function() {
  this.updatedAt = new Date();
});

const Integration = mongoose.model('Integration', integrationSchema);

module.exports = Integration;

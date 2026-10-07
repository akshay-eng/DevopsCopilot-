/**
 * Cluster Model
 *
 * Simplified cluster model for alert enrichment
 * Only includes fields needed for user/cluster mapping
 */

const mongoose = require('mongoose');

const ClusterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['connected', 'disconnected', 'error'],
    default: 'disconnected'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Cluster', ClusterSchema);

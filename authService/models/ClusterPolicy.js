const mongoose = require('mongoose');

/**
 * A user-defined compliance baseline.
 *
 * `clusterId: null` means the account-wide default, applied to any cluster
 * without its own policy — so a baseline defined once covers every cluster
 * onboarded afterwards.
 */
const ruleSchema = new mongoose.Schema({
  rule: { type: String, required: true },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  enabled: { type: Boolean, default: true },
}, { _id: false });

const clusterPolicySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clusterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cluster', default: null, index: true },
  name: { type: String, default: 'Default baseline' },
  rules: { type: [ruleSchema], default: [] },
}, { timestamps: true });

clusterPolicySchema.index({ userId: 1, clusterId: 1 }, { unique: true });

module.exports = mongoose.model('ClusterPolicy', clusterPolicySchema);

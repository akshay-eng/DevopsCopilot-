const mongoose = require('mongoose');

/**
 * One evaluation of a cluster against its policy. Kept so the UI can show when
 * compliance last ran and whether it is drifting, rather than only ever showing
 * a live result that disappears on reload.
 */
const complianceResultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clusterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cluster', required: true, index: true },
  score: { type: Number, default: 0 },
  passed: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  warned: { type: Number, default: 0 },
  unknown: { type: Number, default: 0 },
  compliant: { type: Boolean, default: false },
  checks: { type: [mongoose.Schema.Types.Mixed], default: [] },
  evaluatedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

module.exports = mongoose.model('ComplianceResult', complianceResultSchema);

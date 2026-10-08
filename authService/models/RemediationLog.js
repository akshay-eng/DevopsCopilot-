const mongoose = require('mongoose');

/**
 * An audit trail of every cluster change the agent made.
 *
 * Separate from the in-memory agent threads on purpose: threads are capped and
 * vanish on restart, but "what changed production, when, and why" must survive
 * both.
 */
const remediationLogSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  action: { type: String, required: true },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
  reason: { type: String, default: '' },
  status: { type: String, enum: ['applied', 'failed', 'refused'], required: true },
  result: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: '' },
  alertId: { type: String, default: null, index: true },
  correlationId: { type: String, default: null, index: true },
  durationMs: Number,
}, { timestamps: true });

remediationLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('RemediationLog', remediationLogSchema);

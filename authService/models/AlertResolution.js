const mongoose = require('mongoose');

/**
 * One agent-driven attempt to resolve an alert.
 *
 * Kept even when the attempt fails or is refused: "we tried this and the
 * operator said no" is exactly the history the next responder needs, and it is
 * the evidence behind the summary shown in the alert details.
 */
const alertResolutionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  alertId: { type: String, index: true },
  alertname: { type: String, required: true, index: true },
  namespace: String,
  pod: String,
  clusterId: String,

  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  // What the run achieved, as distinct from whether it ran.
  outcome: {
    type: String,
    enum: ['remediated', 'no-action-needed', 'investigated', 'awaiting-human', 'failed', ''],
    default: '',
  },

  summary: { type: String, default: '' },
  transcript: { type: String, default: '' },
  threadId: String,
  toolsUsed: [String],
  actions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  approvals: { type: [mongoose.Schema.Types.Mixed], default: [] },
  followUps: { type: [String], default: [] },

  sopPath: String,
  snowIncident: String,
  correlationId: String,

  error: { type: String, default: '' },
  startedAt: Date,
  endedAt: Date,
}, { timestamps: true });

alertResolutionSchema.index({ userId: 1, alertname: 1, createdAt: -1 });

module.exports = mongoose.model('AlertResolution', alertResolutionSchema);

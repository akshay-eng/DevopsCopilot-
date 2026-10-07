const mongoose = require('mongoose');

const correlatedIncidentSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  clusterId: { type: String, default: '' },

  // Fingerprint for deduplication: hash of sorted alert names + pods + namespace
  fingerprint: { type: String, required: true, index: true },

  // Occurrence tracking
  occurrences: { type: Number, default: 1 },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },

  // Status
  status: { type: String, enum: ['active', 'resolved', 'acknowledged'], default: 'active' },

  // Root cause analysis summary
  rootCause: {
    pod: String,
    namespace: String,
    score: Number,
    anomalySummary: String,
    anomalousMetrics: [String],
  },

  // Cluster summary
  alertCount: { type: Number, default: 0 },
  alertNames: [String],
  pods: [String],
  namespaces: [String],
  severities: { type: mongoose.Schema.Types.Mixed, default: {} },
  statuses: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Causal chain
  causalChain: [{
    pod: String,
    role: String,
    score: Number,
    anomaly: String,
  }],

  // Evidence
  evidence: [String],

  // Topology snapshot
  topology: {
    nodes: [{ type: mongoose.Schema.Types.Mixed }],
    edges: [{ type: mongoose.Schema.Types.Mixed }],
  },

  // Downstream impact
  downstreamImpact: [String],

  // Anomaly details per pod
  anomalyDetails: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Time range of the alerts
  timeRange: {
    start: String,
    end: String,
    durationSeconds: Number,
  },

  // Execution metadata
  executionTimeMs: Number,

  // ServiceNow integration
  snowIncident: {
    number: String,        // INC0012345
    sysId: String,         // ServiceNow sys_id
    url: String,           // Full URL to the incident
    state: String,         // new, in_progress, resolved, closed
    createdAt: Date,
    updatedAt: Date,
  },

  // Change request raised when remediating this incident mutates production
  changeRequest: {
    number: String,        // CHG0012345
    sysId: String,
    url: String,
    state: String,
    reason: String,        // why a change was required
    plan: String,          // the proposed remediation
    riskLevel: String,     // 1=High 2=Moderate 3=Low
    createdAt: Date,
  },

  // Cron job reference
  cronJobId: { type: String, default: null },
}, {
  timestamps: true,
});

// Compound index for dedup lookups
correlatedIncidentSchema.index({ userId: 1, fingerprint: 1, status: 1 });
correlatedIncidentSchema.index({ userId: 1, lastSeenAt: -1 });

module.exports = mongoose.model('CorrelatedIncident', correlatedIncidentSchema);

const mongoose = require('mongoose');

const mcpMetricSnapshotSchema = new mongoose.Schema({
    deploymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MCPDeployment',
        required: true,
        index: true,
    },
    cpu: {
        millicores: { type: Number, default: 0 },
        percent: { type: Number, default: 0 },
    },
    memory: {
        usageMi: { type: Number, default: 0 },
        percent: { type: Number, default: 0 },
    },
    network: {
        rxMB: { type: Number, default: 0 },
        txMB: { type: Number, default: 0 },
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
});

// Fast range queries: find snapshots for a deployment within a time window
mcpMetricSnapshotSchema.index({ deploymentId: 1, timestamp: -1 });

// Auto-delete records older than 30 days
mcpMetricSnapshotSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('MCPMetricSnapshot', mcpMetricSnapshotSchema);

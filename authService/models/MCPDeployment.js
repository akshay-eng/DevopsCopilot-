const mongoose = require('mongoose');

const mcpDeploymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    clusterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cluster',
        required: true,
    },
    mcpServerId: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    namespace: {
        type: String,
        default: 'mcp-servers',
    },
    image: {
        type: String,
        default: '',
    },
    port: {
        type: Number,
        default: 3000,
    },
    deployMethod: {
        type: String,
        enum: ['docker', 'helm'],
        default: 'docker',
    },
    envVars: {
        type: Map,
        of: String,
        default: {},
    },
    status: {
        type: String,
        enum: ['pending', 'running', 'stopped', 'failed', 'terminating'],
        default: 'pending',
    },
    sseUrl: {
        type: String,
        default: '',
    },
    podName: {
        type: String,
        default: '',
    },
}, {
    timestamps: true,
});

// Compound index: one MCP server per cluster per user
mcpDeploymentSchema.index({ userId: 1, clusterId: 1, mcpServerId: 1 }, { unique: true });

module.exports = mongoose.model('MCPDeployment', mcpDeploymentSchema);

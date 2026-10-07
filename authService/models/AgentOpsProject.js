const mongoose = require('mongoose');

const agentOpsProjectSchema = new mongoose.Schema({
    user_id: {
        type: String,
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    organization: {
        type: String,
        required: true
    },
    trace_count: {
        type: Number,
        default: 0
    },
    last_activity: {
        type: Date,
        default: null
    },
    settings: {
        framework: {
            type: String,
            default: 'custom'
        },
        integration_type: {
            type: String,
            enum: ['existing', 'fresh'],
            default: 'existing'
        },
        llm_provider: {
            type: String,
            default: null
        }
    },
    pg_project_id: {
        type: String,
        default: null
    },
    is_default: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Index for faster queries
agentOpsProjectSchema.index({ user_id: 1, created_at: -1 });

// Ensure only one default project per user
agentOpsProjectSchema.pre('save', async function () {
    if (this.is_default && this.isModified('is_default')) {
        await this.constructor.updateMany(
            { user_id: this.user_id, _id: { $ne: this._id } },
            { is_default: false }
        );
    }
});

module.exports = mongoose.model('AgentOpsProject', agentOpsProjectSchema);

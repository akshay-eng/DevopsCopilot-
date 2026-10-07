const mongoose = require('mongoose');
const crypto = require('crypto');

const agentOpsAPIKeySchema = new mongoose.Schema({
    project_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AgentOpsProject',
        required: true,
        index: true
    },
    user_id: {
        type: String,
        required: true,
        index: true
    },
    key_hash: {
        type: String,
        required: true,
        unique: true
    },
    key_preview: {
        type: String,
        required: true
    },
    name: {
        type: String,
        default: 'Default API Key'
    },
    last_used: {
        type: Date,
        default: null
    },
    usage_count: {
        type: Number,
        default: 0
    },
    is_active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Index for faster lookups
agentOpsAPIKeySchema.index({ key_hash: 1 });
agentOpsAPIKeySchema.index({ project_id: 1, is_active: 1 });

// Static method to generate API key (UUID format for AgentOps SDK compatibility)
agentOpsAPIKeySchema.statics.generateKey = function () {
    // Generate UUID v4 format key (required by AgentOps API)
    const bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const hex = bytes.toString('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
};

// Static method to hash API key
agentOpsAPIKeySchema.statics.hashKey = function (key) {
    return crypto.createHash('sha256').update(key).digest('hex');
};

// Static method to create preview (last 8 chars)
agentOpsAPIKeySchema.statics.createPreview = function (key) {
    return key.slice(-8);
};

// Method to verify API key
agentOpsAPIKeySchema.methods.verifyKey = function (key) {
    const hash = this.constructor.hashKey(key);
    return this.key_hash === hash;
};

// Method to record usage
agentOpsAPIKeySchema.methods.recordUsage = async function () {
    this.last_used = new Date();
    this.usage_count += 1;
    await this.save();
};

module.exports = mongoose.model('AgentOpsAPIKey', agentOpsAPIKeySchema);

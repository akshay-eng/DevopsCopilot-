const mongoose = require('mongoose');

/**
 * A generated AI answer, kept until someone asks for a new one.
 *
 * In-memory caches lose everything on restart and expire on a timer, which
 * means the first person through the door after a deploy pays the full model
 * latency — repeatedly, for an answer that has not changed. These are written
 * once and then simply read, so "already generated" actually means already
 * generated.
 *
 * Staleness is a separate question from expiry: `inputHash` records what the
 * answer was derived from, so a caller can tell that the underlying data moved
 * and offer a refresh, rather than silently discarding a good answer.
 */
const aiArtifactSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  // What produced it, e.g. 'fleet-advice'
  kind: { type: String, required: true },
  // Unique within (userId, kind) — e.g. '720|security'
  key: { type: String, required: true },

  value: { type: mongoose.Schema.Types.Mixed, required: true },
  source: { type: String, default: '' },
  model: { type: String, default: '' },
  inputHash: { type: String, default: '' },
  generatedAt: { type: Date, default: Date.now },
  generationMs: Number,
}, { timestamps: true });

aiArtifactSchema.index({ userId: 1, kind: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('AiArtifact', aiArtifactSchema);

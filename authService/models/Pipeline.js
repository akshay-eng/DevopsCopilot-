const mongoose = require('mongoose');

const tableRunDetailSchema = new mongoose.Schema({
  table: String,
  collection: String,
  recordCount: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' }
}, { _id: false });

const pipelineRunSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  startedAt: Date,
  completedAt: Date,
  totalRecords: { type: Number, default: 0 },
  processedRecords: { type: Number, default: 0 },
  tableDetails: [tableRunDetailSchema],
  error: String,
  durationMs: Number
});

const tableCollectionMapSchema = new mongoose.Schema({
  table: { type: String, required: true },
  collection: { type: String, required: true },
  label: String
}, { _id: false });

const pipelineSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  sourceType: {
    type: String,
    enum: ['snow', 'jira', 'email', 'github'],
    required: true
  },
  destinationType: {
    type: String,
    enum: ['milvus'],
    required: true,
    default: 'milvus'
  },
  tableCollections: [tableCollectionMapSchema],
  status: {
    type: String,
    enum: ['idle', 'running', 'completed', 'failed'],
    default: 'idle'
  },
  lastRun: pipelineRunSchema,
  runs: [pipelineRunSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

pipelineSchema.index({ userId: 1, sourceType: 1 });

pipelineSchema.pre('save', function () {
  this.updatedAt = new Date();
});

const Pipeline = mongoose.model('Pipeline', pipelineSchema);

module.exports = Pipeline;

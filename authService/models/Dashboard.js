const mongoose = require('mongoose');

// A user's custom analytics dashboard: a list of AI/NLP-generated widget specs.
const widgetSchema = new mongoose.Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  type: { type: String, required: true },        // stat|line|area|bar|stackedBar|horizontalBar|donut|radar|funnel
  dataSource: { type: String, required: true },  // e.g. alerts_over_time, vuln_by_severity
  series: [String],
  metric: String,
  prompt: String,                                 // original NL prompt
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const dashboardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: 'My Dashboard' },
  widgets: { type: [widgetSchema], default: [] },
}, { timestamps: true });

dashboardSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Dashboard', dashboardSchema);

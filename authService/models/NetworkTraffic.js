const mongoose = require('mongoose');

const endpointSchema = {
  ip: String,
  port: Number,
  pod: String,
  ns: String,
  svc: String,
  labels: { type: mongoose.Schema.Types.Mixed, default: {} }
};

const networkTrafficSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  clusterId: { type: String, required: true, index: true },
  timestamp: { type: Date, required: true, index: true },
  src: endpointSchema,
  dst: endpointSchema,
  http: {
    method: String,
    path: String,
    query: { type: Map, of: String, default: {} },
    headers: { type: Map, of: String, default: {} },
    body: String,
    status: Number,
    latency_ms: Number
  },
  bytes: { type: Number, default: 0 },
  protocol: { type: String, default: 'TCP' },
  createdAt: { type: Date, default: Date.now }
});

// TTL index: auto-delete after 7 days
networkTrafficSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

// Compound indexes for efficient queries
networkTrafficSchema.index({ userId: 1, clusterId: 1, timestamp: -1 });
networkTrafficSchema.index({ userId: 1, clusterId: 1, 'src.svc': 1, 'dst.svc': 1 });

// Namespace-based query indexes
networkTrafficSchema.index({ userId: 1, clusterId: 1, 'src.ns': 1, timestamp: -1 });
networkTrafficSchema.index({ userId: 1, clusterId: 1, 'dst.ns': 1, timestamp: -1 });

networkTrafficSchema.statics.getRecent = async function(userId, clusterId, options = {}) {
  const { limit = 50, skip = 0, method, status, since, ns } = options;
  const query = { userId, clusterId };
  if (method) query['http.method'] = method.toUpperCase();
  if (status) query['http.status'] = parseInt(status);
  if (since) query.timestamp = { $gte: new Date(since) };
  if (ns) query.$or = [{ 'src.ns': ns }, { 'dst.ns': ns }];
  return this.find(query).sort({ timestamp: -1 }).limit(limit).skip(skip).lean();
};

/**
 * Aggregate L4 flow summaries from MongoDB (historical)
 */
networkTrafficSchema.statics.getFlowSummaries = async function(userId, clusterId, options = {}) {
  const { ns, limit = 100, since } = options;
  const match = { userId, clusterId };
  if (since) match.timestamp = { $gte: new Date(since) };
  if (ns) match.$or = [{ 'src.ns': ns }, { 'dst.ns': ns }];

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          srcPod: { $ifNull: ['$src.pod', '$src.ip'] },
          dstPod: { $ifNull: ['$dst.pod', '$dst.ip'] },
          dstPort: { $ifNull: ['$dst.port', 0] },
          dstSvc: '$dst.svc',
          protocol: { $ifNull: ['$protocol', 'TCP'] }
        },
        totalBytes: { $sum: { $ifNull: ['$bytes', 0] } },
        requestCount: { $sum: 1 },
        totalLatency: { $sum: { $ifNull: ['$http.latency_ms', 0] } },
        errorCount: { $sum: { $cond: [{ $gte: ['$http.status', 400] }, 1, 0] } },
        srcNs: { $first: '$src.ns' },
        srcSvc: { $first: '$src.svc' },
        srcIp: { $first: '$src.ip' },
        dstNs: { $first: '$dst.ns' },
        dstIp: { $first: '$dst.ip' },
        firstSeen: { $min: '$timestamp' },
        lastSeen: { $max: '$timestamp' }
      }
    },
    { $sort: { totalBytes: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        protocol: '$_id.protocol',
        client: { pod: '$_id.srcPod', ns: '$srcNs', svc: '$srcSvc', ip: '$srcIp' },
        server: { pod: '$_id.dstPod', ns: '$dstNs', svc: '$_id.dstSvc', ip: '$dstIp', port: '$_id.dstPort' },
        totalBytes: 1,
        requestCount: 1,
        avgLatency: { $cond: [{ $gt: ['$requestCount', 0] }, { $round: [{ $divide: ['$totalLatency', '$requestCount'] }, 0] }, 0] },
        errorRate: { $cond: [{ $gt: ['$requestCount', 0] }, { $divide: ['$errorCount', '$requestCount'] }, 0] },
        firstSeen: 1,
        lastSeen: 1
      }
    }
  ]);
};

module.exports = mongoose.model('NetworkTraffic', networkTrafficSchema, 'network_traffic');

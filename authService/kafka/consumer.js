/**
 * Kafka Consumer - Main Consumer for All Topics
 *
 * Consumes messages from all Kafka topics and distributes to appropriate handlers
 */

const { Kafka } = require('kafkajs');
const Alert = require('../models/Alert');
const NetworkTraffic = require('../models/NetworkTraffic');
const Cluster = require('../models/Cluster');
const K8sChange = require('../models/K8sChange');

let io; // Socket.IO instance

// ========================================
// Network Traffic In-Memory State
// ========================================

// Circular buffer: { "userId:clusterId" -> event[] }
const trafficBuffers = new Map();
const MAX_TRAFFIC_BUFFER = 1000;

// Service graph aggregation: { "userId:clusterId" -> { edges: Map, lastReset: timestamp } }
const serviceGraphs = new Map();
const SERVICE_GRAPH_WINDOW_MS = 5 * 60 * 1000; // 5-minute rolling window

// Capture state: { "userId:clusterId" -> boolean }
const captureStates = new Map();

// Throttle service map emissions: { "userId:clusterId" -> lastEmitTime }
const serviceMapThrottle = new Map();
const THROTTLE_INTERVAL = 3000; // emit at most every 3 seconds

const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(',');

const kafka = new Kafka({
  clientId: 'devopscopilot-main-consumer',
  brokers,
  connectionTimeout: 60000,
  requestTimeout: 60000,
  retry: {
    retries: 8,
    initialRetryTime: 300,
    maxRetryTime: 30000
  }
});

const consumer = kafka.consumer({
  groupId: 'devopscopilot-realtime-v3',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxWaitTimeInMs: 100,
  retry: {
    retries: 10,
    initialRetryTime: 300,
    maxRetryTime: 30000
  },
});

// Dedicated Kafka instance + consumer for network-events (avoids topic starvation)
const kafkaNet = new Kafka({
  clientId: 'devopscopilot-net-consumer',
  brokers,
  connectionTimeout: 60000,
  requestTimeout: 60000,
});

const netConsumer = kafkaNet.consumer({
  groupId: 'devopscopilot-network-v8',
  sessionTimeout: 60000,
  heartbeatInterval: 5000,
  maxWaitTimeInMs: 500,
  rebalanceTimeout: 90000,
  retry: {
    retries: 10,
    initialRetryTime: 300,
    maxRetryTime: 30000
  },
});

let isConnected = false;
let isNetConnected = false;

// In-memory cache for recent alerts (per user)
// Structure: { userId: [ {alert1}, {alert2}, ... ] }
const recentAlerts = new Map();
const MAX_ALERTS_PER_USER = 100; // Keep last 100 alerts per user

// In-memory cache for recent K8s changes (per user)
// Structure: { userId: [ {change1}, {change2}, ... ] }
const recentChanges = new Map();
const MAX_CHANGES_PER_USER = 200; // Keep last 200 changes per user

// Topics for the main consumer
// Note: 'alerts' is handled by the dedicated alert consumer in server.js
const TOPICS = [
  'logs',
  'k8s-events',
  'resources',
  'metrics',
  'heartbeats',
  'changes',
  'network-events', // Network traffic from eBPF monitor
];

/**
 * Set Socket.IO instance
 */
function setSocketIO(socketIO) {
  io = socketIO;
  console.log('✅ Socket.IO instance set for Kafka consumer');
}

/**
 * Handle log messages
 */
function handleLogMessage(data) {
  if (!io) return;

  const { userId, clusterId, clusterName, namespace, pod, container, logLine, timestamp } = data;

  io.to(`user-${userId}`).emit('pod-logs', {
    clusterId,
    clusterName,
    namespace,
    pod,
    container,
    logLine,
    timestamp,
  });

  if (process.env.LOG_LEVEL === 'DEBUG') {
    const preview = logLine.substring(0, 60);
    console.log(`[LOG] ${userId} | ${namespace}/${pod}: ${preview}...`);
  }
}

/**
 * Handle alert messages
 */
async function handleAlertMessage(data) {
  if (!io) return;

  console.log(`[DEBUG] handleAlertMessage called for alert: ${data.alertname}, userId: ${data.userId}`);

  const {
    userId,
    clusterId,
    severity,
    alertname,
    namespace,
    pod,
    node,
    labels,
    annotations,
    startsAt,
    endsAt,
    status
  } = data;

  // Extract message from annotations
  const message = annotations?.summary || annotations?.description || annotations?.message || `${alertname} alert`;
  const description = annotations?.description || '';
  const summary = annotations?.summary || '';

  // Build alert object for frontend
  const alert = {
    clusterId,
    severity: severity || 'warning',
    alertname,
    namespace: namespace || labels?.namespace || 'default',
    pod: pod || labels?.pod || 'N/A',
    node: node || labels?.node,
    message,
    labels: labels || {},
    annotations: annotations || {},
    startsAt: startsAt || new Date().toISOString(),
    endsAt,
    status: status || 'firing'
  };

  // 1. Save to MongoDB (async, don't block real-time emission)
  let isNewAlert = false; // tracks whether this is a first-time fire (for Socket.IO dedup)
  try {
    if (status === 'resolved') {
      // Update the most recent firing document to resolved
      await Alert.findOneAndUpdate(
        {
          userId,
          clusterId,
          alertname,
          namespace: namespace || labels?.namespace || 'default',
          status: 'firing'
        },
        {
          $set: {
            status: 'resolved',
            endsAt: endsAt || new Date().toISOString(),
            receivedAt: new Date().toISOString()
          }
        },
        { sort: { startsAt: -1 } }
      );
    } else {
      // Create a new document for each firing (including repeat_interval re-sends).
      // Each document gets a unique receivedAt = now, so the timeline shows a dot
      // at the actual time the alert was re-fired, not just at the original startsAt.
      const savedAlert = await Alert.create({
        userId,
        clusterId,
        alertname,
        severity: severity || 'warning',
        namespace: namespace || labels?.namespace || 'default',
        pod: pod || labels?.pod,
        node: node || labels?.node,
        message,
        description,
        summary,
        labels: labels || {},
        annotations: annotations || {},
        status: 'firing',
        startsAt: startsAt || new Date().toISOString(),
        endsAt: null,
        receivedAt: new Date().toISOString()
      });
      isNewAlert = true; // always emit — each re-fire is a new timeline dot

      // Fire-and-forget: enrich with Prometheus metrics (non-blocking)
      const { enrichAlert } = require('../utils/alertEnricher');
      enrichAlert(savedAlert).catch(err => console.error('[ENRICH] Uncaught:', err.message));
    }

    // Reverse correlation: check for recent changes that might have caused this alert
    try {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const recentChangesInNs = await K8sChange.find({
        userId,
        clusterId,
        namespace: namespace || labels?.namespace || 'default',
        timestamp: { $gte: fifteenMinAgo }
      }).sort({ timestamp: -1 }).limit(5).lean();

      if (recentChangesInNs.length > 0) {
        const cause = recentChangesInNs[0]; // Most recent change
        // Emit correlation to frontend
        if (io) {
          io.to(`user-${userId}`).emit('alert-correlation', {
            alertname,
            clusterId,
            possibleCause: {
              changeType: cause.action,
              resource: `${cause.resourceType}/${cause.resourceName}`,
              summary: cause.summary,
              changeTimestamp: cause.timestamp
            }
          });
        }
      }
    } catch (corrErr) {
      console.error('[CORRELATION] Alert->Change lookup failed:', corrErr.message);
    }

  } catch (err) {
    // Don't block real-time if DB save fails
    console.error(`[ERROR] Failed to save alert to MongoDB:`, err.message);
  }

  // 2. Emit to Socket.IO for real-time update
  if (status === 'resolved') {
    // Emit resolution so the frontend can update the existing alert row
    io.to(`user-${userId}`).emit('alert-resolved', {
      clusterId,
      alertname,
      endsAt: endsAt || new Date().toISOString(),
      namespace: namespace || labels?.namespace || 'default',
    });
  } else if (isNewAlert) {
    // Emit for every firing (including repeat_interval re-sends) — each becomes a timeline dot
    io.to(`user-${userId}`).emit('alert', alert);
  }

  // 3. Cache alert for this user (for quick access)
  if (!recentAlerts.has(userId)) {
    recentAlerts.set(userId, []);
  }
  const userAlerts = recentAlerts.get(userId);
  userAlerts.unshift(alert); // Add to beginning

  // Keep only last MAX_ALERTS_PER_USER alerts in memory
  if (userAlerts.length > MAX_ALERTS_PER_USER) {
    userAlerts.pop();
  }

  console.log(`[ALERT] ${userId} | ${severity || 'unknown'} - ${alertname} in ${alert.namespace}/${alert.pod}`);
}

/**
 * Handle Kubernetes event messages
 */
function handleK8sEventMessage(data) {
  if (!io) return;

  const { userId, clusterId, namespace, reason, message, type } = data;

  io.to(`user-${userId}`).emit('k8s-event', {
    clusterId,
    namespace,
    reason,
    message,
    type,
    ...data,
  });

  if (type === 'Warning') {
    console.log(`[K8S-EVENT] ${userId} | ${type} - ${reason}: ${message}`);
  }
}

/**
 * Handle resource update messages
 */
function handleResourceMessage(data) {
  if (!io) return;

  const { userId, clusterId, resourceType, action, namespace, name } = data;

  io.to(`user-${userId}`).emit('resource-update', {
    clusterId,
    resourceType,
    action,
    namespace,
    name,
    ...data,
  });

  if (process.env.LOG_LEVEL === 'DEBUG') {
    console.log(`[RESOURCE] ${userId} | ${action} ${resourceType} ${namespace}/${name}`);
  }
}

/**
 * Handle K8s change messages (from changes topic)
 */
async function handleK8sChangeMessage(data) {
  if (!io) return;

  const {
    userId,
    clusterId,
    namespace,
    resourceType,
    resourceName,
    action,
    summary,
    diff,
    severity,
    labels,
    timestamp
  } = data;

  const change = {
    clusterId,
    namespace: namespace || 'default',
    resourceType,
    resourceName,
    action,
    summary,
    diff: diff || {},
    severity: severity || 'info',
    labels: labels || {},
    timestamp: timestamp || new Date().toISOString()
  };

  // 1. Save to MongoDB (async, non-blocking)
  try {
    await K8sChange.create({ userId, ...change });
  } catch (err) {
    console.error('[CHANGE] MongoDB save error:', err.message);
  }

  // 2. Cache in memory
  if (!recentChanges.has(userId)) {
    recentChanges.set(userId, []);
  }
  const userChanges = recentChanges.get(userId);
  userChanges.unshift(change);
  if (userChanges.length > MAX_CHANGES_PER_USER) {
    userChanges.pop();
  }

  // 3. Emit Socket.IO event
  io.to(`user-${userId}`).emit('k8s-change', change);

  // 4. Run correlation check
  await correlateChangeWithAlerts(userId, clusterId, namespace, change);

  console.log(`[CHANGE] ${userId} | ${action} ${resourceType} ${namespace}/${resourceName}`);
}

/**
 * Correlation Engine: Link changes to recent alerts
 */
async function correlateChangeWithAlerts(userId, clusterId, namespace, change) {
  try {
    // Find recent alerts in the same namespace (last 15 minutes)
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const recentNamespaceAlerts = await Alert.find({
      userId,
      clusterId,
      namespace,
      receivedAt: { $gte: fifteenMinAgo }
    }).sort({ receivedAt: -1 }).limit(10).lean();

    if (recentNamespaceAlerts.length === 0) return;

    const alertIds = recentNamespaceAlerts.map(a => a._id.toString());

    // Update the change with correlated alert IDs
    await K8sChange.findOneAndUpdate(
      {
        userId,
        clusterId,
        namespace,
        resourceName: change.resourceName,
        timestamp: change.timestamp
      },
      { $addToSet: { correlatedAlertIds: { $each: alertIds } } }
    );

    // Update alerts with possible cause
    for (const alert of recentNamespaceAlerts) {
      await Alert.findByIdAndUpdate(alert._id, {
        $set: {
          'enrichment.possibleCause': {
            changeType: change.action,
            resource: `${change.resourceType}/${change.resourceName}`,
            summary: change.summary,
            changeTimestamp: change.timestamp
          }
        }
      });

      // Emit correlation update to frontend
      if (io) {
        io.to(`user-${userId}`).emit('alert-correlation', {
          alertId: alert._id.toString(),
          alertname: alert.alertname,
          clusterId,
          possibleCause: {
            changeType: change.action,
            resource: `${change.resourceType}/${change.resourceName}`,
            summary: change.summary,
            changeTimestamp: change.timestamp
          }
        });
      }
    }

    console.log(`[CORRELATION] Linked ${change.action} ${change.resourceType}/${change.resourceName} to ${alertIds.length} alerts in ${namespace}`);
  } catch (err) {
    console.error('[CORRELATION] Error:', err.message);
  }
}

/**
 * Handle metrics messages
 *
 * Expected format from cluster agent:
 * {
 *   userId: "...",
 *   clusterId: "...",
 *   clusterName: "...",
 *   timestamp: "2025-12-23T10:43:42.656493+00:00",
 *   eventType: "metrics",
 *   resourceType: "pod",
 *   metricName: "cpu_usage_cores",
 *   data: [
 *     {
 *       labels: { namespace: "...", pod: "...", container: "...", ... },
 *       value: 0.00123,
 *       timestamp: 1766486622.811
 *     },
 *     ...
 *   ]
 * }
 */
function handleMetricsMessage(data) {
  if (!io) {
    console.error('[METRICS] ❌ Socket.IO not initialized, cannot emit metrics');
    return;
  }

  const { userId, clusterId, resourceType, metricName, data: rawMetricData, timestamp } = data;

  console.log('[METRICS] 📥 Received from Kafka:', {
    userId,
    clusterId,
    resourceType,
    metricName,
    dataLength: rawMetricData?.length,
    timestamp
  });

  if (!userId || !clusterId || !resourceType || !metricName || !Array.isArray(rawMetricData)) {
    console.error('[METRICS] ❌ Invalid metrics message format:', { userId, clusterId, resourceType, metricName });
    return;
  }

  // Transform the data into the format expected by the frontend
  // Frontend expects: { namespace, name, value }
  const metricData = rawMetricData.map(item => ({
    namespace: item.labels?.namespace || 'default',
    name: item.labels?.pod || item.labels?.node || item.labels?.container || 'unknown',
    value: item.value,
    labels: item.labels,
    timestamp: item.timestamp
  }));

  console.log('[METRICS] 🔄 Transformed data:', {
    firstItem: metricData[0],
    totalItems: metricData.length
  });

  // Emit detailed metrics to user's Socket.IO room
  const room = `user-${userId}`;
  console.log(`[METRICS] 📤 Emitting to room: ${room}`);

  io.to(room).emit('metrics-update', {
    clusterId,
    resourceType,
    metricName,
    metricData,
    timestamp,
  });

  console.log(`[METRICS] ✅ Emitted metrics-update event for ${resourceType} - ${metricName} (${metricData.length} data points)`);
}

/**
 * Handle heartbeat messages
 */
function handleHeartbeatMessage(data) {
  const { userId, clusterId, status } = data;

  if (process.env.LOG_LEVEL === 'DEBUG') {
    console.log(`[HEARTBEAT] ${userId} | ${clusterId} - ${status}`);
  }

  // Update cluster status in database or cache
  // Can be used for connectivity checking during onboarding
  if (io) {
    io.to(`user-${userId}`).emit('cluster-heartbeat', {
      clusterId,
      status,
      timestamp: data.timestamp,
    });
  }
}

// ========================================
// Network Traffic Handlers
// ========================================

/**
 * Handle network traffic messages from network-monitor eBPF agent
 */
// Noisy internal paths to skip (Loki, Prometheus scrapes, Kafka internals)
// Noise filters — all overridable via env. Set NETWORK_CAPTURE_ALL=true to show
// EVERY captured call (including kube-system/DNS/monitoring) on the workload map.
const NETWORK_CAPTURE_ALL = process.env.NETWORK_CAPTURE_ALL === 'true';
const _csv = (v, d) => (v !== undefined ? v : d).split(',').map(s => s.trim()).filter(Boolean);
const FILTERED_PATHS = _csv(process.env.NETWORK_FILTER_PATHS, '/loki/api/v1/push,/metrics,/api/v1/write,/api/v2/alerts');
const FILTERED_NAMESPACES = _csv(process.env.NETWORK_FILTER_NAMESPACES, 'monitoring,loki,kube-system');
const FILTERED_POD_PREFIXES = _csv(process.env.NETWORK_FILTER_POD_PREFIXES, 'loki-,prometheus-,alertmanager-,kafka-,grafana-');

let _netFilteredCount = 0;
let _netPassedCount = 0;
let _netLastLog = 0;

function handleNetworkTrafficMessage(data) {
  if (!io) {
    console.error('[NET] ❌ Socket.IO instance not set, cannot emit events');
    return;
  }

  const { userId, clusterId, ts, src, dst, http, bytes, protocol } = data;

  // Filter out noisy internal K8s traffic (unless NETWORK_CAPTURE_ALL=true)
  const isFiltered = !NETWORK_CAPTURE_ALL && (
    (http?.path && FILTERED_PATHS.some(p => http.path.startsWith(p))) ||
    (src?.namespace && FILTERED_NAMESPACES.includes(src.namespace)) ||
    (dst?.namespace && FILTERED_NAMESPACES.includes(dst.namespace)) ||
    (src?.pod && FILTERED_POD_PREFIXES.some(p => src.pod.startsWith(p))) ||
    (dst?.pod && FILTERED_POD_PREFIXES.some(p => dst.pod.startsWith(p)))
  );

  if (isFiltered) {
    _netFilteredCount++;
    // Log stats every 30 seconds
    if (Date.now() - _netLastLog > 30000) {
      console.log(`[NET] 📊 Stats: ${_netPassedCount} passed, ${_netFilteredCount} filtered (${((_netFilteredCount / (_netFilteredCount + _netPassedCount)) * 100).toFixed(0)}% noise)`);
      _netLastLog = Date.now();
    }
    return;
  }
  _netPassedCount++;

  console.log(`[NET] 📥 Handling event: userId=${userId}, clusterId=${clusterId}`);

  if (!userId || !clusterId) {
    console.warn(`[NET] ⚠️ Missing userId or clusterId in event`);
    return;
  }

  const bufferKey = `${userId}:${clusterId}`;

  // Check if capture is enabled (default: true)
  if (captureStates.has(bufferKey) && !captureStates.get(bufferKey)) {
    console.log(`[NET] ⏸️ Capture disabled for ${bufferKey}`);
    return;
  }

  // Use wall clock if BPF timestamp is bogus (epoch year < 2020)
  const tsDate = ts ? new Date(ts) : null;
  const useWallClock = !tsDate || tsDate.getFullYear() < 2020;
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: useWallClock ? new Date().toISOString() : ts,
    src,
    dst,
    http,
    bytes: bytes || 0,
    protocol: protocol || 'TCP'
  };

  // 1. Add to in-memory circular buffer
  if (!trafficBuffers.has(bufferKey)) {
    trafficBuffers.set(bufferKey, []);
  }
  const buffer = trafficBuffers.get(bufferKey);
  buffer.unshift(event);
  if (buffer.length > MAX_TRAFFIC_BUFFER) buffer.pop();

  // 2. Update service graph aggregation
  updateServiceGraph(userId, clusterId, src, dst, http, bytes);

  // 3. Save to MongoDB (non-blocking) - strip labels to avoid Cast errors
  const cleanSrc = src ? { ...src, labels: undefined } : src;
  const cleanDst = dst ? { ...dst, labels: undefined } : dst;
  NetworkTraffic.create({
    userId,
    clusterId,
    timestamp: useWallClock ? new Date() : new Date(ts),
    src: cleanSrc,
    dst: cleanDst,
    http,
    bytes: bytes || 0,
    protocol: protocol || 'TCP'
  }).catch(err => console.error('[NET] MongoDB save error:', err.message));

  // 4. Emit to Socket.IO for real-time update
  io.to(`user-${userId}`).emit('network-traffic', { clusterId, ...event });
  console.log(`[NET] 📡 Emitted network-traffic event to room user-${userId}, clusterId: ${clusterId}, eventId: ${event.id}`);

  // 5. Throttled service map emission
  emitServiceMapUpdate(userId, clusterId);

  if (process.env.LOG_LEVEL === 'DEBUG') {
    console.log(`[NET] ${userId} | ${http?.method || '?'} ${http?.status || '?'} ${http?.path || '?'} ${src?.pod || src?.ip} -> ${dst?.pod || dst?.ip}`);
  }
}

/**
 * Update in-memory service graph with a new traffic event
 */
function updateServiceGraph(userId, clusterId, src, dst, http, bytes) {
  // Skip edges we can't place on the map (e.g. SSL-uprobe events have no IP),
  // so they don't create a bogus "unknown" node. The event is still buffered,
  // persisted and emitted to the traffic list — only the graph edge is skipped.
  const srcIdent = src?.svc || src?.pod || src?.ip;
  const dstIdent = dst?.svc || dst?.pod || dst?.ip;
  if (!srcIdent || !dstIdent || srcIdent === 'unknown' || dstIdent === 'unknown') {
    return;
  }

  const graphKey = `${userId}:${clusterId}`;
  if (!serviceGraphs.has(graphKey)) {
    serviceGraphs.set(graphKey, { edges: new Map(), lastReset: Date.now() });
  }
  const graph = serviceGraphs.get(graphKey);

  // Reset if window exceeded
  if (Date.now() - graph.lastReset > SERVICE_GRAPH_WINDOW_MS) {
    graph.edges.clear();
    graph.lastReset = Date.now();
  }

  const srcName = src?.svc || src?.pod || src?.ip || 'unknown';
  const dstName = dst?.svc || dst?.pod || dst?.ip || 'unknown';
  const edgeKey = `${srcName}->${dstName}`;

  if (!graph.edges.has(edgeKey)) {
    graph.edges.set(edgeKey, {
      source: { name: srcName, ns: src?.ns, pod: src?.pod, ip: src?.ip },
      target: { name: dstName, ns: dst?.ns, pod: dst?.pod, ip: dst?.ip },
      requestCount: 0,
      errorCount: 0,
      totalLatency: 0,
      totalBytes: 0
    });
  }

  const edge = graph.edges.get(edgeKey);
  edge.requestCount++;
  if (http?.status >= 400) edge.errorCount++;
  if (http?.latency_ms) edge.totalLatency += http.latency_ms;
  edge.totalBytes += (bytes || 0);
}

/**
 * Throttled emission of service map updates via Socket.IO
 */
function emitServiceMapUpdate(userId, clusterId) {
  const key = `${userId}:${clusterId}`;
  const now = Date.now();
  const lastEmit = serviceMapThrottle.get(key) || 0;

  if (now - lastEmit < THROTTLE_INTERVAL) return;
  serviceMapThrottle.set(key, now);

  const mapData = getServiceMapData(userId, clusterId);
  io.to(`user-${userId}`).emit('service-map-update', { clusterId, ...mapData });
}

/**
 * Build service map data from in-memory aggregation
 */
function getServiceMapData(userId, clusterId) {
  const graphKey = `${userId}:${clusterId}`;
  const graph = serviceGraphs.get(graphKey);
  if (!graph) return { nodes: [], links: [] };

  const nodeSet = new Map();
  const links = [];

  const elapsedSeconds = Math.max(1, (Date.now() - graph.lastReset) / 1000);

  graph.edges.forEach((edge) => {
    if (!nodeSet.has(edge.source.name)) {
      nodeSet.set(edge.source.name, {
        id: edge.source.name,
        name: edge.source.pod || edge.source.name,
        namespace: edge.source.ns || 'unknown',
        ip: edge.source.ip
      });
    }
    if (!nodeSet.has(edge.target.name)) {
      nodeSet.set(edge.target.name, {
        id: edge.target.name,
        name: edge.target.pod || edge.target.name,
        namespace: edge.target.ns || 'unknown',
        ip: edge.target.ip
      });
    }

    const rps = edge.requestCount / elapsedSeconds;
    links.push({
      source: edge.source.name,
      target: edge.target.name,
      value: rps,
      label: `${rps.toFixed(2)} req/s`,
      requestCount: edge.requestCount,
      errorRate: edge.requestCount > 0 ? edge.errorCount / edge.requestCount : 0,
      avgLatency: edge.requestCount > 0 ? Math.round(edge.totalLatency / edge.requestCount) : 0,
      totalBytes: edge.totalBytes,
      bytesPerSec: Math.round(edge.totalBytes / elapsedSeconds)
    });
  });

  return { nodes: Array.from(nodeSet.values()), links };
}

/**
 * Get traffic buffer for a user/cluster
 */
function getTrafficBuffer(userId, clusterId) {
  return trafficBuffers.get(`${userId}:${clusterId}`) || [];
}

/**
 * Set capture state for a user/cluster
 */
function setCaptureState(userId, clusterId, enabled) {
  captureStates.set(`${userId}:${clusterId}`, enabled);
}

/**
 * Get capture state for a user/cluster
 */
function getCaptureState(userId, clusterId) {
  const state = captureStates.get(`${userId}:${clusterId}`);
  return state !== false; // default true
}

/**
 * Route message to appropriate handler based on eventType
 */
function routeMessage(topic, data) {
  try {
    const eventType = data.eventType;

    switch (eventType) {
      case 'log':
        handleLogMessage(data);
        break;

      case 'alert':
        handleAlertMessage(data);
        break;

      case 'k8s_event':
        handleK8sEventMessage(data);
        break;

      case 'resource_event':
        handleResourceMessage(data);
        break;

      case 'metrics':
        handleMetricsMessage(data);
        break;

      case 'heartbeat':
        handleHeartbeatMessage(data);
        break;

      default:
        console.log(`Unknown event type: ${eventType}`);
    }
  } catch (error) {
    console.error(`Error routing message from topic ${topic}:`, error);
  }
}

/**
 * Start Kafka consumer
 */
async function startKafkaConsumer() {
  try {
    console.log('📡 Connecting to Kafka...');
    await consumer.connect();
    console.log('✅ Kafka consumer connected');
    isConnected = true;

    // Auto-restart on crash (e.g. broker disconnect, session timeout)
    consumer.on(consumer.events.CRASH, async ({ payload: { error, restart } }) => {
      console.error('💥 Kafka consumer crashed:', error.message);
      isConnected = false;
      if (!restart) {
        console.log('🔄 Crash is non-retriable, restarting consumer in 10 seconds...');
        setTimeout(startKafkaConsumer, 10000);
      } else {
        console.log('🔄 KafkaJS will auto-restart the consumer...');
      }
    });

    consumer.on(consumer.events.DISCONNECT, () => {
      console.warn('⚠️ Kafka consumer disconnected');
      isConnected = false;
    });

    consumer.on(consumer.events.CONNECT, () => {
      console.log('✅ Kafka consumer reconnected');
      isConnected = true;
    });

    // Subscribe to all topics
    // fromBeginning: false to skip old compressed messages
    await consumer.subscribe({
      topics: TOPICS,
      fromBeginning: false,
    });

    console.log(`✅ Subscribed to topics: ${TOPICS.join(', ')}`);

    // Add error handlers to prevent crashes
    consumer.on('consumer.crash', (event) => {
      console.error('❌ Main consumer crashed:', event.payload.error);
      console.log('🔄 Consumer will auto-restart...');
    });

    consumer.on('consumer.disconnect', () => {
      console.log('⚠️ Main consumer disconnected');
    });

    consumer.on('consumer.network.request_timeout', (payload) => {
      console.warn('⚠️ Main consumer request timeout:', payload);
    });

    // Start consuming messages
    await consumer.run({
      autoCommitInterval: 5000,
      eachMessage: async ({ topic, partition, message }) => {
        try {
          // Safety check for null/corrupted messages
          if (!message.value || message.value.length === 0) {
            console.warn(`[${topic}] Skipping null/empty message at offset ${message.offset}`);
            return;
          }

          const data = JSON.parse(message.value.toString());

          // Debug: Log alerts topic messages
          if (topic === 'alerts') {
            console.log(`[DEBUG-ALERTS] Received alert: eventType=${data.eventType}, alertname=${data.alertname}, userId=${data.userId}`);
          }

          // Route based on topic name
          if (topic === 'alerts' && !data.eventType) {
            handleAlertMessage(data);
          } else if (topic === 'logs' && !data.eventType) {
            handleLogMessage(data);
          } else if (topic === 'k8s-events' && !data.eventType) {
            handleK8sEventMessage(data);
          } else if (topic === 'resources' && !data.eventType) {
            handleResourceMessage(data);
          } else if (topic === 'metrics' && !data.eventType) {
            handleMetricsMessage(data);
          } else if (topic === 'heartbeats' && !data.eventType) {
            handleHeartbeatMessage(data);
          } else if (topic === 'changes') {
            handleK8sChangeMessage(data);
          } else if (topic === 'network-events') {
            handleNetworkTrafficMessage(data);
          } else {
            routeMessage(topic, data);
          }

        } catch (error) {
          console.error(`Error processing message from ${topic}:`, error);
        }
      },
    });

    console.log('🎧 Kafka main consumer running (topics: ' + TOPICS.join(', ') + ')');

  } catch (error) {
    console.error('❌ Failed to start Kafka consumer:', error);
    isConnected = false;
    console.log('🔄 Retrying Kafka connection in 10 seconds...');
    setTimeout(startKafkaConsumer, 10000);
  }
}

/**
 * Start dedicated network-events consumer
 */
function startNetworkConsumer() {
  // Network events now handled by main consumer (added to TOPICS array)
  console.log('📡 Network events handled by main consumer (no separate consumer needed)');
  return;

  // Legacy worker code below (disabled)
  let netWorker = null;
  function _startNetworkConsumerLegacy() {
  const { fork } = require('child_process');
  const path = require('path');

  if (netWorker) {
    try { netWorker.kill(); } catch {}
  }

  const workerPath = path.join(__dirname, 'networkConsumerWorker.js');
  console.log('📡 Forking network consumer worker process...');

  netWorker = fork(workerPath, [], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });

  isNetConnected = true;

  // Receive network events from worker via IPC
  netWorker.on('message', (msg) => {
    if (msg.type === 'network-event') {
      handleNetworkTrafficMessage(msg.data);
    }
  });

  // Log worker stdout/stderr
  netWorker.stdout.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(line);
  });
  netWorker.stderr.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(line);
  });

  netWorker.on('exit', (code) => {
    console.error(`[NET] Worker exited with code ${code}, restarting in 3s...`);
    isNetConnected = false;
    netWorker = null;
    setTimeout(startNetworkConsumer, 3000);
  });

  console.log(`🎧 Network consumer worker started (PID: ${netWorker.pid})`);
  }
}

/**
 * Stop Kafka consumers gracefully
 */
async function stopKafkaConsumer() {
  if (isConnected) {
    try {
      await consumer.disconnect();
      console.log('✅ Kafka main consumer disconnected');
      isConnected = false;
    } catch (error) {
      console.error('Error disconnecting main consumer:', error);
    }
  }
  if (isNetConnected) {
    try {
      await netConsumer.disconnect();
      console.log('✅ Network consumer disconnected');
      isNetConnected = false;
    } catch (error) {
      console.error('Error disconnecting network consumer:', error);
    }
  }
}

/**
 * Get consumer status
 */
function getKafkaStatus() {
  return {
    isConnected,
    topics: TOPICS,
    groupId: process.env.KAFKA_CONSUMER_GROUP || 'devopscopilot-backend-group',
  };
}

/**
 * Get recent alerts for a user
 * @param {string} userId - User ID
 * @returns {Array} Recent alerts for the user
 */
function getRecentAlertsForUser(userId) {
  return recentAlerts.get(userId) || [];
}

/**
 * Get recent K8s changes for a user
 * @param {string} userId - User ID
 * @returns {Array} Recent changes for the user
 */
function getRecentChangesForUser(userId) {
  return recentChanges.get(userId) || [];
}

// ========================================
// L4 Flow Summaries & Workload Reports
// ========================================

/**
 * Get L4 flow summaries from in-memory traffic buffer.
 * Groups by unique (src pod, dst pod:port) pairs.
 */
function getFlowSummaries(userId, clusterId, options = {}) {
  const { ns, limit = 100 } = options;
  const buffer = trafficBuffers.get(`${userId}:${clusterId}`) || [];

  const flowMap = new Map();

  for (const event of buffer) {
    if (ns && event.src?.ns !== ns && event.dst?.ns !== ns) continue;

    const srcId = event.src?.pod || event.src?.ip || 'unknown';
    const dstId = event.dst?.pod || event.dst?.svc || event.dst?.ip || 'unknown';
    const dstPort = event.dst?.port || 0;
    const flowKey = `${srcId}->${dstId}:${dstPort}`;

    if (!flowMap.has(flowKey)) {
      flowMap.set(flowKey, {
        protocol: event.protocol || 'TCP',
        client: {
          pod: event.src?.pod,
          ns: event.src?.ns,
          ip: event.src?.ip,
          svc: event.src?.svc
        },
        server: {
          pod: event.dst?.pod,
          ns: event.dst?.ns,
          ip: event.dst?.ip,
          svc: event.dst?.svc,
          port: dstPort
        },
        totalBytes: 0,
        requestCount: 0,
        totalLatency: 0,
        errorCount: 0,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp
      });
    }

    const flow = flowMap.get(flowKey);
    flow.totalBytes += (event.bytes || 0);
    flow.requestCount++;
    if (event.http?.latency_ms) flow.totalLatency += event.http.latency_ms;
    if (event.http?.status >= 400) flow.errorCount++;
    flow.lastSeen = event.timestamp;
  }

  return Array.from(flowMap.values())
    .map(f => ({
      ...f,
      avgLatency: f.requestCount > 0 ? Math.round(f.totalLatency / f.requestCount) : 0,
      errorRate: f.requestCount > 0 ? f.errorCount / f.requestCount : 0
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes)
    .slice(0, limit);
}

/**
 * Extract workload name from pod name by stripping ReplicaSet/pod hash suffixes.
 * e.g. "nginx-deployment-5d4c7bf9b8-x2r4n" -> "nginx-deployment"
 */
function extractWorkloadName(podName) {
  if (!podName) return null;
  const match = podName.match(/^(.+?)-[a-z0-9]{8,10}-[a-z0-9]{5}$/);
  if (match) return match[1];
  const match2 = podName.match(/^(.+?)-[a-z0-9]{5}$/);
  if (match2) return match2[1];
  return podName;
}

/**
 * Generate workload report from in-memory traffic buffer.
 * Groups flows by namespace/workload, calculates total traffic and health.
 */
function getWorkloadReport(userId, clusterId, options = {}) {
  const { ns } = options;
  const buffer = trafficBuffers.get(`${userId}:${clusterId}`) || [];

  const workloadMap = new Map();

  for (const event of buffer) {
    for (const side of ['src', 'dst']) {
      const endpoint = event[side];
      if (!endpoint) continue;
      const endpointNs = endpoint.ns || 'unknown';
      if (ns && endpointNs !== ns) continue;

      const workloadName = endpoint.svc || extractWorkloadName(endpoint.pod) || endpoint.ip || 'unknown';
      const workloadKey = `${endpointNs}/${workloadName}`;

      if (!workloadMap.has(workloadKey)) {
        workloadMap.set(workloadKey, {
          name: workloadName,
          namespace: endpointNs,
          type: endpoint.svc ? 'service' : 'pod',
          pods: new Set(),
          totalBytesIn: 0,
          totalBytesOut: 0,
          requestCountIn: 0,
          requestCountOut: 0,
          errorCountIn: 0,
          errorCountOut: 0,
          totalLatency: 0,
          connections: new Set()
        });
      }

      const workload = workloadMap.get(workloadKey);
      if (endpoint.pod) workload.pods.add(endpoint.pod);

      if (side === 'dst') {
        workload.totalBytesIn += (event.bytes || 0);
        workload.requestCountIn++;
        if (event.http?.status >= 400) workload.errorCountIn++;
        if (event.http?.latency_ms) workload.totalLatency += event.http.latency_ms;
        const srcName = event.src?.svc || event.src?.pod || event.src?.ip;
        if (srcName) workload.connections.add(srcName);
      } else {
        workload.totalBytesOut += (event.bytes || 0);
        workload.requestCountOut++;
        if (event.http?.status >= 400) workload.errorCountOut++;
        const dstName = event.dst?.svc || event.dst?.pod || event.dst?.ip;
        if (dstName) workload.connections.add(dstName);
      }
    }
  }

  return Array.from(workloadMap.values()).map(w => {
    const totalRequests = w.requestCountIn + w.requestCountOut;
    const totalErrors = w.errorCountIn + w.errorCountOut;
    return {
      name: w.name,
      namespace: w.namespace,
      type: w.type,
      podCount: w.pods.size,
      traffic: {
        bytesIn: w.totalBytesIn,
        bytesOut: w.totalBytesOut,
        totalBytes: w.totalBytesIn + w.totalBytesOut,
        requestsIn: w.requestCountIn,
        requestsOut: w.requestCountOut
      },
      health: {
        errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
        avgLatency: w.requestCountIn > 0 ? Math.round(w.totalLatency / w.requestCountIn) : 0,
        status: totalErrors / Math.max(totalRequests, 1) > 0.1 ? 'degraded' :
                totalRequests === 0 ? 'idle' : 'healthy'
      },
      connectionCount: w.connections.size
    };
  }).sort((a, b) => b.traffic.totalBytes - a.traffic.totalBytes);
}

module.exports = {
  startKafkaConsumer,
  startNetworkConsumer,
  stopKafkaConsumer,
  getKafkaStatus,
  setSocketIO,
  getRecentAlertsForUser,
  getRecentChangesForUser,
  getTrafficBuffer,
  getServiceMapData,
  setCaptureState,
  getCaptureState,
  getFlowSummaries,
  getWorkloadReport,
  handleNetworkTrafficMessage,
};

require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Import routes
const authRoutes = require('./api/authRoutes');
const clusterRoutes = require('./api/clusterRoutes');
const onboardingRoutes = require('./api/onboardingRoutes');
const resourceRoutes = require('./api/resourceRoutes');
const integrationsRoutes = require('./api/integrationsRoutes');
const testAlertsRoutes = require('./api/testAlertsRoutes');
const alertRoutes = require('./api/alertRoutes');
const agentopsRoutes = require('./api/agentopsRoutes');
const agentopsProjectRoutes = require('./api/agentopsProjectRoutes');
const networkRoutes = require('./api/networkRoutes');
const mcpCatalogRoutes = require('./api/mcpCatalogRoutes');
const timelineRoutes = require('./api/timelineRoutes');
const agentRoutes = require('./api/agentRoutes');
const correlationRoutes = require('./api/correlationRoutes');
const managedAlertRoutes = require('./api/managedAlertRoutes');
const pipelineRoutes = require('./api/pipelineRoutes');
const vulnerabilityRoutes = require('./api/vulnerabilityRoutes');
const usersRoutes = require('./api/usersRoutes');
const dashboardRoutes = require('./api/dashboardRoutes');
const documentsRoutes = require('./api/documentsRoutes');
const vectorRoutes = require('./api/vectorRoutes');
const costRoutes = require('./api/costRoutes');
const complianceRoutes = require('./api/complianceRoutes');
const fleetRoutes = require('./api/fleetRoutes');
const agentThreadsRoutes = require('./api/agentThreadsRoutes');
const remediationActionRoutes = require('./api/remediationActionRoutes');

// Models
const Alert = require('./models/Alert');

// Kafka consumer for all topics (including network-events)
const kafkaConsumer = require('./kafka/consumer');

// In-memory alert buffer: Map<userId, alert[]> - shared with alertRoutes
// Holds the most recent MAX_ALERTS_BUFFER alerts per user (no MongoDB needed)
const alertBuffer = new Map();
const MAX_ALERTS_BUFFER = 500;
let alertBufferReady = false; // True after Kafka initial replay window

const app = express();
const server = http.createServer(app);

// Build allowed origins list from env (supports comma-separated values)
const allowedOrigins = [
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
  'http://localhost:3000',
  'http://localhost:3005',
].filter(Boolean);

const corsOriginFn = (origin, callback) => {
  // allow requests with no origin (curl, mobile apps, server-to-server)
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  callback(new Error(`CORS: origin ${origin} not allowed`));
};

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: corsOriginFn,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middleware
app.use(cors({
  origin: corsOriginFn,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGO_DB_URI, {
  socketTimeoutMS: 45000,   // aggregation pipelines over K3s network can take ~10s
  serverSelectionTimeoutMS: 10000,
})
  .then(async () => {
    console.log('✅ MongoDB connected successfully');
    // Start background metrics collector for MCP servers
    const { startMetricsCollector } = require('./jobs/metricsCollector');
    startMetricsCollector();

    // Periodically record Trivy Operator scan results so we keep history.
    const { startVulnerabilityCollector } = require('./jobs/vulnerabilityCollector');
    startVulnerabilityCollector();

    // Pre-warm timeline-grouped cache for all active users so the first
    // browser request is instant instead of waiting 15s for MongoDB.
    try {
      const User = require('./models/User');
      const users = await User.find({}, { _id: 1 }).lean();
      const alertRoutes = require('./api/alertRoutes');
      users.forEach(u => alertRoutes.warmTimelineGroupedCache(u._id.toString()));
      console.log(`🔥 Pre-warming timeline cache for ${users.length} user(s)`);
    } catch (e) {
      console.warn('⚠️ Cache pre-warm skipped:', e.message);
    }

    // Root-cause analysis for alert details, generated ahead of the click.
    try {
      const { startEnrichmentWarmer } = require('./jobs/enrichmentWarmer');
      startEnrichmentWarmer();
    } catch (e) {
      console.warn('⚠️ Enrichment pre-generation skipped:', e.message);
    }

    // The fleet rollup reads every cluster (~10s cold), and the Trends page is
    // the first thing most users open — so build it now rather than making that
    // first visit pay for it.
    try {
      require('./api/fleetRoutes').warmFleetCache();
      console.log('🔥 Pre-warming fleet rollup');
    } catch (e) {
      console.warn('⚠️ Fleet pre-warm skipped:', e.message);
    }
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ========================================
// Socket.IO Authentication & Connection Handling
// ========================================

// Middleware to authenticate Socket.IO connections
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      console.log('❌ Socket connection rejected: No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user info to socket
    socket.userId = decoded.id;
    socket.userEmail = decoded.email;

    console.log(`✅ Socket authenticated: User ${decoded.id} (${decoded.email})`);
    next();

  } catch (error) {
    console.log('❌ Socket authentication failed:', error.message);
    return next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id} (User: ${socket.userId})`);

  // Join user-specific room for targeted broadcasts
  const userRoom = `user-${socket.userId}`;
  socket.join(userRoom);
  console.log(`👤 User ${socket.userId} joined room: ${userRoom}`);

  // Send connection success message
  socket.emit('connected', {
    message: 'Connected to DevOps Copilot real-time server',
    userId: socket.userId,
    socketId: socket.id,
  });

  // Send buffered recent alerts if Kafka replay is complete
  if (alertBufferReady) {
    const buffered = alertBuffer.get(socket.userId) || [];
    if (buffered.length > 0) {
      console.log(`📦 Sending ${buffered.length} buffered alerts to user ${socket.userId}`);
      buffered.forEach(alert => socket.emit('alert', alert));
    }
  }

  // ========================================
  // Log Streaming Events
  // ========================================

  /**
   * Client requests to start streaming logs for a pod
   */
  socket.on('start-log-stream', async (data) => {
    try {
      const { clusterId, namespace, pod, container, tailLines } = data;

      console.log(`📡 Start log stream request from user ${socket.userId}:`, {
        clusterId,
        namespace,
        pod,
        container,
      });

      // TODO: Verify user owns this cluster
      // const userOwnsCluster = await verifyClusterOwnership(socket.userId, clusterId);
      // if (!userOwnsCluster) {
      //   return socket.emit('log-stream-error', {
      //     error: 'Unauthorized: You do not own this cluster',
      //   });
      // }

      // TODO: Get agent URL for this cluster
      // For now, assume agent is running on localhost:8080 (for testing)
      const agentUrl = process.env.AGENT_URL || 'http://localhost:8080';

      // Call agent API to start streaming
      const response = await fetch(`${agentUrl}/api/logs/stream/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace,
          pod,
          container,
          tailLines: tailLines || 100,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        socket.emit('log-stream-started', {
          clusterId,
          namespace,
          pod,
          container,
          ...result,
        });
        console.log(`✅ Log stream started for ${namespace}/${pod}`);
      } else {
        throw new Error(result.error || 'Failed to start log stream');
      }

    } catch (error) {
      console.error('Error starting log stream:', error);
      socket.emit('log-stream-error', {
        error: error.message || 'Failed to start log stream',
      });
    }
  });

  /**
   * Client requests to stop streaming logs for a pod
   */
  socket.on('stop-log-stream', async (data) => {
    try {
      const { clusterId, namespace, pod, container } = data;

      console.log(`⏸️ Stop log stream request from user ${socket.userId}:`, {
        clusterId,
        namespace,
        pod,
      });

      const agentUrl = process.env.AGENT_URL || 'http://localhost:8080';

      const response = await fetch(`${agentUrl}/api/logs/stream/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ namespace, pod, container }),
      });

      const result = await response.json();

      if (response.ok) {
        socket.emit('log-stream-stopped', {
          clusterId,
          namespace,
          pod,
          ...result,
        });
        console.log(`✅ Log stream stopped for ${namespace}/${pod}`);
      } else {
        throw new Error(result.error || 'Failed to stop log stream');
      }

    } catch (error) {
      console.error('Error stopping log stream:', error);
      socket.emit('log-stream-error', {
        error: error.message || 'Failed to stop log stream',
      });
    }
  });

  // ========================================
  // Disconnect Handler
  // ========================================

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id} (User: ${socket.userId}) - Reason: ${reason}`);
  });

  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// ========================================
// HTTP Routes
// ========================================

// Share alert buffer with routes
app.locals.alertBuffer = alertBuffer;

app.use('/api/auth', authRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/clusters', resourceRoutes); // Resource routes under /api/clusters/:id/...
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/test-alerts', testAlertsRoutes.router); // Test alerts route
app.use('/api/alerts/managed', managedAlertRoutes); // Managed Prometheus alert rules (must be before /api/alerts)
app.use('/api/alerts', alertRoutes); // Alert management routes
app.use('/api/agentops/projects', agentopsProjectRoutes); // AgentOps project routes (must be before /api/agentops)
app.use('/api/agentops', agentopsRoutes); // AgentOps integration routes
app.use('/api/clusters', networkRoutes); // Network traffic monitoring routes
app.use('/api/mcp-catalog', mcpCatalogRoutes); // MCP Catalog routes
app.use('/api/timeline', timelineRoutes); // Timeline API routes (alerts + changes)
app.use('/api/agent', agentRoutes); // Deep Agent AI assistant routes
app.use('/api/correlation', correlationRoutes); // Alert Correlation Engine proxy
app.use('/api/pipelines', pipelineRoutes); // Data pipeline routes (SNOW → Milvus)
app.use('/api/vulnerabilities', vulnerabilityRoutes); // Trivy Operator vulnerability scan + remediation
app.use('/api/users', usersRoutes); // External user onboarding / management (Settings → Users)
app.use('/api/dashboards', dashboardRoutes); // Custom AI/NLP dashboards + widgets (Trends)
app.use('/api/documents', documentsRoutes); // Finder-style SOPs & Reports document browser
app.use('/api/vectors', vectorRoutes); // Milvus knowledge base (tickets + correlated incidents)
app.use('/api/cost', costRoutes); // OpenCost Kubernetes cost monitoring
app.use('/api/compliance', complianceRoutes); // cluster compliance baselines + remediation
app.use('/api/fleet', fleetRoutes); // fleet-wide rollup for the Trends dashboard
app.use('/api/agent-threads', agentThreadsRoutes); // Live Pi agent task threads
app.use('/api/remediation', remediationActionRoutes); // Cluster actions the agent applies (approval-gated)

// ========================================
// Direct Network Events Webhook (bypasses Kafka for real-time streaming)
// Network-monitor Go agent posts events here directly via HTTP
// ========================================
app.post('/api/internal/network-events', (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [req.body];
  let emitted = 0;

  for (const data of events) {
    if (!data.userId || !data.clusterId) continue;
    kafkaConsumer.handleNetworkTrafficMessage(data);
    emitted++;
  }

  res.status(200).json({ ok: true, emitted });
});

// Note: AlertManager webhook has been moved to a separate microservice
// See alert-webhook-service/ folder for the standalone service

// DIRECT METRICS PROXY - Fetch metrics from Prometheus directly
app.get('/api/metrics/pod', async (req, res) => {
  try {
    const { namespace, pod } = req.query;
    const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://192.168.1.249:9090';

    console.log(`📊 Fetching recent metrics for pod: ${namespace}/${pod} from Prometheus`);

    // Calculate time range: last 2 hours with 30s step for dense real-time data
    const now = Math.floor(Date.now() / 1000);
    const start = now - (2 * 60 * 60); // 2 hours ago
    const step = 30; // 30 second interval = 240 data points over 2 hours

    // Helper function to query range
    const queryRange = async (query) => {
      const url = `${PROMETHEUS_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${now}&step=${step}`;
      const response = await fetch(url);
      return response.json();
    };

    // Fetch all metrics in parallel using range queries
    const [
      cpuData,
      memData,
      netRxData,
      netTxData,
      diskReadData,
      diskWriteData,
      restartsData,
      throttleData
    ] = await Promise.all([
      queryRange(`rate(container_cpu_usage_seconds_total{namespace="${namespace}",pod="${pod}",container!=""}[5m])`),
      queryRange(`container_memory_working_set_bytes{namespace="${namespace}",pod="${pod}",container!=""}`),
      queryRange(`rate(container_network_receive_bytes_total{namespace="${namespace}",pod="${pod}"}[5m])`),
      queryRange(`rate(container_network_transmit_bytes_total{namespace="${namespace}",pod="${pod}"}[5m])`),
      queryRange(`rate(container_fs_reads_bytes_total{namespace="${namespace}",pod="${pod}"}[5m])`),
      queryRange(`rate(container_fs_writes_bytes_total{namespace="${namespace}",pod="${pod}"}[5m])`),
      queryRange(`kube_pod_container_status_restarts_total{namespace="${namespace}",pod="${pod}"}`),
      queryRange(`rate(container_cpu_cfs_throttled_seconds_total{namespace="${namespace}",pod="${pod}",container!=""}[5m])`)
    ]);

    // Helper function to transform range query results
    const transformRangeData = (data) => {
      if (!data.data?.result || data.data.result.length === 0) {
        return [];
      }

      // Aggregate all time series into a single array
      const allPoints = [];
      data.data.result.forEach(series => {
        series.values.forEach(([timestamp, value]) => {
          allPoints.push({
            value: parseFloat(value),
            timestamp: timestamp,
            labels: series.metric
          });
        });
      });

      // Sort by timestamp
      allPoints.sort((a, b) => a.timestamp - b.timestamp);
      return allPoints;
    };

    // Transform to expected format with historical data
    const result = {
      cpu_usage_cores: transformRangeData(cpuData),
      memory_usage_bytes: transformRangeData(memData),
      network_receive_bytes: transformRangeData(netRxData),
      network_transmit_bytes: transformRangeData(netTxData),
      disk_read_bytes: transformRangeData(diskReadData),
      disk_write_bytes: transformRangeData(diskWriteData),
      container_restarts: transformRangeData(restartsData),
      cpu_throttled: transformRangeData(throttleData)
    };

    console.log(`✅ 24-hour metrics fetched: CPU=${result.cpu_usage_cores.length} points, MEM=${result.memory_usage_bytes.length} points, DISK=${result.disk_read_bytes.length} points`);
    res.json(result);
  } catch (error) {
    console.error('❌ Failed to fetch metrics from Prometheus:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// NODE METRICS PROXY - Fetch 24-hour node metrics from Prometheus
app.get('/api/metrics/node', async (req, res) => {
  try {
    const { node } = req.query;
    const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://192.168.1.249:9090';

    console.log(`📊 Fetching recent metrics for node: ${node} from Prometheus`);

    // Calculate time range: last 2 hours with 30s step for dense real-time data
    const now = Math.floor(Date.now() / 1000);
    const start = now - (2 * 60 * 60); // 2 hours ago
    const step = 30; // 30 second interval = 240 data points over 2 hours

    // Helper function to query range
    const queryRange = async (query) => {
      const url = `${PROMETHEUS_URL}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${now}&step=${step}`;
      const response = await fetch(url);
      return response.json();
    };

    // Fetch all node metrics in parallel using range queries
    // Note: For single-node clusters, we query all node metrics without filtering
    // For multi-node, you would filter by instance or use label_replace with node_uname_info
    const [
      cpuData,
      memData,
      diskData,
      netRxData,
      netTxData,
      loadAvg1Data,
      loadAvg5Data,
      loadAvg15Data,
      diskUsageData,
      inodeUsageData
    ] = await Promise.all([
      // CPU usage (100 - idle)
      queryRange(`100 - (avg (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)`),
      // Memory usage percentage
      queryRange(`100 * (1 - ((node_memory_MemAvailable_bytes or node_memory_MemFree_bytes) / node_memory_MemTotal_bytes))`),
      // Disk I/O
      queryRange(`sum(rate(node_disk_io_time_seconds_total[5m])) * 100`),
      // Network receive
      queryRange(`sum(rate(node_network_receive_bytes_total{device!="lo"}[5m]))`),
      // Network transmit
      queryRange(`sum(rate(node_network_transmit_bytes_total{device!="lo"}[5m]))`),
      // Load average 1m
      queryRange(`node_load1`),
      // Load average 5m
      queryRange(`node_load5`),
      // Load average 15m
      queryRange(`node_load15`),
      // Disk usage percentage
      queryRange(`100 - ((node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"} * 100) / node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"})`),
      // Inode usage
      queryRange(`100 - ((node_filesystem_files_free{mountpoint="/",fstype!="rootfs"} * 100) / node_filesystem_files{mountpoint="/",fstype!="rootfs"})`)
    ]);

    // Helper function to transform range query results
    const transformRangeData = (data) => {
      if (!data.data?.result || data.data.result.length === 0) {
        return [];
      }

      // Aggregate all time series into a single array
      const allPoints = [];
      data.data.result.forEach(series => {
        series.values.forEach(([timestamp, value]) => {
          allPoints.push({
            value: parseFloat(value),
            timestamp: timestamp,
            labels: series.metric
          });
        });
      });

      // Sort by timestamp
      allPoints.sort((a, b) => a.timestamp - b.timestamp);
      return allPoints;
    };

    // Transform to expected format with historical data
    const result = {
      cpu_percent: transformRangeData(cpuData),
      memory_percent: transformRangeData(memData),
      disk_io: transformRangeData(diskData),
      network_receive_bytes: transformRangeData(netRxData),
      network_transmit_bytes: transformRangeData(netTxData),
      load_avg_1m: transformRangeData(loadAvg1Data),
      load_avg_5m: transformRangeData(loadAvg5Data),
      load_avg_15m: transformRangeData(loadAvg15Data),
      disk_usage_percent: transformRangeData(diskUsageData),
      inode_usage_percent: transformRangeData(inodeUsageData)
    };

    console.log(`✅ 24-hour node metrics fetched: CPU=${result.cpu_percent.length} points, MEM=${result.memory_percent.length} points, DISK=${result.disk_io.length} points`);
    res.json(result);
  } catch (error) {
    console.error('❌ Failed to fetch node metrics from Prometheus:', error);
    res.status(500).json({ error: 'Failed to fetch node metrics' });
  }
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Auth service is running',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      kafka: 'enabled',
      socketio: 'active',
    },
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DevOps Copilot Auth Service API',
    version: '1.0.0',
    features: {
      authentication: true,
      kafka: true,
      websocket: true,
      realTimeLogs: true,
    },
    endpoints: {
      auth: '/api/auth',
      clusters: '/api/clusters',
      onboarding: '/api/onboarding',
      health: '/health',
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ========================================
// Server Startup
// ========================================

const PORT = process.env.PORT || 5001;

// Global Kafka consumer references for cleanup
let alertConsumer = null;
let enrichmentConsumer = null;

// Kafka consumer cleanup function
async function stopKafkaConsumer() {
  if (alertConsumer) {
    try {
      await alertConsumer.disconnect();
      console.log('✅ Alert Kafka consumer disconnected');
    } catch (error) {
      console.error('Error disconnecting alert Kafka consumer:', error);
    }
  }
  if (enrichmentConsumer) {
    try {
      await enrichmentConsumer.disconnect();
      console.log('✅ Enrichment Kafka consumer disconnected');
    } catch (error) {
      console.error('Error disconnecting enrichment Kafka consumer:', error);
    }
  }
}

server.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 DevOps Copilot Backend Server Started');
  console.log('===========================================');
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`📊 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
  console.log('===========================================\n');

  // Initialize test alerts route with Socket.IO
  testAlertsRoutes.setSocketIO(io);
  alertRoutes.setSocketIO(io);

  // Start SIMPLE Kafka consumer for alerts (using working pattern from stream_alerts.js)
  if (process.env.ENABLE_KAFKA !== 'false') {
    const { Kafka } = require('kafkajs');
    const net = require('net');

    const kafka = new Kafka({
      clientId: 'devopscopilot-alert-consumer',
      brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(','),
      requestTimeout: 150000,   // 2.5 min — NodePort responses can be very slow
      connectionTimeout: 30000, // 30s
      // TCP keepalive to prevent NAT from dropping idle connections
      socketFactory: ({ host, port, onConnect }) => {
        const socket = new net.Socket();
        socket.setKeepAlive(true, 10000); // keepalive probe every 10s
        socket.setNoDelay(true);
        socket.connect({ port, host }, onConnect);
        return socket;
      },
      retry: {
        retries: 10,
        initialRetryTime: 300,
        maxRetryTime: 30000
      }
    });

    let lastAlertMessageAt = Date.now();
    let alertConsumerStopped = false; // true only when KafkaJS fully gives up
    let restartScheduled = false;

    const scheduleNewAlertConsumer = (delayMs) => {
      if (restartScheduled) return;
      restartScheduled = true;
      setTimeout(() => { restartScheduled = false; startAlertConsumer(); }, delayMs);
    };

    const startAlertConsumer = async () => {
      // Disconnect and discard any previous instance
      const prev = alertConsumer;
      alertConsumer = null;
      if (prev) { try { await prev.disconnect(); } catch (_) {} }

      const consumer = kafka.consumer({
        groupId: 'devopscopilot-alert-history-v2',
        sessionTimeout:    120000, // 2 min — NodePort heartbeat responses arrive slowly
        rebalanceTimeout:  180000, // 3 min — allow time for rebalance over NodePort
        heartbeatInterval:  10000, // 10s — less frequent to reduce NodePort traffic
        maxWaitTimeInMs:     5000, // broker returns every 5s → keeps TCP warm
        retry: { retries: 15, initialRetryTime: 300, maxRetryTime: 30000 }
      });
      alertConsumer = consumer;
      alertConsumerStopped = false;

      // Only intervene when KafkaJS has fully given up (non-retriable crash)
      consumer.on('consumer.crash', (event) => {
        if (alertConsumer !== consumer) return;
        const msg = event.payload.error?.message || String(event.payload.error);
        if (event.payload.restart) {
          console.log(`⚠️ Alert consumer crashed (KafkaJS retrying): ${msg}`);
          // Don't create new consumer — KafkaJS handles the retry internally
        } else {
          console.error(`❌ Alert consumer permanently crashed: ${msg}`);
          alertConsumer = null;
          alertConsumerStopped = true;
          scheduleNewAlertConsumer(20000);
        }
      });

      try {
        console.log('📡 Connecting alert consumer to Kafka...');
        await consumer.connect();
        console.log('✅ Alert consumer connected!');
        lastAlertMessageAt = Date.now();

        // fromBeginning: true + new group ID = replay ALL historical alerts on first run.
        // After first run, committed offsets mean subsequent restarts pick up from last offset.
        // Upsert on (userId, clusterId, alertname, namespace, receivedAt) prevents duplicates on replay.
        await consumer.subscribe({ topic: 'alerts', fromBeginning: true });
        console.log('✅ Alert consumer subscribed to alerts topic (replaying from beginning)\n');

        await consumer.run({
          eachMessage: async ({ topic, partition, message }) => {
            lastAlertMessageAt = Date.now();
            try {
              if (!message.value) return;

              const alertData = JSON.parse(message.value.toString());
              const { userId, clusterId, clusterName, alertname, severity, namespace, pod, node, labels, annotations,
                      startsAt, endsAt, status,
                      receivedAt: payloadReceivedAt } = alertData;

              const ns = namespace || labels?.namespace || 'default';
              const podName = pod || labels?.pod || 'N/A';

              // Use the payload's receivedAt (set by cluster-agent when it received the Alertmanager
              // webhook). This is STABLE across replays of the same Kafka message and correctly
              // reflects when each Alertmanager repeat_interval notification was actually received.
              // Fall back to Kafka message timestamp only if payload lacks receivedAt.
              const receivedAt = payloadReceivedAt || new Date(parseInt(message.timestamp)).toISOString();

              if (status === 'resolved') {
                // Update the most recent firing doc to resolved
                Alert.findOneAndUpdate(
                  { userId, clusterId, alertname, namespace: ns, status: 'firing' },
                  { $set: { status: 'resolved', endsAt: endsAt || new Date().toISOString() } },
                  { sort: { receivedAt: -1 } }
                ).catch(err => console.error('[ALERT] MongoDB resolve failed:', err.message));

                // Emit resolution to frontend
                io.to(`user-${userId}`).emit('alert-resolved', {
                  clusterId, alertname,
                  endsAt: endsAt || new Date().toISOString(),
                  namespace: ns,
                });

              } else {
                const alert = {
                  clusterId, clusterName: clusterName || null, alertname,
                  severity: severity || 'warning',
                  namespace: ns,
                  pod: podName,
                  node: node || labels?.node,
                  message: annotations?.summary || annotations?.description || annotations?.message || `${alertname} alert`,
                  labels: labels || {},
                  annotations: annotations || {},
                  startsAt: startsAt || new Date().toISOString(),
                  endsAt: null,
                  receivedAt,
                  status: 'firing',
                };

                // Upsert keyed on (userId, clusterId, alertname, namespace, receivedAt).
                // new: false → returns null if inserted (new), existing doc if already present.
                // Only emits to socket when actually inserting (not on replay of existing docs).
                Alert.findOneAndUpdate(
                  { userId, clusterId, alertname, namespace: ns, receivedAt },
                  { $setOnInsert: {
                    userId, clusterId, clusterName: clusterName || null, alertname,
                    severity: severity || 'warning',
                    namespace: ns,
                    pod: podName,
                    node: node || labels?.node,
                    message: alert.message,
                    description: annotations?.description || '',
                    summary: annotations?.summary || '',
                    labels: labels || {},
                    annotations: annotations || {},
                    status: 'firing',
                    startsAt: startsAt || new Date().toISOString(),
                    endsAt: null,
                    receivedAt,
                    createdAt: new Date(),
                  }},
                  { upsert: true, new: false }
                ).then(existing => {
                  if (!existing) {
                    // Truly new document — add to buffer and emit to socket
                    if (!alertBuffer.has(userId)) alertBuffer.set(userId, []);
                    const userBuf = alertBuffer.get(userId);
                    userBuf.unshift(alert);
                    if (userBuf.length > MAX_ALERTS_BUFFER) userBuf.length = MAX_ALERTS_BUFFER;

                    // Mark stale + proactively rebuild in background (stale-while-revalidate)
                    alertRoutes.invalidateTimelineGroupedCache(userId);
                    alertRoutes.warmTimelineGroupedCache(userId);

                    io.to(`user-${userId}`).emit('alert', alert);
                    console.log(`[ALERT] NEW ${userId} | ${severity || 'unknown'} - ${alertname} @ ${receivedAt}`);

                    // Fire-and-forget: enrich with Prometheus metrics + pod logs
                    const { enrichAlert } = require('./utils/alertEnricher');
                    Alert.findOne({ userId, clusterId, alertname, receivedAt }).lean()
                      .then(savedDoc => {
                        if (savedDoc) enrichAlert(savedDoc).catch(err => console.error('[ENRICH] Uncaught:', err.message));
                      })
                      .catch(err => console.error('[ENRICH] Find failed:', err.message));
                  }
                  // else: already in DB (replay of existing doc) — skip
                }).catch(err => console.error('[ALERT] MongoDB save failed:', err.message));
              }

            } catch (error) {
              console.error('Error processing alert message:', error);
            }
          },
        });

      } catch (error) {
        console.error('❌ Alert consumer connect/subscribe error:', error.message);
        if (alertConsumer === consumer) alertConsumer = null;
        scheduleNewAlertConsumer(15000);
      }
    };

    // Watchdog: if KafkaJS is stuck (consumer stopped & no external trigger), force restart
    setInterval(() => {
      if (alertConsumerStopped && !restartScheduled) {
        console.log('🔍 Alert consumer watchdog: consumer is stopped, restarting...');
        scheduleNewAlertConsumer(0);
      }
    }, 30 * 1000);

    startAlertConsumer();

    // After 10s, Kafka initial replay should be done — mark buffer ready
    // and push buffered alerts to any users already connected
    setTimeout(() => {
      alertBufferReady = true;
      let totalSent = 0;
      io.sockets.sockets.forEach(socket => {
        const buffered = alertBuffer.get(socket.userId) || [];
        if (buffered.length > 0) {
          buffered.forEach(a => socket.emit('alert', a));
          totalSent += buffered.length;
        }
      });
      if (totalSent > 0) {
        console.log(`📦 Initial replay complete: emitted ${totalSent} buffered alerts to connected users`);
      } else {
        console.log(`📦 Initial replay complete: buffer ready (no connected users or no alerts yet)`);
      }
    }, 10000);

    // ========================================
    // Alert Enrichment Consumer
    // ========================================
    enrichmentConsumer = kafka.consumer({
      groupId: 'devopscopilot-enrichment-consumer',
      sessionTimeout: 30000,
      retry: {
        retries: 8,
        initialRetryTime: 300
      }
    });

    const runEnrichmentConsumer = async () => {
      try {
        console.log('📡 Connecting to Kafka for alert enrichments...');
        await enrichmentConsumer.connect();

        // Add error handlers
        enrichmentConsumer.on('consumer.crash', (event) => {
          console.error('❌ Enrichment consumer crashed:', event.payload.error);
          console.log('🔄 Consumer will auto-restart...');
        });

        await enrichmentConsumer.subscribe({ topic: 'alert-enrichments', fromBeginning: false });
        console.log('✅ Subscribed to alert-enrichments topic');

        await enrichmentConsumer.run({
          eachMessage: async ({ topic, partition, message }) => {
            try {
              if (!message.value) {
                console.warn('[ENRICHMENT] Skipping null message');
                return;
              }

              const enrichment = JSON.parse(message.value.toString());
              const { alertId, userId, clusterId, alertname, data, enrichedAt, enrichmentDurationMs } = enrichment;

              console.log(`[ENRICHMENT] ${userId} | ${alertname} enriched in ${enrichmentDurationMs}ms`);

              // 1. Update in-memory alert buffer (merge, don't overwrite)
              const userBuf = alertBuffer.get(userId);
              if (userBuf) {
                const matchingAlert = userBuf.find(a =>
                  a.alertname === alertname && a.clusterId === clusterId
                );
                if (matchingAlert) {
                  matchingAlert.enrichment = { ...(matchingAlert.enrichment || {}), data, enrichedAt, enrichmentDurationMs, status: 'complete' };
                }
              }

              // 2. Persist to MongoDB — merge with existing enrichment (metrics/logs from alertEnricher)
              // First ensure enrichment is not null (dot-notation $set fails on null parent)
              await Alert.findOneAndUpdate(
                { userId, clusterId, alertname, enrichment: null },
                { $set: { enrichment: {} } },
                { sort: { receivedAt: -1 } }
              ).catch(() => {});
              Alert.findOneAndUpdate(
                { userId, clusterId, alertname },
                { $set: {
                  'enrichment.data': data,
                  'enrichment.enrichedAt': enrichedAt,
                  'enrichment.enrichmentDurationMs': enrichmentDurationMs,
                  'enrichment.status': 'complete',
                } },
                { sort: { receivedAt: -1 } }
              ).catch(err => console.error('[ENRICHMENT] MongoDB update failed:', err.message));

              // 3. Emit to frontend via Socket.IO
              io.to(`user-${userId}`).emit('alert-enrichment', {
                alertId,
                alertname,
                clusterId,
                enrichment: { data, enrichedAt, enrichmentDurationMs }
              });

            } catch (error) {
              console.error('Error processing enrichment:', error.message);
            }
          }
        });
      } catch (error) {
        console.error('❌ Enrichment consumer error:', error.message);
      }
    };

    runEnrichmentConsumer();

    // Start Kafka consumers
    kafkaConsumer.setSocketIO(io);
    kafkaConsumer.startKafkaConsumer();
    kafkaConsumer.startNetworkConsumer();

  } else {
    console.log('⚠️ Kafka consumer disabled (ENABLE_KAFKA=false)');
  }
});

// ========================================
// Graceful Shutdown
// ========================================

// ========================================
// Crash Protection - Prevent ERR_BUFFER_OUT_OF_BOUNDS from killing the process
// This happens when KafkaJS reads a corrupted TCP frame from the broker
// ========================================
let _bufErrCount = 0;
let _bufErrLastLog = 0;
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_BUFFER_OUT_OF_BOUNDS' || err.message?.includes('ERR_BUFFER_OUT_OF_BOUNDS')) {
    _bufErrCount++;
    // Rate-limit logging to once per 30s to avoid spam choking the event loop
    if (Date.now() - _bufErrLastLog > 30000) {
      console.error(`⚠️ ERR_BUFFER_OUT_OF_BOUNDS x${_bufErrCount} (suppressing further logs for 30s)`);
      _bufErrLastLog = Date.now();
      _bufErrCount = 0;
    }
    return;
  }
  console.error('💥 Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled rejection at:', promise, 'reason:', reason);
  // Don't exit - log and continue
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');

  // Close HTTP server
  server.close(() => {
    console.log('✅ HTTP server closed');
  });

  // Disconnect Kafka
  await stopKafkaConsumer();

  // Close MongoDB
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');

  server.close(() => {
    console.log('✅ HTTP server closed');
  });

  await stopKafkaConsumer();
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');

  process.exit(0);
});

module.exports = { app, server, io };

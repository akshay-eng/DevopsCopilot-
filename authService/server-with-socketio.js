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

// Import Kafka consumer
const { startKafkaConsumer, stopKafkaConsumer, getKafkaStatus, setSocketIO } = require('./kafka/consumer');

const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(process.env.MONGO_DB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
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

app.use('/api/auth', authRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Health check route (includes Kafka status)
app.get('/health', (req, res) => {
  const kafkaStatus = getKafkaStatus();

  res.status(200).json({
    success: true,
    message: 'Auth service is running',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      kafka: kafkaStatus.isConnected ? 'connected' : 'disconnected',
      socketio: 'active',
    },
    kafka: kafkaStatus,
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

  // Initialize Kafka consumer and pass Socket.IO instance
  setSocketIO(io);

  // Start Kafka consumer
  if (process.env.ENABLE_KAFKA !== 'false') {
    startKafkaConsumer().catch((error) => {
      console.error('Failed to start Kafka consumer:', error);
    });
  } else {
    console.log('⚠️ Kafka consumer disabled (ENABLE_KAFKA=false)');
  }
});

// ========================================
// Graceful Shutdown
// ========================================

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

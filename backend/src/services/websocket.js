/**
 * WebSocket Service for Real-time Updates
 */
const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let io = null;

/**
 * Initialize Socket.IO
 */
const initializeWebSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`, {
      userId: socket.userId,
    });

    // Join user-specific room
    socket.join(`user:${socket.userId}`);

    // Handle cluster subscription
    socket.on('subscribe:cluster', (clusterId) => {
      socket.join(`cluster:${clusterId}`);
      logger.debug(`Client subscribed to cluster: ${clusterId}`);
    });

    socket.on('unsubscribe:cluster', (clusterId) => {
      socket.leave(`cluster:${clusterId}`);
      logger.debug(`Client unsubscribed from cluster: ${clusterId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
};

/**
 * Emit event to specific user
 */
const emitToUser = (userId, event, data) => {
  if (!io) return;

  io.to(`user:${userId}`).emit(event, data);
  logger.debug(`Emitted ${event} to user ${userId}`);
};

/**
 * Emit event to specific cluster subscribers
 */
const emitToCluster = (clusterId, event, data) => {
  if (!io) return;

  io.to(`cluster:${clusterId}`).emit(event, data);
  logger.debug(`Emitted ${event} to cluster ${clusterId}`);
};

/**
 * Broadcast to all connected clients
 */
const broadcast = (event, data) => {
  if (!io) return;

  io.emit(event, data);
  logger.debug(`Broadcasted ${event} to all clients`);
};

module.exports = {
  initializeWebSocket,
  emitToUser,
  emitToCluster,
  broadcast,
};

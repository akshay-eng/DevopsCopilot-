import { io } from 'socket.io-client';

/**
 * Socket.IO Service for Real-time Communication
 *
 * Manages WebSocket connection to backend for real-time updates:
 * - Pod logs streaming
 * - Kubernetes events
 * - Alerts from Prometheus/Alertmanager
 * - Resource updates
 * - Metrics updates
 * - Cluster heartbeats
 */

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = new Map();
  }

  /**
   * Connect to Socket.IO server with JWT authentication
   */
  connect() {
    console.log('🚀 socketService.connect() called');

    const token = localStorage.getItem('token');
    console.log('🔑 Token exists:', !!token);

    if (!token) {
      console.error('❌ Cannot connect to Socket.IO: No authentication token');
      return;
    }

    const SOCKET_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5001';
    console.log('📡 Connecting to Socket.IO at:', SOCKET_URL);

    this.socket = io(SOCKET_URL, {
      auth: {
        token: token
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    });

    console.log('✅ Socket.IO instance created');

    // Test: Listen for ALL events to debug - register IMMEDIATELY
    this.socket.onAny((eventName, ...args) => {
      console.log('🎯 RECEIVED EVENT:', eventName, args);
    });
    console.log('✅ onAny listener registered');

    // Connection event handlers
    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('✅✅✅ Socket.IO connected:', this.socket.id);
    });

    this.socket.on('connected', (data) => {
      console.log('✅✅✅ Socket.IO authenticated:', data);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log('🔌 Socket.IO disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌❌❌ Socket.IO connection error:', error.message, error);
      this.isConnected = false;
    });

    this.socket.on('error', (error) => {
      console.error('❌❌❌ Socket.IO error:', error);
    });

    console.log('✅ Event handlers registered');

    return this.socket;
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
      console.log('Socket.IO disconnected');
    }
  }

  /**
   * Subscribe to an event
   */
  on(event, callback) {
    if (!this.socket) {
      console.warn('Socket not connected. Call connect() first.');
      return;
    }

    // Store listener for cleanup
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    this.socket.on(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(event, callback) {
    if (!this.socket) return;

    this.socket.off(event, callback);

    // Remove from listeners map
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
      if (callbacks.length === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event to server
   */
  emit(event, data) {
    if (!this.socket) {
      console.warn('Socket not connected. Call connect() first.');
      return;
    }

    this.socket.emit(event, data);
  }

  /**
   * Check if socket is connected
   */
  isSocketConnected() {
    return this.isConnected && this.socket?.connected;
  }

  // ========================================
  // Log Streaming Methods
  // ========================================

  /**
   * Start streaming logs for a pod
   */
  startLogStream({ clusterId, namespace, pod, container, tailLines = 100 }) {
    this.emit('start-log-stream', {
      clusterId,
      namespace,
      pod,
      container,
      tailLines
    });
  }

  /**
   * Stop streaming logs for a pod
   */
  stopLogStream({ clusterId, namespace, pod, container }) {
    this.emit('stop-log-stream', {
      clusterId,
      namespace,
      pod,
      container
    });
  }

  /**
   * Subscribe to pod logs
   */
  onPodLogs(callback) {
    this.on('pod-logs', callback);
  }

  /**
   * Unsubscribe from pod logs
   */
  offPodLogs(callback) {
    this.off('pod-logs', callback);
  }

  /**
   * Subscribe to log stream events
   */
  onLogStreamStarted(callback) {
    this.on('log-stream-started', callback);
  }

  onLogStreamStopped(callback) {
    this.on('log-stream-stopped', callback);
  }

  onLogStreamError(callback) {
    this.on('log-stream-error', callback);
  }

  // ========================================
  // Resource Update Methods
  // ========================================

  /**
   * Subscribe to resource updates
   */
  onResourceUpdate(callback) {
    this.on('resource-update', callback);
  }

  /**
   * Unsubscribe from resource updates
   */
  offResourceUpdate(callback) {
    this.off('resource-update', callback);
  }

  // ========================================
  // Metrics Methods
  // ========================================

  /**
   * Subscribe to metrics updates
   */
  onMetricsUpdate(callback) {
    this.on('metrics-update', callback);
  }

  /**
   * Unsubscribe from metrics updates
   */
  offMetricsUpdate(callback) {
    this.off('metrics-update', callback);
  }

  // ========================================
  // Alert Methods
  // ========================================

  /**
   * Subscribe to alerts
   */
  onAlert(callback) {
    this.on('alert', callback);
  }

  /**
   * Unsubscribe from alerts
   */
  offAlert(callback) {
    this.off('alert', callback);
  }

  // ========================================
  // Alert Enrichment Methods
  // ========================================

  /**
   * Subscribe to alert enrichment data
   */
  onAlertEnrichment(callback) {
    this.on('alert-enrichment', callback);
  }

  /**
   * Unsubscribe from alert enrichment data
   */
  offAlertEnrichment(callback) {
    this.off('alert-enrichment', callback);
  }

  // ========================================
  // Kubernetes Event Methods
  // ========================================

  /**
   * Subscribe to Kubernetes events
   */
  onK8sEvent(callback) {
    this.on('k8s-event', callback);
  }

  /**
   * Unsubscribe from Kubernetes events
   */
  offK8sEvent(callback) {
    this.off('k8s-event', callback);
  }

  // ========================================
  // K8s Change Methods
  // ========================================

  /**
   * Subscribe to K8s resource changes (deployments, configmaps, etc.)
   */
  onK8sChange(callback) {
    this.on('k8s-change', callback);
  }

  /**
   * Unsubscribe from K8s resource changes
   */
  offK8sChange(callback) {
    this.off('k8s-change', callback);
  }

  /**
   * Subscribe to alert-change correlations
   */
  onAlertCorrelation(callback) {
    this.on('alert-correlation', callback);
  }

  /**
   * Unsubscribe from alert-change correlations
   */
  offAlertCorrelation(callback) {
    this.off('alert-correlation', callback);
  }

  // ========================================
  // Network Traffic Methods
  // ========================================

  onNetworkTraffic(callback) {
    console.log('🎯 Subscribing to network-traffic events, socket exists:', !!this.socket);
    this.on('network-traffic', (data) => {
      console.log('🌐 RECEIVED network-traffic event:', data);
      callback(data);
    });
  }

  offNetworkTraffic(callback) {
    this.off('network-traffic', callback);
  }

  onServiceMapUpdate(callback) {
    this.on('service-map-update', callback);
  }

  offServiceMapUpdate(callback) {
    this.off('service-map-update', callback);
  }

  // ========================================
  // Cluster Heartbeat Methods
  // ========================================

  /**
   * Subscribe to cluster heartbeats
   */
  onClusterHeartbeat(callback) {
    this.on('cluster-heartbeat', callback);
  }

  /**
   * Unsubscribe from cluster heartbeats
   */
  offClusterHeartbeat(callback) {
    this.off('cluster-heartbeat', callback);
  }
}

// Create singleton instance
const socketService = new SocketService();

export default socketService;

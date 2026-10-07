/**
 * AlertManager Webhook Service
 *
 * Standalone microservice that runs in Kubernetes cluster to:
 * 1. Receive alerts from AlertManager via webhook
 * 2. Enrich alerts with user metadata from MongoDB
 * 3. Send enriched alerts to Kafka for multi-tenant handling
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Kafka } = require('kafkajs');
const cors = require('cors');
const AlertProcessor = require('./services/alertProcessor');
const AlertEnricher = require('./services/alertEnricher');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ===========================
// MongoDB Connection
// ===========================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/devopscopilot';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    console.log(`   URI: ${MONGO_URI}`);
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ===========================
// Kafka Configuration
// ===========================
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'alert-webhook-service';

const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000,
});

let isKafkaConnected = false;
let alertProcessor = null;
let alertEnricher = null;

// Connect to Kafka
async function connectKafka() {
  try {
    await producer.connect();
    isKafkaConnected = true;
    console.log('✅ Kafka producer connected');
    console.log(`   Brokers: ${KAFKA_BROKERS.join(', ')}`);
    console.log(`   Client ID: ${KAFKA_CLIENT_ID}`);
    console.log(`   Topic: ${process.env.KAFKA_ALERTS_TOPIC || 'alerts'}`);

    // Initialize alert processor
    alertProcessor = new AlertProcessor(producer);
    console.log('✅ Alert processor initialized');

    // Initialize alert enricher (runs K8s + Prometheus queries async)
    try {
      alertEnricher = new AlertEnricher(producer, process.env.PROMETHEUS_URL);
    } catch (err) {
      console.warn('⚠️  AlertEnricher initialization failed (enrichment disabled):', err.message);
    }
  } catch (error) {
    console.error('❌ Failed to connect to Kafka:', error);
    process.exit(1);
  }
}

// ===========================
// Health Check Endpoints
// ===========================

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'alert-webhook-service',
    timestamp: new Date().toISOString()
  });
});

// Detailed health check
app.get('/health/detailed', (req, res) => {
  const health = {
    service: 'alert-webhook-service',
    status: 'ok',
    timestamp: new Date().toISOString(),
    components: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      kafka: isKafkaConnected ? 'connected' : 'disconnected',
      alertProcessor: alertProcessor ? 'initialized' : 'not initialized',
      alertEnricher: alertEnricher ? 'initialized' : 'disabled'
    }
  };

  const allHealthy = Object.values(health.components).every(
    status => status === 'connected' || status === 'initialized' || status === 'disabled'
  );

  res.status(allHealthy ? 200 : 503).json(health);
});

// ===========================
// AlertManager Webhook Endpoint
// ===========================

/**
 * POST /webhook/alerts
 * Receives alerts from AlertManager
 *
 * AlertManager sends alerts in this format:
 * {
 *   "version": "4",
 *   "groupKey": "...",
 *   "status": "firing|resolved",
 *   "receiver": "webhook",
 *   "groupLabels": {...},
 *   "commonLabels": {...},
 *   "commonAnnotations": {...},
 *   "externalURL": "http://alertmanager:9093",
 *   "alerts": [
 *     {
 *       "status": "firing|resolved",
 *       "labels": {
 *         "alertname": "HighPodMemory",
 *         "severity": "warning|critical",
 *         "cluster_id": "...",
 *         ...
 *       },
 *       "annotations": {
 *         "summary": "...",
 *         "description": "...",
 *       },
 *       "startsAt": "2024-01-01T10:00:00Z",
 *       "endsAt": "0001-01-01T00:00:00Z",
 *       "generatorURL": "...",
 *       "fingerprint": "abc123"
 *     }
 *   ]
 * }
 */
app.post('/webhook/alerts', async (req, res) => {
  try {
    const alertData = req.body;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📢 ALERTMANAGER WEBHOOK RECEIVED');
    console.log(`📊 Alert count: ${alertData.alerts?.length || 0}`);
    console.log(`📍 Status: ${alertData.status}`);
    console.log(`🏷️  Group: ${alertData.groupKey}`);
    console.log('📝 Raw payload:', JSON.stringify(alertData, null, 2));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Check if services are ready
    if (!alertProcessor) {
      console.error('❌ Alert processor not initialized');
      return res.status(503).json({
        success: false,
        error: 'Service not ready - alert processor not initialized'
      });
    }

    if (!isKafkaConnected) {
      console.error('❌ Kafka not connected');
      return res.status(503).json({
        success: false,
        error: 'Service not ready - Kafka not connected'
      });
    }

    // Process each alert
    const results = [];
    for (const alert of alertData.alerts || []) {
      console.log(`🔔 Processing alert: ${alert.labels?.alertname} (${alert.status})`);
      try {
        await alertProcessor.processAlert(alert, alertData);
        results.push({ alert: alert.labels?.alertname, status: 'success' });
      } catch (error) {
        console.error(`❌ Error processing alert ${alert.labels?.alertname}:`, error);
        results.push({ alert: alert.labels?.alertname, status: 'failed', error: error.message });
      }
    }

    // Respond with 200 OK to AlertManager immediately
    res.status(200).json({
      success: true,
      received: alertData.alerts?.length || 0,
      processed: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    });

    // Fire-and-forget: run enrichment asynchronously after responding
    if (alertEnricher) {
      for (const alert of alertData.alerts || []) {
        if (alert.status !== 'firing') continue; // Only enrich firing alerts

        const clusterIdentifier = alertProcessor.extractClusterIdentifier(alert);
        alertProcessor.findClustersForAlert(clusterIdentifier, alert)
          .then(clusters => {
            for (const cluster of clusters) {
              const enrichedBase = alertProcessor.enrichAlert(alert, alertData, cluster);
              alertEnricher.enrichAlert(alert, enrichedBase)
                .catch(err => console.error(`❌ Enrichment failed for ${alert.labels?.alertname}:`, err.message));
            }
          })
          .catch(err => console.error(`❌ Cluster lookup for enrichment failed:`, err.message));
      }
    }
  } catch (error) {
    console.error('❌ Error processing AlertManager webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================
// Error Handling
// ===========================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// ===========================
// Graceful Shutdown
// ===========================

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received, starting graceful shutdown...`);

  // Stop accepting new requests
  server.close(() => {
    console.log('✅ HTTP server closed');
  });

  // Disconnect from Kafka
  if (isKafkaConnected) {
    try {
      await producer.disconnect();
      console.log('✅ Kafka disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting Kafka:', error);
    }
  }

  // Disconnect from MongoDB
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB disconnected');
  } catch (error) {
    console.error('❌ Error disconnecting MongoDB:', error);
  }

  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ===========================
// Start Server
// ===========================

async function startServer() {
  try {
    // Connect to Kafka first
    await connectKafka();

    // Start HTTP server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 AlertManager Webhook Service Started');
      console.log(`📡 Port: ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 Available endpoints:');
      console.log('   GET  /health - Basic health check');
      console.log('   GET  /health/detailed - Detailed health status');
      console.log('   POST /webhook/alerts - AlertManager webhook');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });

    // Export server for graceful shutdown
    global.server = server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

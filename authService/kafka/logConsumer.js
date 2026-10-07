/**
 * Kafka Consumer for Real-Time Log Streaming
 *
 * Consumes log messages from Kafka and forwards them to users via WebSocket
 */

const { Kafka } = require('kafkajs');

let io; // Socket.IO instance (will be set from server.js)

const kafka = new Kafka({
  clientId: 'devopscopilot-log-consumer',
  brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(','),
  // Add security config if needed
  // ssl: process.env.KAFKA_SECURITY_PROTOCOL === 'SASL_SSL',
  // sasl: process.env.KAFKA_SASL_MECHANISM ? {
  //   mechanism: process.env.KAFKA_SASL_MECHANISM,
  //   username: process.env.KAFKA_USERNAME,
  //   password: process.env.KAFKA_PASSWORD,
  // } : undefined,
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_LOG_CONSUMER_GROUP || 'log-streaming-group',
  sessionTimeout: 60000,
  heartbeatInterval: 3000,
});

let isConnected = false;

/**
 * Initialize Socket.IO instance
 */
function setSocketIO(socketIO) {
  io = socketIO;
  console.log('✅ Socket.IO instance set for log consumer');
}

/**
 * Start Kafka consumer for logs
 */
async function startLogConsumer() {
  try {
    await consumer.connect();
    console.log('✅ Kafka log consumer connected');
    isConnected = true;

    // Subscribe to logs topic
    await consumer.subscribe({
      topics: ['logs'],
      fromBeginning: false, // Only new messages
    });

    console.log('✅ Subscribed to "logs" topic');

    // Process messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const logData = JSON.parse(message.value.toString());

          // Extract user context
          const {
            userId,
            clusterId,
            clusterName,
            eventType,
            namespace,
            pod,
            container,
            logLine,
            timestamp,
          } = logData;

          // Only forward if we have Socket.IO and the message is a log
          if (io && eventType === 'log') {
            // Emit to user-specific room
            const room = `user-${userId}`;

            io.to(room).emit('pod-logs', {
              clusterId,
              clusterName,
              namespace,
              pod,
              container,
              logLine,
              timestamp,
            });

            // Debug logging (can be disabled in production)
            if (process.env.LOG_LEVEL === 'DEBUG') {
              const preview = logLine.length > 60 ? logLine.substring(0, 60) + '...' : logLine;
              console.log(`[LOG] ${userId} | ${namespace}/${pod}: ${preview}`);
            }
          }
        } catch (error) {
          console.error('Error processing log message:', error);
          console.error('Message:', message.value.toString());
        }
      },
    });

    console.log('🎧 Log consumer is running and processing messages...');

  } catch (error) {
    console.error('❌ Failed to start log consumer:', error);
    isConnected = false;

    // Retry after 5 seconds
    console.log('🔄 Retrying log consumer in 5 seconds...');
    setTimeout(startLogConsumer, 5000);
  }
}

/**
 * Stop Kafka consumer gracefully
 */
async function stopLogConsumer() {
  if (isConnected) {
    try {
      await consumer.disconnect();
      console.log('✅ Kafka log consumer disconnected');
      isConnected = false;
    } catch (error) {
      console.error('Error disconnecting log consumer:', error);
    }
  }
}

/**
 * Get consumer status
 */
function getConsumerStatus() {
  return {
    isConnected,
    groupId: process.env.KAFKA_LOG_CONSUMER_GROUP || 'log-streaming-group',
    topics: ['logs'],
  };
}

module.exports = {
  startLogConsumer,
  stopLogConsumer,
  getConsumerStatus,
  setSocketIO,
};

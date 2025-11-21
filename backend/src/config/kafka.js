/**
 * Kafka Configuration
 */
const { Kafka, logLevel } = require('kafkajs');
const logger = require('../utils/logger');

const kafkaConfig = {
  clientId: process.env.KAFKA_CLIENT_ID || 'devops-copilot-backend',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
};

// Add SASL authentication if configured
if (process.env.KAFKA_SECURITY_PROTOCOL === 'SASL_PLAINTEXT' ||
    process.env.KAFKA_SECURITY_PROTOCOL === 'SASL_SSL') {
  kafkaConfig.sasl = {
    mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
    username: process.env.KAFKA_USERNAME || '',
    password: process.env.KAFKA_PASSWORD || '',
  };
}

// Add SSL if configured
if (process.env.KAFKA_SECURITY_PROTOCOL === 'SSL' ||
    process.env.KAFKA_SECURITY_PROTOCOL === 'SASL_SSL') {
  kafkaConfig.ssl = true;
}

const kafka = new Kafka(kafkaConfig);

// Create admin client for topic management
const admin = kafka.admin();

const createTopicsIfNotExist = async () => {
  try {
    await admin.connect();

    const topics = [
      { topic: process.env.KAFKA_TOPIC_ALERTS || 'alerts', numPartitions: 3, replicationFactor: 1 },
      { topic: process.env.KAFKA_TOPIC_METRICS || 'metrics', numPartitions: 3, replicationFactor: 1 },
      { topic: process.env.KAFKA_TOPIC_EVENTS || 'k8s-events', numPartitions: 3, replicationFactor: 1 },
      { topic: process.env.KAFKA_TOPIC_LOGS || 'logs', numPartitions: 3, replicationFactor: 1 },
      { topic: process.env.KAFKA_TOPIC_RESOURCES || 'resources', numPartitions: 3, replicationFactor: 1 },
      { topic: process.env.KAFKA_TOPIC_HEARTBEATS || 'heartbeats', numPartitions: 1, replicationFactor: 1 },
    ];

    const existingTopics = await admin.listTopics();
    const topicsToCreate = topics.filter(t => !existingTopics.includes(t.topic));

    if (topicsToCreate.length > 0) {
      await admin.createTopics({
        topics: topicsToCreate,
        waitForLeaders: true,
      });
      logger.info(`Created Kafka topics: ${topicsToCreate.map(t => t.topic).join(', ')}`);
    } else {
      logger.info('All Kafka topics already exist');
    }

    await admin.disconnect();
  } catch (error) {
    logger.error('Failed to create Kafka topics:', error);
    // Don't exit - topics might already exist
  }
};

module.exports = {
  kafka,
  createTopicsIfNotExist,
};

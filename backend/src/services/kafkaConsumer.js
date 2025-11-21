/**
 * Kafka Consumer Service
 * Consumes messages from Kafka topics and processes them
 */
const { kafka } = require('../config/kafka');
const logger = require('../utils/logger');
const Alert = require('../models/Alert');
const Metric = require('../models/Metric');
const Event = require('../models/Event');
const Resource = require('../models/Resource');
const Cluster = require('../models/Cluster');
const { emitToUser } = require('./websocket');

class KafkaConsumerService {
  constructor() {
    this.consumer = null;
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Kafka consumer is already running');
      return;
    }

    try {
      this.consumer = kafka.consumer({
        groupId: process.env.KAFKA_GROUP_ID || 'devops-copilot-consumers',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });

      await this.consumer.connect();
      logger.info('Kafka consumer connected');

      // Subscribe to all topics
      await this.consumer.subscribe({
        topics: [
          process.env.KAFKA_TOPIC_ALERTS || 'alerts',
          process.env.KAFKA_TOPIC_METRICS || 'metrics',
          process.env.KAFKA_TOPIC_EVENTS || 'k8s-events',
          process.env.KAFKA_TOPIC_RESOURCES || 'resources',
          process.env.KAFKA_TOPIC_HEARTBEATS || 'heartbeats',
        ],
        fromBeginning: false,
      });

      logger.info('Subscribed to Kafka topics');

      // Start consuming messages
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const value = JSON.parse(message.value.toString());
            await this.processMessage(topic, value);
          } catch (error) {
            logger.error('Error processing Kafka message:', {
              topic,
              partition,
              offset: message.offset,
              error: error.message,
            });
          }
        },
      });

      this.isRunning = true;
      logger.info('Kafka consumer is running');
    } catch (error) {
      logger.error('Failed to start Kafka consumer:', error);
      throw error;
    }
  }

  async processMessage(topic, data) {
    const { type, agent_id, user_id, cluster_name } = data;

    logger.debug(`Processing message from topic ${topic}`, {
      type,
      agent_id,
      user_id,
    });

    try {
      // Find cluster
      const cluster = await Cluster.findOne({ agentId: agent_id });

      if (!cluster) {
        logger.warn(`Cluster not found for agent_id: ${agent_id}`);
        return;
      }

      // Route to appropriate handler based on topic
      switch (topic) {
        case process.env.KAFKA_TOPIC_ALERTS || 'alerts':
          await this.handleAlert(data, cluster);
          break;

        case process.env.KAFKA_TOPIC_METRICS || 'metrics':
          await this.handleMetrics(data, cluster);
          break;

        case process.env.KAFKA_TOPIC_EVENTS || 'k8s-events':
          await this.handleEvent(data, cluster);
          break;

        case process.env.KAFKA_TOPIC_RESOURCES || 'resources':
          await this.handleResource(data, cluster);
          break;

        case process.env.KAFKA_TOPIC_HEARTBEATS || 'heartbeats':
          await this.handleHeartbeat(data, cluster);
          break;

        default:
          logger.warn(`Unknown topic: ${topic}`);
      }
    } catch (error) {
      logger.error('Error in message handler:', error);
    }
  }

  async handleAlert(data, cluster) {
    const { data: alertData } = data;

    const alert = await Alert.upsertAlert({
      userId: cluster.userId,
      clusterId: cluster._id,
      agentId: cluster.agentId,
      clusterName: cluster.name,
      alertname: alertData.alertname,
      severity: alertData.severity,
      status: alertData.status,
      fingerprint: alertData.fingerprint,
      labels: alertData.labels,
      annotations: alertData.annotations,
      startsAt: alertData.starts_at || new Date(),
    });

    logger.info(`Alert processed: ${alertData.alertname}`, {
      clusterId: cluster._id,
      severity: alertData.severity,
    });

    // Emit to WebSocket for real-time updates
    emitToUser(cluster.userId.toString(), 'alert', {
      alert,
      clusterName: cluster.name,
    });
  }

  async handleMetrics(data, cluster) {
    const { data: metricsData } = data;

    const metric = await Metric.create({
      userId: cluster.userId,
      clusterId: cluster._id,
      agentId: cluster.agentId,
      clusterName: cluster.name,
      timestamp: metricsData.timestamp || new Date(),
      cluster: metricsData.cluster,
      pods: metricsData.pods || [],
      nodes: metricsData.nodes || [],
    });

    logger.debug(`Metrics saved for cluster: ${cluster.name}`);

    // Update cluster stats
    if (metricsData.cluster) {
      cluster.nodeCount = metricsData.cluster.nodes?.total || cluster.nodeCount;
      cluster.podCount = metricsData.cluster.pods?.total || cluster.podCount;
      cluster.namespaceCount = metricsData.cluster.namespaces?.total || cluster.namespaceCount;
      await cluster.save();
    }

    // Emit metrics update
    emitToUser(cluster.userId.toString(), 'metrics', {
      clusterId: cluster._id,
      clusterName: cluster.name,
      metrics: metricsData.cluster,
    });
  }

  async handleEvent(data, cluster) {
    const { data: eventData } = data;

    const event = await Event.create({
      userId: cluster.userId,
      clusterId: cluster._id,
      agentId: cluster.agentId,
      clusterName: cluster.name,
      type: eventData.type,
      reason: eventData.reason,
      message: eventData.message,
      count: eventData.count || 1,
      firstTimestamp: eventData.first_timestamp,
      lastTimestamp: eventData.last_timestamp || new Date(),
      involvedObject: eventData.involved_object,
      source: eventData.source,
    });

    logger.debug(`Event saved: ${eventData.reason}`, {
      clusterId: cluster._id,
      type: eventData.type,
    });

    // Emit events (especially warnings/errors) in real-time
    if (eventData.type === 'Warning' || eventData.type === 'Error') {
      emitToUser(cluster.userId.toString(), 'event', {
        event,
        clusterName: cluster.name,
      });
    }
  }

  async handleResource(data, cluster) {
    const { data: resourceData } = data;

    const resource = await Resource.upsertResource({
      userId: cluster.userId,
      clusterId: cluster._id,
      agentId: cluster.agentId,
      clusterName: cluster.name,
      kind: resourceData.kind,
      eventType: resourceData.event_type,
      name: resourceData.name,
      namespace: resourceData.namespace,
      uid: resourceData.uid,
      resourceVersion: resourceData.resource_version,
      creationTimestamp: resourceData.creation_timestamp,
      labels: resourceData.labels,
      annotations: resourceData.annotations,
      spec: resourceData.spec,
      status: resourceData.status,
    });

    logger.debug(`Resource updated: ${resourceData.kind}/${resourceData.name}`, {
      clusterId: cluster._id,
      eventType: resourceData.event_type,
    });

    // Emit resource changes for real-time UI updates
    emitToUser(cluster.userId.toString(), 'resource', {
      resource,
      clusterName: cluster.name,
      eventType: resourceData.event_type,
    });
  }

  async handleHeartbeat(data, cluster) {
    await cluster.updateHeartbeat();

    logger.debug(`Heartbeat received from cluster: ${cluster.name}`);

    // Update cluster stats if provided in heartbeat
    if (data.data && data.data.features) {
      Object.assign(cluster.features, data.data.features);
      await cluster.save();
    }
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn('Kafka consumer is not running');
      return;
    }

    try {
      await this.consumer.disconnect();
      this.isRunning = false;
      logger.info('Kafka consumer stopped');
    } catch (error) {
      logger.error('Error stopping Kafka consumer:', error);
      throw error;
    }
  }
}

// Singleton instance
const kafkaConsumerService = new KafkaConsumerService();

module.exports = kafkaConsumerService;

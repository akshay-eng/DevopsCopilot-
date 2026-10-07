/**
 * Alert Processor Service
 *
 * Processes alerts from AlertManager, enriches them with user metadata,
 * and sends them to Kafka for multi-tenant alert handling.
 */

const Cluster = require('../models/Cluster');

class AlertProcessor {
  constructor(kafkaProducer) {
    this.kafkaProducer = kafkaProducer;
  }

  /**
   * Process a single alert and send to Kafka with user context
   */
  async processAlert(alert, groupData) {
    try {
      // Extract cluster identifier from alert labels
      const clusterIdentifier = this.extractClusterIdentifier(alert);

      // Find all users who have access to this cluster
      const clusters = await this.findClustersForAlert(clusterIdentifier, alert);

      if (clusters.length === 0) {
        console.warn(`⚠️  No clusters found for alert ${alert.labels.alertname}`);
        console.warn(`   Cluster identifier: ${JSON.stringify(clusterIdentifier)}`);
        return;
      }

      console.log(`✅ Found ${clusters.length} cluster(s) for alert ${alert.labels.alertname}`);

      // Send alert to Kafka for each user who owns a cluster affected by this alert
      for (const cluster of clusters) {
        const enrichedAlert = this.enrichAlert(alert, groupData, cluster);
        await this.sendToKafka(enrichedAlert);
      }
    } catch (error) {
      console.error('❌ Error processing alert:', error);
      throw error;
    }
  }

  /**
   * Extract cluster identifier from alert labels
   */
  extractClusterIdentifier(alert) {
    // Strategy 1: Use cluster_id label if available
    if (alert.labels.cluster_id) {
      console.log(`   Using cluster_id label: ${alert.labels.cluster_id}`);
      return { type: 'cluster_id', value: alert.labels.cluster_id };
    }

    // Strategy 2: Use instance/node name
    if (alert.labels.instance) {
      console.log(`   Using instance label: ${alert.labels.instance}`);
      return { type: 'instance', value: alert.labels.instance };
    }

    // Strategy 3: Use namespace (for multi-cluster setups)
    if (alert.labels.cluster) {
      console.log(`   Using cluster label: ${alert.labels.cluster}`);
      return { type: 'cluster_name', value: alert.labels.cluster };
    }

    // Default: return null for cluster-wide alerts
    console.log(`   No cluster identifier found, using 'all' strategy`);
    return { type: 'all', value: null };
  }

  /**
   * Find clusters that match this alert
   */
  async findClustersForAlert(identifier, alert) {
    try {
      let query = {};

      switch (identifier.type) {
        case 'cluster_id':
          // Direct cluster ID match
          query = { _id: identifier.value };
          break;

        case 'instance':
          // Match by node instance (requires storing node IPs in cluster metadata)
          // For now, get all clusters and you can enhance this later
          query = {}; // Get all clusters
          break;

        case 'cluster_name':
          // Match by cluster name
          query = { name: identifier.value };
          break;

        case 'all':
        default:
          // Get all clusters (for cluster-wide alerts)
          query = {}; // Get all clusters regardless of status
          break;
      }

      console.log(`   Cluster query: ${JSON.stringify(query)}`);
      const clusters = await Cluster.find(query).select('_id name userId');
      console.log(`   Found ${clusters.length} cluster(s)`);

      return clusters;
    } catch (error) {
      console.error('❌ Error finding clusters:', error);
      return [];
    }
  }

  /**
   * Enrich alert with user and cluster metadata
   */
  enrichAlert(alert, groupData, cluster) {
    return {
      // User context for routing
      userId: cluster.userId.toString(),
      clusterId: cluster._id.toString(),
      clusterName: cluster.name,

      // Alert metadata
      alertId: alert.fingerprint,
      status: alert.status, // 'firing' or 'resolved'
      severity: alert.labels.severity || 'info',
      alertname: alert.labels.alertname,

      // Alert details
      labels: alert.labels,
      annotations: alert.annotations,

      // Timing
      startsAt: alert.startsAt,
      endsAt: alert.endsAt,

      // Links
      generatorURL: alert.generatorURL,
      externalURL: groupData.externalURL,

      // Group context
      groupKey: groupData.groupKey,
      groupLabels: groupData.groupLabels,

      // Timestamp
      receivedAt: new Date().toISOString(),

      // Alert source
      source: 'alertmanager'
    };
  }

  /**
   * Send enriched alert to Kafka
   */
  async sendToKafka(alert) {
    try {
      if (!this.kafkaProducer) {
        console.error('❌ Kafka producer not available, skipping alert');
        return;
      }

      const topic = process.env.KAFKA_ALERTS_TOPIC || 'alerts';

      console.log(`📤 Sending to Kafka topic '${topic}':`);
      console.log(`   Alert: ${alert.alertname}`);
      console.log(`   Status: ${alert.status}`);
      console.log(`   User: ${alert.userId}`);
      console.log(`   Cluster: ${alert.clusterName}`);

      await this.kafkaProducer.send({
        topic,
        messages: [
          {
            key: alert.userId, // Partition by userId for ordered delivery
            value: JSON.stringify(alert),
            headers: {
              'user-id': alert.userId,
              'cluster-id': alert.clusterId,
              'alert-status': alert.status,
              'alert-severity': alert.severity
            }
          }
        ]
      });

      console.log(`✅ Alert sent to Kafka: ${alert.alertname} (${alert.status}) for user ${alert.userId}`);
    } catch (error) {
      console.error('❌ Failed to send alert to Kafka:', error);
      console.error('❌ Error details:', error.message);
      throw error;
    }
  }
}

module.exports = AlertProcessor;

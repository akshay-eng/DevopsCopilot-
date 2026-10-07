


const express = require('express');
const { Kafka } = require('kafkajs');

const app = express();
app.use(express.json());

// Kafka Configuration
const kafka = new Kafka({
  clientId: 'grafana-webhook-producer',
  brokers: ['172.17.204.8:9092'], // Update with your Kafka broker addresses
});

const producer = kafka.producer();

// Kafka topic for Grafana alerts
const GRAFANA_ALERTS_TOPIC = 'grafana-alerts';

// Initialize Kafka producer
const initKafka = async () => {
  await producer.connect();
  console.log('Kafka producer connected');
};

// Webhook endpoint to receive Grafana alerts
app.post('/webhook/grafana', async (req, res) => {
  try {
    const alertData = req.body;
    
    console.log('Received Grafana alert:', JSON.stringify(alertData, null, 2));

    // Extract key information from the alert
    const messages = alertData.alerts?.map(alert => ({
      key: alert.fingerprint || alert.labels?.alertname,
      value: JSON.stringify({
        alertname: alert.labels?.alertname,
        status: alert.status,
        startsAt: alert.startsAt,
        endsAt: alert.endsAt,
        labels: alert.labels,
        annotations: alert.annotations,
        generatorURL: alert.generatorURL,
        fingerprint: alert.fingerprint,
        timestamp: new Date().toISOString()
      }),
      headers: {
        'source': 'grafana',
        'alert_status': alert.status
      }
    })) || [];

    // Send to Kafka
    if (messages.length > 0) {
      await producer.send({
        topic: GRAFANA_ALERTS_TOPIC,
        messages: messages
      });

      console.log(`Sent ${messages.length} alerts to Kafka topic: ${GRAFANA_ALERTS_TOPIC}`);
    }

    res.status(200).json({ 
      success: true, 
      message: 'Alert received and sent to Kafka',
      alertCount: messages.length 
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down...');
  await producer.disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await initKafka();
  console.log(`Grafana webhook receiver listening on port ${PORT}`);
  console.log(`Webhook endpoint: http://172.17.204.2:${PORT}/webhook/grafana`);
});
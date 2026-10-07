/**
 * Send a test alert directly to Kafka to verify the flow
 */

require('dotenv').config({ path: './authService/.env' });
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'test-alert-sender',
  brokers: process.env.KAFKA_BOOTSTRAP_SERVERS.split(','),
});

const producer = kafka.producer();

async function sendTestAlert() {
  try {
    await producer.connect();
    console.log('✅ Connected to Kafka');

    const testAlert = {
      userId: '69518aec39dcb1f682e1c984',
      clusterId: '69518b2339dcb1f682e1c991',
      clusterName: 'k3sprod',
      alertname: 'TestAlertFromScript',
      severity: 'critical',
      namespace: 'default',
      pod: 'test-pod-123',
      labels: {
        alertname: 'TestAlertFromScript',
        severity: 'critical',
        namespace: 'default'
      },
      annotations: {
        summary: 'This is a test alert sent manually to verify Kafka→Backend→Frontend flow',
        description: 'If you see this in the Timeline, the complete flow is working!'
      },
      startsAt: new Date().toISOString(),
      status: 'firing',
      source: 'manual-test-script'
    };

    await producer.send({
      topic: 'alerts',
      messages: [
        { value: JSON.stringify(testAlert) }
      ],
    });

    console.log('✅ Test alert sent to Kafka!');
    console.log('   Alert name:', testAlert.alertname);
    console.log('   Severity:', testAlert.severity);
    console.log('   Message:', testAlert.annotations.summary);
    console.log('');
    console.log('👀 Check:');
    console.log('   1. Backend logs should show: [ALERT] 69518aec39dcb1f682e1c984 | critical - TestAlertFromScript');
    console.log('   2. Browser console should show: 🚨 RECEIVED ALERT FROM SOCKET.IO');
    console.log('   3. Timeline UI should display the new alert');

    await producer.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error sending test alert:', error);
    process.exit(1);
  }
}

sendTestAlert();

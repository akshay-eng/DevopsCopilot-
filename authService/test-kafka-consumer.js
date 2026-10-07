/**
 * Test Kafka Consumer - Verify alerts are flowing from Kafka
 */

require('dotenv').config();
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'test-consumer',
  brokers: (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(','),
  connectionTimeout: 60000,
  requestTimeout: 60000,
});

const consumer = kafka.consumer({
  groupId: 'test-consumer-group-' + Date.now(), // Unique group to read all messages
  sessionTimeout: 60000,
  heartbeatInterval: 3000,
});

async function testKafkaConsumer() {
  try {
    console.log('🔌 Connecting to Kafka...');
    console.log('📡 Brokers:', process.env.KAFKA_BOOTSTRAP_SERVERS);

    await consumer.connect();
    console.log('✅ Connected to Kafka successfully!\n');

    // Subscribe to alerts topic
    await consumer.subscribe({ topic: 'alerts', fromBeginning: false });
    console.log('✅ Subscribed to "alerts" topic\n');
    console.log('🎧 Listening for alerts... (Press Ctrl+C to stop)\n');
    console.log('='.repeat(80));

    let alertCount = 0;

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const data = JSON.parse(message.value.toString());
          alertCount++;

          console.log(`\n📨 Alert #${alertCount} received:`);
          console.log('  Topic:', topic);
          console.log('  Partition:', partition);
          console.log('  Offset:', message.offset);
          console.log('  Timestamp:', new Date(parseInt(message.timestamp)).toISOString());
          console.log('\n  Alert Data:');
          console.log('    userId:', data.userId);
          console.log('    clusterId:', data.clusterId);
          console.log('    clusterName:', data.clusterName);
          console.log('    alertname:', data.alertname);
          console.log('    severity:', data.severity);
          console.log('    namespace:', data.namespace);
          console.log('    pod:', data.pod);
          console.log('    message:', data.message);
          console.log('    status:', data.status);
          console.log('    startsAt:', data.startsAt);
          console.log('='.repeat(80));

        } catch (error) {
          console.error('❌ Error parsing message:', error);
          console.error('Raw message:', message.value.toString());
        }
      },
    });

  } catch (error) {
    console.error('❌ Kafka consumer error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down...');
  await consumer.disconnect();
  console.log('✅ Disconnected from Kafka');
  process.exit(0);
});

testKafkaConsumer();

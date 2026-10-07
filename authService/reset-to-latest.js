const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'admin-reset',
  brokers: ['192.168.1.5:30092', '192.168.1.5:30093', '192.168.1.5:30094'],
});

const admin = kafka.admin();

async function resetToLatest() {
  try {
    await admin.connect();
    console.log('✅ Connected to Kafka admin');

    // Reset offset to latest for the network consumer group
    await admin.resetOffsets({
      groupId: 'devopscopilot-network-v1',
      topic: 'network-events',
      earliest: false, // Use latest offset, not earliest
    });

    console.log('✅ Reset devopscopilot-network-v1 consumer group to LATEST offset');
    console.log('✅ Consumer will now only process NEW messages');

    await admin.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetToLatest();

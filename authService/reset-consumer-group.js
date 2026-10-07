const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'admin-client',
  brokers: ['192.168.1.5:30092', '192.168.1.5:30093', '192.168.1.5:30094'],
});

const admin = kafka.admin();

async function resetConsumerGroup() {
  try {
    console.log('Connecting to Kafka admin...');
    await admin.connect();
    console.log('✅ Connected');

    const groupId = 'devopscopilot-network-v1';

    // Check if group exists
    console.log(`\nChecking consumer group: ${groupId}`);
    const groups = await admin.listGroups();
    console.log(`Found ${groups.groups.length} consumer groups`);

    const targetGroup = groups.groups.find(g => g.groupId === groupId);
    if (targetGroup) {
      console.log(`✅ Group found: ${groupId}`);
      console.log(`   State: ${targetGroup.state || 'unknown'}`);
      console.log(`   Protocol Type: ${targetGroup.protocolType || 'unknown'}`);
    } else {
      console.log(`❌ Group not found: ${groupId}`);
    }

    // Delete the consumer group
    console.log(`\nDeleting consumer group: ${groupId}...`);
    try {
      await admin.deleteGroups([groupId]);
      console.log(`✅ Consumer group deleted successfully`);
    } catch (err) {
      console.log(`⚠️  Delete result: ${err.message}`);
    }

    console.log('\n✅ Done - restart authService to create fresh consumer group');

    await admin.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetConsumerGroup();

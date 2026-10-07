const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'test-consumer',
  brokers: ['192.168.1.5:30092', '192.168.1.5:30093', '192.168.1.5:30094'],
});

const consumer = kafka.consumer({ groupId: 'test-group-' + Date.now() });

async function test() {
  try {
    console.log('Connecting to Kafka...');
    await consumer.connect();
    console.log('✅ Connected');

    console.log('Subscribing to network-events...');
    await consumer.subscribe({ topic: 'network-events', fromBeginning: false });
    console.log('✅ Subscribed');

    let count = 0;
    console.log('Waiting for messages (will timeout in 30 seconds)...');

    const timeout = setTimeout(() => {
      console.log(`❌ No messages received after 30 seconds (received ${count} total)`);
      process.exit(0);
    }, 30000);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        count++;
        console.log(`\n✅ Message #${count} received!`);
        console.log(`  Topic: ${topic}`);
        console.log(`  Partition: ${partition}`);
        console.log(`  Offset: ${message.offset}`);
        console.log(`  Value: ${message.value ? message.value.toString().substring(0, 200) : 'null'}`);

        if (count >= 5) {
          clearTimeout(timeout);
          console.log('\n✅ Test complete - messages are flowing!');
          process.exit(0);
        }
      },
    });

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

test();

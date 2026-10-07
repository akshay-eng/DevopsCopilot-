const { Kafka, logLevel } = require('kafkajs');

// 1. Configuration based on your kubectl services
const kafka = new Kafka({
  clientId: 'alert-monitor-cli',
  // Brokers taken from your External-IPs and ports:
  brokers: [
    '192.168.1.246:9092', // Broker 1
    '192.168.1.245:9093', // Broker 2
    '192.168.1.240:9094', // Broker 3
  ],
  logLevel: logLevel.ERROR, // Reduce noise, only show errors
});

const topic = 'alerts';
const consumer = kafka.consumer({ groupId: 'alert-dashboard-reader' });

const run = async () => {
  console.log("🚀 Connecting to Kafka Cluster...");
  await consumer.connect();
  
  console.log(`✅ Connected! Subscribing to topic: ${topic}`);
  // fromBeginning: false ensures we only see NEW alerts starting now
  await consumer.subscribe({ topic, fromBeginning: false });

  console.log("👀 Waiting for new alerts... (Ctrl+C to exit)\n");

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const timestamp = new Date(Number(message.timestamp)).toLocaleTimeString();
      let alertData;

      // Try to parse JSON, fall back to string if it fails
      try {
        alertData = JSON.parse(message.value.toString());
      } catch (e) {
        alertData = message.value.toString();
      }

      // Print a clean, formatted log
      console.log(`[${timestamp}] New Alert on Partition ${partition}:`);
      console.dir(alertData, { depth: null, colors: true });
      console.log("-".repeat(50));
    },
  });
};

// Handle errors gracefully
run().catch(console.error);

// Handle Ctrl+C to disconnect cleanly
const errorTypes = ['unhandledRejection', 'uncaughtException'];
const signalTraps = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

signalTraps.forEach(type => {
  process.once(type, async () => {
    try {
      await consumer.disconnect();
    } finally {
      process.kill(process.pid, type);
    }
  });
});
/**
 * Network Events Consumer Worker
 *
 * Runs in a separate child process. Filters noisy traffic HERE
 * so only relevant events go through IPC to the parent.
 */
const { Kafka } = require('kafkajs');

const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(',');
const groupId = `devopscopilot-network-worker-${Date.now()}`;

// ── Noise filters (same as parent but applied here to reduce IPC volume) ──
const FILTERED_PATHS = ['/loki/api/v1/push', '/metrics', '/api/v1/write', '/api/v2/alerts'];
const FILTERED_POD_PREFIXES = ['loki-', 'prometheus-', 'alertmanager-', 'grafana-'];
const FILTERED_NAMESPACES = ['monitoring', 'loki', 'kube-system'];

function isNoisy(data) {
  const { http, src, dst } = data;
  if (http?.path && FILTERED_PATHS.some(p => http.path.startsWith(p))) return true;
  if (src?.namespace && FILTERED_NAMESPACES.includes(src.namespace)) return true;
  if (dst?.namespace && FILTERED_NAMESPACES.includes(dst.namespace)) return true;
  if (src?.pod && FILTERED_POD_PREFIXES.some(p => src.pod.startsWith(p))) return true;
  if (dst?.pod && FILTERED_POD_PREFIXES.some(p => dst.pod.startsWith(p))) return true;
  return false;
}

console.log(`[NET-Worker] Starting (group: ${groupId})`);

const kafka = new Kafka({
  clientId: 'devopscopilot-net-worker',
  brokers,
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retry: { retries: 5, initialRetryTime: 300, maxRetryTime: 10000 },
});

const consumer = kafka.consumer({
  groupId,
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxWaitTimeInMs: 2000,
});

let totalCount = 0;
let passedCount = 0;
let filteredCount = 0;
let lastStatsLog = Date.now();

async function start() {
  await consumer.connect();
  console.log('[NET-Worker] Connected to Kafka');

  consumer.on(consumer.events.CRASH, ({ payload: { error, restart } }) => {
    console.error('[NET-Worker] Crash:', error.message);
    if (!restart) process.exit(1);
  });

  await consumer.subscribe({ topic: 'network-events', fromBeginning: false });
  console.log('[NET-Worker] Subscribed');

  await consumer.run({
    autoCommitInterval: 5000,
    eachBatchAutoResolve: true,
    eachBatch: async ({ batch, heartbeat }) => {
      for (const message of batch.messages) {
        try {
          if (!message.value || message.value.length === 0) continue;
          const data = JSON.parse(message.value.toString());
          totalCount++;

          // Filter noise HERE to avoid IPC saturation
          if (isNoisy(data)) {
            filteredCount++;
            continue;
          }

          passedCount++;

          // Only send non-noisy events to parent
          if (process.send) {
            process.send({ type: 'network-event', data });
          }

          if (passedCount <= 5 || passedCount % 100 === 0) {
            console.log(`[NET-Worker] #${passedCount} ${data.http?.method || '?'} ${data.http?.status || '?'} ${data.src?.pod || data.src?.ip || '?'}->${data.dst?.pod || data.dst?.ip || '?'}`);
          }
        } catch {
          // Skip corrupt messages
        }
      }

      // Stats every 30s
      if (Date.now() - lastStatsLog > 30000) {
        console.log(`[NET-Worker] Stats: ${passedCount} passed, ${filteredCount} filtered, ${totalCount} total`);
        lastStatsLog = Date.now();
      }

      await heartbeat();
    },
  });

  console.log('[NET-Worker] Consumer running');
}

start().catch(err => {
  console.error('[NET-Worker] Fatal:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await consumer.disconnect();
  process.exit(0);
});

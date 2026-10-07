require('dotenv').config();
const { testConnection, getSessions, getMetrics } = require('./utils/agentopsDb');

async function test() {
  console.log('Testing AgentOps Database Connection...\n');

  // Test connection
  const connected = await testConnection();

  if (!connected) {
    console.error('❌ Could not connect to AgentOps database');
    console.error('Make sure the AgentOps PostgreSQL container is running on port 5433');
    process.exit(1);
  }

  console.log('✅ Database connection successful!\n');

  // Test querying sessions
  try {
    console.log('Fetching sessions...');
    const sessions = await getSessions({ limit: 5 });
    console.log(`✅ Found ${sessions.length} sessions`);

    if (sessions.length > 0) {
      console.log('\nSample session:');
      console.log(JSON.stringify(sessions[0], null, 2));
    }
  } catch (error) {
    console.error('Error fetching sessions:', error.message);
  }

  // Test metrics
  try {
    console.log('\nFetching metrics...');
    const metrics = await getMetrics();
    console.log('✅ Metrics retrieved:');
    console.log(JSON.stringify(metrics, null, 2));
  } catch (error) {
    console.error('Error fetching metrics:', error.message);
  }

  process.exit(0);
}

test();

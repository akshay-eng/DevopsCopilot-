/**
 * Test Backend Alerts Endpoint
 *
 * This script tests the POST /api/test-alerts/send endpoint
 * to verify Socket.IO alert emission works correctly.
 *
 * Usage:
 * 1. Login to get your token
 * 2. Run: node test-backend-alerts.js YOUR_TOKEN_HERE
 */

const http = require('http');

// Get token from command line
const token = process.argv[2];

if (!token) {
  console.error('❌ Please provide authentication token as argument');
  console.error('Usage: node test-backend-alerts.js YOUR_TOKEN_HERE');
  process.exit(1);
}

const postData = JSON.stringify({
  count: 3
});

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/test-alerts/send',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('🧪 Testing backend test-alerts endpoint...');
console.log('📡 Endpoint: POST http://localhost:5001/api/test-alerts/send');
console.log('🔑 Token:', token.substring(0, 20) + '...');

const req = http.request(options, (res) => {
  console.log(`📊 Status Code: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\n📦 Response Body:');
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));

      if (json.success) {
        console.log('\n✅ SUCCESS! Backend test alerts endpoint is working');
        console.log('✅ Alerts were emitted via Socket.IO');
        console.log('✅ Check your frontend console to verify if alerts were received');
      } else {
        console.log('\n❌ FAILED:', json.error);
      }
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
});

req.write(postData);
req.end();

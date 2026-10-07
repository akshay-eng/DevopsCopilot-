const axios = require('axios');

async function testTracesAPI() {
  try {
    // You'll need to replace this with a valid token from localStorage
    // Get it from your browser console: localStorage.getItem('token')
    const token = process.argv[2];

    if (!token) {
      console.error('Usage: node test-traces-direct.js <your-jwt-token>');
      console.error('Get your token from browser console: localStorage.getItem("token")');
      process.exit(1);
    }

    const url = 'http://localhost:5001/api/agentops/traces';
    const params = {
      page: 0,
      limit: 20
    };

    console.log('Testing traces API...');
    console.log('URL:', url);
    console.log('Params:', params);
    console.log('');

    const response = await axios.get(url, {
      params,
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Success!');
    console.log('Status:', response.status);
    console.log('Total traces:', response.data.total);
    console.log('Traces returned:', response.data.traces?.length || 0);
    console.log('');
    console.log('First trace (if any):');
    console.log(JSON.stringify(response.data.traces?.[0], null, 2));
    console.log('');
    console.log('Full response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testTracesAPI();

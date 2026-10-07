const mongoose = require('mongoose');
const Alert = require('./models/Alert');

async function emitAlerts() {
  try {
    await mongoose.connect(process.env.MONGO_DB_URI || 'mongodb://adminuser:password123@192.168.1.5:32001/devopscopilot?authSource=admin');
    
    console.log('Fetching recent alerts...');
    const alerts = await Alert.find({ userId: '698afc0aaa3beccf28a05099' })
      .sort({ receivedAt: -1 })
      .limit(100)
      .lean();
    
    console.log(`Found ${alerts.length} alerts for user`);
    console.log('Sample alert:', alerts[0]?.alertname);
    
    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

emitAlerts();

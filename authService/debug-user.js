const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');

async function debugUser() {
  try {
    await mongoose.connect(process.env.MONGO_DB_URI);
    console.log('Connected to MongoDB');

    // Find the most recent user
    const user = await User.findOne().sort({ createdAt: -1 });
    
    if (!user) {
      console.log('No users found');
      return;
    }

    console.log('\n=== Most Recent User ===');
    console.log('Email:', user.email);
    console.log('Name:', user.name);
    console.log('Email Verified:', user.isEmailVerified);
    console.log('Has Verification Token:', !!user.emailVerificationToken);
    console.log('Token Expiry:', user.emailVerificationExpire);
    console.log('Token Expired:', user.emailVerificationExpire ? new Date(user.emailVerificationExpire) < new Date() : 'N/A');
    console.log('Created At:', user.createdAt);
    console.log('==================\n');

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugUser();

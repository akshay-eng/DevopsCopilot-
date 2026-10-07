const mongoose = require('mongoose');
const User = require('../models/User');
const Cluster = require('../models/Cluster');
require('dotenv').config();

async function migrateOnboardingClusters() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_DB_URI || 'mongodb://localhost:27017/devops-copilot');
    console.log('Connected to MongoDB');

    // Find all users who completed onboarding
    const users = await User.find({
      onboardingCompleted: true
    });

    console.log(`Found ${users.length} users with onboarding completed`);

    for (const user of users) {
      // Check if user has onboarding data with cluster info
      if (!user.onboardingData || !user.onboardingData.clusterName) {
        console.log(`User ${user.email} has no cluster data in onboarding`);
        continue;
      }

      // Check if cluster already exists
      const existingCluster = await Cluster.findOne({
        userId: user._id,
        name: user.onboardingData.clusterName
      });

      if (existingCluster) {
        console.log(`Cluster already exists for user ${user.email}`);
        continue;
      }

      // Create cluster from onboarding data
      const cluster = await Cluster.create({
        userId: user._id,
        name: user.onboardingData.clusterName,
        clusterType: user.onboardingData.clusterType || 'production',
        monitoringSetup: {
          hasPrometheus: user.onboardingData.hasPrometheus || false,
          hasGrafana: user.onboardingData.hasGrafana || false,
          hasLoki: false
        }
      });

      console.log(`✅ Created cluster "${cluster.name}" (${cluster.agentId}) for user ${user.email}`);
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrateOnboardingClusters();

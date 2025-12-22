const express = require('express');
const { body } = require('express-validator');
const User = require('../models/User');
const OnboardingResponse = require('../models/OnboardingResponse');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validator');
const { sendWelcomeEmail } = require('../utils/emailService');

const router = express.Router();

// Validation for onboarding completion
const onboardingValidation = [
  body('foundUsThrough')
    .notEmpty()
    .withMessage('Please tell us how you found us')
    .isIn(['google-search', 'social-media', 'friend-referral', 'blog-article', 'youtube', 'github', 'conference', 'other'])
    .withMessage('Invalid option'),
  body('clusterName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Cluster name must be at least 2 characters')
];

// @route   POST /api/onboarding/complete
// @desc    Complete onboarding process
// @access  Private
router.post('/complete', protect, onboardingValidation, validate, async (req, res) => {
  try {
    const {
      foundUsThrough,
      otherSource,
      feedback,
      clusterName,
      clusterType,
      hasPrometheus,
      hasGrafana
    } = req.body;

    const userId = req.user._id;

    // Update user onboarding status
    const user = await User.findById(userId);

    user.onboardingCompleted = true;
    user.onboardingData = {
      clusterName,
      clusterType,
      hasPrometheus,
      hasGrafana,
      foundUsThrough,
      completedAt: Date.now()
    };
    await user.save();

    // Save onboarding response
    await OnboardingResponse.findOneAndUpdate(
      { userId },
      {
        userId,
        foundUsThrough,
        otherSource: foundUsThrough === 'other' ? otherSource : undefined,
        feedback
      },
      { upsert: true, new: true }
    );

    // Send welcome email
    try {
      await sendWelcomeEmail(user, clusterName);
    } catch (emailError) {
      console.error('Welcome email failed:', emailError);
      // Continue even if email fails
    }

    res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        onboardingCompleted: user.onboardingCompleted,
        onboardingData: user.onboardingData
      }
    });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during onboarding completion'
    });
  }
});

// @route   GET /api/onboarding/status
// @desc    Get onboarding status for current user
// @access  Private
router.get('/status', protect, async (req, res) => {
  try {
    const user = req.user;

    res.status(200).json({
      success: true,
      onboardingCompleted: user.onboardingCompleted,
      onboardingData: user.onboardingData || null
    });
  } catch (error) {
    console.error('Get onboarding status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching onboarding status'
    });
  }
});

// @route   POST /api/onboarding/skip
// @desc    Skip onboarding (for returning users)
// @access  Private
router.post('/skip', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    user.onboardingCompleted = true;
    user.onboardingData = {
      completedAt: Date.now()
    };
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Onboarding skipped successfully'
    });
  } catch (error) {
    console.error('Skip onboarding error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while skipping onboarding'
    });
  }
});

// @route   POST /api/onboarding/save-progress
// @desc    Save onboarding progress (for any step)
// @access  Private
router.post('/save-progress', protect, async (req, res) => {
  try {
    const {
      clusterName,
      clusterType,
      hasPrometheus,
      hasGrafana,
      helmChartInstalled,
      connectionStatus,
      foundUsThrough
    } = req.body;

    const user = await User.findById(req.user._id);

    // Merge new data with existing onboarding data
    user.onboardingData = {
      ...user.onboardingData,
      ...(clusterName && { clusterName }),
      ...(clusterType && { clusterType }),
      ...(hasPrometheus !== undefined && { hasPrometheus }),
      ...(hasGrafana !== undefined && { hasGrafana }),
      ...(helmChartInstalled !== undefined && {
        helmChartInstalled,
        installationCompletedAt: helmChartInstalled ? new Date() : user.onboardingData?.installationCompletedAt
      }),
      ...(connectionStatus && {
        connectionStatus,
        connectedAt: connectionStatus === 'connected' ? new Date() : user.onboardingData?.connectedAt
      }),
      ...(foundUsThrough && { foundUsThrough })
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Onboarding progress saved',
      onboardingData: user.onboardingData
    });
  } catch (error) {
    console.error('Save onboarding progress error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while saving onboarding progress'
    });
  }
});

// @route   GET /api/onboarding/helm-chart
// @desc    Get Helm chart download link and installation instructions
// @access  Private
router.get('/helm-chart', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Generate unique cluster ID
    const clusterId = `${user._id}-${user.onboardingData?.clusterName || 'default'}`
      .replace(/\s+/g, '-')
      .toLowerCase();

    // Helm chart repository URL (update with your actual URL)
    const helmChartUrl = 'https://github.com/devopscopilot/helm-charts';

    const installationCommand = `# Add DevOps Copilot Helm repository
helm repo add devopscopilot https://charts.devopscopilot.io
helm repo update

# Install the agent
helm install devopscopilot-agent devopscopilot/devopscopilot-agent \\
  --set clusterId=${clusterId} \\
  --set apiKey=${user._id} \\
  --set apiEndpoint=http://localhost:5001 \\
  --namespace devopscopilot \\
  --create-namespace`;

    res.status(200).json({
      success: true,
      helmChartUrl,
      clusterId,
      installationCommand,
      instructions: [
        {
          step: 1,
          title: 'Add Helm Repository',
          command: 'helm repo add devopscopilot https://charts.devopscopilot.io',
          description: 'Add the DevOps Copilot Helm repository to your local Helm installation'
        },
        {
          step: 2,
          title: 'Update Repositories',
          command: 'helm repo update',
          description: 'Update your Helm repositories to fetch the latest charts'
        },
        {
          step: 3,
          title: 'Install Agent',
          command: installationCommand.split('\n').slice(4).join('\n'),
          description: 'Install the DevOps Copilot agent in your Kubernetes cluster'
        },
        {
          step: 4,
          title: 'Verify Installation',
          command: 'kubectl get pods -n devopscopilot',
          description: 'Check that the agent pod is running successfully'
        }
      ]
    });
  } catch (error) {
    console.error('Get helm chart error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while generating Helm chart information'
    });
  }
});

// @route   POST /api/onboarding/check-connectivity
// @desc    Check if cluster has connected
// @access  Private
router.post('/check-connectivity', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // TODO: In production, check if cluster agent has connected
    // by querying your metrics database or checking agent heartbeat
    // For now, simulate a delayed connection

    // Simulate: If user has marked installation as complete,
    // pretend connection succeeds after a short delay
    const isConnected = user.onboardingData?.helmChartInstalled || false;

    if (isConnected && user.onboardingData.connectionStatus !== 'connected') {
      // Auto-update connection status
      user.onboardingData.connectionStatus = 'connected';
      user.onboardingData.connectedAt = new Date();
      await user.save();
    }

    res.status(200).json({
      success: true,
      connected: isConnected,
      connectionStatus: user.onboardingData?.connectionStatus || 'pending',
      message: isConnected
        ? 'Cluster is connected and sending data!'
        : 'Waiting for cluster connection... Please ensure the Helm chart is installed correctly.'
    });
  } catch (error) {
    console.error('Check connectivity error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while checking connectivity'
    });
  }
});

module.exports = router;

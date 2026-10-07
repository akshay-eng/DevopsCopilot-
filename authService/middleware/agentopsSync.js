const axios = require('axios');

const AGENTOPS_API_URL = process.env.AGENTOPS_API_URL || 'http://localhost:8000';
const AGENTOPS_SERVICE_TOKEN = process.env.AGENTOPS_SERVICE_TOKEN || 'dev-service-token';

/**
 * Sync user to AgentOps when they register
 * @param {Object} user - User object from DevOps Copilot
 * @returns {Promise<Object|null>} - AgentOps user object or null
 */
async function syncUserToAgentOps(user) {
  try {
    console.log('[AgentOps Sync] Syncing user to AgentOps:', user.email);

    const response = await axios.post(`${AGENTOPS_API_URL}/api/v1/users/sync`, {
      user_id: user.id.toString(),
      email: user.email,
      name: user.name || user.email.split('@')[0],
      organization_id: user.organizationId || 'default-org',
      metadata: {
        source: 'devops-copilot',
        created_at: user.createdAt || new Date().toISOString(),
        role: user.role || 'user'
      }
    }, {
      headers: {
        'Authorization': `Bearer ${AGENTOPS_SERVICE_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Service-Name': 'devops-copilot-auth'
      },
      timeout: 5000 // 5 second timeout
    });

    console.log('[AgentOps Sync] User synced successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('[AgentOps Sync] Failed to sync user:', {
      email: user.email,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    // Don't fail the registration if AgentOps sync fails
    return null;
  }
}

/**
 * Create AgentOps project for user
 * @param {string} userId - User ID
 * @param {string} projectName - Project name
 * @param {string} environment - Environment (production, staging, development)
 * @returns {Promise<Object|null>} - Project object or null
 */
async function createAgentOpsProject(userId, projectName, environment = 'production') {
  try {
    console.log('[AgentOps Sync] Creating project for user:', userId, projectName);

    const response = await axios.post(`${AGENTOPS_API_URL}/api/v1/projects/create`, {
      user_id: userId.toString(),
      project_name: projectName,
      environment: environment,
      metadata: {
        source: 'devops-copilot',
        auto_created: true
      }
    }, {
      headers: {
        'Authorization': `Bearer ${AGENTOPS_SERVICE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    console.log('[AgentOps Sync] Project created:', response.data);
    return response.data;
  } catch (error) {
    console.error('[AgentOps Sync] Failed to create project:', {
      userId,
      projectName,
      error: error.message,
      status: error.response?.status
    });
    return null;
  }
}

/**
 * Generate AgentOps session token for user
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} - Session token or null
 */
async function generateAgentOpsToken(userId) {
  try {
    console.log('[AgentOps Sync] Generating token for user:', userId);

    // For local development, use the service token directly
    // The AgentOps backend will authenticate via the service token
    // In production, you'd implement proper user-specific token generation
    if (process.env.NODE_ENV === 'development' || process.env.ENVIRONMENT === 'development') {
      console.log('[AgentOps Sync] Using service token for local development');
      return AGENTOPS_SERVICE_TOKEN;
    }

    // Production path: call AgentOps API to get user-specific token
    const response = await axios.post(`${AGENTOPS_API_URL}/api/v1/auth/token`, {
      user_id: userId.toString(),
      expires_in: 86400 // 24 hours
    }, {
      headers: {
        'Authorization': `Bearer ${AGENTOPS_SERVICE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    return response.data.token;
  } catch (error) {
    console.error('[AgentOps Sync] Failed to generate token:', {
      userId,
      error: error.message,
      status: error.response?.status
    });

    // Fallback to service token for local dev if API call fails
    console.warn('[AgentOps Sync] Falling back to service token');
    return AGENTOPS_SERVICE_TOKEN;
  }
}

/**
 * Delete user from AgentOps (for cleanup)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteUserFromAgentOps(userId) {
  try {
    console.log('[AgentOps Sync] Deleting user from AgentOps:', userId);

    await axios.delete(`${AGENTOPS_API_URL}/api/v1/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${AGENTOPS_SERVICE_TOKEN}`
      },
      timeout: 5000
    });

    console.log('[AgentOps Sync] User deleted successfully');
    return true;
  } catch (error) {
    console.error('[AgentOps Sync] Failed to delete user:', {
      userId,
      error: error.message
    });
    return false;
  }
}

/**
 * Update user in AgentOps
 * @param {string} userId - User ID
 * @param {Object} updates - Update data
 * @returns {Promise<Object|null>} - Updated user or null
 */
async function updateUserInAgentOps(userId, updates) {
  try {
    console.log('[AgentOps Sync] Updating user in AgentOps:', userId);

    const response = await axios.patch(`${AGENTOPS_API_URL}/api/v1/users/${userId}`, updates, {
      headers: {
        'Authorization': `Bearer ${AGENTOPS_SERVICE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    console.log('[AgentOps Sync] User updated successfully');
    return response.data;
  } catch (error) {
    console.error('[AgentOps Sync] Failed to update user:', {
      userId,
      error: error.message
    });
    return null;
  }
}

/**
 * Check if AgentOps service is healthy
 * @returns {Promise<boolean>} - Health status
 */
async function checkAgentOpsHealth() {
  try {
    const response = await axios.get(`${AGENTOPS_API_URL}/health`, {
      timeout: 3000
    });
    return response.status === 200;
  } catch (error) {
    console.error('[AgentOps Sync] Health check failed:', error.message);
    return false;
  }
}

module.exports = {
  syncUserToAgentOps,
  createAgentOpsProject,
  generateAgentOpsToken,
  deleteUserFromAgentOps,
  updateUserInAgentOps,
  checkAgentOpsHealth
};

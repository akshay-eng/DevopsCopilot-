/**
 * Authentication Middleware - Integrates with existing Flask AuthService
 * Validates JWT tokens issued by AuthService
 */
const axios = require('axios');
const logger = require('../utils/logger');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:8000';

/**
 * Verify JWT token with AuthService
 */
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Validate token with AuthService
    const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/validate`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });

    if (response.data.valid) {
      req.userId = response.data.user_id;

      // Optionally fetch full user details
      const userResponse = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 5000
      });

      req.user = userResponse.data.user;
      next();
    } else {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    logger.error('Authentication failed:', error.message);

    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    return res.status(500).json({ error: 'Authentication service unavailable' });
  }
};

/**
 * Verify API key from agent requests
 */
const authenticateAgent = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const agentId = req.headers['x-agent-id'] || req.body.agent_id;

    if (!apiKey || !agentId) {
      return res.status(401).json({ error: 'Missing API key or agent ID' });
    }

    const Cluster = require('../models/Cluster');
    const cluster = await Cluster.findOne({ agentId, isActive: true });

    if (!cluster) {
      return res.status(401).json({ error: 'Invalid agent ID' });
    }

    const isValidApiKey = await cluster.compareApiKey(apiKey);

    if (!isValidApiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.cluster = cluster;
    req.clusterId = cluster._id;
    req.userId = cluster.userId;
    next();
  } catch (error) {
    logger.error('Agent authentication failed:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Optional authentication - attaches user if token is valid but doesn't fail if not
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/validate`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 5000
      });

      if (response.data.valid) {
        req.userId = response.data.user_id;
      }
    }
  } catch (error) {
    // Silently fail for optional auth
  }
  next();
};

module.exports = {
  authenticate,
  authenticateAgent,
  optionalAuth,
};

const express = require('express');
const axios = require('axios');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  generateAgentOpsToken,
  syncUserToAgentOps,
  checkAgentOpsHealth
} = require('../middleware/agentopsSync');
const {
  getSessions,
  getSessionCount,
  getSessionById,
  getSessionEvents,
  getMetrics,
  getProjects
} = require('../utils/agentopsDb');

const AGENTOPS_API_URL = process.env.AGENTOPS_API_URL || 'http://localhost:8000';
const AGENTOPS_DASHBOARD_URL = process.env.AGENTOPS_DASHBOARD_URL || 'http://localhost:3001';

/**
 * Get AgentOps session token for current user
 * Used by frontend to authenticate AgentOps iframe
 */
router.get('/token', protect, async (req, res) => {
  try {
    const token = await generateAgentOpsToken(req.user.id);

    if (!token) {
      return res.status(500).json({
        error: 'Failed to generate AgentOps token',
        message: 'Could not create session token. AgentOps service may be unavailable.'
      });
    }

    res.json({
      token,
      dashboardUrl: AGENTOPS_DASHBOARD_URL,
      userId: req.user.id,
      expiresIn: 86400 // 24 hours
    });
  } catch (error) {
    console.error('Error generating AgentOps token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health check for AgentOps service
 */
router.get('/health', async (req, res) => {
  try {
    const isHealthy = await checkAgentOpsHealth();

    if (isHealthy) {
      res.json({
        status: 'healthy',
        service: 'agentops',
        apiUrl: AGENTOPS_API_URL,
        dashboardUrl: AGENTOPS_DASHBOARD_URL
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        service: 'agentops',
        message: 'AgentOps service is not responding'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * Manual user sync endpoint (for admin use)
 */
router.post('/sync-user', protect, async (req, res) => {
  try {
    const result = await syncUserToAgentOps(req.user);

    if (result) {
      res.json({
        success: true,
        message: 'User synced to AgentOps',
        agentOpsUser: result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to sync user to AgentOps'
      });
    }
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Proxy endpoint for AgentOps API
 * Forwards authenticated requests to AgentOps backend
 */
router.all('/api/*', protect, async (req, res) => {
  try {
    // Extract the path after /api/agentops/api/
    const agentOpsPath = req.originalUrl.replace('/api/agentops/api', '');
    const url = `${AGENTOPS_API_URL}/api${agentOpsPath}`;

    console.log(`[AgentOps Proxy] ${req.method} ${url}`);

    // Get user's AgentOps token
    const agentOpsToken = await generateAgentOpsToken(req.user.id);

    if (!agentOpsToken) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Could not authenticate with AgentOps'
      });
    }

    // Forward request to AgentOps API
    const response = await axios({
      method: req.method,
      url,
      data: req.body,
      params: req.query,
      headers: {
        'Authorization': `Bearer ${agentOpsToken}`,
        'Content-Type': 'application/json',
        'X-User-ID': req.user.id,
        'X-User-Email': req.user.email
      },
      timeout: 30000 // 30 seconds
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('[AgentOps Proxy] Error:', {
      method: req.method,
      path: req.originalUrl,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    const status = error.response?.status || 500;
    const errorData = error.response?.data || {
      error: 'Proxy request failed',
      message: error.message
    };

    res.status(status).json(errorData);
  }
});

/**
 * Get AgentOps project for current user
 */
router.get('/project', protect, async (req, res) => {
  try {
    const agentOpsToken = await generateAgentOpsToken(req.user.id);

    const response = await axios.get(`${AGENTOPS_API_URL}/api/v1/projects/user/${req.user.id}`, {
      headers: {
        'Authorization': `Bearer ${agentOpsToken}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching AgentOps project:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || 'Failed to fetch project'
    });
  }
});

/**
 * Get user's traces from AgentOps
 * Queries PostgreSQL database directly
 */
router.get('/traces', protect, async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      page = 0,
      startDate,
      endDate,
      projectId,
      search
    } = req.query;

    // Calculate offset from page if provided
    const actualOffset = page ? parseInt(page) * parseInt(limit) : parseInt(offset);

    console.log('[AgentOps] Fetching traces from database:', {
      limit,
      offset: actualOffset,
      page,
      startDate,
      endDate,
      projectId,
      search
    });

    // Query sessions from database
    const [sessions, total] = await Promise.all([
      getSessions({
        limit: parseInt(limit),
        offset: actualOffset,
        startDate,
        endDate,
        projectId,
        search
      }),
      getSessionCount({ startDate, endDate, projectId, search })
    ]);

    // Transform sessions to match expected trace format for Sessions page
    const traces = sessions.map(session => {
      const startTime = new Date(session.init_timestamp);
      const endTime = session.end_timestamp ? new Date(session.end_timestamp) : null;
      const durationMs = endTime ? endTime - startTime : null;

      // Determine status
      let status = 'running';
      if (session.end_state) {
        status = session.end_state.toLowerCase() === 'success' ? 'success' : 'failed';
      }

      // Get span name from tags or use default
      const rootSpanName = session.tags?.find(tag => !tag.startsWith('user:') && !tag.startsWith('environment:'))
        || 'Agent Session';

      return {
        // Session identifiers
        trace_id: session.id,
        id: session.id,
        sessionId: session.id,

        // Project info
        projectId: session.project_id,
        projectName: session.project_name,

        // Naming
        root_span_name: rootSpanName,
        name: rootSpanName,

        // Timestamps
        start_time: session.init_timestamp,
        startTime: session.init_timestamp,
        end_time: session.end_timestamp,
        endTime: session.end_timestamp,

        // Duration
        duration_ms: durationMs,
        duration: durationMs,

        // Status
        status: status,
        end_state: session.end_state,
        statusReason: session.end_state_reason,

        // Metrics
        cost: parseFloat(session.cost) || 0,
        total_cost: parseFloat(session.cost) || 0,
        span_count: parseInt(session.llm_calls || 0) + parseInt(session.tool_calls || 0),
        llmCalls: parseInt(session.llm_calls) || 0,
        toolCalls: parseInt(session.tool_calls) || 0,
        errors: parseInt(session.errors) || 0,

        // Additional data
        tags: session.tags || [],
        hostEnv: session.host_env,
        video: session.video
      };
    });

    res.json({
      traces,
      total,
      page: Math.floor(actualOffset / parseInt(limit)),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Error fetching traces from database:', error);
    res.status(500).json({
      error: 'Failed to fetch traces',
      message: error.message,
      traces: [],
      total: 0
    });
  }
});

/**
 * Get specific trace details
 */
router.get('/traces/:traceId', protect, async (req, res) => {
  try {
    const { traceId } = req.params;

    console.log('[AgentOps] Fetching trace details for:', traceId);

    const session = await getSessionById(traceId);

    if (!session) {
      return res.status(404).json({
        error: 'Trace not found'
      });
    }

    res.json({
      id: session.id,
      sessionId: session.id,
      projectId: session.project_id,
      projectName: session.project_name,
      startTime: session.init_timestamp,
      endTime: session.end_timestamp,
      duration: session.end_timestamp ?
        new Date(session.end_timestamp) - new Date(session.init_timestamp) : null,
      status: session.end_state || 'Running',
      statusReason: session.end_state_reason,
      cost: session.cost || 0,
      llmCalls: session.llm_calls || 0,
      toolCalls: session.tool_calls || 0,
      errors: session.errors || 0,
      tags: session.tags || [],
      video: session.video,
      hostEnv: session.host_env
    });
  } catch (error) {
    console.error('Error fetching trace details:', error);
    res.status(500).json({
      error: 'Failed to fetch trace details',
      message: error.message
    });
  }
});

/**
 * Get trace spans (for waterfall view)
 */
router.get('/traces/:traceId/spans', protect, async (req, res) => {
  try {
    const { traceId } = req.params;

    console.log('[AgentOps] Fetching spans for trace:', traceId);

    const events = await getSessionEvents(traceId);

    // Transform events to span format
    const spans = events.map(event => ({
      id: event.id,
      sessionId: event.session_id,
      type: event.event_type,
      timestamp: event.init_timestamp,
      endTimestamp: event.end_timestamp,
      duration: event.end_timestamp ?
        new Date(event.end_timestamp) - new Date(event.init_timestamp) : null,
      data: event.params || {}
    }));

    res.json({
      spans,
      total: spans.length
    });
  } catch (error) {
    console.error('Error fetching trace spans:', error);
    res.status(500).json({
      error: 'Failed to fetch trace spans',
      message: error.message,
      spans: []
    });
  }
});

/**
 * Get metrics for date range
 * Queries PostgreSQL database directly
 */
router.get('/metrics', protect, async (req, res) => {
  try {
    const { startDate, endDate, projectId } = req.query;

    console.log('[AgentOps] Fetching metrics from database:', { startDate, endDate, projectId });

    const metrics = await getMetrics({ startDate, endDate, projectId });

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message,
      totalSessions: 0,
      totalCost: 0,
      successRate: 0
    });
  }
});

/**
 * Get user's projects
 * Queries PostgreSQL database directly
 */
router.get('/projects', protect, async (req, res) => {
  try {
    console.log('[AgentOps] Fetching projects from database');

    const projects = await getProjects(req.user.id);

    res.json({
      projects,
      total: projects.length
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      error: 'Failed to fetch projects',
      message: error.message,
      projects: []
    });
  }
});

/**
 * Create new project
 */
router.post('/projects', protect, async (req, res) => {
  try {
    const agentOpsToken = await generateAgentOpsToken(req.user.id);

    const response = await axios.post(
      `${AGENTOPS_API_URL}/api/v1/projects`,
      {
        ...req.body,
        user_id: req.user.id
      },
      {
        headers: {
          'Authorization': `Bearer ${agentOpsToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || 'Failed to create project'
    });
  }
});

/**
 * Get user's agents
 */
router.get('/agents', protect, async (req, res) => {
  try {
    const agentOpsToken = await generateAgentOpsToken(req.user.id);

    const response = await axios.get(`${AGENTOPS_API_URL}/api/v1/agents`, {
      params: {
        user_id: req.user.id
      },
      headers: {
        'Authorization': `Bearer ${agentOpsToken}`
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data || 'Failed to fetch agents'
    });
  }
});

/**
 * Get session details by ID
 */
router.get('/sessions/:sessionId', protect, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const agentopsDb = require('../utils/agentopsDb');

    // Get session details
    const session = await agentopsDb.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching session details:', error);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

/**
 * Get events for a session
 */
router.get('/sessions/:sessionId/events', protect, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const agentopsDb = require('../utils/agentopsDb');

    // Get events for this session
    const events = await agentopsDb.getSessionEvents(sessionId);

    res.json(events);
  } catch (error) {
    console.error('Error fetching session events:', error);
    res.status(500).json({ error: 'Failed to fetch session events' });
  }
});

module.exports = router;

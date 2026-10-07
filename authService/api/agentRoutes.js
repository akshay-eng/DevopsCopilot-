const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

const DEEP_AGENT_URL = process.env.DEEP_AGENT_URL || 'http://localhost:8100';

/**
 * POST /api/agent/chat
 * Proxy chat request to deep-agent Python service, return SSE stream
 */
router.post('/chat', protect, async (req, res) => {
  try {
    const { message, conversationId, modelProvider, clusterId } = req.body;
    const userId = req.user._id.toString();

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Extract JWT token to pass to deep-agent (for platform API calls)
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';

    // Forward to Python deep-agent
    const response = await fetch(`${DEEP_AGENT_URL}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversationId,
        modelProvider: modelProvider || 'bedrock',
        clusterId: clusterId || '',
        userId,
        authToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AGENT] Deep agent error:', response.status, errorText);
      res.write(`data: ${JSON.stringify({ type: 'error', error: `Agent service error: ${response.status}` })}\n\n`);
      return res.end();
    }

    // Pipe SSE stream from Python to client
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
      res.end();
    };

    // Handle client disconnect
    req.on('close', () => {
      reader.cancel();
    });

    await pump();
  } catch (error) {
    console.error('[AGENT] Chat proxy error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * GET /api/agent/conversations
 * List conversations for the authenticated user
 */
router.get('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const response = await fetch(
      `${DEEP_AGENT_URL}/api/agent/conversations?userId=${userId}&limit=${req.query.limit || 50}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[AGENT] List conversations error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/agent/conversations/:id
 * Get messages for a specific conversation
 */
router.get('/conversations/:id', protect, async (req, res) => {
  try {
    const response = await fetch(
      `${DEEP_AGENT_URL}/api/agent/conversations/${req.params.id}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[AGENT] Get conversation error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agent/tools
 * Get active tools available to the agent (platform + MCP deployments).
 * Discovers tools from built-in agent tools + live MCP server introspection.
 */
router.post('/tools', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const MCPDeployment = require('../models/MCPDeployment');
    const Cluster = require('../models/Cluster');
    const axios = require('axios');

    // 1. Built-in platform tools (from deep-agent)
    const toolGroups = [
      {
        name: 'Platform Tools',
        status: 'connected',
        toolCount: 24,
        tools: [
          'list_clusters', 'get_cluster_details', 'get_namespaces',
          'get_resources', 'get_pod_logs', 'get_k8s_events',
          'get_cluster_metrics', 'get_pod_metrics', 'get_node_metrics',
          'get_alerts', 'get_alert_timeline_grouped', 'get_managed_alerts',
          'get_correlated_incidents', 'run_correlation_analysis',
          'get_timeline_events', 'get_network_traffic', 'get_service_map',
          'get_integrations',
          'itsm_create_incident', 'itsm_create_change_request',
          'itsm_update_ticket', 'itsm_close_ticket',
          'search_similar_incidents', 'search_similar_change_requests',
        ],
      },
      {
        name: 'Prometheus',
        status: 'connected',
        toolCount: 2,
        tools: ['prometheus_query', 'prometheus_query_range'],
      },
      {
        name: 'SNOW Direct (CMDB)',
        status: 'connected',
        toolCount: 5,
        tools: [
          'search_cmdb_ci', 'add_affected_cis', 'add_change_attachment',
          'check_change_conflicts', 'update_change_dates',
        ],
      },
    ];

    // 2. Discover deployed MCP servers (fetch all in parallel)
    const deployments = await MCPDeployment.find({ userId, status: 'running' });

    const mcpPromises = deployments.map(async (dep) => {
      const toolGroup = {
        name: dep.name,
        status: 'disconnected',
        toolCount: 0,
        tools: [],
        error: null,
      };

      try {
        const cluster = await Cluster.findOne({ _id: dep.clusterId, userId });
        if (!cluster?.agentEndpoint) {
          toolGroup.error = 'Cluster agent not reachable';
          return toolGroup;
        }

        const toolsResp = await axios.get(
          `${cluster.agentEndpoint}/mcp/tools/${dep.name}`,
          { params: { namespace: dep.namespace, port: dep.port }, timeout: 45000 }
        );

        if (toolsResp.data?.tools?.length > 0) {
          toolGroup.status = 'connected';
          toolGroup.toolCount = toolsResp.data.tools.length;
          toolGroup.tools = toolsResp.data.tools.map(t => t.name);
        } else {
          toolGroup.error = 'No tools returned';
        }
      } catch (err) {
        toolGroup.error = 'Connection failed';
        console.error(`[AGENT] MCP tool discovery failed for ${dep.name}:`, err.message);
      }

      return toolGroup;
    });

    const mcpResults = await Promise.all(mcpPromises);
    toolGroups.push(...mcpResults);

    res.json({ tools: toolGroups });
  } catch (error) {
    console.error('[AGENT] Tools discovery error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agent/ops
 * Proxy to the Enterprise AIOps agent. Supports memory, sessions, full tool access.
 * Streams tool calls and responses via SSE.
 */
router.post('/ops', protect, async (req, res) => {
  try {
    const { message, conversationId, modelProvider, clusterId } = req.body;
    const userId = req.user._id.toString();
    const authToken = req.headers.authorization?.replace('Bearer ', '') || '';

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const response = await fetch(`${DEEP_AGENT_URL}/api/agent/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversationId: conversationId || '',
        modelProvider: modelProvider || 'bedrock',
        clusterId: clusterId || '',
        userId,
        authToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AGENT] Ops agent error:', response.status, errorText);
      res.write(`data: ${JSON.stringify({ type: 'error', error: `Agent service error: ${response.status}` })}\n\n`);
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
      res.end();
    };

    req.on('close', () => { reader.cancel(); });
    await pump();
  } catch (error) {
    console.error('[AGENT] Ops proxy error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * POST /api/agent/alert-generate
 * Proxy alert generation request to deep-agent, return SSE stream.
 * The agent verifies Prometheus metrics and generates a structured alert rule.
 */
router.post('/alert-generate', protect, async (req, res) => {
  try {
    const { prompt, clusterId, namespace, modelProvider } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const response = await fetch(`${DEEP_AGENT_URL}/api/agent/alert-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        clusterId: clusterId || '',
        namespace: namespace || 'all',
        modelProvider: modelProvider || 'bedrock',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AGENT] Alert generate error:', response.status, errorText);
      res.write(`data: ${JSON.stringify({ type: 'error', error: `Agent service error: ${response.status}` })}\n\n`);
      return res.end();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
      res.end();
    };

    req.on('close', () => {
      reader.cancel();
    });

    await pump();
  } catch (error) {
    console.error('[AGENT] Alert generate proxy error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
  }
});

/**
 * DELETE /api/agent/conversations/:id
 * Delete a conversation
 */
router.delete('/conversations/:id', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const response = await fetch(
      `${DEEP_AGENT_URL}/api/agent/conversations/${req.params.id}?userId=${userId}`,
      { method: 'DELETE' }
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[AGENT] Delete conversation error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

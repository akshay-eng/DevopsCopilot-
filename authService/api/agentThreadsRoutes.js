/**
 * Pi agent thread observability — proxies the agent runtime's live task registry
 * so the UI can show what the agent is working on right now.
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

// Threads are a Pi-runtime feature, so prefer PI_AGENT_URL when it is set.
const AGENT_URL = process.env.PI_AGENT_URL || process.env.DEEP_AGENT_URL || 'http://localhost:8100';

async function agentFetch(path, timeout = 8000) {
  const res = await fetch(`${AGENT_URL}${path}`, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`agent HTTP ${res.status}`);
  return res.json();
}

// GET /api/agent-threads — live + recent agent task threads
router.get('/', protect, async (req, res) => {
  try {
    const qs = new URLSearchParams();
    qs.set('userId', req.user._id.toString());
    if (req.query.status) qs.set('status', req.query.status);
    qs.set('limit', String(Math.min(parseInt(req.query.limit, 10) || 50, 200)));
    const data = await agentFetch(`/api/threads?${qs}`);
    res.json({ success: true, agentOnline: true, ...data });
  } catch (e) {
    // The page should still render when the agent runtime is down.
    res.json({
      success: true, agentOnline: false, error: e.message,
      stats: { total: 0, running: 0, completed: 0, errored: 0, toolCalls: 0 }, threads: [],
    });
  }
});

// GET /api/agent-threads/approvals — everything the agent is waiting on a human for
// Declared before '/:id' so "approvals" is not swallowed as a thread id.
router.get('/approvals', protect, async (req, res) => {
  try {
    const data = await agentFetch(`/api/approvals?userId=${encodeURIComponent(req.user._id.toString())}`);
    res.json({ success: true, agentOnline: true, ...data });
  } catch (e) {
    res.json({ success: true, agentOnline: false, approvals: [], error: e.message });
  }
});

// POST /api/agent-threads/approvals/:id { approved, reason }
router.post('/approvals/:id', protect, async (req, res) => {
  try {
    const r = await fetch(`${AGENT_URL}/api/approvals/${encodeURIComponent(req.params.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approved: Boolean(req.body?.approved),
        by: req.user.email || req.user._id.toString(),
        reason: req.body?.reason,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ success: false, ...data });
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(503).json({ success: false, error: `Agent runtime unreachable: ${e.message}` });
  }
});

// GET /api/agent-threads/:id — full detail for one thread
router.get('/:id', protect, async (req, res) => {
  try {
    const data = await agentFetch(`/api/threads/${encodeURIComponent(req.params.id)}`);
    res.json({ success: true, agentOnline: true, ...data });
  } catch (e) {
    res.status(404).json({ success: false, agentOnline: false, error: e.message });
  }
});

module.exports = router;

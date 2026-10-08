/**
 * Remediation actions — the endpoints the agent uses to actually change a
 * cluster, plus the dry-run description used to ask an operator first.
 *
 * `/describe` is read-only and exists so the approval prompt can state what
 * will happen, how risky it is and whether it can be undone, without the agent
 * inventing that text.
 *
 * `/apply` performs the change and records it. It does NOT ask for approval —
 * approval happens in the agent run before this is ever called — so this route
 * stays behind `protect` and is never exposed to anything unauthenticated.
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const { describeAction, runAction, ACTIONS } = require('../services/k8sActions');
const RemediationLog = require('../models/RemediationLog');

const router = express.Router();

// GET /api/remediation/actions — what the agent is allowed to do
router.get('/actions', protect, (req, res) => {
  res.json({
    success: true,
    actions: Object.entries(ACTIONS).map(([name, a]) => ({
      name, risk: a.risk, reversible: a.reversible, mutating: a.mutating,
    })),
  });
});

// POST /api/remediation/describe { action, params } — dry run, no side effects
router.post('/describe', protect, (req, res) => {
  const { action, params } = req.body || {};
  const describe = describeAction(action, params);
  if (!describe) {
    return res.status(400).json({ success: false, error: `Unknown action '${action}'.` });
  }
  res.json({ success: true, describe });
});

// POST /api/remediation/apply { action, params, reason }
router.post('/apply', protect, async (req, res) => {
  const { action, params, reason, alertId, correlationId } = req.body || {};
  const userId = req.user._id.toString();

  if (!ACTIONS[action]) {
    return res.status(400).json({ success: false, error: `Unknown action '${action}'.` });
  }

  const started = Date.now();
  try {
    const result = await runAction(action, params);

    // Log before responding: an applied change that we failed to record is far
    // worse than a slow response.
    await RemediationLog.create({
      userId, action, params, reason: reason || '',
      status: 'applied', result, alertId: alertId || null,
      correlationId: correlationId || null, durationMs: Date.now() - started,
    }).catch((e) => console.warn('[REMEDIATION] log write failed:', e.message));

    console.log(`[REMEDIATION] ${action} applied by ${userId}: ${result.target} (${result.detail})`);
    res.json({ success: true, result });
  } catch (error) {
    await RemediationLog.create({
      userId, action, params, reason: reason || '',
      status: 'failed', error: error.message, alertId: alertId || null,
      correlationId: correlationId || null, durationMs: Date.now() - started,
    }).catch(() => {});

    console.error(`[REMEDIATION] ${action} failed:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/remediation/log?limit=50
router.get('/log', protect, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const logs = await RemediationLog.find({ userId: req.user._id.toString() })
    .sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ success: true, logs });
});

module.exports = router;

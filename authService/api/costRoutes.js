/**
 * Kubernetes cost routes — backed by OpenCost.
 *
 * Every response carries `pricingSource` and the Prometheus `retentionHours`,
 * because on bare metal the figures come from a configured price list rather
 * than a cloud invoice, and the history is only as deep as Prometheus keeps.
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const { getCostSummary, getClusterCosts, allocation, resolveProvider, WINDOWS } = require('../services/costService');

const router = express.Router();

// @route   GET /api/cost/summary?window=24h
// @desc    Totals, projections, per-namespace and per-controller cost
router.get('/summary', protect, async (req, res) => {
  try {
    res.json({ success: true, ...(await getCostSummary({ window: req.query.window, userId: req.user._id })) });
  } catch (error) {
    console.error('[COST] summary failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/cost/clusters?window=24h
// @desc    Per-cluster cost, plus the registered clusters that report none
router.get('/clusters', protect, async (req, res) => {
  try {
    res.json({ success: true, ...(await getClusterCosts({ window: req.query.window, userId: req.user._id })) });
  } catch (error) {
    console.error('[COST] clusters failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route   GET /api/cost/allocation?window=24h&aggregate=namespace
// @desc    Raw allocation rows for an arbitrary aggregation
router.get('/allocation', protect, async (req, res) => {
  const ALLOWED = ['namespace', 'controller', 'pod', 'node', 'service', 'cluster', 'container'];
  const aggregate = ALLOWED.includes(req.query.aggregate) ? req.query.aggregate : 'namespace';
  try {
    const provider = await resolveProvider(req.user._id);
    if (!provider) {
      return res.status(400).json({ success: false, error: 'No cost provider configured', aggregate });
    }
    const rows = await allocation(provider, req.query.window, aggregate);
    res.json({ success: true, aggregate, window: req.query.window || '24h', provider: provider.id, rows });
  } catch (error) {
    res.status(502).json({ success: false, error: error.message, aggregate });
  }
});

// @route   GET /api/cost/windows
// @desc    Windows the UI may offer
router.get('/windows', protect, (req, res) => {
  res.json({ success: true, windows: Object.keys(WINDOWS) });
});

module.exports = router;

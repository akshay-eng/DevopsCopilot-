/**
 * Cluster compliance: the policy catalog, the user's baseline, evaluation and
 * the automatable part of remediation.
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const { publicCatalog, DEFAULT_POLICY, SEVERITIES } = require('../config/compliancePolicies');
const { evaluateCluster, remediateCluster, getEffectivePolicy } = require('../services/complianceService');
const ClusterPolicy = require('../models/ClusterPolicy');
const ComplianceResult = require('../models/ComplianceResult');
const Cluster = require('../models/Cluster');
const { encrypt } = require('../utils/integrationCrypto');
const { resolveAccess } = require('../services/clusterAccess');
const { getPlatformFootprint } = require('../services/platformFootprintService');
const { computeFootprint } = require('../config/chartFootprint');

const router = express.Router();

// @route GET /api/compliance/catalog
// @desc  Available rules + their parameter shapes (drives the policy editor)
router.get('/catalog', protect, (req, res) => {
  res.json({ success: true, rules: publicCatalog(), severities: SEVERITIES, defaultPolicy: DEFAULT_POLICY });
});

// @route GET /api/compliance/chart-footprint?nodeCount=3&components=prometheus,trivy-operator
// @desc  What installing the Helm chart will reserve on a cluster. Public-ish:
//        shown during onboarding, before any cluster exists.
router.get('/chart-footprint', protect, (req, res) => {
  const nodeCount = Math.max(1, Math.min(500, parseInt(req.query.nodeCount, 10) || 3));
  const enabled = req.query.components
    ? String(req.query.components).split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  res.json({ success: true, ...computeFootprint({ nodeCount, enabled }) });
});

// @route GET /api/compliance/footprint
// @desc  Health + resource footprint of the components this platform installs
router.get('/footprint', protect, async (req, res) => {
  try {
    res.json({ success: true, ...(await getPlatformFootprint({ userId: req.user._id, clusterId: req.query.clusterId })) });
  } catch (error) {
    console.error('[FOOTPRINT] failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route GET /api/compliance/policy?clusterId=...
// @desc  The baseline in force (cluster-specific, account default, or built-in)
router.get('/policy', protect, async (req, res) => {
  try {
    const policy = await getEffectivePolicy(req.user._id, req.query.clusterId || null);
    res.json({ success: true, policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route PUT /api/compliance/policy
// @desc  Save a baseline. Omit clusterId to set the account-wide default.
router.put('/policy', protect, async (req, res) => {
  try {
    const { clusterId = null, name, rules } = req.body || {};
    if (!Array.isArray(rules)) {
      return res.status(400).json({ success: false, error: 'rules must be an array' });
    }
    const policy = await ClusterPolicy.findOneAndUpdate(
      { userId: req.user._id, clusterId: clusterId || null },
      { $set: { name: name || 'Baseline', rules } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route PUT /api/compliance/kubeconfig/:clusterId
// @desc  Store a kubeconfig for a cluster so the backend can read it directly.
//        Without this, a cluster whose agent predates the resource API can only
//        be read via the backend's own kubeconfig — which is only correct for
//        the one cluster that kubeconfig points at.
router.put('/kubeconfig/:clusterId', protect, async (req, res) => {
  try {
    const { kubeconfig } = req.body || {};
    if (typeof kubeconfig !== 'string' || !/apiVersion|clusters:/.test(kubeconfig)) {
      return res.status(400).json({ success: false, error: 'Body must contain a kubeconfig YAML string' });
    }
    const cluster = await Cluster.findOne({ _id: req.params.clusterId, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    cluster.kubeconfig = encrypt(kubeconfig);
    await cluster.save();

    // Prove it works before reporting success, rather than storing a dud.
    const access = await resolveAccess(req.user._id, req.params.clusterId);
    res.json({
      success: true,
      stored: true,
      access: { mode: access.mode, verified: access.verified, warning: access.warning },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route POST /api/compliance/access/:clusterId/bind-local
// @desc  Assert that the backend's own kubeconfig IS this cluster.
//        Verification cannot bootstrap itself — the node-name fingerprint has
//        to come from somewhere trusted first — so this records it on a human's
//        say-so. After this, a local read that stops matching those nodes is
//        reported as unavailable instead of being quietly wrong.
router.post('/access/:clusterId/bind-local', protect, async (req, res) => {
  try {
    const cluster = await Cluster.findOne({ _id: req.params.clusterId, userId: req.user._id });
    if (!cluster) return res.status(404).json({ success: false, error: 'Cluster not found' });

    const k8s = require('@kubernetes/client-node');
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    const core = kc.makeApiClient(k8s.CoreV1Api);
    const resp = await core.listNode();
    const names = ((resp?.body || resp)?.items || []).map((n) => n.metadata?.name).filter(Boolean);
    if (!names.length) {
      return res.status(400).json({ success: false, error: 'The local kubeconfig returned no nodes.' });
    }

    cluster.metadata = { ...(cluster.metadata || {}), nodeNames: names, nodeCount: names.length };
    cluster.markModified('metadata');
    await cluster.save();

    res.json({
      success: true, bound: true, context: kc.getCurrentContext(),
      nodes: names,
      note: `"${cluster.name}" is now fingerprinted by these node names; reads are verified against them.`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route GET /api/compliance/access/:clusterId
// @desc  How this cluster is reachable, and whether that is confirmed
router.get('/access/:clusterId', protect, async (req, res) => {
  try {
    const a = await resolveAccess(req.user._id, req.params.clusterId);
    res.json({
      success: true,
      mode: a.mode, verified: !!a.verified, context: a.context || null,
      warning: a.warning || null, cluster: { id: String(a.cluster._id), name: a.cluster.name },
    });
  } catch (error) {
    const code = /not found/i.test(error.message) ? 404 : 500;
    res.status(code).json({ success: false, error: error.message });
  }
});

// @route POST /api/compliance/evaluate/:clusterId
router.post('/evaluate/:clusterId', protect, async (req, res) => {
  try {
    res.json({ success: true, ...(await evaluateCluster(req.user._id, req.params.clusterId)) });
  } catch (error) {
    const code = /not found/i.test(error.message) ? 404 : 500;
    res.status(code).json({ success: false, error: error.message });
  }
});

// @route GET /api/compliance/:clusterId
// @desc  Last stored evaluation — cheap, for dashboards
router.get('/:clusterId', protect, async (req, res) => {
  try {
    const last = await ComplianceResult.findOne({ userId: req.user._id, clusterId: req.params.clusterId })
      .sort({ evaluatedAt: -1 }).lean();
    res.json({ success: true, result: last || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// @route POST /api/compliance/remediate/:clusterId
// @desc  Apply the safe, automatable fixes; return the rest as manual guidance
router.post('/remediate/:clusterId', protect, async (req, res) => {
  try {
    const r = await remediateCluster(req.user._id, req.params.clusterId, { ruleIds: req.body?.ruleIds });
    res.json({ success: true, ...r });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

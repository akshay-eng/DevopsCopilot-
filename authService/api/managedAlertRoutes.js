const express = require('express');
const mongoose = require('mongoose');
const k8s = require('@kubernetes/client-node');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// MongoDB Model — ManagedAlert
// ---------------------------------------------------------------------------
const managedAlertSchema = new mongoose.Schema({
  userId:      { type: String, required: true, index: true },
  clusterId:   { type: String, required: true },
  alertId:     { type: String, required: true },       // catalog id e.g. 'pod-high-cpu'
  alertName:   { type: String, required: true },       // unique rule name inside PrometheusRule
  displayName: { type: String },                       // human-friendly name
  category:    String,
  severity:    String,
  expr:        { type: String, required: true },
  duration:    { type: String, default: '5m' },
  summary:     String,
  description: String,
  namespace:   { type: String, default: 'all' },
  labels:      { type: Map, of: String },
  variables:   { type: Map, of: mongoose.Schema.Types.Mixed },
  status:      { type: String, enum: ['active', 'paused', 'error'], default: 'active' },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

managedAlertSchema.index({ userId: 1, alertName: 1 }, { unique: true });

const ManagedAlert = mongoose.model('ManagedAlert', managedAlertSchema);

// ---------------------------------------------------------------------------
// Kubernetes client setup
// ---------------------------------------------------------------------------
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

const CRD_GROUP   = 'monitoring.coreos.com';
const CRD_VERSION = 'v1';
const CRD_PLURAL  = 'prometheusrules';
const CRD_NS      = 'monitoring';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive the PrometheusRule resource name for a given user.
 */
function ruleResourceName(userId) {
  return `devopscopilot-managed-${userId.slice(-8)}`;
}

/**
 * Build a single Prometheus alerting rule object from a ManagedAlert doc.
 */
function buildRule(alert) {
  const rule = {
    alert: alert.alertName,
    expr:  alert.expr,
    for:   alert.duration || '5m',
    labels: {
      severity:   alert.severity || 'warning',
      managed_by: 'devopscopilot',
      user_id:    alert.userId,
      ...(alert.labels instanceof Map ? Object.fromEntries(alert.labels) : (alert.labels || {})),
    },
    annotations: {},
  };

  if (alert.summary)     rule.annotations.summary     = alert.summary;
  if (alert.description) rule.annotations.description = alert.description;
  if (alert.displayName) rule.annotations.display_name = alert.displayName;

  return rule;
}

/**
 * Fetch the existing PrometheusRule for a user, or null if it does not exist.
 */
async function getExistingRule(resourceName) {
  try {
    const res = await customApi.getNamespacedCustomObject({
      group: CRD_GROUP, version: CRD_VERSION, namespace: CRD_NS, plural: CRD_PLURAL, name: resourceName,
    });
    return res;
  } catch (err) {
    if (err.code === 404 || err.statusCode === 404 || err?.response?.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Reconcile the PrometheusRule CRD so that it contains exactly the rules for
 * every *active* ManagedAlert belonging to the user.
 *
 * If there are no active alerts the CRD is deleted to keep the cluster tidy.
 */
async function reconcilePrometheusRule(userId) {
  const resourceName = ruleResourceName(userId);
  const activeAlerts = await ManagedAlert.find({ userId, status: 'active' }).lean();

  // ---- No active alerts → delete the CRD if it exists ----
  if (activeAlerts.length === 0) {
    try {
      await customApi.deleteNamespacedCustomObject({
        group: CRD_GROUP, version: CRD_VERSION, namespace: CRD_NS, plural: CRD_PLURAL, name: resourceName,
      });
      console.log(`[ManagedAlerts] Deleted PrometheusRule ${resourceName} (no active alerts)`);
    } catch (err) {
      if (err.statusCode !== 404 && err?.response?.statusCode !== 404) {
        console.error(`[ManagedAlerts] Failed to delete PrometheusRule ${resourceName}:`, err.message);
      }
    }
    return;
  }

  // ---- Build rules grouped by category (or 'default') ----
  const groups = {};
  for (const alert of activeAlerts) {
    const groupName = alert.category || 'default';
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(buildRule(alert));
  }

  const ruleGroups = Object.entries(groups).map(([name, rules]) => ({
    name: `devopscopilot-${name}`,
    rules,
  }));

  const body = {
    apiVersion: 'monitoring.coreos.com/v1',
    kind: 'PrometheusRule',
    metadata: {
      name: resourceName,
      namespace: CRD_NS,
      labels: {
        release: 'prometheus',
        role: 'alert-rules',
        'app.kubernetes.io/managed-by': 'devopscopilot',
      },
    },
    spec: { groups: ruleGroups },
  };

  // ---- Create or replace ----
  const existing = await getExistingRule(resourceName);

  if (existing) {
    body.metadata.resourceVersion = existing.metadata.resourceVersion;
    await customApi.replaceNamespacedCustomObject({
      group: CRD_GROUP, version: CRD_VERSION, namespace: CRD_NS, plural: CRD_PLURAL, name: resourceName, body,
    });
    console.log(`[ManagedAlerts] Updated PrometheusRule ${resourceName} (${activeAlerts.length} rules)`);
  } else {
    await customApi.createNamespacedCustomObject({
      group: CRD_GROUP, version: CRD_VERSION, namespace: CRD_NS, plural: CRD_PLURAL, body,
    });
    console.log(`[ManagedAlerts] Created PrometheusRule ${resourceName} (${activeAlerts.length} rules)`);
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/alerts/managed/create
 * Create a new managed alert rule.
 */
router.post('/create', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const {
      cluster_id, alert_name, alert_group, expr, duration,
      severity, summary, description, labels,
      display_name, alert_id, variables, namespace,
    } = req.body;

    // --- Validation ---
    if (!cluster_id || !alert_name || !expr) {
      return res.status(400).json({
        success: false,
        error: 'cluster_id, alert_name, and expr are required',
      });
    }

    // Check for duplicate alert name for this user
    const existing = await ManagedAlert.findOne({ userId, alertName: alert_name });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: `Alert with name "${alert_name}" already exists`,
      });
    }

    // --- Persist to MongoDB ---
    const alert = await ManagedAlert.create({
      userId,
      clusterId:   cluster_id,
      alertId:     alert_id || alert_name,
      alertName:   alert_name,
      displayName: display_name || alert_name,
      category:    alert_group || 'default',
      severity:    severity || 'warning',
      expr,
      duration:    duration || '5m',
      summary:     summary || '',
      description: description || '',
      namespace:   namespace || 'all',
      labels:      labels || {},
      variables:   variables || {},
      status:      'active',
    });

    // --- Reconcile the PrometheusRule CRD ---
    try {
      await reconcilePrometheusRule(userId);
    } catch (k8sErr) {
      // Mark as error but don't rollback the MongoDB doc so the user can retry
      console.error('[ManagedAlerts] K8s reconcile failed on create:', k8sErr.message);
      alert.status = 'error';
      await alert.save();
      return res.status(207).json({
        success: true,
        warning: 'Alert saved but failed to apply to cluster. You can retry by toggling the alert.',
        alert,
      });
    }

    console.log(`[ManagedAlerts] Created alert "${alert_name}" for user ${userId}`);
    return res.status(201).json({ success: true, alert });
  } catch (err) {
    console.error('[ManagedAlerts] POST /create error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create alert' });
  }
});

/**
 * GET /api/alerts/managed
 * List all managed alerts for the authenticated user.
 */
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const alerts = await ManagedAlert.find({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, count: alerts.length, alerts });
  } catch (err) {
    console.error('[ManagedAlerts] GET / error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch managed alerts' });
  }
});

/**
 * DELETE /api/alerts/managed/:id
 * Delete a managed alert and remove it from the PrometheusRule CRD.
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const alert = await ManagedAlert.findOne({ _id: req.params.id, userId });

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    const alertName = alert.alertName;
    await ManagedAlert.deleteOne({ _id: alert._id });

    // Reconcile (removes the rule from the CRD)
    try {
      await reconcilePrometheusRule(userId);
    } catch (k8sErr) {
      console.error('[ManagedAlerts] K8s reconcile failed on delete:', k8sErr.message);
      // Alert is already deleted from MongoDB; warn the caller
      return res.status(207).json({
        success: true,
        warning: 'Alert deleted from database but failed to remove from cluster. It will be cleaned up on next reconcile.',
      });
    }

    console.log(`[ManagedAlerts] Deleted alert "${alertName}" for user ${userId}`);
    return res.json({ success: true, message: `Alert "${alertName}" deleted` });
  } catch (err) {
    console.error('[ManagedAlerts] DELETE /:id error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete alert' });
  }
});

/**
 * PATCH /api/alerts/managed/:id/toggle
 * Pause or resume a managed alert.
 *   - paused  → removes the rule from the PrometheusRule CRD
 *   - active  → adds it back
 */
router.patch('/:id/toggle', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const alert = await ManagedAlert.findOne({ _id: req.params.id, userId });

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    // Toggle between active and paused
    const newStatus = alert.status === 'active' ? 'paused' : 'active';
    alert.status = newStatus;
    alert.updatedAt = new Date();
    await alert.save();

    // Reconcile the CRD (only active alerts are included)
    try {
      await reconcilePrometheusRule(userId);
    } catch (k8sErr) {
      console.error('[ManagedAlerts] K8s reconcile failed on toggle:', k8sErr.message);
      alert.status = 'error';
      await alert.save();
      return res.status(207).json({
        success: true,
        warning: 'Status updated in database but failed to apply to cluster.',
        alert,
      });
    }

    console.log(`[ManagedAlerts] Toggled alert "${alert.alertName}" to ${newStatus} for user ${userId}`);
    return res.json({ success: true, status: newStatus, alert });
  } catch (err) {
    console.error('[ManagedAlerts] PATCH /:id/toggle error:', err);
    return res.status(500).json({ success: false, error: 'Failed to toggle alert' });
  }
});

module.exports = router;

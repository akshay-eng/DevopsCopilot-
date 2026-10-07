/**
 * Cluster compliance evaluation.
 *
 * A user defines a baseline (config/compliancePolicies.js describes the
 * available rules); this gathers the cluster's current state once and runs
 * every enabled rule against it.
 *
 * Deliberate choices:
 *  - A rule that cannot be evaluated returns `unknown`, never a silent pass.
 *    Scoring excludes unknowns so a cluster is not credited for checks that did
 *    not actually run.
 *  - Remediation is only offered where the action is safe and reversible
 *    (creating a namespace). Anything destructive or physical — adding nodes,
 *    resizing hardware, moving control-plane pods — is returned as instructions
 *    for a human, because a button that cannot work is worse than none.
 */

const clusterAccess = require('./clusterAccess');
const ClusterPolicy = require('../models/ClusterPolicy');
const ComplianceResult = require('../models/ComplianceResult');
const Cluster = require('../models/Cluster');
const { RULES, DEFAULT_POLICY } = require('../config/compliancePolicies');

const SEVERITY_WEIGHT = { low: 1, medium: 2, high: 4, critical: 8 };

/** The policy in force for a cluster: its own, else the account default, else built-in. */
async function getEffectivePolicy(userId, clusterId) {
  const own = clusterId ? await ClusterPolicy.findOne({ userId, clusterId }).lean() : null;
  if (own && own.rules?.length) return { ...own, source: 'cluster' };

  const fallback = await ClusterPolicy.findOne({ userId, clusterId: null }).lean();
  if (fallback && fallback.rules?.length) return { ...fallback, source: 'account-default' };

  return { name: 'Built-in baseline', rules: DEFAULT_POLICY, source: 'built-in' };
}

/**
 * Read the state every rule needs, from THIS cluster.
 * `access` decides the transport (stored kubeconfig / agent / local), and its
 * `verified` flag travels with the result so callers can say whether the data
 * is confirmed to be the cluster that was asked about.
 */
async function gatherContext(cluster, access) {
  const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { return fallback; } };

  const [nodes, namespaces, pods, deployments, daemonsets] = await Promise.all([
    safe(() => clusterAccess.getNodes(access), []),
    safe(() => clusterAccess.getNamespaces(access), []),
    safe(() => clusterAccess.getPods(access), []),
    safe(() => clusterAccess.getWorkloads(access, 'deployments'), []),
    safe(() => clusterAccess.getWorkloads(access, 'daemonsets'), []),
  ]);

  // Remember the node names so a later local-kubeconfig read can be checked
  // against them instead of being trusted blindly.
  if (access.verified && nodes.length) {
    clusterAccess.rememberNodeNames(cluster._id, nodes);
  }

  return {
    cluster,
    nodes,
    namespaces: namespaces.map((n) => (typeof n === 'string' ? { name: n } : n)),
    pods,
    deployments,
    daemonsets,
  };
}

/** Run one rule, converting a thrown error into `unknown` rather than losing it. */
function runRule(entry, ctx) {
  const def = RULES[entry.rule];
  if (!def) {
    return {
      rule: entry.rule, name: entry.rule, category: 'Unknown', severity: entry.severity || 'medium',
      status: 'unknown', summary: `No such rule: ${entry.rule}`, evidence: [], remediable: false,
    };
  }
  const params = { ...Object.fromEntries((def.params || []).map((p) => [p.name, p.default])), ...(entry.params || {}) };
  try {
    const r = def.evaluate(ctx, params) || {};
    return {
      rule: def.id, name: def.name, category: def.category, description: def.description,
      severity: entry.severity || 'medium', params,
      status: r.status || 'unknown',
      summary: r.summary || '',
      evidence: r.evidence || [],
      remediable: !!r.remediable,
      remediationAction: r.remediationAction || null,
      remediation: r.remediation || null,
    };
  } catch (e) {
    return {
      rule: def.id, name: def.name, category: def.category, severity: entry.severity || 'medium',
      status: 'unknown', summary: `Check failed to run: ${e.message}`, evidence: [], remediable: false,
    };
  }
}

/**
 * @returns { compliant, score, counts, checks[], policy{} }
 */
async function evaluateCluster(userId, clusterId, { persist = true } = {}) {
  const cluster = await Cluster.findOne({ _id: clusterId, userId }).lean();
  if (!cluster) throw new Error('Cluster not found');

  const policy = await getEffectivePolicy(userId, clusterId);
  const enabled = (policy.rules || []).filter((r) => r.enabled !== false);

  const access = await clusterAccess.resolveAccess(userId, clusterId);
  if (access.mode === 'unavailable') {
    // Refusing beats scoring a cluster we cannot actually see.
    return {
      clusterId: String(clusterId),
      clusterName: cluster.name,
      policy: { name: policy.name, source: policy.source, ruleCount: enabled.length },
      score: null,
      compliant: false,
      evaluated: false,
      dataSource: { mode: access.mode, verified: false, warning: access.warning },
      counts: { pass: 0, fail: 0, warn: 0, unknown: enabled.length },
      checks: [],
      evaluatedAt: new Date().toISOString(),
    };
  }

  const ctx = await gatherContext(cluster, access);
  const checks = enabled.map((e) => runRule(e, ctx));

  const counts = { pass: 0, fail: 0, warn: 0, unknown: 0 };
  let earned = 0;
  let possible = 0;
  for (const c of checks) {
    counts[c.status] = (counts[c.status] || 0) + 1;
    if (c.status === 'unknown') continue;            // never score what did not run
    const w = SEVERITY_WEIGHT[c.severity] || 2;
    possible += w;
    if (c.status === 'pass') earned += w;
    else if (c.status === 'warn') earned += w * 0.5; // partial credit
  }
  const score = possible ? Math.round((earned / possible) * 100) : null;

  const result = {
    clusterId: String(clusterId),
    clusterName: cluster.name,
    policy: { name: policy.name, source: policy.source, ruleCount: enabled.length },
    score,
    compliant: counts.fail === 0 && counts.pass > 0,
    counts,
    checks,
    evaluatedAt: new Date().toISOString(),
    evaluated: true,
    // Where the data came from, and whether it is confirmed to be this cluster.
    dataSource: {
      mode: access.mode,
      verified: !!access.verified,
      context: access.context || null,
      warning: access.warning || null,
    },
    observed: { nodes: ctx.nodes.length, namespaces: ctx.namespaces.length, pods: ctx.pods.length },
  };

  if (persist) {
    try {
      await ComplianceResult.create({
        userId, clusterId, score: score ?? 0,
        passed: counts.pass, failed: counts.fail, warned: counts.warn, unknown: counts.unknown,
        compliant: result.compliant, checks,
      });
    } catch (e) { console.error('[COMPLIANCE] persist failed:', e.message); }
  }
  return result;
}

/**
 * Apply the automatable remediations for a cluster.
 * Only acts on checks that declared `remediationAction`; everything else is
 * returned as `manual` so the caller can show what still needs a human.
 */
async function remediateCluster(userId, clusterId, { ruleIds } = {}) {
  const access = await clusterAccess.resolveAccess(userId, clusterId);
  if (access.mode === 'unavailable') {
    throw new Error(access.warning || 'This cluster cannot be reached.');
  }
  const evaluation = await evaluateCluster(userId, clusterId, { persist: false });
  const targets = evaluation.checks.filter((c) => c.remediable && c.remediationAction
    && (!ruleIds?.length || ruleIds.includes(c.rule)));

  const applied = [];
  const failed = [];
  for (const c of targets) {
    const a = c.remediationAction;
    try {
      if (a.type === 'create_namespaces') {
        const made = [];
        for (const ns of a.namespaces || []) {
          await clusterAccess.createNamespace(access, ns);
          made.push(ns);
        }
        applied.push({ rule: c.rule, action: 'create_namespaces', detail: `Created: ${made.join(', ')}` });
      } else {
        failed.push({ rule: c.rule, error: `Unsupported remediation type: ${a.type}` });
      }
    } catch (e) {
      failed.push({ rule: c.rule, error: e.message });
    }
  }

  const manual = evaluation.checks
    .filter((c) => (c.status === 'fail' || c.status === 'warn') && !c.remediationAction)
    .map((c) => ({ rule: c.rule, name: c.name, summary: c.summary, guidance: c.remediation?.manual || (c.remediation?.steps || []).join('; ') }));

  const after = applied.length ? await evaluateCluster(userId, clusterId) : evaluation;
  return { applied, failed, manual, before: { score: evaluation.score }, after };
}

module.exports = { evaluateCluster, remediateCluster, getEffectivePolicy, gatherContext };

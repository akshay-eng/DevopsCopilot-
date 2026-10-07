/**
 * Incident Orchestrator
 *
 * Bridges the Alert Correlation Engine to ITSM:
 *   correlated alert group -> ServiceNow incident
 *   remediation that mutates production -> ServiceNow change request
 *
 * Goes through the connector layer, so it works with whatever auth the user
 * configured (basic / OAuth) rather than assuming username+password.
 * The Pi agent calls these same functions via its tools.
 */

const connectors = require('./connectors');
const { getIntegrationConfig } = require('../utils/integrationCrypto');
const CorrelatedIncident = require('../models/CorrelatedIncident');

// ServiceNow urgency/impact: 1=High 2=Medium 3=Low
const SEV_MAP = { critical: 1, high: 2, warning: 3, medium: 3, low: 4, info: 5 };

/**
 * Remediations that CHANGE production require a change request. Each pattern
 * maps a correlated alert signature to the action it implies + its risk.
 */
const MUTATING_REMEDIATIONS = [
  { re: /CrashLoop|OOMKill|OutOfMemory|Memory/i, action: 'Adjust resource limits or roll back the workload image', risk: '2' },
  { re: /ImagePull|ErrImage|InvalidImageName/i, action: 'Correct the image reference or registry credentials and redeploy', risk: '2' },
  { re: /FailedScheduling|Unschedulable|Pending/i, action: 'Adjust requests/affinity or add capacity', risk: '2' },
  { re: /NodeNotReady|NodeDown|Unreachable|KubeNode/i, action: 'Drain and replace the affected node', risk: '1' },
  { re: /DiskPressure|VolumeFull|OutOfDisk|OutOfSpace|Filesystem|Storage|\bDisk\b|PVC/i, action: 'Expand the volume or reclaim disk space', risk: '2' },
  { re: /CertificateExpir|TLS/i, action: 'Rotate the expiring certificate', risk: '2' },
  { re: /ReplicaMismatch|Deployment|StatefulSet|Replicas/i, action: 'Scale or roll the affected workload', risk: '3' },
  { re: /Config|Secret|Mount/i, action: 'Correct the ConfigMap/Secret and restart consumers', risk: '2' },
  { re: /ClockNotSync|ClockSkew|TimeSync|\bNTP\b|Chrony/i, action: 'Restore time synchronisation (NTP/chrony) on the affected node', risk: '2' },
  { re: /Throttl/i, action: 'Adjust CPU limits/requests on the throttled workload', risk: '3' },
  { re: /Restart|Backoff|Terminat/i, action: 'Roll the affected workload', risk: '2' },
];

/**
 * Decide whether remediating this incident needs a change request.
 * Deterministic + explainable; the agent may override by passing its own plan.
 */
function assessRemediation(incident) {
  const names = [...(incident.alertNames || []), incident.rootCause?.anomalySummary || ''].join(' ');
  const matches = MUTATING_REMEDIATIONS.filter((m) => m.re.test(names));

  if (matches.length === 0) {
    return {
      changeRequired: false,
      reason: 'The correlated alerts indicate an investigative/observability condition; no production-changing action is implied.',
      riskLevel: '3',
      proposedActions: [],
    };
  }

  // Highest risk wins (1 = High).
  const riskLevel = matches.map((m) => m.risk).sort()[0];
  return {
    changeRequired: true,
    reason: `Remediation requires changing a running workload/node: ${matches.map((m) => m.action).join('; ')}.`,
    riskLevel,
    proposedActions: matches.map((m) => m.action),
  };
}

function topSeverity(incident) {
  return Object.keys(incident.severities || {}).reduce(
    (best, s) => ((SEV_MAP[s] || 5) < (SEV_MAP[best] || 5) ? s : best),
    'info'
  );
}

/** Rich, human-readable incident body from the correlation output. */
function buildDescription(incident, assessment) {
  return [
    `Root Cause: ${incident.rootCause?.pod || 'Unknown'} (ns/${incident.rootCause?.namespace || 'unknown'})`,
    `Confidence score: ${incident.rootCause?.score?.toFixed?.(3) ?? 'N/A'}`,
    `Correlated alerts: ${incident.alertCount} across ${incident.pods?.length || 0} pod(s)`,
    `Alert names: ${(incident.alertNames || []).join(', ') || 'n/a'}`,
    `Namespaces: ${(incident.namespaces || []).join(', ') || 'n/a'}`,
    `Pods: ${(incident.pods || []).join(', ') || 'n/a'}`,
    `Time range: ${incident.timeRange?.start || ''} → ${incident.timeRange?.end || ''}`,
    `Occurrences: ${incident.occurrences || 1}`,
    '',
    'Evidence:',
    ...((incident.evidence || []).map((e) => `  - ${e}`)),
    '',
    'Causal chain:',
    ...((incident.causalChain || []).map((c) => `  ${c.role}: ${c.pod} (score ${c.score})`)),
    '',
    `Anomaly summary: ${incident.rootCause?.anomalySummary || 'N/A'}`,
    ...(assessment ? [
      '',
      `Remediation assessment: ${assessment.changeRequired ? 'CHANGE REQUEST REQUIRED' : 'No production change required'}`,
      `  ${assessment.reason}`,
      ...(assessment.proposedActions.length ? ['  Proposed actions:', ...assessment.proposedActions.map((a) => `    - ${a}`)] : []),
    ] : []),
    '',
    'Raised automatically by AIOps DevOps Copilot — Alert Correlation Engine.',
  ].join('\n');
}

async function snowConfig(userId) {
  const cfg = await getIntegrationConfig(userId, 'snow');
  if (!cfg) throw new Error('ServiceNow is not connected. Add it in Settings → Integrations.');
  return cfg;
}

/**
 * Create a ServiceNow incident for a correlated alert group.
 * Idempotent: returns the existing incident unless `force` is set.
 */
async function createIncidentForCorrelation(userId, incidentDoc, { force = false } = {}) {
  if (incidentDoc.snowIncident?.number && !force) {
    return { alreadyExisted: true, incident: incidentDoc.snowIncident, assessment: assessRemediation(incidentDoc) };
  }

  const cfg = await snowConfig(userId);
  const assessment = assessRemediation(incidentDoc);
  const sev = SEV_MAP[topSeverity(incidentDoc)] || 3;

  const short = `[Correlated] ${incidentDoc.rootCause?.pod || 'Unknown'}: ${(incidentDoc.alertNames || []).slice(0, 3).join(', ')}`.slice(0, 160);

  const result = await connectors.run('snow', 'create_incident', cfg, {
    short_description: short,
    description: buildDescription(incidentDoc, assessment),
    urgency: String(sev),
    assignment_group: cfg.assignment_group || undefined,
  });

  incidentDoc.snowIncident = {
    number: result.number,
    sysId: result.sys_id,
    url: result.url,
    state: 'new',
    createdAt: new Date(),
  };
  await incidentDoc.save();

  console.log(`[Orchestrator] Incident ${result.number} created for correlation ${incidentDoc._id} (change required: ${assessment.changeRequired})`);
  return { alreadyExisted: false, incident: incidentDoc.snowIncident, assessment };
}

/**
 * Raise a change request for a remediation on a correlated incident.
 * `plan` / `reason` let the agent supply its own judgement; otherwise the
 * deterministic assessment is used.
 */
async function raiseChangeRequest(userId, incidentDoc, { plan, reason, riskLevel, force = false } = {}) {
  if (incidentDoc.changeRequest?.number && !force) {
    return { alreadyExisted: true, changeRequest: incidentDoc.changeRequest };
  }

  const cfg = await snowConfig(userId);
  const assessment = assessRemediation(incidentDoc);
  const finalReason = reason || assessment.reason;
  const finalPlan = plan || (assessment.proposedActions.join('\n- ') || 'Investigate and apply the appropriate fix.');
  const finalRisk = riskLevel || assessment.riskLevel || '3';

  const description = [
    `Linked incident: ${incidentDoc.snowIncident?.number || '(not yet created)'}`,
    `Root cause: ${incidentDoc.rootCause?.pod || 'Unknown'} (ns/${incidentDoc.rootCause?.namespace || 'unknown'})`,
    `Affected pods: ${(incidentDoc.pods || []).join(', ') || 'n/a'}`,
    `Correlated alerts: ${(incidentDoc.alertNames || []).join(', ') || 'n/a'}`,
    '',
    'Why a change is required:',
    `  ${finalReason}`,
    '',
    'Planned remediation:',
    `- ${finalPlan}`,
    '',
    'Raised automatically by AIOps DevOps Copilot.',
  ].join('\n');

  const result = await connectors.run('snow', 'create_change_request', cfg, {
    short_description: `[Remediation] ${incidentDoc.rootCause?.pod || 'Correlated incident'}`.slice(0, 160),
    description,
    type: 'normal',
    risk: finalRisk,
  });

  incidentDoc.changeRequest = {
    number: result.number,
    sysId: result.sys_id,
    url: result.url,
    state: 'new',
    reason: finalReason,
    plan: finalPlan,
    riskLevel: finalRisk,
    createdAt: new Date(),
  };
  await incidentDoc.save();

  console.log(`[Orchestrator] Change request ${result.number} raised for correlation ${incidentDoc._id}`);
  return { alreadyExisted: false, changeRequest: incidentDoc.changeRequest };
}

/**
 * Full path for one correlated incident: raise the ServiceNow incident, and if
 * remediation mutates production, raise the change request too.
 */
async function processCorrelation(userId, incidentDoc, { raiseChange = true } = {}) {
  const inc = await createIncidentForCorrelation(userId, incidentDoc);
  let change = null;
  if (raiseChange && inc.assessment?.changeRequired) {
    change = await raiseChangeRequest(userId, incidentDoc);
  }
  return {
    correlationId: String(incidentDoc._id),
    incident: inc.incident,
    incidentAlreadyExisted: inc.alreadyExisted,
    assessment: inc.assessment,
    changeRequest: change?.changeRequest || null,
  };
}

/** Auto-process newly-stored correlations above a severity threshold. */
async function autoProcess(userId, { minAlerts = 2, onlyCritical = false } = {}) {
  const docs = await CorrelatedIncident.find({
    userId, status: 'active', 'snowIncident.number': { $exists: false },
  }).sort({ lastSeenAt: -1 }).limit(20);

  const out = [];
  for (const doc of docs) {
    if ((doc.alertCount || 0) < minAlerts) continue;
    if (onlyCritical && (SEV_MAP[topSeverity(doc)] || 5) > 2) continue;
    try {
      out.push(await processCorrelation(userId, doc));
    } catch (e) {
      console.error(`[Orchestrator] Failed for ${doc._id}:`, e.message);
      out.push({ correlationId: String(doc._id), error: e.message });
    }
  }
  return out;
}

module.exports = {
  assessRemediation, buildDescription,
  createIncidentForCorrelation, raiseChangeRequest, processCorrelation, autoProcess,
};

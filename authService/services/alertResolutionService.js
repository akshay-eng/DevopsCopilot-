/**
 * Agentic alert resolution.
 *
 * "Resolve" used to mean one thing: flip `status` to resolved in Mongo. Nothing
 * was investigated, nothing was fixed, and the ticket stayed open. This runs the
 * Pi agent against the alert instead, and only then records the outcome.
 *
 * The agent's own run streams to the Agent Threads page (that is where approvals
 * are answered). Here we consume the same stream to capture the transcript, then
 * do the bookkeeping the agent should not be trusted to do itself:
 *
 *   1. store the resolution summary on the alert,
 *   2. write/refresh the runbook in SOPs & Reports,
 *   3. resolve the linked ServiceNow incident,
 *   4. mark the alert resolved — last, and ONLY if the agent actually fixed it.
 *
 * Step 4 is deliberately conditional. Marking an alert resolved when nothing was
 * fixed is how a monitoring system starts lying to the people who depend on it.
 */

const Alert = require('../models/Alert');
const CorrelatedIncident = require('../models/CorrelatedIncident');
const AlertResolution = require('../models/AlertResolution');
const { writeRunbook } = require('./sopService');
const { resolveSnowIncident } = require('./incidentOrchestrator');

const AGENT_URL = process.env.PI_AGENT_URL || process.env.DEEP_AGENT_URL || 'http://localhost:8110';
const RUN_TIMEOUT_MS = Number(process.env.RESOLVE_TIMEOUT_MS || 900000);

/**
 * Drive the agent's SSE stream to completion, collecting what it said and did.
 */
async function runAgentResolve({ alert, clusterId, authToken, userId, modelProvider }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);

  try {
    const res = await fetch(`${AGENT_URL}/api/agent/resolve-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert, clusterId, authToken, userId, modelProvider }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Agent returned ${res.status}`);

    let text = '';
    let threadId = null;
    const toolCalls = [];
    let error = null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; keep the partial tail.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line.slice(5).trim()); } catch { continue; }

        if (evt.type === 'token') text += evt.content || '';
        else if (evt.type === 'tool_start') toolCalls.push({ tool: evt.tool, input: evt.input });
        else if (evt.type === 'done') threadId = evt.threadId || threadId;
        else if (evt.type === 'error') error = evt.error;
      }
    }

    return { text, threadId, toolCalls, error };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull the agent's own "RESOLUTION SUMMARY" section out of its answer.
 *
 * The heading usually arrives wrapped in markdown (`## **RESOLUTION SUMMARY**`),
 * so the match has to tolerate the decoration on both sides — otherwise the
 * leftover `**` leads the summary shown in the UI and written to ServiceNow.
 */
function extractSummary(text) {
  if (!text) return '';
  const m = text.match(/[<#]*\s*\**\s*RESOLUTION SUMMARY\s*\**\s*>?\s*:?\s*\n?([\s\S]*)$/i);
  let body = (m ? m[1] : text).trim();
  // The model sometimes closes the section like an XML tag, and leaves a line
  // of leftover punctuation where the heading was. Drop whole lines that are
  // only punctuation — stripping characters instead would eat the opening `**`
  // of the first bold heading and leave the markdown unbalanced.
  body = body.replace(/<\/\s*RESOLUTION SUMMARY\s*>\s*$/i, '').trim();
  body = body.replace(/^(?:[\s>#:_*-]*\n)+/, '').trim();
  return body.length > 4000 ? `${body.slice(0, 4000)}…` : body;
}

/**
 * Did the agent actually change anything?
 *
 * Read from the thread's recorded actions rather than from the prose — a model
 * saying "I restarted the deployment" is not evidence that it did.
 */
async function fetchThreadOutcome(threadId) {
  if (!threadId) return { actions: [], approvals: [] };
  try {
    const res = await fetch(`${AGENT_URL}/api/threads/${threadId}`);
    if (!res.ok) return { actions: [], approvals: [] };
    const data = await res.json();
    return {
      actions: data?.thread?.actions || [],
      approvals: data?.thread?.approvals || [],
    };
  } catch {
    return { actions: [], approvals: [] };
  }
}

/**
 * @param alertDoc   the Alert being resolved
 * @param opts.force mark resolved even with no applied action (operator override)
 */
async function resolveAlertWithAgent(alertDoc, { userId, authToken, clusterId, modelProvider, force = false } = {}) {
  const alert = {
    alertname: alertDoc.alertname,
    severity: alertDoc.severity,
    namespace: alertDoc.namespace,
    pod: alertDoc.pod,
    node: alertDoc.node,
    message: alertDoc.message,
    startsAt: alertDoc.startsAt,
  };

  const record = await AlertResolution.create({
    userId,
    alertId: alertDoc._id?.toString(),
    alertname: alert.alertname,
    namespace: alert.namespace,
    pod: alert.pod,
    clusterId: clusterId || alertDoc.clusterId,
    status: 'running',
    startedAt: new Date(),
  });

  let run;
  try {
    run = await runAgentResolve({ alert, clusterId: clusterId || alertDoc.clusterId, authToken, userId, modelProvider });
  } catch (e) {
    record.status = 'failed';
    record.error = e.name === 'AbortError'
      ? 'The agent did not finish within the time limit.'
      : e.message;
    record.endedAt = new Date();
    await record.save();
    throw new Error(record.error);
  }

  const { actions, approvals } = await fetchThreadOutcome(run.threadId);
  const applied = actions.filter((a) => a.status === 'applied');
  const refused = actions.filter((a) => a.status === 'refused');
  const summary = extractSummary(run.text);

  record.threadId = run.threadId;
  record.summary = summary;
  record.transcript = (run.text || '').slice(0, 20000);
  record.actions = actions;
  record.approvals = approvals;
  record.toolsUsed = [...new Set(run.toolCalls.map((t) => t.tool))];
  record.error = run.error || '';
  record.endedAt = new Date();

  // "Fixed" means a change was applied, or the agent found nothing to fix and
  // said so. A refusal is explicitly NOT a fix.
  const nothingToDo = !applied.length && !refused.length && !run.error
    && /no action|not required|no remediation|benign|informational|already (healthy|resolved|recovered)/i.test(summary);

  record.outcome = run.error ? 'failed'
    : applied.length ? 'remediated'
    : refused.length ? 'awaiting-human'
    : nothingToDo ? 'no-action-needed'
    : 'investigated';
  record.status = run.error ? 'failed' : 'completed';

  const shouldClose = force || record.outcome === 'remediated' || record.outcome === 'no-action-needed';

  // --- bookkeeping -------------------------------------------------------
  const followUps = [];

  if (shouldClose) {
    const endsAt = new Date().toISOString();
    const filter = {
      userId, alertname: alertDoc.alertname, status: 'firing',
      ...(alertDoc.clusterId ? { clusterId: alertDoc.clusterId } : {}),
      ...(alertDoc.namespace ? { namespace: alertDoc.namespace } : {}),
    };
    const upd = await Alert.updateMany(filter, {
      $set: {
        status: 'resolved', endsAt, receivedAt: new Date().toISOString(),
        resolution: {
          summary, outcome: record.outcome, threadId: run.threadId,
          resolvedBy: 'pi-agent', resolvedAt: new Date(),
          actions: applied.map((a) => ({ action: a.action, detail: a.detail })),
        },
      },
    });
    followUps.push(`${upd.modifiedCount} alert occurrence(s) marked resolved`);
  }

  // SOP: capture what worked so the next person does not start from zero.
  try {
    const sop = await writeRunbook({
      alertname: alert.alertname, namespace: alert.namespace,
      summary, actions: applied, outcome: record.outcome,
      transcript: run.text, userId,
    });
    if (sop) {
      record.sopPath = sop.virtualPath;
      followUps.push(`runbook ${sop.updated ? 'updated' : 'created'}: ${sop.virtualPath}`);
    }
  } catch (e) {
    console.warn('[RESOLVE] SOP write failed:', e.message);
  }

  // Close the linked ServiceNow incident, if correlation raised one.
  if (shouldClose) {
    try {
      const inc = await CorrelatedIncident.findOne({
        userId, alertNames: alert.alertname, status: { $in: ['active', 'acknowledged'] },
      }).sort({ lastSeenAt: -1 });

      if (inc?.snowIncident?.number) {
        const snow = await resolveSnowIncident(userId, inc, {
          notes: summary || 'Resolved by the AIOps agent.',
        });
        if (snow?.ok) {
          record.snowIncident = inc.snowIncident.number;
          followUps.push(`ServiceNow ${inc.snowIncident.number} resolved`);
        } else if (snow?.error) {
          followUps.push(`ServiceNow not updated: ${snow.error}`);
        }
      }
      if (inc) {
        inc.status = 'resolved';
        inc.resolvedAt = new Date();
        await inc.save();
        record.correlationId = inc._id.toString();
      }
    } catch (e) {
      console.warn('[RESOLVE] incident close failed:', e.message);
    }
  }

  record.followUps = followUps;
  await record.save();

  return record.toObject();
}

module.exports = { resolveAlertWithAgent, extractSummary };

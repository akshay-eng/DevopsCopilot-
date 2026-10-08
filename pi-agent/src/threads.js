/**
 * In-memory registry of agent runs ("threads").
 *
 * Every prompt the agent handles becomes a thread we can observe live: which
 * tools it called, how long each took, whether it is still running. This backs
 * the Pi Threads page so operators can watch the agent work.
 */

import crypto from 'crypto';

const MAX_THREADS = 200;
const threads = new Map(); // id -> thread

function prune() {
  if (threads.size <= MAX_THREADS) return;
  const finished = [...threads.values()]
    .filter((t) => t.status !== 'running' && t.status !== 'awaiting-approval')
    .sort((a, b) => new Date(a.endedAt || a.startedAt) - new Date(b.endedAt || b.startedAt));
  for (const t of finished.slice(0, threads.size - MAX_THREADS)) threads.delete(t.id);
}

export function startThread({ prompt, userId, model, clusterId, conversationId, kind = 'chat' }) {
  const id = crypto.randomUUID();
  const t = {
    id,
    kind,                       // chat | ops | alert-generate
    title: String(prompt || '').slice(0, 120),
    prompt: String(prompt || '').slice(0, 2000),
    userId: userId || null,
    model: model || null,
    clusterId: clusterId || null,
    conversationId: conversationId || null,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: null,
    toolCalls: [],
    steps: 0,
    outputChars: 0,
    approvals: [],
    pendingApproval: null,
    actions: [],
    error: null,
  };
  threads.set(id, t);
  prune();
  return t;
}

export function toolStart(id, name, input) {
  const t = threads.get(id);
  if (!t) return;
  t.toolCalls.push({ tool: name, input: truncate(input), status: 'running', startedAt: Date.now() });
  t.steps += 1;
  t.currentTool = name;
}

export function toolEnd(id, name, output) {
  const t = threads.get(id);
  if (!t) return;
  const call = [...t.toolCalls].reverse().find((c) => c.tool === name && c.status === 'running');
  if (call) {
    call.status = 'done';
    call.durationMs = Date.now() - call.startedAt;
    call.outputPreview = truncate(output, 400);
  }
  if (t.currentTool === name) t.currentTool = null;
}

export function addOutput(id, chars) {
  const t = threads.get(id);
  if (t) t.outputChars += chars;
}

export function endThread(id, { error } = {}) {
  const t = threads.get(id);
  if (!t) return;
  t.status = error ? 'error' : 'completed';
  t.error = error || null;
  t.endedAt = new Date().toISOString();
  t.durationMs = new Date(t.endedAt) - new Date(t.startedAt);
  t.currentTool = null;
  // any tool still marked running was interrupted
  t.toolCalls.forEach((c) => { if (c.status === 'running') { c.status = error ? 'error' : 'interrupted'; } });
}

function truncate(v, n = 200) {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// ---------------------------------------------------------------------------
// Human approval
//
// A mutating action pauses the run here and waits for a person. The pending
// request is published on the thread so the Agent Threads page can show it and
// answer it; the agent's own tool call simply awaits the promise.
//
// A request that nobody answers must not pin a run open forever, so each one
// expires — and expiry is a REFUSAL, never a silent go-ahead.
// ---------------------------------------------------------------------------

const APPROVAL_TIMEOUT_MS = Number(process.env.AGENT_APPROVAL_TIMEOUT_MS || 900000);

export function requestApproval(id, { action, summary: text, risk, reversible, params }) {
  const t = threads.get(id);
  if (!t) return Promise.resolve({ approved: false, reason: 'Thread is no longer active.' });

  const approval = {
    id: crypto.randomUUID(),
    action,
    summary: text,
    risk: risk || 'medium',
    reversible: reversible !== false,
    params: params || {},
    status: 'pending',
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + APPROVAL_TIMEOUT_MS).toISOString(),
  };

  t.approvals = t.approvals || [];
  t.approvals.push(approval);
  t.pendingApproval = approval;
  t.status = 'awaiting-approval';

  return new Promise((resolve) => {
    const settle = (decision) => {
      if (approval.status !== 'pending') return;
      Object.assign(approval, decision, { decidedAt: new Date().toISOString() });
      if (t.pendingApproval?.id === approval.id) t.pendingApproval = null;
      if (t.status === 'awaiting-approval') t.status = 'running';
      clearTimeout(timer);
      pending.delete(approval.id);
      resolve({ approved: decision.status === 'approved', reason: decision.reason });
    };

    const timer = setTimeout(
      () => settle({ status: 'expired', reason: `No response within ${Math.round(APPROVAL_TIMEOUT_MS / 60000)} minutes — treated as refused.` }),
      APPROVAL_TIMEOUT_MS,
    );
    timer.unref?.();

    pending.set(approval.id, { settle, threadId: id });
  });
}

const pending = new Map(); // approvalId -> {settle, threadId}

/** Answer a pending approval. Returns false if it is unknown or already decided. */
export function decideApproval(approvalId, { approved, by, reason }) {
  const entry = pending.get(approvalId);
  if (!entry) return false;
  entry.settle({
    status: approved ? 'approved' : 'rejected',
    decidedBy: by || 'operator',
    reason: reason || (approved ? 'Approved by operator.' : 'Rejected by operator.'),
  });
  return true;
}

/** Every approval still waiting on a person, for the UI to surface. */
export function listPendingApprovals({ userId } = {}) {
  const out = [];
  for (const t of threads.values()) {
    if (userId && t.userId && t.userId !== userId) continue;
    for (const a of t.approvals || []) {
      if (a.status === 'pending') out.push({ ...a, threadId: t.id, threadTitle: t.title });
    }
  }
  return out;
}

/** Record a remediation the agent carried out, for the resolution summary. */
export function recordAction(id, entry) {
  const t = threads.get(id);
  if (!t) return;
  t.actions = t.actions || [];
  t.actions.push({ ...entry, at: new Date().toISOString() });
}

export function listThreads({ userId, status, limit = 50 } = {}) {
  let all = [...threads.values()];
  if (userId) all = all.filter((t) => !t.userId || t.userId === userId);
  if (status) all = all.filter((t) => t.status === status);
  all.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  return all.slice(0, limit).map(summary);
}

export function getThread(id) {
  const t = threads.get(id);
  return t ? { ...t } : null;
}

function summary(t) {
  return {
    id: t.id, kind: t.kind, title: t.title, status: t.status,
    model: t.model, clusterId: t.clusterId, conversationId: t.conversationId,
    startedAt: t.startedAt, endedAt: t.endedAt, durationMs: t.durationMs,
    steps: t.steps, outputChars: t.outputChars, currentTool: t.currentTool || null,
    toolCalls: t.toolCalls.map((c) => ({ tool: c.tool, status: c.status, durationMs: c.durationMs })),
    pendingApproval: t.pendingApproval || null,
    approvals: t.approvals || [],
    actions: t.actions || [],
    error: t.error,
  };
}

export function stats() {
  const all = [...threads.values()];
  return {
    total: all.length,
    running: all.filter((t) => t.status === 'running').length,
    completed: all.filter((t) => t.status === 'completed').length,
    errored: all.filter((t) => t.status === 'error').length,
    toolCalls: all.reduce((s, t) => s + t.toolCalls.length, 0),
  };
}

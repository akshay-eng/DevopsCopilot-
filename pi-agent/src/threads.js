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
    .filter((t) => t.status !== 'running')
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

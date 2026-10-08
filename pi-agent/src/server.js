/**
 * AIOps Pi Agent — full-swap replacement for the LangGraph deep-agent.
 *
 * Exposes the same HTTP + SSE contract the platform already speaks, so it is a
 * drop-in: point authService's DEEP_AGENT_URL at this service. Built on the Pi
 * toolkit (@mariozechner/pi-ai + pi-agent-core) with modular BYO models.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { streamSimple } from '@mariozechner/pi-ai';
import { Agent } from '@mariozechner/pi-agent-core';

import { resolveModel, publicModels, loadRegistry, saveRegistry } from './models.js';
import { buildTools, buildIntegrationTools } from './tools.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import * as store from './conversationStore.js';
import * as threads from './threads.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PLATFORM_API_URL = process.env.PLATFORM_API_URL || 'http://localhost:5001';
const PORT = process.env.PORT || 8100;
// How many prior turns to replay into a follow-up (keeps context without
// blowing the window on long sessions).
const MAX_HISTORY_MESSAGES = parseInt(process.env.MAX_HISTORY_MESSAGES || '20', 10);

const sse = (res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  return (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
};

/**
 * Reasoning models sometimes leak the tail of their <think> block into the
 * TEXT stream, which shows up as a stray "</think>" plus a duplicated answer.
 * We hold back the opening of the text stream briefly: if a closing think tag
 * turns up, everything before it was thinking and gets dropped; otherwise the
 * buffer is flushed untouched. Bounded so latency stays negligible.
 */
const THINK_CLOSE = /<\/think>/i;
const OPEN_BUFFER_LIMIT = 600;

function makeTextSanitizer() {
  let buffer = '';
  let settled = false;
  return {
    push(delta) {
      if (settled) return delta.replace(/<\/?think>/gi, '');
      buffer += delta;
      const m = buffer.match(THINK_CLOSE);
      if (m) {
        settled = true;
        const out = buffer.slice(m.index + m[0].length).replace(/<\/?think>/gi, '');
        buffer = '';
        return out.replace(/^\s+/, '');
      }
      if (buffer.length >= OPEN_BUFFER_LIMIT) {
        settled = true;
        const out = buffer.replace(/<\/?think>/gi, '');
        buffer = '';
        return out;
      }
      return ''; // still deciding
    },
    flush() {
      if (settled || !buffer) return '';
      settled = true;
      const out = buffer.replace(/<\/?think>/gi, '');
      buffer = '';
      return out;
    },
  };
}

const asText = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((c) => (c?.text ?? (typeof c === 'string' ? c : JSON.stringify(c)))).join('\n');
  if (v.content) return asText(v.content);
  return JSON.stringify(v);
};

/**
 * Map a pi agent event onto the frontend SSE contract. Field names are handled
 * defensively so small pi version differences don't break streaming.
 */
function mapAgentEvent(event, send, acc, threadId) {
  switch (event.type) {
    case 'message_update': {
      const ae = event.assistantMessageEvent || event.event || {};
      const t = ae.type || '';
      if (t === 'text_delta' || t === 'text') {
        const raw = ae.delta ?? ae.text ?? '';
        const delta = acc.sanitizer ? acc.sanitizer.push(raw) : raw;
        if (delta) {
          acc.text += delta;
          send({ type: 'token', content: delta });
          threads.addOutput(threadId, delta.length);
        }
      } else if (t.includes('thinking') || t.includes('reasoning')) {
        const delta = ae.delta ?? ae.text ?? '';
        if (delta) send({ type: 'reasoning', content: delta });
      }
      break;
    }
    case 'tool_execution_start': {
      const name = event.toolName || event.name;
      const input = event.args ?? event.arguments ?? {};
      send({ type: 'tool_start', tool: name, input });
      threads.toolStart(threadId, name, input);
      break;
    }
    case 'tool_execution_end': {
      const name = event.toolName || event.name;
      const output = asText(event.result);
      send({ type: 'tool_end', tool: name, output });
      threads.toolEnd(threadId, name, output);
      break;
    }
    default:
      break;
  }
}

async function runAgent({ message, modelProvider, clusterId, authToken, userId, conversationId, extraSystem, kind = 'chat' }, res) {
  const send = sse(res);
  const convId = conversationId || store.newId();
  const acc = { text: '', sanitizer: makeTextSanitizer() };
  const thread = threads.startThread({ prompt: message, userId, model: modelProvider, clusterId, conversationId: convId, kind });

  try {
    const { cfg, model } = resolveModel(modelProvider);
    // Platform tools + one tool per action of every connected integration.
    const platformTools = buildTools({ platformUrl: PLATFORM_API_URL, authToken, clusterId, threadId: thread.id });
    const integrationTools = await buildIntegrationTools({ platformUrl: PLATFORM_API_URL, authToken });
    const tools = [...platformTools, ...integrationTools];
    if (integrationTools.length) {
      console.log(`[pi-agent] ${integrationTools.length} integration tools available: ${integrationTools.map((t) => t.name).join(', ')}`);
    }

    // Seed the transcript with prior turns, otherwise every message is treated
    // as a brand-new conversation and follow-ups lose all context.
    // Shapes matter: a UserMessage may carry a plain string, but an
    // AssistantMessage MUST have content as a block array plus api/provider/
    // model — a malformed one makes the turn silently produce nothing.
    const zeroUsage = {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const history = store.getMessages(convId)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && String(m.content || '').trim())
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => (m.role === 'user'
        ? { role: 'user', content: String(m.content), timestamp: Date.now() }
        : {
            role: 'assistant',
            content: [{ type: 'text', text: String(m.content) }],
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: zeroUsage,
            stopReason: 'stop',
            timestamp: Date.now(),
          }));

    if (history.length) {
      console.log(`[pi-agent] conversation ${convId}: replaying ${history.length} prior message(s)`);
    }

    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT + (extraSystem ? `\n\n${extraSystem}` : ''),
        model,
        tools,
        thinkingLevel: cfg.thinkingLevel || 'off',
        messages: history,
      },
      streamFn: streamSimple,
    });

    agent.subscribe((event) => {
      try { mapAgentEvent(event, send, acc, thread.id); } catch (e) { /* keep streaming */ }
    });

    store.appendMessage(convId, { role: 'user', content: message, userId });
    await agent.prompt(message);

    // Emit anything the sanitizer was still holding back.
    const tail = acc.sanitizer.flush();
    if (tail) { acc.text += tail; send({ type: 'token', content: tail }); }

    store.appendMessage(convId, { role: 'assistant', content: acc.text, userId, model: cfg.id });

    threads.endThread(thread.id);
    send({ type: 'done', conversationId: convId, threadId: thread.id });
  } catch (error) {
    console.error('[pi-agent] run error:', error);
    threads.endThread(thread.id, { error: error.message || String(error) });
    send({ type: 'error', error: error.message || String(error) });
  } finally {
    res.end();
  }
}

// ---- Thread observability -------------------------------------------------
app.get('/api/threads', (req, res) => {
  res.json({
    success: true,
    stats: threads.stats(),
    threads: threads.listThreads({ userId: req.query.userId, status: req.query.status, limit: Number(req.query.limit) || 50 }),
  });
});

app.get('/api/threads/:id', (req, res) => {
  const t = threads.getThread(req.params.id);
  if (!t) return res.status(404).json({ success: false, error: 'Thread not found' });
  res.json({ success: true, thread: t });
});

// ---- Human approval ------------------------------------------------------
// A mutating tool parks here until a person answers. Both endpoints are plain
// JSON (not SSE) so the Agent Threads page can poll and answer them directly.

app.get('/api/approvals', (req, res) => {
  res.json({ success: true, approvals: threads.listPendingApprovals({ userId: req.query.userId }) });
});

app.post('/api/approvals/:id', (req, res) => {
  const { approved, by, reason } = req.body || {};
  if (typeof approved !== 'boolean') {
    return res.status(400).json({ success: false, error: 'approved must be true or false' });
  }
  const ok = threads.decideApproval(req.params.id, { approved, by, reason });
  if (!ok) {
    return res.status(404).json({ success: false, error: 'No pending approval with that id (it may have been answered or expired).' });
  }
  res.json({ success: true });
});

// ---- Alert resolution ----------------------------------------------------
// The agent investigates one alert and fixes it if it safely can. Mutating
// steps stop for approval; the run streams like any other so the Threads page
// shows the work as it happens.
app.post('/api/agent/resolve-alert', (req, res) => {
  const { alert } = req.body || {};
  if (!alert || !alert.alertname) {
    return res.status(400).json({ success: false, error: 'alert (with alertname) is required' });
  }

  const facts = [
    `Alert: ${alert.alertname}`,
    alert.severity ? `Severity: ${alert.severity}` : null,
    alert.namespace ? `Namespace: ${alert.namespace}` : null,
    alert.pod && alert.pod !== 'N/A' ? `Pod: ${alert.pod}` : null,
    alert.node ? `Node: ${alert.node}` : null,
    alert.message ? `Message: ${alert.message}` : null,
    alert.startsAt ? `Started: ${alert.startsAt}` : null,
  ].filter(Boolean).join('\n');

  runAgent({
    ...req.body,
    kind: 'resolve',
    message: `Resolve this alert.\n\n${facts}`,
    extraSystem: [
      'TASK: resolve the alert above on the live cluster.',
      '',
      'STEP 1 — FIND THE REAL OBJECT.',
      'The pod named on an alert is often the EXPORTER that reported it, not the thing that is broken.',
      'Read the alert description: it names the actual resource (e.g. "PVC data-redis-0 is stuck Pending"',
      'means investigate the PVC data-redis-0, NOT the kube-state-metrics pod that emitted the alert).',
      '',
      'STEP 2 — READ THE EVIDENCE BEFORE THEORISING.',
      'Call get_events for the namespace FIRST. Kubernetes states the reason verbatim there',
      '("no persistent volumes available for this claim", "Insufficient cpu", "0/3 nodes are available...").',
      'Then use list_resources with the right type for the symptom:',
      '  Pending pod on storage  -> pvc, then pv, then sc (is there a default StorageClass? a matching PV?)',
      '  Pending pod on scheduling -> nodes (taints, allocatable), then describe_resource on the pod',
      '  CrashLoop / not ready   -> get_pod_logs, then describe_resource',
      'Never attribute a cause you have not seen in events, logs or resource status.',
      '',
      'STEP 3 — FIX IT IF YOU SAFELY CAN.',
      'Use restart_workload, delete_pod or scale_workload. Each asks a human first; if they refuse,',
      'do not retry — say what a human should do by hand.',
      'Think about whether the action can even work: deleting a Pending pod does NOT fix an unbound PVC,',
      'because the replacement will be Pending for exactly the same reason. If no available action fixes',
      'the cause, say so instead of applying one that cannot help.',
      '',
      'STEP 4 — RECORD IT IN SERVICENOW.',
      'You have snow_search_records, snow_update_ticket, snow_create_incident and snow_create_change_request.',
      'Search for an existing incident for this alert before creating anything. If you fixed it, update the',
      'ticket with what you did. If it needs a human, update it with your findings so they do not start from zero.',
      '',
      'STEP 5 — VERIFY. Re-read the object state and say whether it actually recovered.',
      '',
      'Rules:',
      '- Never claim you fixed something you did not verify.',
      '- Do not blame unrelated firing alerts for this one. etcd or control-plane alerts firing elsewhere are',
      '  NOT the cause of a storage or scheduling failure unless events say so.',
      '- If the cause is outside the cluster, say so and stop rather than restarting things hopefully.',
      '- Some alerts need no action (inhibitors, watchdogs, info). Say that plainly instead of inventing work.',
      '',
      'Finish with a section headed exactly "RESOLUTION SUMMARY" containing:',
      'What was wrong / What I did / Whether it is fixed / What to watch.',
      'Keep it under 200 words — it is shown directly in the alert details.',
    ].join('\n'),
  }, res);
});

// ---- Agent chat (drop-in for deep-agent) --------------------------------
app.post('/api/agent/chat', (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ success: false, error: 'Message is required' });
  runAgent(req.body, res);
});

// Enterprise/ops variant — same runtime, full tool access.
app.post('/api/agent/ops', (req, res) => {
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ success: false, error: 'Message is required' });
  runAgent(req.body, res);
});

// Alert-rule generation — same agent with a focused instruction.
app.post('/api/agent/alert-generate', (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || !prompt.trim()) return res.status(400).json({ success: false, error: 'Prompt is required' });
  runAgent({
    ...req.body,
    message: prompt,
    extraSystem: 'Task: verify the relevant Prometheus metrics with tools, then output a single valid Prometheus alerting rule (YAML) with sensible thresholds. Explain the threshold briefly.',
  }, res);
});

// ---- Conversations -------------------------------------------------------
app.get('/api/agent/conversations', (req, res) => {
  res.json({ conversations: store.listConversations(req.query.userId, Number(req.query.limit) || 50) });
});
app.get('/api/agent/conversations/:id', (req, res) => {
  res.json({ messages: store.getMessages(req.params.id) });
});
app.delete('/api/agent/conversations/:id', (req, res) => {
  res.json({ success: store.deleteConversation(req.params.id) });
});

// ---- Modular model registry ---------------------------------------------
app.get('/api/models', (req, res) => res.json(publicModels()));

// Add or update a model at runtime (BYO on-prem/cloud) — persisted to models.json.
app.post('/api/models', (req, res) => {
  const m = req.body || {};
  if (!m.id) return res.status(400).json({ success: false, error: 'id is required' });
  const reg = loadRegistry();
  const models = reg.models.filter((x) => x.id !== m.id);
  models.push(m);
  const next = { default: req.body.makeDefault ? m.id : reg.defaultId, models };
  saveRegistry(next);
  res.json({ success: true, ...publicModels() });
});

app.get('/health', (req, res) => res.json({ status: 'ok', runtime: 'pi-agent', models: publicModels().models.length }));

app.listen(PORT, () => {
  console.log(`🤖 AIOps Pi Agent listening on :${PORT}  (platform: ${PLATFORM_API_URL})`);
  const pm = publicModels();
  console.log(`   Models: ${pm.models.map((m) => `${m.id}${m.id === pm.default ? '*' : ''}`).join(', ')}`);
});

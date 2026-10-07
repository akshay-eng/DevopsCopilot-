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
    const platformTools = buildTools({ platformUrl: PLATFORM_API_URL, authToken, clusterId });
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

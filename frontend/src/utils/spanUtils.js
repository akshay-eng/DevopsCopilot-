/**
 * Span processing utilities for the waterfall trace detail view.
 * Works with raw event data from the /sessions/:id/events endpoint.
 *
 * Event shape from backend:
 *   id, session_id, event_type (SpanName), parent_span_id,
 *   init_timestamp, end_timestamp, duration (ns), status_code,
 *   params (SpanAttributes map), resource_attributes
 */

// ── Color palette per span category ─────────────────────────────────────────
export const SPAN_COLORS = {
  session:  { bg: '#6B7280', light: '#9CA3AF', dark: '#4B5563', text: '#F9FAFB' },
  agent:    { bg: '#10B981', light: '#34D399', dark: '#059669', text: '#F0FDF4' },
  llm:      { bg: '#3B82F6', light: '#60A5FA', dark: '#2563EB', text: '#EFF6FF' },
  tool:     { bg: '#F59E0B', light: '#FBBF24', dark: '#D97706', text: '#FFFBEB' },
  workflow: { bg: '#8B5CF6', light: '#A78BFA', dark: '#7C3AED', text: '#F5F3FF' },
  unknown:  { bg: '#6B7280', light: '#9CA3AF', dark: '#4B5563', text: '#F9FAFB' },
};

// ── Classify a span event into a category ───────────────────────────────────
export function classifySpan(event) {
  const name = (event.event_type || '').toLowerCase();
  if (name === 'default.session' || name.endsWith('.session')) return 'session';
  if (name.includes('openai') || name.includes('chat.completion') || name.includes('llm')) return 'llm';
  if (name.startsWith('tool_call.') || name.startsWith('tool.')) return 'tool';
  if (name.includes('workflow.execute') || name === 'workflow') return 'workflow';
  if (name.includes('node.execute') || name.includes('agent') || name.includes('lgraph')) return 'agent';
  if (name.includes('langgraph') || name.includes('graph')) return 'workflow';
  // Fallback heuristics
  const params = event.params || {};
  if (params['gen_ai.request.model']) return 'llm';
  if (params['tool.name']) return 'tool';
  return 'unknown';
}

// ── Extract indexed attributes like gen_ai.prompt.0.content ─────────────────
export function extractIndexedAttributes(attrs, prefix, suffix) {
  const results = [];
  for (let i = 0; i < 20; i++) {
    const key = `${prefix}.${i}.${suffix}`;
    if (attrs[key] !== undefined && attrs[key] !== '') {
      results.push({ index: i, value: attrs[key] });
    } else {
      break;
    }
  }
  return results;
}

// ── Extract meaningful details from a span's params (SpanAttributes) ────────
export function extractSpanDetails(event) {
  const params = event.params || {};
  const details = {
    model: params['gen_ai.request.model'] || null,
    promptTokens: parseFloat(params['gen_ai.usage.prompt_tokens']) || 0,
    completionTokens: parseFloat(params['gen_ai.usage.completion_tokens']) || 0,
    promptCost: parseFloat(params['gen_ai.usage.prompt_cost']) || 0,
    completionCost: parseFloat(params['gen_ai.usage.completion_cost']) || 0,
    totalCost: 0,
    totalTokens: 0,
    prompts: [],
    completions: [],
    toolName: null,
    toolArgs: null,
    toolResult: null,
    endState: params['agentops.session.end_state'] || null,
    tags: null,
  };

  details.totalCost = details.promptCost + details.completionCost;
  details.totalTokens = details.promptTokens + details.completionTokens;

  // Extract prompts (gen_ai.prompt.N.content / gen_ai.prompt.N.role)
  const promptContents = extractIndexedAttributes(params, 'gen_ai.prompt', 'content');
  const promptRoles = extractIndexedAttributes(params, 'gen_ai.prompt', 'role');
  details.prompts = promptContents.map((p, idx) => ({
    role: promptRoles[idx]?.value || 'user',
    content: p.value,
  }));

  // Extract completions
  const completionContents = extractIndexedAttributes(params, 'gen_ai.completion', 'content');
  const completionRoles = extractIndexedAttributes(params, 'gen_ai.completion', 'role');
  details.completions = completionContents.map((c, idx) => ({
    role: completionRoles[idx]?.value || 'assistant',
    content: c.value,
  }));

  // Tool info
  if (event.event_type?.startsWith('tool_call.')) {
    details.toolName = event.event_type.replace('tool_call.', '');
  }
  details.toolName = details.toolName || params['tool.name'] || null;
  details.toolArgs = params['tool.args'] || params['tool.parameters'] || null;
  details.toolResult = params['tool.result'] || params['tool.output'] || null;

  // Tags
  try {
    if (params['agentops.tags']) {
      details.tags = JSON.parse(params['agentops.tags']);
    }
  } catch (_) { /* ignore */ }

  return details;
}

// ── Get a user-friendly display name for a span ─────────────────────────────
export function getSpanDisplayName(event) {
  const category = classifySpan(event);
  const details = extractSpanDetails(event);

  if (category === 'session') {
    return event.event_type || 'Session';
  }
  if (category === 'llm' && details.model) {
    // Show first few words of prompt if available
    if (details.prompts.length > 0) {
      const lastUserPrompt = [...details.prompts].reverse().find(p => p.role === 'user');
      if (lastUserPrompt) {
        const short = lastUserPrompt.content.substring(0, 60);
        return short.length < lastUserPrompt.content.length ? short + '...' : short;
      }
    }
    return details.model;
  }
  if (category === 'tool' && details.toolName) {
    return details.toolName;
  }
  // Default: use the span name
  return event.event_type || 'Span';
}

// ── Build a parent-child tree from flat events, return DFS-flattened list ───
export function buildSpanTree(events) {
  if (!events || events.length === 0) return [];

  // Index events by their span id
  const byId = {};
  events.forEach(e => {
    byId[e.id] = { ...e, children: [], classification: classifySpan(e) };
  });

  const roots = [];

  events.forEach(e => {
    const node = byId[e.id];
    const parentId = e.parent_span_id;
    if (parentId && byId[parentId]) {
      byId[parentId].children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort children by init_timestamp
  const sortChildren = (node) => {
    node.children.sort((a, b) => new Date(a.init_timestamp) - new Date(b.init_timestamp));
    node.children.forEach(sortChildren);
  };
  roots.sort((a, b) => new Date(a.init_timestamp) - new Date(b.init_timestamp));
  roots.forEach(sortChildren);

  // DFS flatten
  const flat = [];
  const dfs = (node, depth) => {
    flat.push({ ...node, depth, childCount: node.children.length });
    node.children.forEach(child => dfs(child, depth + 1));
  };
  roots.forEach(root => dfs(root, 0));

  return flat;
}

// ── Calculate waterfall bar positions (percentage-based) ────────────────────
export function calculateWaterfallLayout(flatSpans) {
  if (!flatSpans || flatSpans.length === 0) return { spans: [], totalDurationMs: 0 };

  // Find global time range
  let globalStart = Infinity;
  let globalEnd = -Infinity;

  flatSpans.forEach(span => {
    const start = new Date(span.init_timestamp).getTime();
    const end = span.end_timestamp
      ? new Date(span.end_timestamp).getTime()
      : start + (span.duration ? span.duration / 1e6 : 0); // duration is in ns
    if (start < globalStart) globalStart = start;
    if (end > globalEnd) globalEnd = end;
  });

  const totalDurationMs = Math.max(globalEnd - globalStart, 1); // avoid division by zero

  const spans = flatSpans.map(span => {
    const start = new Date(span.init_timestamp).getTime();
    const end = span.end_timestamp
      ? new Date(span.end_timestamp).getTime()
      : start + (span.duration ? span.duration / 1e6 : 0);
    const durationMs = Math.max(end - start, 0);

    const leftPercent = ((start - globalStart) / totalDurationMs) * 100;
    const widthPercent = Math.max((durationMs / totalDurationMs) * 100, 0.5); // min 0.5% so it's visible

    return {
      ...span,
      startMs: start - globalStart,
      durationMs,
      leftPercent,
      widthPercent,
    };
  });

  return { spans, totalDurationMs };
}

// ── Generate nice tick marks for the timeline axis ──────────────────────────
export function generateTimelineTicks(totalDurationMs) {
  if (totalDurationMs <= 0) return [{ label: '0.00s', percent: 0 }];

  const totalSec = totalDurationMs / 1000;
  // Pick a nice interval
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60];
  let interval = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (totalSec / c <= 8) { // aim for max ~8 ticks
      interval = c;
      break;
    }
  }

  const ticks = [];
  for (let t = 0; t <= totalSec + interval * 0.01; t += interval) {
    const percent = (t / totalSec) * 100;
    if (percent > 100.5) break;
    ticks.push({
      label: t < 10 ? `${t.toFixed(2)}s` : `${t.toFixed(1)}s`,
      percent: Math.min(percent, 100),
    });
  }

  // Ensure we have the end tick
  const lastTick = ticks[ticks.length - 1];
  if (lastTick && lastTick.percent < 99) {
    ticks.push({
      label: totalSec < 10 ? `${totalSec.toFixed(2)}s` : `${totalSec.toFixed(1)}s`,
      percent: 100,
    });
  }

  return ticks;
}

// ── Format duration helpers ─────────────────────────────────────────────────
export function formatDurationMs(ms) {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatDurationNs(ns) {
  if (ns == null || isNaN(ns)) return '—';
  return formatDurationMs(ns / 1e6);
}

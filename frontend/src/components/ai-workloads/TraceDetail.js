import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import {
  ArrowLeft, Download, RefreshCw, X,
  Copy, Check, ThumbsUp, ThumbsDown,
  ChevronDown, ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/* ═══════════════════════════════════════════════════════════════════════════════
   COLORS — bright, clearly distinct per span type
   ═══════════════════════════════════════════════════════════════════════════════ */
const CLR = {
  session:  { dot: '#9CA3AF', bar: '#6B7280', light: '#9CA3AF' },
  agent:    { dot: '#A78BFA', bar: '#8B5CF6', light: '#A78BFA' },
  llm:      { dot: '#60A5FA', bar: '#3B82F6', light: '#60A5FA' },
  tool:     { dot: '#FBBF24', bar: '#F59E0B', light: '#FBBF24' },
  workflow: { dot: '#9CA3AF', bar: '#6B7280', light: '#9CA3AF' },
  unknown:  { dot: '#9CA3AF', bar: '#6B7280', light: '#9CA3AF' },
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CLASSIFY SPAN
   ═══════════════════════════════════════════════════════════════════════════════ */
function classify(evt) {
  const n = (evt.event_type || '').toLowerCase();
  if (n === 'default.session' || n.endsWith('.session')) return 'session';
  if (n.includes('openai') || n.includes('chat.completion')) return 'llm';
  if (n.startsWith('tool_call.') || n.startsWith('tool.')) return 'tool';
  if (n.includes('workflow.execute') || n === 'workflow') return 'workflow';
  if (n.includes('node.execute') || n.includes('agent')) return 'agent';
  if (n.includes('langgraph') || n.includes('graph')) return 'workflow';
  const p = evt.params || {};
  if (p['gen_ai.request.model']) return 'llm';
  if (p['tool.name']) return 'tool';
  return 'unknown';
}

/* ═══════════════════════════════════════════════════════════════════════════════
   DISPLAY NAME — content-based label for the waterfall rows
   ═══════════════════════════════════════════════════════════════════════════════ */
function getDisplayName(span) {
  const p = span.params || {};
  const cat = span.classification;

  if (cat === 'tool') {
    const name = span.event_type?.replace('tool_call.', '') || p['tool.name'] || 'tool';
    const args = p['tool.parameters'] || p['tool.args'];
    if (args) {
      try {
        const parsed = typeof args === 'string' ? JSON.parse(args) : args;
        const hint = Object.entries(parsed).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ');
        return `${name} (${hint})`;
      } catch { return name; }
    }
    return name;
  }

  if (cat === 'llm') {
    const prompt = p['gen_ai.prompt.0.content'];
    if (prompt) return prompt;
    const comp = p['gen_ai.completion.0.content'];
    if (comp) return comp;
    return span.event_type || 'LLM Call';
  }

  if (cat === 'agent') {
    const comp = p['gen_ai.completion.0.content'];
    if (comp) return comp;
    const prompt = p['gen_ai.prompt.0.content'];
    if (prompt) return prompt;
    return span.event_type || 'Agent';
  }

  if (cat === 'session') {
    try {
      const tags = p['agentops.tags'];
      if (tags) return JSON.parse(tags).join(', ');
    } catch {}
  }

  return span.event_type || 'Span';
}

/* ═══════════════════════════════════════════════════════════════════════════════
   EXTRACT SPAN DETAILS
   ═══════════════════════════════════════════════════════════════════════════════ */
function extractDetails(evt) {
  const p = evt.params || {};
  const d = {
    model: p['gen_ai.request.model'] || null,
    promptTokens: parseFloat(p['gen_ai.usage.prompt_tokens']) || 0,
    completionTokens: parseFloat(p['gen_ai.usage.completion_tokens']) || 0,
    promptCost: parseFloat(p['gen_ai.usage.prompt_cost']) || 0,
    completionCost: parseFloat(p['gen_ai.usage.completion_cost']) || 0,
    endState: p['agentops.session.end_state'] || null,
    messages: [],
    toolName: null,
    toolInput: null,
    toolOutput: null,
    tags: null,
  };
  d.totalCost = d.promptCost + d.completionCost;
  d.totalTokens = d.promptTokens + d.completionTokens;

  for (let i = 0; i < 20; i++) {
    const content = p[`gen_ai.prompt.${i}.content`];
    if (content === undefined || content === '') break;
    d.messages.push({ role: p[`gen_ai.prompt.${i}.role`] || 'user', content });
  }
  for (let i = 0; i < 20; i++) {
    const content = p[`gen_ai.completion.${i}.content`];
    if (content === undefined || content === '') break;
    d.messages.push({ role: p[`gen_ai.completion.${i}.role`] || 'assistant', content });
  }

  if (evt.event_type?.startsWith('tool_call.')) d.toolName = evt.event_type.replace('tool_call.', '');
  d.toolName = d.toolName || p['tool.name'] || null;
  d.toolInput = p['tool.args'] || p['tool.parameters'] || null;
  d.toolOutput = p['tool.result'] || p['tool.output'] || null;
  try { if (p['agentops.tags']) d.tags = JSON.parse(p['agentops.tags']); } catch {}

  return d;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BUILD SPAN TREE → FLAT LIST WITH DEPTH + LAYOUT
   ═══════════════════════════════════════════════════════════════════════════════ */
function buildTree(events) {
  if (!events?.length) return { flat: [], totalMs: 0, startMs: 0, roots: [] };

  const byId = {};
  events.forEach((e, i) => {
    byId[e.id] = { ...e, children: [], idx: i + 1, classification: classify(e) };
  });

  const roots = [];
  events.forEach(e => {
    const node = byId[e.id];
    if (e.parent_span_id && byId[e.parent_span_id]) {
      byId[e.parent_span_id].children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortT = arr => arr.sort((a, b) => new Date(a.init_timestamp) - new Date(b.init_timestamp));
  const sortAll = n => { sortT(n.children); n.children.forEach(sortAll); };
  sortT(roots);
  roots.forEach(sortAll);

  let gS = Infinity, gE = -Infinity;
  events.forEach(e => {
    const s = new Date(e.init_timestamp).getTime();
    const dur = parseFloat(e.duration) || 0;
    const end = e.end_timestamp ? new Date(e.end_timestamp).getTime() : s + dur / 1e6;
    if (s < gS) gS = s;
    if (end > gE) gE = end;
  });
  const totalMs = Math.max(gE - gS, 1);

  const flat = [];
  const dfs = (node, depth) => {
    const s = new Date(node.init_timestamp).getTime();
    const dur = parseFloat(node.duration) || 0;
    const end = node.end_timestamp ? new Date(node.end_timestamp).getTime() : s + dur / 1e6;
    const ms = Math.max(end - s, 0);
    const leftPct = ((s - gS) / totalMs) * 100;
    const widthPct = Math.max((ms / totalMs) * 100, 0.5);
    flat.push({ ...node, depth, durationMs: ms, leftPct, widthPct });
    node.children.forEach(ch => dfs(ch, depth + 1));
  };
  roots.forEach(r => dfs(r, 0));
  return { flat, totalMs, startMs: gS, roots };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FORMAT HELPERS
   ═══════════════════════════════════════════════════════════════════════════════ */
function fmtDur(ms) {
  if (ms == null || isNaN(ms) || ms < 0.01) return '0s';
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTime(ts) {
  try { return format(new Date(ts), 'HH:mm:ss'); } catch { return ''; }
}

function fmtCost(cost) {
  if (cost == null || isNaN(cost) || cost === 0) return '$0.00';
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(7)}`;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */
const TraceDetail = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const dk = theme === 'dark';

  const [session, setSession] = useState(null);
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('prettify');
  const [viewTab, setViewTab] = useState('waterfall');
  const [showBarText, setShowBarText] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [filters, setFilters] = useState({
    agent: true, llm: true, tool: true, workflow: true, session: true,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [sessionId]);

  const load = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [sRes, eRes] = await Promise.all([
        axios.get(`${API}/api/agentops/sessions/${sessionId}`, { headers: h }),
        axios.get(`${API}/api/agentops/sessions/${sessionId}/events`, { headers: h }),
      ]);
      setSession(sRes.data);
      setEvents(eRes.data || []);
    } catch (err) {
      console.error('Error loading trace:', err);
    } finally {
      setLoading(false);
    }
  };

  const { flat, totalMs, startMs, roots } = useMemo(() => buildTree(events), [events]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (flat.length > 0 && !selected) setSelected(flat[0]);
  }, [flat]);

  const visibleSpans = useMemo(
    () => flat.filter(s => filters[s.classification] !== false),
    [flat, filters]
  );

  const metrics = useMemo(() => {
    let cost = 0, tokens = 0, llmCount = 0, toolCount = 0;
    const models = new Set();
    flat.forEach(s => {
      const d = extractDetails(s);
      if (d.model) models.add(d.model);
      if (s.classification === 'llm') {
        llmCount++;
        // Only count cost/tokens from LLM spans to avoid double-counting with parent agent spans
        cost += d.totalCost;
        tokens += d.totalTokens;
      }
      if (s.classification === 'tool') toolCount++;
    });
    const durMs = session?.end_timestamp && session?.init_timestamp
      ? new Date(session.end_timestamp) - new Date(session.init_timestamp)
      : totalMs;
    return { durMs, cost, tokens, llmCount, toolCount, models: [...models], spans: flat.length };
  }, [flat, session, totalMs]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ session, events }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `trace-${sessionId}.json`;
    a.click();
  };

  const toggleFilter = key => setFilters(f => ({ ...f, [key]: !f[key] }));

  if (loading) {
    return (
      <div className={`flex h-screen items-center justify-center ${dk ? 'bg-[#0C0C14]' : 'bg-gray-50'}`}>
        <RefreshCw className={`h-8 w-8 animate-spin ${dk ? 'text-slate-400' : 'text-gray-500'}`} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`flex h-screen items-center justify-center ${dk ? 'bg-[#0C0C14]' : 'bg-gray-50'}`}>
        <div className="text-center">
          <p className={dk ? 'text-white' : 'text-gray-900'}>Session not found</p>
          <button onClick={() => navigate('/dashboard/ai-workloads/sessions')} className="mt-2 text-purple-400 text-sm">
            &larr; Back to Sessions
          </button>
        </div>
      </div>
    );
  }

  const selDetails = selected ? extractDetails(selected) : null;
  const selCat = selected ? selected.classification : null;

  /* ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className={`flex h-screen flex-col ${dk ? 'bg-[#0C0C14] text-white' : 'bg-gray-50 text-gray-900'}`}>

      {/* ═══════════ HEADER ═══════════ */}
      <div className={`flex-shrink-0 border-b px-5 py-3 ${dk ? 'border-slate-700/50 bg-[#111119]' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard/ai-workloads/sessions')}
              className={`p-1 rounded ${dk ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            <svg className="h-5 w-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span className="text-lg font-bold">{session.tags?.[0] || 'langgraph'}</span>
            {metrics.models.map(m => (
              <span key={m} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${dk ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg>
                {m}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className={`p-2 rounded-lg ${dk ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}><RefreshCw className="h-4 w-4" /></button>
            <button onClick={handleExport} className={`p-2 rounded-lg ${dk ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}><Download className="h-4 w-4" /></button>
            <button onClick={() => navigate('/dashboard/ai-workloads/sessions')} className={`p-2 rounded-lg ${dk ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className={`mt-2 flex items-center gap-2 text-sm ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
          <span>Duration: <b className={dk ? 'text-white' : 'text-gray-900'}>{fmtDur(metrics.durMs)}</b></span>
          <span className="mx-1">&middot;</span>
          <span>Cost: <b className={dk ? 'text-white' : 'text-gray-900'}>{fmtCost(metrics.cost)}</b></span>
          <span className="mx-1">&middot;</span>
          <span>Spans: <b className={dk ? 'text-white' : 'text-gray-900'}>{metrics.spans}</b></span>
          <span className="mx-1">&middot;</span>
          <span>Tokens: <b className={dk ? 'text-white' : 'text-gray-900'}>{metrics.tokens.toLocaleString()}</b></span>
          {session.tags?.length > 0 && (
            <div className="ml-auto flex gap-1.5">
              {session.tags.map((t, i) => (
                <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${dk ? 'bg-slate-800 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ TABS ═══════════ */}
      <div className={`flex-shrink-0 flex items-center gap-1 border-b px-5 ${dk ? 'border-slate-700/50 bg-[#111119]' : 'border-gray-200 bg-white'}`}>
        {[
          { id: 'waterfall', label: 'Waterfall', icon: <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" /></svg> },
          { id: 'graph', label: 'Graph', icon: <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" /><path d="M12 8v3M9.5 14l-3 3M14.5 14l3 3" /></svg> },
          { id: 'logs', label: 'Logs', icon: <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setViewTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 my-2 text-xs font-medium transition-colors ${
              viewTab === t.id
                ? 'bg-purple-600 text-white font-semibold'
                : dk ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════ MAIN BODY ═══════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT PANEL ─────────────────────────────────────── */}
        <div className={`w-3/5 flex flex-col overflow-hidden border-r ${dk ? 'border-slate-700/50' : 'border-gray-200'}`}>

          {/* Filter chips */}
          <div className={`flex-shrink-0 flex items-center gap-3 border-b px-4 py-3 ${dk ? 'border-slate-800' : 'border-gray-100'}`}>
            {Object.entries(filters).map(([key, active]) => {
              const col = CLR[key] || CLR.unknown;
              return (
                <button
                  key={key}
                  onClick={() => toggleFilter(key)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? dk ? 'border-slate-600 bg-slate-800 text-slate-200' : 'border-gray-300 bg-white text-gray-800 shadow-sm'
                      : dk ? 'border-slate-700 bg-slate-800/30 text-slate-600' : 'border-gray-200 bg-gray-50 text-gray-400'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: active ? col.dot : 'transparent',
                      border: active ? 'none' : `2px solid ${dk ? '#475569' : '#d1d5db'}`,
                    }}
                  />
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              );
            })}
          </div>

          {/* ══ WATERFALL VIEW ══ */}
          {viewTab === 'waterfall' && (
            <>
              <div className="flex-1 overflow-y-auto">
                {visibleSpans.map(span => {
                  const col = CLR[span.classification] || CLR.unknown;
                  const isSel = selected?.id === span.id;
                  const isHov = hoveredId === span.id;
                  const label = getDisplayName(span);
                  const indent = span.depth * 20;

                  return (
                    <div
                      key={span.id}
                      onClick={() => { setSelected(span); setTab('prettify'); }}
                      onMouseEnter={() => setHoveredId(span.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`relative flex items-center cursor-pointer border-b transition-colors ${
                        dk ? 'border-slate-800/50' : 'border-gray-100'
                      } ${
                        isSel
                          ? dk ? 'bg-purple-900/20' : 'bg-purple-50'
                          : isHov
                          ? dk ? 'bg-slate-800/40' : 'bg-gray-50'
                          : ''
                      }`}
                      style={{ minHeight: 40 }}
                    >
                      <div
                        className="w-2/5 flex-shrink-0 flex items-center gap-2 py-2 pr-2 overflow-hidden"
                        style={{ paddingLeft: 12 + indent }}
                      >
                        <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: col.dot }} />
                        <span className={`text-sm truncate ${dk ? 'text-slate-300' : 'text-gray-700'}`}>{label}</span>
                      </div>

                      <div className={`flex-1 relative py-2 pr-3 border-l ${dk ? 'border-slate-800' : 'border-gray-200'}`} style={{ height: 40 }}>
                        <div
                          className="absolute rounded-sm"
                          style={{
                            left: `${span.leftPct}%`,
                            width: `${span.widthPct}%`,
                            top: 8, height: 24,
                            backgroundColor: isSel ? col.light : col.bar,
                            minWidth: 6,
                          }}
                        >
                          {showBarText && span.widthPct > 10 && (
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium text-white truncate">{label}</span>
                          )}
                        </div>
                        {showTooltip && isHov && (
                          <div className={`absolute z-50 -top-7 rounded px-2 py-1 text-[10px] shadow-lg whitespace-nowrap pointer-events-none ${dk ? 'bg-slate-700 text-white' : 'bg-gray-800 text-white'}`}
                            style={{ left: `${Math.min(span.leftPct + span.widthPct / 2, 80)}%`, transform: 'translateX(-50%)' }}>
                            {span.event_type} &middot; {fmtDur(span.durationMs)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleSpans.length === 0 && (
                  <div className={`py-8 text-center text-sm ${dk ? 'text-slate-400' : 'text-gray-500'}`}>No spans match the selected filters</div>
                )}
              </div>

              <div className={`flex-shrink-0 border-t ${dk ? 'border-slate-700/50' : 'border-gray-200'}`}>
                <div className="flex items-start">
                  <div className="w-2/5 flex-shrink-0 px-4 py-2">
                    <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                      <input type="checkbox" checked={showBarText} onChange={e => setShowBarText(e.target.checked)} className="rounded border-gray-500 text-purple-500 focus:ring-purple-500 h-3.5 w-3.5" />
                      Show Bar Text
                    </label>
                    <label className={`mt-1 flex items-center gap-1.5 text-xs cursor-pointer ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                      <input type="checkbox" checked={showTooltip} onChange={e => setShowTooltip(e.target.checked)} className="rounded border-gray-500 text-purple-500 focus:ring-purple-500 h-3.5 w-3.5" />
                      Show tooltip
                    </label>
                  </div>
                  <div className={`flex-1 border-l px-3 py-2 ${dk ? 'border-slate-800' : 'border-gray-200'}`}>
                    <div className="flex justify-between">
                      <span className={`text-[10px] tabular-nums ${dk ? 'text-slate-500' : 'text-gray-400'}`}>0.00s</span>
                      <span className={`text-[10px] tabular-nums ${dk ? 'text-slate-500' : 'text-gray-400'}`}>{fmtDur(totalMs)}</span>
                    </div>
                    {startMs > 0 && (
                      <div className="flex justify-between">
                        <span className={`text-[10px] tabular-nums ${dk ? 'text-slate-600' : 'text-gray-400'}`}>{fmtTime(new Date(startMs))}</span>
                        <span className={`text-[10px] tabular-nums ${dk ? 'text-slate-600' : 'text-gray-400'}`}>{fmtTime(new Date(startMs + totalMs))}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ══ GRAPH VIEW ══ */}
          {viewTab === 'graph' && (
            <GraphView
              roots={roots}
              selected={selected}
              onSelect={(span) => { setSelected(span); setTab('prettify'); }}
              filters={filters}
              dk={dk}
            />
          )}

          {/* ══ LOGS VIEW (placeholder) ══ */}
          {viewTab === 'logs' && (
            <div className={`flex-1 overflow-y-auto p-6 font-mono text-xs ${dk ? 'bg-[#0a0a12] text-slate-400' : 'bg-gray-900 text-gray-300'}`}>
              {flat.map((span, i) => (
                <div key={span.id} className="leading-6">
                  <span className="text-slate-600">[{fmtTime(span.init_timestamp)}]</span>{' '}
                  <span style={{ color: (CLR[span.classification] || CLR.unknown).dot }}>{span.classification.toUpperCase()}</span>{' '}
                  {span.event_type} — {fmtDur(span.durationMs)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: SPAN DETAIL ─────────────────────────────────── */}
        <div className={`w-2/5 flex flex-col overflow-hidden ${dk ? 'bg-[#0E0E16]' : 'bg-white'}`}>
          {selected ? (
            <>
              {/* ── Span header ── */}
              <div className={`flex-shrink-0 border-b px-5 py-4 ${dk ? 'border-slate-700/50' : 'border-gray-200'}`}>
                <h2 className="text-xl font-bold">
                  {(selected.event_type || 'Span').replace('.execute', '').replace('default.', '')}
                </h2>
                <div className={`mt-2 space-y-1 text-sm ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                  <div>
                    Time:{' '}
                    <span className={dk ? 'text-slate-200' : 'text-gray-800'}>
                      {fmtTime(selected.init_timestamp)} - {fmtTime(selected.end_timestamp)}
                    </span>
                  </div>
                  <div>
                    Duration:{' '}
                    <span className={dk ? 'text-slate-200' : 'text-gray-800'}>
                      {fmtDur(selected.durationMs)}
                    </span>
                  </div>
                  {selDetails?.model && (
                    <div className="flex items-center gap-1.5">
                      Model:{' '}
                      <span className={`inline-flex items-center gap-1 ${dk ? 'text-slate-200' : 'text-gray-800'}`}>
                        <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg>
                        {selDetails.model}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Cost + Tokens (for LLM / agent spans) ── */}
              {(selCat === 'llm' || selCat === 'agent') && (selDetails.totalTokens > 0 || selDetails.totalCost > 0) && (
                <div className={`flex-shrink-0 flex border-b ${dk ? 'border-slate-700/50' : 'border-gray-200'}`}>
                  <div className={`flex-1 px-5 py-3 border-r ${dk ? 'border-slate-700/50' : 'border-gray-200'}`}>
                    <div className={`text-xs font-semibold mb-1 ${dk ? 'text-slate-300' : 'text-gray-700'}`}>Cost</div>
                    <div className={`space-y-0.5 text-xs ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                      <div>Prompt: <span className={dk ? 'text-slate-200' : 'text-gray-800'}>${selDetails.promptCost.toFixed(7)}</span></div>
                      <div>Completion: <span className={dk ? 'text-slate-200' : 'text-gray-800'}>${selDetails.completionCost.toFixed(7)}</span></div>
                      <div className={`font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Total: ${selDetails.totalCost.toFixed(7)}</div>
                    </div>
                  </div>
                  <div className="flex-1 px-5 py-3">
                    <div className={`text-xs font-semibold mb-1 ${dk ? 'text-slate-300' : 'text-gray-700'}`}>Tokens</div>
                    <div className={`space-y-0.5 text-xs ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                      <div>Prompt: <span className={dk ? 'text-slate-200' : 'text-gray-800'}>{selDetails.promptTokens}</span></div>
                      <div>Completion: <span className={dk ? 'text-slate-200' : 'text-gray-800'}>{selDetails.completionTokens}</span></div>
                      <div className={`font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Total: {selDetails.totalTokens}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tabs: Prettify/Tool View | Raw JSON ── */}
              <div className={`flex-shrink-0 flex items-center border-b ${dk ? 'border-slate-700/50' : 'border-gray-200'}`}>
                <TabBtn active={tab === 'prettify'} onClick={() => setTab('prettify')} dk={dk}>
                  {selCat === 'tool' ? 'Tool View' : 'Prettify'}
                </TabBtn>
                <TabBtn active={tab === 'raw'} onClick={() => setTab('raw')} dk={dk}>
                  Raw JSON
                </TabBtn>
              </div>

              {/* ── Content area ── */}
              <div className="flex-1 overflow-y-auto p-5">
                {tab === 'prettify'
                  ? <PrettifyView span={selected} details={selDetails} category={selCat} dk={dk} />
                  : <RawJsonView span={selected} dk={dk} />
                }
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className={`text-sm ${dk ? 'text-slate-500' : 'text-gray-400'}`}>Select a span to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   TAB BUTTON
   ═══════════════════════════════════════════════════════════════════════════════ */
const TabBtn = ({ active, onClick, dk, children }) => (
  <button onClick={onClick} className={`border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${
    active
      ? 'border-purple-500 text-purple-400'
      : dk ? 'border-transparent text-slate-500 hover:text-slate-300' : 'border-transparent text-gray-400 hover:text-gray-700'
  }`}>
    {children}
  </button>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   PRETTIFY VIEW — context-sensitive content
   ═══════════════════════════════════════════════════════════════════════════════ */
const PrettifyView = ({ span, details, category, dk }) => {
  // ── LLM / Agent: Chat-style messages ──
  if ((category === 'llm' || category === 'agent') && details.messages.length > 0) {
    return (
      <div className="space-y-4">
        {details.messages.map((msg, i) => (
          <ChatBubble key={i} msg={msg} dk={dk} />
        ))}
      </div>
    );
  }

  // ── Tool: Tool Name + Parameters + Result ──
  if (category === 'tool') {
    return (
      <div className="space-y-4">
        {details.toolName && (
          <Collapsible title="Tool Name" dk={dk}>
            <div className={`rounded-lg border p-3 font-mono text-sm ${dk ? 'border-slate-700 bg-slate-800/50 text-slate-200' : 'border-gray-200 bg-gray-50 text-gray-800'}`}>
              {details.toolName}
            </div>
          </Collapsible>
        )}
        {details.toolInput && (
          <Collapsible title="Parameters" dk={dk}>
            <div className={`rounded-lg border p-3 font-mono text-sm whitespace-pre-wrap ${dk ? 'border-slate-700 bg-slate-800/50 text-slate-200' : 'border-gray-200 bg-gray-50 text-gray-800'}`}>
              {tryJson(details.toolInput)}
            </div>
          </Collapsible>
        )}
        {details.toolOutput && (
          <Collapsible title="Result" dk={dk}>
            <div className={`rounded-lg border p-3 font-mono text-sm whitespace-pre-wrap ${dk ? 'border-slate-700 bg-slate-800/50 text-slate-200' : 'border-gray-200 bg-gray-50 text-gray-800'}`}>
              {tryJson(details.toolOutput)}
            </div>
          </Collapsible>
        )}
        {!details.toolName && !details.toolInput && !details.toolOutput && (
          <FallbackParams span={span} dk={dk} />
        )}
      </div>
    );
  }

  // ── Session ──
  if (category === 'session') {
    return (
      <div className="space-y-3">
        {details.endState && (
          <div>
            <div className={`text-xs font-semibold uppercase mb-1 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>End State</div>
            <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
              details.endState === 'Success'
                ? dk ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                : dk ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
            }`}>{details.endState}</span>
          </div>
        )}
        {details.tags?.length > 0 && (
          <div>
            <div className={`text-xs font-semibold uppercase mb-1 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Tags</div>
            <div className="flex flex-wrap gap-1">
              {details.tags.map((t, i) => (
                <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs ${dk ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-600'}`}>{t}</span>
              ))}
            </div>
          </div>
        )}
        <FallbackParams span={span} dk={dk} />
      </div>
    );
  }

  // ── Workflow / unknown ──
  return <FallbackParams span={span} dk={dk} />;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   FALLBACK: show all params as collapsible key-value pairs
   ═══════════════════════════════════════════════════════════════════════════════ */
const FallbackParams = ({ span, dk }) => {
  const params = span.params || {};
  const entries = Object.entries(params).filter(([, v]) => v !== '' && v != null);
  if (entries.length === 0) {
    return <p className={`text-sm ${dk ? 'text-slate-500' : 'text-gray-400'}`}>No detailed content available</p>;
  }
  return (
    <div className="space-y-3">
      {entries.slice(0, 30).map(([k, v]) => (
        <Collapsible key={k} title={k} dk={dk} startOpen={false}>
          <div className={`rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap ${dk ? 'border-slate-700 bg-slate-800/50 text-slate-300' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
            {tryJson(v)}
          </div>
        </Collapsible>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CHAT BUBBLE (for LLM prettify view)
   ═══════════════════════════════════════════════════════════════════════════════ */
const ChatBubble = ({ msg, dk }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const role = (msg.role || 'user').toLowerCase();

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className={`max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm ${dk ? 'bg-blue-600/20 text-blue-100' : 'bg-blue-50 text-gray-800'}`}>
          <MdText text={msg.content} />
        </div>
      </div>
    );
  }

  if (role === 'system') {
    return (
      <div className={`rounded-lg border px-4 py-3 text-xs ${dk ? 'border-slate-700 bg-slate-800/40 text-slate-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
        <span className={`mb-1 block text-[10px] font-semibold uppercase ${dk ? 'text-purple-400' : 'text-purple-600'}`}>System</span>
        <MdText text={msg.content} />
      </div>
    );
  }

  if (role === 'tool' || role === 'function') {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">T</div>
        <div className="flex-1">
          <div className={`rounded-xl px-4 py-3 text-sm ${dk ? 'bg-slate-800/60 text-slate-200' : 'bg-gray-50 text-gray-800'}`}>
            <MdText text={msg.content} />
          </div>
          <MsgActions onCopy={copy} copied={copied} dk={dk} />
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${dk ? 'bg-emerald-600' : 'bg-emerald-500'}`}>A</div>
      <div className="flex-1">
        <div className={`text-sm leading-relaxed ${dk ? 'text-slate-200' : 'text-gray-800'}`}>
          <MdText text={msg.content} />
        </div>
        <MsgActions onCopy={copy} copied={copied} dk={dk} />
      </div>
    </div>
  );
};

const MsgActions = ({ onCopy, copied, dk }) => (
  <div className="mt-1.5 flex items-center gap-2">
    <button onClick={onCopy} className={`p-1 rounded transition-colors ${dk ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`} title={copied ? 'Copied!' : 'Copy'}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
    <button className={`p-1 rounded transition-colors ${dk ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}><ThumbsUp className="h-3.5 w-3.5" /></button>
    <button className={`p-1 rounded transition-colors ${dk ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}><ThumbsDown className="h-3.5 w-3.5" /></button>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   RAW JSON VIEW — dark theme, line numbers, syntax highlighting
   ═══════════════════════════════════════════════════════════════════════════════ */
const RawJsonView = ({ span, dk }) => {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(span, null, 2);
  const lines = json.split('\n');
  const copy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`relative rounded-lg overflow-hidden ${dk ? 'bg-[#0a0a12]' : 'bg-gray-900'}`}>
      <button onClick={copy} className="absolute top-2 right-2 z-10 rounded p-1.5 text-slate-400 hover:text-white hover:bg-slate-700">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <div className="flex font-mono text-xs">
        <div className="select-none border-r border-slate-700/50 px-3 py-3 text-right text-slate-600" style={{ minWidth: 40 }}>
          {lines.map((_, i) => <div key={i} className="leading-5">{i + 1}</div>)}
        </div>
        <pre className="flex-1 overflow-x-auto p-3 text-slate-300 leading-5">
          {lines.map((line, i) => {
            const h = line
              .replace(/"([^"]+)":/g, '<span class="text-blue-400">"$1"</span>:')
              .replace(/: "([^"]*)"/g, ': <span class="text-green-400">"$1"</span>')
              .replace(/: (true|false|null)/g, ': <span class="text-purple-400">$1</span>')
              .replace(/: (-?\d+\.?\d*)/g, ': <span class="text-orange-400">$1</span>');
            return <div key={i} dangerouslySetInnerHTML={{ __html: h }} />;
          })}
        </pre>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   COLLAPSIBLE SECTION
   ═══════════════════════════════════════════════════════════════════════════════ */
const Collapsible = ({ title, dk, startOpen = true, children }) => {
  const [open, setOpen] = useState(startOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className={`flex w-full items-center gap-2 py-1.5 text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && <div className="pl-6 pt-1">{children}</div>}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   SIMPLE MARKDOWN (bold + newlines)
   ═══════════════════════════════════════════════════════════════════════════════ */
const MdText = ({ text }) => {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   GRAPH VIEW — top-down directed flow graph
   ═══════════════════════════════════════════════════════════════════════════════ */
const NODE_W = 190;
const NODE_H = 60;
const ROW_GAP = 50;
const COL_GAP = 20;

function computeGraphLayout(roots, filters) {
  const nodes = [];
  const edges = [];

  // Compute subtree width for each node (bottom-up)
  function subtreeWidth(node) {
    const visible = node.children.filter(c => filters[c.classification] !== false);
    if (visible.length === 0) return NODE_W;
    const childWidths = visible.map(subtreeWidth);
    return childWidths.reduce((sum, w) => sum + w + COL_GAP, -COL_GAP);
  }

  // Place nodes recursively
  function place(node, x, y) {
    if (filters[node.classification] === false) return;
    const col = CLR[node.classification] || CLR.unknown;
    nodes.push({ ...node, gx: x, gy: y, color: col });

    const visible = node.children.filter(c => filters[c.classification] !== false);
    if (visible.length === 0) return;

    const childWidths = visible.map(subtreeWidth);
    const totalW = childWidths.reduce((sum, w) => sum + w + COL_GAP, -COL_GAP);
    let cx = x - totalW / 2;

    visible.forEach((child, i) => {
      const cw = childWidths[i];
      const childX = cx + cw / 2;
      const childY = y + NODE_H + ROW_GAP;

      edges.push({
        x1: x, y1: y + NODE_H,
        x2: childX, y2: childY,
      });

      place(child, childX, childY);
      cx += cw + COL_GAP;
    });
  }

  // Layout all roots side by side
  const visibleRoots = roots.filter(r => filters[r.classification] !== false);
  const rootWidths = visibleRoots.map(subtreeWidth);
  const totalRootW = rootWidths.reduce((sum, w) => sum + w + COL_GAP * 3, -COL_GAP * 3);
  let rx = 40;

  visibleRoots.forEach((root, i) => {
    const rw = rootWidths[i];
    place(root, rx + rw / 2, 30);
    rx += rw + COL_GAP * 3;
  });

  // Compute bounds
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  nodes.forEach(n => {
    if (n.gx - NODE_W / 2 < minX) minX = n.gx - NODE_W / 2;
    if (n.gx + NODE_W / 2 > maxX) maxX = n.gx + NODE_W / 2;
    if (n.gy + NODE_H > maxY) maxY = n.gy + NODE_H;
  });

  return { nodes, edges, width: Math.max(maxX - minX + 80, 400), height: maxY + 60, offsetX: Math.min(minX - 40, 0) };
}

const GraphView = ({ roots, selected, onSelect, filters, dk }) => {
  const layout = useMemo(() => computeGraphLayout(roots, filters), [roots, filters]);
  const { nodes, edges, width, height, offsetX } = layout;

  return (
    <div className="flex-1 overflow-auto">
      <div style={{ minWidth: width - offsetX, minHeight: height, position: 'relative' }}>
        {/* SVG edges layer */}
        <svg
          style={{ position: 'absolute', top: 0, left: -offsetX, width: width - offsetX, height, pointerEvents: 'none' }}
        >
          {edges.map((e, i) => {
            const midY = e.y1 + (e.y2 - e.y1) / 2;
            return (
              <path
                key={i}
                d={`M${e.x1 - offsetX},${e.y1} C${e.x1 - offsetX},${midY} ${e.x2 - offsetX},${midY} ${e.x2 - offsetX},${e.y2}`}
                fill="none"
                stroke={dk ? '#334155' : '#d1d5db'}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {/* Node boxes */}
        {nodes.map(node => {
          const isSel = selected?.id === node.id;
          const label = getDisplayName(node);
          return (
            <div
              key={node.id}
              onClick={() => onSelect(node)}
              className={`absolute cursor-pointer rounded-lg border-l-4 transition-all ${
                dk
                  ? `bg-[#1a1a2e] border ${isSel ? 'border-purple-500 shadow-lg shadow-purple-500/20' : 'border-slate-700 hover:border-slate-500'}`
                  : `bg-white border ${isSel ? 'border-purple-500 shadow-lg shadow-purple-500/20' : 'border-gray-200 hover:border-gray-400'}`
              }`}
              style={{
                left: node.gx - NODE_W / 2 - offsetX,
                top: node.gy,
                width: NODE_W,
                height: NODE_H,
                borderLeftColor: node.color.bar,
              }}
            >
              <div className="flex h-full flex-col justify-center px-3 py-1.5 overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                    style={{
                      backgroundColor: dk ? `${node.color.bar}20` : `${node.color.bar}15`,
                      color: node.color.bar,
                    }}
                  >
                    {node.classification}
                  </span>
                  <span className={`text-[10px] tabular-nums ${dk ? 'text-slate-500' : 'text-gray-400'}`}>
                    {fmtDur(node.durationMs)}
                  </span>
                </div>
                <span className={`mt-1 text-xs truncate ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function tryJson(v) {
  if (typeof v !== 'string') return JSON.stringify(v, null, 2);
  try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; }
}

export default TraceDetail;

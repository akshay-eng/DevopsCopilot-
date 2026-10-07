import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { backendApi } from '../services/api';
import {
  Activity, CheckCircle2, XCircle, Loader2, Wrench, ChevronDown, ChevronRight,
  RefreshCw, Cpu, Clock, Zap, AlertTriangle,
} from 'lucide-react';

const fmtDur = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};
const relTime = (iso) => {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

const AgentThreads = () => {
  const { theme } = useTheme();
  const dk = theme === 'dark';
  const [data, setData] = useState({ threads: [], stats: {}, agentOnline: true });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [auto, setAuto] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const r = await backendApi.get('/api/agent-threads?limit=60');
      if (r?.success) setData(r);
    } catch (e) { /* keep last */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return undefined;
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [auto, load]);

  const card = `rounded-2xl ${dk ? 'bg-[#141414] border border-[#1f1f1f]' : 'bg-white border border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)]'}`;
  const heading = dk ? 'text-white' : 'text-gray-900';
  const soft = dk ? 'text-gray-500' : 'text-gray-400';
  const body = dk ? 'text-gray-300' : 'text-gray-600';

  const stats = data.stats || {};
  const threads = (data.threads || []).filter((t) => filter === 'all' || t.status === filter);

  const StatusPill = ({ status }) => {
    if (status === 'running') {
      return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-500">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> Running
      </span>;
    }
    if (status === 'error') {
      return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-500"><XCircle size={11} /> Error</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/10 text-green-600"><CheckCircle2 size={11} /> Completed</span>;
  };

  const Stat = ({ icon: Icon, label, value, tint }) => (
    <div className={`${card} p-4 flex items-center gap-3`}>
      <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: `${tint}22`, color: tint }}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <div className={`text-[20px] font-bold leading-none ${heading}`}>{value ?? 0}</div>
        <div className={`text-[12px] mt-1 ${soft}`}>{label}</div>
      </div>
    </div>
  );

  return (
    <div className={`flex-1 overflow-auto ${dk ? 'bg-[#0a0a0a]' : 'bg-[#f4f6fa]'}`}>
      <div className="p-6 max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className={`text-[22px] font-bold tracking-tight ${heading}`}>Agent Threads</h1>
            <p className={`text-[13px] ${soft}`}>Live view of every task Pi is working on — and the tools it calls.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setAuto((a) => !a)}
              className={`px-3 py-2 rounded-xl text-[12.5px] font-medium border transition-colors ${auto
                ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                : dk ? 'border-[#232323] text-gray-400' : 'border-gray-200 text-gray-500'}`}>
              {auto ? '● Live' : 'Paused'}
            </button>
            <button onClick={load} className={`p-2.5 rounded-xl ${dk ? 'bg-[#141414] border border-[#1f1f1f] text-gray-400' : 'bg-white border border-gray-100 text-gray-500 shadow-sm'}`}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {!data.agentOnline && (
          <div className={`rounded-2xl p-4 flex items-start gap-3 ${dk ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
            <AlertTriangle size={17} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className={`text-[13.5px] font-semibold ${dk ? 'text-amber-300' : 'text-amber-800'}`}>Agent runtime offline</div>
              <p className={`text-[12.5px] mt-0.5 ${dk ? 'text-amber-200/80' : 'text-amber-700'}`}>
                Start the Pi agent (<code>cd pi-agent &amp;&amp; npm start</code>) and point <code>DEEP_AGENT_URL</code> at it. Threads appear here as soon as it runs a task.
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat icon={Activity} label="Running now" value={stats.running} tint="#3b82f6" />
          <Stat icon={CheckCircle2} label="Completed" value={stats.completed} tint="#22c55e" />
          <Stat icon={XCircle} label="Errored" value={stats.errored} tint="#ef4444" />
          <Stat icon={Wrench} label="Tool calls" value={stats.toolCalls} tint="#a5b4fc" />
        </div>

        {/* Filter */}
        <div className={`inline-flex items-center gap-0.5 p-1 rounded-xl ${dk ? 'bg-[#141414] border border-[#1f1f1f]' : 'bg-white border border-gray-100'}`}>
          {['all', 'running', 'completed', 'error'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium capitalize transition-colors ${filter === f
                ? (dk ? 'bg-[#232323] text-white' : 'bg-gray-100 text-gray-900')
                : soft}`}>
              {f}
            </button>
          ))}
        </div>

        {/* Threads */}
        {threads.length === 0 ? (
          <div className={`${card} p-12 text-center`}>
            <Cpu size={34} className={`mx-auto mb-3 opacity-40 ${soft}`} />
            <p className={`text-[14px] font-medium ${heading}`}>No agent threads yet</p>
            <p className={`text-[13px] mt-1 ${soft}`}>Ask HolmesGPT something and the task will appear here in real time.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {threads.map((t) => {
              const open = !!expanded[t.id];
              return (
                <div key={t.id} className={card}>
                  <button onClick={() => setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))}
                    className="w-full flex items-start gap-3 p-4 text-left">
                    <span className={`mt-0.5 shrink-0 ${soft}`}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusPill status={t.status} />
                        {t.kind && t.kind !== 'chat' && (
                          <span className={`text-[10.5px] px-1.5 py-0.5 rounded ${dk ? 'bg-[#232323] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{t.kind}</span>
                        )}
                        {t.status === 'running' && t.currentTool && (
                          <span className="inline-flex items-center gap-1 text-[11.5px] text-blue-500">
                            <Loader2 size={11} className="animate-spin" /> {t.currentTool}
                          </span>
                        )}
                      </div>
                      <div className={`text-[14px] font-medium mt-1.5 truncate ${heading}`} title={t.title}>{t.title || '(no prompt)'}</div>
                      <div className={`flex items-center gap-4 mt-1.5 text-[11.5px] ${soft} flex-wrap`}>
                        <span className="inline-flex items-center gap-1"><Clock size={11} /> {relTime(t.startedAt)}</span>
                        <span className="inline-flex items-center gap-1"><Zap size={11} /> {fmtDur(t.durationMs)}</span>
                        <span className="inline-flex items-center gap-1"><Wrench size={11} /> {t.steps || 0} tool call{t.steps === 1 ? '' : 's'}</span>
                        {t.model && <span className="inline-flex items-center gap-1"><Cpu size={11} /> {t.model}</span>}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className={`px-4 pb-4 pl-11 border-t ${dk ? 'border-[#1f1f1f]' : 'border-gray-100'} pt-3`}>
                      {t.error && (
                        <div className="text-[12.5px] text-red-500 mb-3 flex items-start gap-2">
                          <XCircle size={14} className="shrink-0 mt-0.5" /> {t.error}
                        </div>
                      )}
                      {(t.toolCalls || []).length === 0 ? (
                        <p className={`text-[12.5px] ${soft}`}>No tool calls — answered directly from context.</p>
                      ) : (
                        <ol className="space-y-2">
                          {t.toolCalls.map((c, i) => (
                            <li key={i} className="flex items-center gap-2.5">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${dk ? 'bg-[#232323] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                              {c.status === 'running'
                                ? <Loader2 size={13} className="animate-spin text-blue-500 shrink-0" />
                                : c.status === 'done'
                                  ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                                  : <XCircle size={13} className="text-red-400 shrink-0" />}
                              <code className={`text-[12.5px] font-mono ${body}`}>{c.tool}</code>
                              <span className={`text-[11.5px] ${soft}`}>{fmtDur(c.durationMs)}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentThreads;

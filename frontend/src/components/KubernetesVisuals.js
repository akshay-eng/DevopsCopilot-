import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  RadialBarChart, RadialBar, PolarAngleAxis, Cell, LabelList, AreaChart, Area,
} from 'recharts';
import {
  Activity, Server, HeartPulse, ShieldAlert, RotateCcw, Gauge, X, Loader2,
  Sparkles, Maximize2, CheckCircle2, AlertTriangle, Info, Layers, Boxes,
  DollarSign, Network, Trash2, RotateCw,
} from 'lucide-react';
import { SEVERITY, STATUS, INK, seriesColor } from './fleetPalette';
import { getFleetAdvice } from '../services/api';

/**
 * Kubernetes health visuals.
 *
 * Every card: a chart, a REMOVE button, and a double-click that opens the
 * detailed view — the numbers behind the card, deterministic findings, and
 * AI-suggested actions for that specific metric.
 *
 * Findings are computed from the same data the chart draws, so the detail view
 * says something true even when the model is unreachable, and an AI claim can
 * be checked against the facts printed beside it.
 *
 * Removals persist per user in localStorage: a dashboard someone has tailored
 * should stay tailored across reloads.
 */

const HIDDEN_KEY = 'aiops-fleet-hidden-cards';
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());

const loadHidden = () => {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); }
  catch { return new Set(); }
};
const saveHidden = (set) => {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
};

/** A gauge is the right form for one ratio against a limit. */
const Ring = ({ value, tone, dk, size = 96 }) => (
  <div className="relative shrink-0" style={{ width: size, height: size }}>
    <ResponsiveContainer width="100%" height="100%">
      <RadialBarChart innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270}
        data={[{ value: Math.max(0, Math.min(100, value || 0)) }]} barSize={8}>
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar background={{ fill: dk ? '#232323' : '#eeeeea' }} dataKey="value"
          cornerRadius={4} fill={tone} isAnimationActive={false} />
      </RadialBarChart>
    </ResponsiveContainer>
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span className="text-[18px] font-medium tabular-nums" style={{ color: dk ? '#fff' : '#0b0b0b' }}>
        {value == null ? '—' : `${value}%`}
      </span>
    </div>
  </div>
);

const Card = ({ icon: Icon, title, hint, children, onOpen, onRemove, dk }) => (
  <div
    onDoubleClick={onOpen}
    onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
    tabIndex={0}
    role="button"
    title="Double-click for the detailed view and AI suggestions"
    className={`group relative rounded-xl border p-4 cursor-pointer outline-none transition-colors
      ${dk ? 'bg-[#131313] border-[#232323] hover:border-[#333] focus-visible:border-[#555]'
           : 'bg-white border-gray-200 hover:border-gray-300 focus-visible:border-gray-400'}`}>
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && <Icon size={13} className={dk ? 'text-gray-500' : 'text-gray-400'} />}
        <h4 className={`text-[12.5px] font-medium truncate ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{title}</h4>
      </div>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onOpen(); }} title="Detailed view"
          className={`p-1 rounded ${dk ? 'text-gray-500 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}>
          <Maximize2 size={12} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove this card"
          className={`p-1 rounded ${dk ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
    {children}
    {hint && <p className={`text-[11px] mt-2.5 ${dk ? 'text-gray-600' : 'text-gray-400'}`}>{hint}</p>}
  </div>
);

const PRIORITY = { high: STATUS.critical, medium: STATUS.warning, low: STATUS.neutral };

/* ── detailed view ────────────────────────────────────────────────────── */

const Detail = ({ card, hours, dk, onClose }) => {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    getFleetAdvice(card.topic, hours)
      .then((r) => setAdvice(r?.success ? r : { error: r?.error || 'No advice returned.' }))
      .catch((e) => setAdvice({ error: e.message }))
      .finally(() => setLoading(false));
  }, [card.topic, hours]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);

  const panel = dk ? 'bg-[#171719] border-[#2e2e33]' : 'bg-white border-gray-200';
  const h1 = dk ? 'text-gray-50' : 'text-gray-900';
  const muted = dk ? 'text-gray-500' : 'text-gray-500';
  const body = dk ? 'text-gray-300' : 'text-gray-700';
  const sub = dk ? 'bg-[#0f0f10]' : 'bg-[#fafbfc]';

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${panel}`}>
        <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4 border-b ${dk ? 'border-[#2e2e33] bg-[#171719]' : 'border-gray-200 bg-white'}`}>
          <div>
            <h2 className={`text-[16px] font-semibold ${h1}`}>{card.detailTitle}</h2>
            <p className={`text-[12px] mt-0.5 ${muted}`}>What this metric shows, and what to do about it</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={load} title="Ask again" disabled={loading}
              className={`p-1.5 rounded-lg disabled:opacity-40 ${dk ? 'text-gray-400 hover:bg-[#232329]' : 'text-gray-500 hover:bg-gray-100'}`}>
              <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} aria-label="Close"
              className={`p-1.5 rounded-lg ${dk ? 'text-gray-400 hover:bg-[#232329]' : 'text-gray-500 hover:bg-gray-100'}`}>
              <X size={16} />
            </button>
          </div>
        </div>

        {card.detail?.length > 0 && (
          <div className={`grid grid-cols-2 sm:grid-cols-4 divide-x border-b ${dk ? 'divide-[#242429] border-[#2e2e33]' : 'divide-gray-100 border-gray-200'}`}>
            {card.detail.map((d) => (
              <div key={d.label} className="px-5 py-3.5">
                <div className="text-[18px] font-medium tabular-nums" style={{ color: d.tone || (dk ? '#fff' : '#0b0b0b') }}>{d.value}</div>
                <div className={`text-[10.5px] uppercase tracking-[0.07em] mt-1 ${muted}`}>{d.label}</div>
              </div>
            ))}
          </div>
        )}

        {card.table?.rows?.length > 0 && (
          <div className="px-6 pt-5">
            <h3 className={`text-[10.5px] uppercase tracking-[0.07em] mb-2 ${muted}`}>{card.table.title}</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`text-[10px] uppercase tracking-wide ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
                    {card.table.columns.map((c, i) => (
                      <th key={c} className={`pb-1.5 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${dk ? 'divide-[#242429]' : 'divide-gray-100'}`}>
                  {card.table.rows.slice(0, 12).map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j} className={`py-1.5 text-[12.5px] ${j === 0 ? `text-left ${body}` : `text-right tabular-nums ${muted}`}`}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="px-6 py-5">
          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2">
              <Loader2 size={15} className="animate-spin" style={{ color: seriesColor(0, dk) }} />
              <span className={`text-[13px] ${muted}`}>Asking the model about this metric…</span>
            </div>
          ) : advice?.error ? (
            <p className="text-[13px]" style={{ color: STATUS.critical }}>{advice.error}</p>
          ) : (
            <>
              <h3 className={`text-[10.5px] uppercase tracking-[0.07em] mb-2.5 ${muted}`}>What the data says</h3>
              <ul className="space-y-1.5 mb-5">
                {(advice?.facts || []).map((f, i) => (
                  <li key={i} className={`flex items-start gap-2 text-[13px] leading-relaxed ${body}`}>
                    <Info size={12} className="shrink-0 mt-1" style={{ color: seriesColor(0, dk) }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center gap-2 mb-2.5">
                <Sparkles size={12} style={{ color: seriesColor(0, dk) }} />
                <h3 className={`text-[10.5px] uppercase tracking-[0.07em] ${muted}`}>AI summary &amp; suggested actions</h3>
                {advice?.source === 'ai' && advice.model && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${dk ? 'bg-[#232329] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{advice.model}</span>
                )}
              </div>

              {advice?.summary && <p className={`text-[13px] leading-relaxed mb-3 ${body}`}>{advice.summary}</p>}

              {(advice?.recommendations || []).length === 0 ? (
                <p className={`text-[12.5px] ${muted}`}>
                  {advice?.modelNote || 'No automated actions were produced for this metric — the findings above still stand.'}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {advice.recommendations.map((r, i) => (
                    <div key={i} className={`rounded-lg p-3 ${sub}`}>
                      <div className="flex items-start gap-2">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: PRIORITY[r.priority] || STATUS.neutral }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[13px] font-medium ${h1}`}>{r.title}</span>
                            <span className="text-[10px] uppercase tracking-wide" style={{ color: PRIORITY[r.priority] || STATUS.neutral }}>{r.priority}</span>
                          </div>
                          <p className={`text-[12.5px] mt-1 leading-relaxed ${body}`}>{r.detail}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── the grid ─────────────────────────────────────────────────────────── */

const KubernetesVisuals = ({ fleet, hours = 24, dk }) => {
  const ink = INK[dk ? 'dark' : 'light'];
  const [open, setOpen] = useState(null);
  const [hidden, setHidden] = useState(loadHidden);

  const remove = (id) => setHidden((prev) => {
    const next = new Set(prev); next.add(id); saveHidden(next); return next;
  });
  const restoreAll = () => { setHidden(new Set()); saveHidden(new Set()); };

  // Memoised because the derived series below depend on them; a fresh {} or []
  // each render would recompute every chart on every paint.
  const t = useMemo(() => fleet?.totals || {}, [fleet]);
  const clusters = fleet?.clusters || { list: [], unreachable: [] };
  const vuln = fleet?.vulnerabilities || {};
  const cost = fleet?.cost || {};
  const alerts = fleet?.alerts || {};
  const phase = fleet?.podPhase || {};
  const nodes = useMemo(() => fleet?.datasets?.nodes || [], [fleet]);
  const pods = useMemo(() => fleet?.datasets?.pods || [], [fleet]);
  const workloads = fleet?.datasets?.workloads || [];

  const tip = {
    contentStyle: { background: dk ? '#1c1c1c' : '#fff', border: `1px solid ${dk ? '#333' : '#e5e5e5'}`, borderRadius: 8, fontSize: 12 },
    labelStyle: { color: dk ? '#fff' : '#0b0b0b', fontWeight: 600 },
    itemStyle: { color: dk ? '#c3c2b7' : '#52514e' },
  };
  const axis = { tick: { fontSize: 10, fill: ink.muted }, tickLine: false, axisLine: { stroke: ink.grid } };

  const podsActive = pct(t.podsRunning, t.pods);
  const clusterHealth = pct(clusters.verified, clusters.total || 1);
  const nodeHealth = pct(t.nodesReady, t.nodes);
  const slots = pct(t.podSlotsUsed, t.podSlots);

  const uptime = useMemo(() => {
    const parts = [];
    if (t.nodes) parts.push(t.nodesReady / t.nodes);
    if (t.pods) parts.push(t.podsRunning / t.pods);
    if (t.workloads) parts.push((t.workloads - (t.workloadsDegraded || 0)) / t.workloads);
    if (!parts.length) return null;
    return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 1000) / 10;
  }, [t]);

  const failures = (phase.Failed || 0) + (phase.Pending || 0) + (t.workloadsDegraded || 0);

  const restartTop = useMemo(() => pods.filter((p) => p.restarts > 0)
    .sort((a, b) => b.restarts - a.restarts).slice(0, 5)
    .map((p) => ({ name: p.name.length > 20 ? `${p.name.slice(0, 19)}…` : p.name, value: p.restarts, full: p.name })), [pods]);

  const nodeLoad = useMemo(() => nodes.slice(0, 8).map((n) => ({
    name: n.name.length > 14 ? `${n.name.slice(0, 13)}…` : n.name,
    used: pct(n.podCount, n.podCapacity), full: n.name,
  })), [nodes]);

  const vulnBars = useMemo(() => {
    const v = vuln.totals || {};
    return ['critical', 'high', 'medium', 'low']
      .map((k) => ({ name: k[0].toUpperCase() + k.slice(1), value: v[k] || 0, key: k }))
      .filter((d) => d.value > 0);
  }, [vuln.totals]);

  const alertTrend = useMemo(() => (alerts.overTime || []).map((b) => ({
    label: new Date(`${b.hour}:00Z`).toLocaleTimeString([], { hour: '2-digit' }), v: b.count,
  })), [alerts.overTime]);

  const nsPods = useMemo(() => {
    const m = {};
    pods.forEach((p) => { m[p.namespace] = (m[p.namespace] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
  }, [pods]);

  const costNs = useMemo(() => (cost.byNamespace || []).slice(0, 6)
    .map((n) => ({ name: n.name, value: Math.round(n.totalCost * 1000) / 1000 })), [cost.byNamespace]);

  const tone = (v, good = 95, warn = 80) => (v == null ? STATUS.neutral
    : v >= good ? STATUS.good : v >= warn ? STATUS.warning : STATUS.critical);

  /** Every card declares its own detail view and AI topic. */
  const CARDS = [
    {
      id: 'pods', icon: Activity, title: 'Pods active', topic: 'pod_health',
      detailTitle: 'Pod health across the fleet', hint: `${fmt(t.pods)} pods · double-click for AI suggestions`,
      detail: [
        { label: 'Running', value: fmt(t.podsRunning), tone: STATUS.good },
        { label: 'Pending', value: fmt(phase.Pending || 0), tone: phase.Pending ? STATUS.warning : undefined },
        { label: 'Not ready', value: fmt(t.podsNotReady), tone: t.podsNotReady ? STATUS.warning : undefined },
        { label: 'Total', value: fmt(t.pods) },
      ],
      render: () => (
        <div className="flex items-center gap-4">
          <Ring value={podsActive} tone={tone(podsActive)} dk={dk} />
          <div className="min-w-0">
            <div className={`text-[13px] ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{fmt(t.podsRunning)} of {fmt(t.pods)}</div>
            <div className={`text-[11.5px] mt-0.5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{phase.Pending ? `${phase.Pending} pending` : 'none pending'}</div>
          </div>
        </div>
      ),
    },
    {
      id: 'clusterhealth', icon: HeartPulse, title: 'Cluster health', topic: 'cluster_connectivity',
      detailTitle: 'Connected cluster health', hint: 'Connected and verifiably readable',
      detail: [
        { label: 'Reachable', value: fmt(clusters.reachable) },
        { label: 'Verified', value: fmt(clusters.verified), tone: STATUS.good },
        { label: 'Unreachable', value: fmt(clusters.unreachable?.length || 0), tone: clusters.unreachable?.length ? STATUS.critical : undefined },
        { label: 'Registered', value: fmt(clusters.total) },
      ],
      table: {
        title: 'Clusters', columns: ['Cluster', 'Nodes', 'Pods', 'Restarts'],
        rows: (clusters.list || []).map((c) => [c.name, `${c.nodesReady}/${c.nodes}`, `${c.podsRunning}/${c.pods}`, c.restarts]),
      },
      render: () => (
        <div className="flex items-center gap-4">
          <Ring value={clusterHealth} tone={tone(clusterHealth, 100, 60)} dk={dk} />
          <div className="min-w-0">
            <div className={`text-[13px] ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{fmt(clusters.verified)} verified</div>
            <div className={`text-[11.5px] mt-0.5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>
              {clusters.unreachable?.length ? `${clusters.unreachable.length} unreachable` : 'all readable'}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'nodehealth', icon: Server, title: 'Node health', topic: 'node_health',
      detailTitle: 'Node health and capacity', hint: 'Ready nodes across the fleet',
      detail: [
        { label: 'Ready', value: `${t.nodesReady}/${t.nodes}`, tone: t.nodesReady === t.nodes ? STATUS.good : STATUS.critical },
        { label: 'vCPU', value: fmt(t.cpuCores) },
        { label: 'Memory', value: `${fmt(t.memoryGi)} Gi` },
        { label: 'Pod slots', value: `${slots}%` },
      ],
      table: {
        title: 'Nodes', columns: ['Node', 'Status', 'vCPU', 'Memory Gi', 'Pods'],
        rows: nodes.map((n) => [n.name, n.status, n.cpuCores, n.memoryGi, `${n.podCount}/${n.podCapacity}`]),
      },
      render: () => (
        <div className="flex items-center gap-4">
          <Ring value={nodeHealth} tone={tone(nodeHealth, 100, 67)} dk={dk} />
          <div className="min-w-0">
            <div className={`text-[13px] ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{t.nodesReady} of {t.nodes} ready</div>
            <div className={`text-[11.5px] mt-0.5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{fmt(t.cpuCores)} vCPU · {fmt(t.memoryGi)} Gi</div>
          </div>
        </div>
      ),
    },
    {
      id: 'uptime', icon: Gauge, title: 'Overall uptime', topic: 'availability',
      detailTitle: 'Overall availability', hint: 'Nodes, pods and workloads combined',
      detail: [
        { label: 'Composite', value: uptime != null ? `${uptime}%` : '—', tone: tone(uptime) },
        { label: 'Nodes', value: `${t.nodesReady}/${t.nodes}` },
        { label: 'Pods', value: `${t.podsRunning}/${t.pods}` },
        { label: 'Workloads', value: `${(t.workloads || 0) - (t.workloadsDegraded || 0)}/${t.workloads}` },
      ],
      render: () => (
        <div className="flex items-center gap-4">
          <Ring value={uptime} tone={tone(uptime)} dk={dk} />
          <div className="min-w-0">
            <div className={`text-[13px] ${dk ? 'text-gray-200' : 'text-gray-800'}`}>availability</div>
            <div className={`text-[11.5px] mt-0.5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>mean of node, pod and workload readiness</div>
          </div>
        </div>
      ),
    },
    {
      id: 'failures', icon: AlertTriangle, title: 'Current failures', topic: 'failures',
      detailTitle: 'Failures across the fleet', hint: 'Pending, failed and degraded',
      detail: [
        { label: 'Failed pods', value: fmt(phase.Failed || 0), tone: phase.Failed ? STATUS.critical : undefined },
        { label: 'Pending pods', value: fmt(phase.Pending || 0), tone: phase.Pending ? STATUS.warning : undefined },
        { label: 'Degraded', value: fmt(t.workloadsDegraded), tone: t.workloadsDegraded ? STATUS.warning : undefined },
        { label: 'Not ready', value: fmt(t.podsNotReady) },
      ],
      table: {
        title: 'Degraded workloads', columns: ['Workload', 'Namespace', 'Ready'],
        rows: workloads.filter((w) => w.degraded).map((w) => [w.name, w.namespace, `${w.ready}/${w.desired}`]),
      },
      render: () => (failures === 0 ? (
        <div className="flex items-center gap-2 py-5">
          <CheckCircle2 size={16} style={{ color: STATUS.good }} />
          <span className={`text-[13px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>No failures right now</span>
        </div>
      ) : (
        <div className="space-y-2 py-1">
          {[['Failed pods', phase.Failed || 0, STATUS.critical],
            ['Pending pods', phase.Pending || 0, STATUS.warning],
            ['Degraded workloads', t.workloadsDegraded || 0, STATUS.warning]]
            .filter((r) => r[1] > 0).map((r) => (
              <div key={r[0]} className="flex items-center justify-between">
                <span className={`text-[12.5px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>{r[0]}</span>
                <span className="text-[14px] tabular-nums" style={{ color: r[2] }}>{r[1]}</span>
              </div>
            ))}
        </div>
      )),
    },
    {
      id: 'restarts', icon: RotateCcw, title: 'Image restarts', topic: 'restarts',
      detailTitle: 'Restarts and image hygiene', hint: 'Containers restarting most',
      detail: [
        { label: 'Total restarts', value: fmt(t.restarts), tone: t.restarts ? STATUS.warning : undefined },
        { label: 'Pods affected', value: fmt(pods.filter((p) => p.restarts > 0).length) },
        { label: 'Distinct images', value: fmt(t.images) },
        { label: 'Floating tags', value: fmt(t.imagesFloating), tone: t.imagesFloating ? STATUS.warning : undefined },
      ],
      render: () => (restartTop.length === 0 ? (
        <div className="flex items-center gap-2 py-5">
          <CheckCircle2 size={16} style={{ color: STATUS.good }} />
          <span className={`text-[13px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>No restarts recorded</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={104}>
          <BarChart data={restartTop} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={104} {...axis} axisLine={false} />
            <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }}
              formatter={(v, _n, p) => [v, p?.payload?.full || 'restarts']} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={11} fill={STATUS.warning}>
              <LabelList dataKey="value" position="right" style={{ fontSize: 10.5, fill: ink.secondary }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )),
    },
    {
      id: 'vulns', icon: ShieldAlert, title: 'Vulnerabilities', topic: 'security',
      detailTitle: 'Vulnerability exposure', hint: 'Findings by severity',
      detail: [
        { label: 'Critical', value: fmt(vuln.totals?.critical), tone: STATUS.critical },
        { label: 'High', value: fmt(vuln.totals?.high), tone: STATUS.serious },
        { label: 'Total', value: fmt(vuln.totals?.total) },
        { label: 'Workloads', value: fmt(vuln.scannedWorkloads) },
      ],
      table: {
        title: 'Most affected images', columns: ['Image', 'Findings'],
        rows: (vuln.topImages || []).map((i) => [i.image, i.total]),
      },
      render: () => (!vuln.installed ? (
        <div className={`text-[12.5px] py-5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>Trivy is not reporting.</div>
      ) : (
        <ResponsiveContainer width="100%" height={104}>
          <BarChart data={vulnBars} margin={{ top: 12, right: 4, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" {...axis} />
            <YAxis {...axis} axisLine={false} width={46} />
            <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28}>
              {vulnBars.map((d) => <Cell key={d.key} fill={SEVERITY[d.key]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )),
    },
    {
      id: 'nodeutil', icon: Gauge, title: 'Node utilisation', topic: 'node_capacity',
      detailTitle: 'CPU, memory and capacity', hint: 'Pod slots used per node',
      detail: [
        { label: 'Slots used', value: `${slots}%` },
        { label: 'vCPU', value: fmt(t.cpuCores) },
        { label: 'Memory', value: `${fmt(t.memoryGi)} Gi` },
        { label: 'Efficiency', value: cost.installed && cost.efficiency != null ? `${cost.efficiency}%` : '—',
          tone: cost.efficiency != null && cost.efficiency < 50 ? STATUS.warning : undefined },
      ],
      render: () => (nodeLoad.length === 0 ? (
        <div className={`text-[12.5px] py-5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>No nodes reporting.</div>
      ) : (
        <ResponsiveContainer width="100%" height={104}>
          <BarChart data={nodeLoad} margin={{ top: 12, right: 4, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" {...axis} />
            <YAxis {...axis} axisLine={false} width={42} domain={[0, 100]} />
            <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }}
              formatter={(v, _n, p) => [`${v}%`, p?.payload?.full || 'slots used']} />
            <Bar dataKey="used" radius={[3, 3, 0, 0]} maxBarSize={28} fill={seriesColor(0, dk)}>
              <LabelList dataKey="used" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 10, fill: ink.secondary }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )),
    },
    {
      id: 'alerttrend', icon: Network, title: 'Alert pressure', topic: 'alerts',
      detailTitle: 'Alert load and noise', hint: 'Per hour across the fleet',
      detail: [
        { label: 'Total', value: fmt(alerts.total) },
        { label: 'Critical', value: fmt(alerts.severity?.critical), tone: STATUS.critical },
        { label: 'Warning', value: fmt(alerts.severity?.warning), tone: STATUS.warning },
        { label: 'Info', value: fmt(alerts.severity?.info) },
      ],
      table: {
        title: 'Most frequent signatures', columns: ['Alert', 'Severity', 'Count'],
        rows: (alerts.top || []).map((a) => [a.alertname, a.severity || '—', a.count]),
      },
      render: () => (alertTrend.length < 2 ? (
        <div className={`text-[12.5px] py-5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>Not enough history.</div>
      ) : (
        <ResponsiveContainer width="100%" height={104}>
          <AreaChart data={alertTrend} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="kvAlert" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={seriesColor(0, dk)} stopOpacity={0.28} />
                <stop offset="100%" stopColor={seriesColor(0, dk)} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={30} />
            <YAxis {...axis} axisLine={false} width={46} />
            <Tooltip {...tip} formatter={(v) => [v, 'alerts']} />
            <Area type="monotone" dataKey="v" stroke={seriesColor(0, dk)} strokeWidth={2} fill="url(#kvAlert)" />
          </AreaChart>
        </ResponsiveContainer>
      )),
    },
    {
      id: 'nspods', icon: Layers, title: 'Pods by namespace', topic: 'namespace_distribution',
      detailTitle: 'Workload distribution', hint: 'Where the workload sits',
      detail: [
        { label: 'Namespaces', value: fmt(t.namespaces) },
        { label: 'Pods', value: fmt(t.pods) },
        { label: 'Workloads', value: fmt(t.workloads) },
        { label: 'Largest', value: nsPods[0]?.name || '—' },
      ],
      render: () => (nsPods.length === 0 ? (
        <div className={`text-[12.5px] py-5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>No pods reporting.</div>
      ) : (
        <ResponsiveContainer width="100%" height={104}>
          <BarChart data={nsPods} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={104} {...axis} axisLine={false} />
            <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={11} fill={seriesColor(2, dk)}>
              <LabelList dataKey="value" position="right" style={{ fontSize: 10.5, fill: ink.secondary }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )),
    },
    {
      id: 'costns', icon: DollarSign, title: 'Cost by namespace', topic: 'cost',
      detailTitle: 'Cost and efficiency', hint: cost.installed ? 'From a configured price list' : undefined,
      detail: [
        { label: 'Monthly', value: cost.installed ? `$${fmt(Math.round(cost.monthly))}` : '—' },
        { label: 'Unused', value: cost.installed ? `$${fmt(Math.round(cost.wasteMonthly))}` : '—', tone: STATUS.warning },
        { label: 'Efficiency', value: cost.efficiency != null ? `${cost.efficiency}%` : '—' },
        { label: 'Measured', value: cost.installed ? `$${Number(cost.measured || 0).toFixed(2)}` : '—' },
      ],
      render: () => (!cost.installed || costNs.length === 0 ? (
        <div className={`text-[12.5px] py-5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>OpenCost is not reporting.</div>
      ) : (
        <ResponsiveContainer width="100%" height={104}>
          <BarChart data={costNs} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={104} {...axis} axisLine={false} />
            <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} formatter={(v) => [`$${v}`, 'cost']} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={11} fill={seriesColor(1, dk)}>
              <LabelList dataKey="value" position="right" formatter={(v) => `$${v}`} style={{ fontSize: 10, fill: ink.secondary }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )),
    },
    {
      id: 'images', icon: Boxes, title: 'Image hygiene', topic: 'image_hygiene',
      detailTitle: 'Container image hygiene', hint: 'Pinned vs floating tags',
      detail: [
        { label: 'Distinct', value: fmt(t.images) },
        { label: 'Pinned', value: fmt((t.images || 0) - (t.imagesFloating || 0)), tone: STATUS.good },
        { label: 'Floating', value: fmt(t.imagesFloating), tone: t.imagesFloating ? STATUS.warning : undefined },
        { label: 'Pinned %', value: `${pct((t.images || 0) - (t.imagesFloating || 0), t.images)}%` },
      ],
      table: {
        title: 'Images on a floating tag', columns: ['Image', 'Tag', 'Containers'],
        rows: (fleet?.datasets?.images || []).filter((i) => i.floating).map((i) => [i.image, i.tag, i.count]),
      },
      render: () => {
        const pinned = (t.images || 0) - (t.imagesFloating || 0);
        return (
          <div className="py-2">
            <div className="flex gap-[2px] h-2.5 mb-3">
              {pinned > 0 && <div className="rounded-l" style={{ flexGrow: pinned, background: STATUS.good }} />}
              {t.imagesFloating > 0 && <div className="rounded-r" style={{ flexGrow: t.imagesFloating, background: STATUS.warning }} />}
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: STATUS.good }} />
                <span className={`text-[12px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>Pinned {pinned}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: STATUS.warning }} />
                <span className={`text-[12px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>Floating {t.imagesFloating || 0}</span>
              </span>
            </div>
          </div>
        );
      },
    },
  ];

  const visible = CARDS.filter((c) => !hidden.has(c.id));

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-[11.5px] ${dk ? 'text-gray-500' : 'text-gray-500'}`}>
          Double-click any card for the detailed view and AI suggestions · hover to remove
        </p>
        {hidden.size > 0 && (
          <button onClick={restoreAll}
            className={`text-[11.5px] underline ${dk ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-800'}`}>
            Restore {hidden.size} removed card{hidden.size > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visible.map((c) => (
          <Card key={c.id} dk={dk} icon={c.icon} title={c.title} hint={c.hint}
            onOpen={() => setOpen(c)} onRemove={() => remove(c.id)}>
            {c.render()}
          </Card>
        ))}
      </div>

      {open && <Detail card={open} hours={hours} dk={dk} onClose={() => setOpen(null)} />}
    </>
  );
};

export default KubernetesVisuals;

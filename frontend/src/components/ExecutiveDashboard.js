import React, { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, LabelList,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { SEVERITY, STATUS, INK, seriesColor } from './fleetPalette';
import { Panel, tooltipStyle, axisProps, Empty, fmt, pct } from './FleetDashboard';

/**
 * Executive view.
 *
 * Different reader, different job: an executive needs the few numbers that
 * change a decision, each with a direction and a "so what" — not every metric
 * the operations tab carries. So this leads with hero figures and plain-English
 * posture statements, and keeps charts to the two questions that actually get
 * asked: where is the money going, and is risk improving.
 *
 * Deliberately NOT here: per-namespace tables, pod phases, image tags. Those
 * are operational detail and live on the Fleet tab.
 */

const Hero = ({ label, value, unit, caption, tone, dk }) => (
  <div className="px-6 py-5">
    <div className={`text-[10.5px] uppercase tracking-[0.08em] ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{label}</div>
    <div className="flex items-baseline gap-1.5 mt-2">
      <span className="text-[44px] leading-none font-light tracking-tight tabular-nums"
        style={{ color: tone || (dk ? '#fff' : '#0b0b0b') }}>{value}</span>
      {unit && <span className={`text-[15px] ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{unit}</span>}
    </div>
    {caption && <div className={`text-[12px] mt-2 leading-snug ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{caption}</div>}
  </div>
);

/** A posture line: a verdict a non-engineer can act on, with its evidence. */
const Posture = ({ state, title, detail, dk }) => {
  const tone = state === 'good' ? STATUS.good : state === 'warn' ? STATUS.warning : STATUS.critical;
  const Icon = state === 'good' ? TrendingUp : state === 'warn' ? Minus : TrendingDown;
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex items-center justify-center w-6 h-6 rounded-full shrink-0"
        style={{ background: `${tone}1f`, color: tone }}>
        <Icon size={13} />
      </span>
      <div className="min-w-0">
        <div className={`text-[13px] font-medium ${dk ? 'text-gray-100' : 'text-gray-900'}`}>{title}</div>
        <div className={`text-[12px] mt-0.5 leading-relaxed ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{detail}</div>
      </div>
    </div>
  );
};

const ExecutiveDashboard = ({ fleet, dk, onGoToTab }) => {
  const ink = INK[dk ? 'dark' : 'light'];
  const tip = tooltipStyle(dk);

  const t = useMemo(() => fleet?.totals || {}, [fleet]);
  const alerts = useMemo(() => fleet?.alerts || {}, [fleet]);
  const vuln = useMemo(() => fleet?.vulnerabilities || {}, [fleet]);
  const cost = useMemo(() => fleet?.cost || {}, [fleet]);
  const clusters = useMemo(() => fleet?.clusters || { list: [], unreachable: [] }, [fleet]);

  /** Availability = nodes ready and workloads at desired replicas. */
  const availability = useMemo(() => {
    const parts = [];
    if (t.nodes) parts.push(t.nodesReady / t.nodes);
    if (t.workloads) parts.push((t.workloads - (t.workloadsDegraded || 0)) / t.workloads);
    if (t.pods) parts.push(t.podsRunning / t.pods);
    if (!parts.length) return null;
    return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 1000) / 10;
  }, [t]);

  const alertTrend = useMemo(() => (alerts.overTime || []).map((b) => ({
    label: new Date(`${b.hour}:00Z`).toLocaleTimeString([], { hour: '2-digit' }),
    Alerts: b.count,
  })), [alerts.overTime]);

  /** Is alert volume rising or falling across the window? */
  const trend = useMemo(() => {
    const v = alertTrend.map((d) => d.Alerts);
    if (v.length < 4) return null;
    const h = Math.floor(v.length / 2);
    const a = v.slice(0, h).reduce((s, x) => s + x, 0);
    const b = v.slice(h).reduce((s, x) => s + x, 0);
    if (!a) return null;
    return Math.round(((b - a) / a) * 100);
  }, [alertTrend]);

  const costByCluster = useMemo(() => {
    // Executives compare business units, which here means clusters.
    const list = clusters.list || [];
    if (!cost.installed || list.length === 0) return [];
    // One cluster reports cost today; attribute honestly rather than splitting.
    return list.map((c) => ({ name: c.name, value: list.length === 1 ? cost.monthly : null }))
      .filter((d) => d.value != null);
  }, [clusters.list, cost]);

  const riskMix = useMemo(() => {
    const v = vuln.totals || {};
    return [
      { name: 'Critical', value: v.critical || 0, key: 'critical' },
      { name: 'High', value: v.high || 0, key: 'high' },
      { name: 'Medium', value: v.medium || 0, key: 'medium' },
      { name: 'Low', value: v.low || 0, key: 'low' },
    ].filter((d) => d.value > 0);
  }, [vuln.totals]);

  const postures = useMemo(() => {
    const out = [];

    if (availability != null) {
      out.push({
        state: availability >= 99 ? 'good' : availability >= 95 ? 'warn' : 'bad',
        title: `Platform availability ${availability}%`,
        detail: `${t.nodesReady} of ${t.nodes} nodes ready, ${t.workloads - (t.workloadsDegraded || 0)} of ${t.workloads} workloads at their desired replica count.`,
      });
    }

    if (clusters.unreachable?.length) {
      out.push({
        state: 'bad',
        title: `${clusters.unreachable.length} cluster${clusters.unreachable.length > 1 ? 's are' : ' is'} not being monitored`,
        detail: `${clusters.unreachable.map((u) => u.name).join(', ')} could not be read, so nothing on this page covers ${clusters.unreachable.length > 1 ? 'them' : 'it'}.`,
      });
    }

    if (vuln.installed) {
      const crit = vuln.totals?.critical || 0;
      out.push({
        state: crit === 0 ? 'good' : crit > 100 ? 'bad' : 'warn',
        title: `${fmt(crit)} critical vulnerabilities outstanding`,
        detail: `${fmt(vuln.totals?.total)} findings across ${fmt(vuln.scannedWorkloads)} scanned workloads. Critical findings are the ones with known exploits.`,
      });
    }

    if (cost.installed && cost.efficiency != null) {
      out.push({
        state: cost.efficiency >= 70 ? 'good' : cost.efficiency >= 40 ? 'warn' : 'bad',
        title: `${cost.efficiency}% of reserved capacity is actually used`,
        detail: `About $${fmt(Math.round(cost.wasteMonthly))} of the $${fmt(Math.round(cost.monthly))} monthly run-rate is reserved but idle. Lowering requests to match real usage recovers most of it.`,
      });
    }

    if (trend != null) {
      out.push({
        state: trend <= 0 ? 'good' : trend > 50 ? 'bad' : 'warn',
        title: `Alert volume ${trend > 0 ? 'up' : 'down'} ${Math.abs(trend)}% across the window`,
        detail: `${fmt(alerts.total)} alerts in total, ${fmt(alerts.severity?.critical)} of them critical.`,
      });
    }

    return out;
  }, [availability, clusters, vuln, cost, trend, alerts, t]);

  const money = (v) => `$${fmt(Math.round(v || 0))}`;

  return (
    <div className="space-y-5">

      {/* ── hero figures: the four numbers that change a decision ── */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 rounded-xl border divide-y sm:divide-y-0 sm:divide-x overflow-hidden
        ${dk ? 'bg-[#131313] border-[#232323] divide-[#232323]' : 'bg-white border-gray-200 divide-gray-100'}`}>
        <Hero dk={dk} label="Monthly run-rate"
          value={cost.installed ? money(cost.monthly) : '—'}
          caption={cost.installed
            ? `${money(cost.wasteMonthly)} of this is reserved but unused`
            : 'No cost provider is reporting'} />
        <Hero dk={dk} label="Availability"
          value={availability != null ? availability : '—'} unit={availability != null ? '%' : ''}
          tone={availability == null ? undefined : availability >= 99 ? STATUS.good : availability >= 95 ? STATUS.warning : STATUS.critical}
          caption={`${t.nodesReady}/${t.nodes} nodes · ${t.podsRunning}/${t.pods} pods running`} />
        <Hero dk={dk} label="Critical risk"
          value={vuln.installed ? fmt(vuln.totals?.critical) : '—'}
          tone={vuln.totals?.critical ? STATUS.critical : undefined}
          caption={vuln.installed
            ? `of ${fmt(vuln.totals?.total)} findings across the fleet`
            : 'Vulnerability scanning is not reporting'} />
        <Hero dk={dk} label="Estate"
          value={fmt(clusters.reachable)} unit={clusters.reachable === 1 ? 'cluster' : 'clusters'}
          tone={clusters.unreachable?.length ? STATUS.warning : undefined}
          caption={`${fmt(t.nodes)} nodes · ${fmt(t.pods)} pods · ${fmt(t.cpuCores)} vCPU${
            clusters.unreachable?.length ? ` · ${clusters.unreachable.length} unreachable` : ''}`} />
      </div>

      {/* ── posture: the verdicts, in plain English ── */}
      <Panel dk={dk} title="Where the estate stands"
        subtitle="Each line is a verdict with the evidence behind it"
        right={onGoToTab && (
          <button onClick={() => onGoToTab('fleet')}
            className={`inline-flex items-center gap-1.5 text-[12px] ${dk ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
            Operational detail <ArrowRight size={12} />
          </button>
        )}>
        {postures.length === 0 ? (
          <Empty dk={dk}>Not enough data to assess the estate yet.</Empty>
        ) : (
          <div className={`divide-y ${dk ? 'divide-[#1e1e1e]' : 'divide-gray-100'}`}>
            {postures.map((p, i) => <Posture key={i} {...p} dk={dk} />)}
          </div>
        )}
      </Panel>

      {/* ── the two questions executives actually ask ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel dk={dk} title="Operational load"
          subtitle={trend == null ? 'Alerts per hour' : `Alerts per hour · ${trend > 0 ? 'up' : 'down'} ${Math.abs(trend)}% over the window`}>
          {alertTrend.length < 2 ? <Empty dk={dk}>Not enough history in this window.</Empty> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={alertTrend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="execLoad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={seriesColor(0, dk)} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={seriesColor(0, dk)} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" {...axisProps(dk)} interval="preserveStartEnd" minTickGap={36} />
                <YAxis {...axisProps(dk)} axisLine={false} width={56} allowDecimals={false} />
                <Tooltip {...tip} />
                <Area type="monotone" dataKey="Alerts" stroke={seriesColor(0, dk)} strokeWidth={2} fill="url(#execLoad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel dk={dk} title="Security exposure"
          subtitle={vuln.installed ? 'Findings by severity, fleet-wide' : undefined}>
          {!vuln.installed ? (
            <Empty dk={dk}>Vulnerability scanning is not reporting.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={riskMix} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" {...axisProps(dk)} />
                <YAxis {...axisProps(dk)} axisLine={false} width={56} />
                <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {riskMix.map((d) => <Cell key={d.key} fill={SEVERITY[d.key]} />)}
                  <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: ink.secondary }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* ── spend attribution ── */}
      {cost.installed && (
        <Panel dk={dk} title="Where the money goes"
          subtitle={`Top namespaces by cost over ${cost.coveredHours}h. Figures come from a configured price list, not a cloud invoice.`}>
          {(cost.byNamespace || []).length === 0 ? (
            <Empty dk={dk}>No allocation rows in this window.</Empty>
          ) : (
            <div className="space-y-2.5">
              {(cost.byNamespace || []).slice(0, 8).map((n) => {
                const share = pct(n.totalCost, cost.measured);
                return (
                  <div key={n.name} className="flex items-center gap-3">
                    <span className={`text-[12.5px] w-40 truncate ${dk ? 'text-gray-300' : 'text-gray-700'}`} title={n.name}>{n.name}</span>
                    <div className={`flex-1 h-2 rounded-full ${dk ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: seriesColor(0, dk) }} />
                    </div>
                    <span className={`text-[12px] tabular-nums w-14 text-right ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{share}%</span>
                    <span className={`text-[12px] tabular-nums w-20 text-right ${dk ? 'text-gray-300' : 'text-gray-700'}`}>
                      ${Number(n.totalCost).toFixed(3)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
};

export default ExecutiveDashboard;

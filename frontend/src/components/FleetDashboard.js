import React, { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell, LabelList,
} from 'recharts';
import {
  Boxes, Server, Layers, AlertTriangle, ShieldAlert, DollarSign, Cpu, HardDrive, CircleSlash,
} from 'lucide-react';
import { SEVERITY, STATUS, INK, seriesColor } from './fleetPalette';
import KubernetesVisuals from './KubernetesVisuals';

/**
 * Fleet operations dashboard — every connected cluster, on one page.
 *
 * Forms are chosen by the data's job, not by variety:
 *   single current value        -> stat tile, never a one-bar chart
 *   magnitude, low→high         -> bar (horizontal when names are long)
 *   trend over time             -> area, one series
 *   part-to-whole across items  -> stacked bar
 *   >7 meaningful classes       -> table
 *
 * Every chart carries a hover layer, a legend when it has 2+ series, and
 * recessive grid/axes. Severity is an ordered scale, so it uses the severity
 * ramp rather than categorical identity hues.
 */

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* ── shared chrome ────────────────────────────────────────────────────── */

const Panel = ({ title, subtitle, children, dk, right, className = '' }) => (
  <section className={`rounded-xl border ${dk ? 'bg-[#131313] border-[#232323]' : 'bg-white border-gray-200'} ${className}`}>
    <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
      <div>
        <h3 className={`text-[13.5px] font-semibold ${dk ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
        {subtitle && <p className={`text-[11.5px] mt-0.5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{subtitle}</p>}
      </div>
      {right}
    </header>
    <div className="px-5 pb-5">{children}</div>
  </section>
);

const Stat = ({ icon: Icon, label, value, sub, tone, dk, onClick }) => (
  <div onClick={onClick}
    className={`px-5 py-4 ${onClick ? 'cursor-pointer' : ''} ${dk ? 'hover:bg-[#161616]' : 'hover:bg-gray-50'} transition-colors`}>
    <div className={`flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.07em] ${dk ? 'text-gray-500' : 'text-gray-500'}`}>
      {Icon && <Icon size={11} />} {label}
    </div>
    <div className="text-[25px] leading-none font-medium tabular-nums mt-1.5"
      style={{ color: tone || (dk ? '#fff' : '#0b0b0b') }}>{value}</div>
    {sub && <div className={`text-[11.5px] mt-1 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{sub}</div>}
  </div>
);

const tooltipStyle = (dk) => ({
  contentStyle: {
    background: dk ? '#1c1c1c' : '#fff',
    border: `1px solid ${dk ? '#333' : '#e5e5e5'}`,
    borderRadius: 8, fontSize: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,.16)',
  },
  labelStyle: { color: dk ? '#fff' : '#0b0b0b', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: dk ? '#c3c2b7' : '#52514e' },
});

/** Axis/grid are context, not content — keep them recessive. */
const axisProps = (dk) => ({
  tick: { fontSize: 10.5, fill: INK[dk ? 'dark' : 'light'].muted },
  tickLine: false,
  axisLine: { stroke: INK[dk ? 'dark' : 'light'].grid },
});

const Empty = ({ children, dk, height = 160 }) => (
  <div className={`flex items-center justify-center text-[12px] ${dk ? 'text-gray-600' : 'text-gray-400'}`} style={{ height }}>
    {children}
  </div>
);

/* ── dashboard ────────────────────────────────────────────────────────── */

const FleetDashboard = ({ fleet, dk, onDrill, hours = 24 }) => {
  const ink = INK[dk ? 'dark' : 'light'];
  const tip = tooltipStyle(dk);

  const t = fleet?.totals || {};
  const alerts = fleet?.alerts || {};
  const vuln = fleet?.vulnerabilities || {};
  const cost = fleet?.cost || {};
  const clusters = fleet?.clusters || { list: [], unreachable: [] };

  // ── derived series ──────────────────────────────────────────────────
  const alertTrend = useMemo(() => (alerts.overTime || []).map((b) => ({
    label: new Date(`${b.hour}:00Z`).toLocaleTimeString([], { hour: '2-digit' }),
    Alerts: b.count,
  })), [alerts.overTime]);

  const alertsByCluster = useMemo(() => (alerts.byCluster || []).slice(0, 8).map((c) => ({
    cluster: c.cluster, Critical: c.critical, Warning: c.warning, Info: c.info,
  })), [alerts.byCluster]);

  const topAlerts = useMemo(() => (alerts.top || []).slice(0, 8).map((a) => ({
    name: a.alertname.length > 28 ? `${a.alertname.slice(0, 27)}…` : a.alertname,
    full: a.alertname, value: a.count, severity: a.severity,
  })), [alerts.top]);

  const nsAlerts = useMemo(() => (alerts.byNamespace || []).slice(0, 8)
    .map((n) => ({ name: n.namespace, value: n.count })), [alerts.byNamespace]);

  const capacity = useMemo(() => (clusters.list || []).map((c) => ({
    cluster: c.name, 'CPU cores': c.cpuCores, 'Memory Gi': c.memoryGi,
  })), [clusters.list]);

  const vulnSeverity = useMemo(() => {
    const v = vuln.totals || {};
    // Ordered scale -> ramp, and ordered left→right by severity, not by size.
    return ['critical', 'high', 'medium', 'low', 'unknown']
      .map((k) => ({ name: k[0].toUpperCase() + k.slice(1), value: v[k] || 0, key: k }))
      .filter((d) => d.value > 0);
  }, [vuln.totals]);

  const costNs = useMemo(() => (cost.byNamespace || []).slice(0, 8)
    .map((n) => ({ name: n.name, value: n.totalCost })), [cost.byNamespace]);

  const phase = fleet?.podPhase || {};

  return (
    <div className="space-y-5">

      {/* ── KPI row: single current values belong in stat tiles ── */}
      <div className={`grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 rounded-xl border divide-x divide-y xl:divide-y-0 overflow-hidden
        ${dk ? 'bg-[#131313] border-[#232323] divide-[#232323]' : 'bg-white border-gray-200 divide-gray-100'}`}>
        <Stat dk={dk} icon={Boxes} label="Clusters" value={fmt(clusters.reachable)}
          sub={clusters.unreachable?.length ? `${clusters.unreachable.length} unreachable` : `${clusters.verified} verified`}
          tone={clusters.unreachable?.length ? STATUS.warning : undefined} />
        <Stat dk={dk} icon={Server} label="Nodes" value={`${t.nodesReady}/${t.nodes}`}
          sub={`${t.cpuCores} vCPU · ${t.memoryGi} Gi`}
          tone={t.nodesReady === t.nodes ? undefined : STATUS.critical} />
        <Stat dk={dk} icon={Layers} label="Pods running" value={`${t.podsRunning}/${t.pods}`}
          sub={`${pct(t.podSlotsUsed, t.podSlots)}% of ${fmt(t.podSlots)} slots`} />
        <Stat dk={dk} icon={Boxes} label="Workloads" value={fmt(t.workloads)}
          sub={t.workloadsDegraded ? `${t.workloadsDegraded} degraded` : 'all at desired'}
          tone={t.workloadsDegraded ? STATUS.warning : undefined} />
        <Stat dk={dk} icon={AlertTriangle} label="Alerts" value={fmt(alerts.total)}
          sub={`${fmt(alerts.severity?.critical)} critical`}
          tone={alerts.severity?.critical ? STATUS.critical : undefined}
          onClick={onDrill ? () => onDrill('alerts') : undefined} />
        <Stat dk={dk} icon={ShieldAlert} label="Vulnerabilities"
          value={vuln.installed ? fmt(vuln.totals?.total) : '—'}
          sub={vuln.installed ? `${fmt(vuln.totals?.critical)} critical` : 'Trivy not reporting'}
          tone={vuln.totals?.critical ? STATUS.critical : undefined} />
        <Stat dk={dk} icon={DollarSign} label="Monthly cost"
          value={cost.installed ? `$${fmt(Math.round(cost.monthly))}` : '—'}
          sub={cost.installed ? `$${fmt(Math.round(cost.wasteMonthly))} unused` : 'OpenCost not reporting'}
          tone={cost.installed ? undefined : undefined} />
      </div>

      {/* ── per-metric visuals: removable, double-click for detail + AI ── */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className={`text-[13.5px] font-semibold ${dk ? 'text-gray-100' : 'text-gray-900'}`}>Kubernetes health</h3>
        </div>
        <KubernetesVisuals fleet={fleet} hours={hours} dk={dk} />
      </section>

      {/* ── clusters: >7 meaningful columns, so a table, not a chart ── */}
      <Panel dk={dk} title="Clusters" subtitle="Every connected cluster — click a column header to sort">
        {clusters.list?.length === 0 ? (
          <Empty dk={dk}>No reachable clusters.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className={`text-[10px] uppercase tracking-wide ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
                  {['Cluster', 'Nodes', 'Pods', 'Namespaces', 'Workloads', 'vCPU', 'Memory', 'Restarts', 'Access'].map((h, i) => (
                    <th key={h} className={`pb-2 font-medium ${i === 0 ? 'text-left' : i === 8 ? 'text-right' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${dk ? 'divide-[#1e1e1e]' : 'divide-gray-100'}`}>
                {clusters.list.map((c) => (
                  <tr key={c.id} className={dk ? 'hover:bg-[#161616]' : 'hover:bg-gray-50'}>
                    <td className={`py-2.5 text-[12.5px] ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{c.name}</td>
                    <td className="py-2.5 text-[12.5px] text-right tabular-nums"
                      style={{ color: c.nodesReady === c.nodes ? undefined : STATUS.critical }}>
                      {c.nodesReady}/{c.nodes}
                    </td>
                    <td className={`py-2.5 text-[12.5px] text-right tabular-nums ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{c.podsRunning}/{c.pods}</td>
                    <td className={`py-2.5 text-[12.5px] text-right tabular-nums ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{c.namespaces}</td>
                    <td className={`py-2.5 text-[12.5px] text-right tabular-nums ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{c.workloads}</td>
                    <td className={`py-2.5 text-[12.5px] text-right tabular-nums ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{c.cpuCores}</td>
                    <td className={`py-2.5 text-[12.5px] text-right tabular-nums ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{c.memoryGi} Gi</td>
                    <td className="py-2.5 text-[12.5px] text-right tabular-nums"
                      style={{ color: c.restarts > 0 ? STATUS.warning : (dk ? '#8a8a85' : '#52514e') }}>{c.restarts}</td>
                    <td className="py-2.5 text-[11.5px] text-right">
                      <span style={{ color: c.verified ? STATUS.good : STATUS.warning }}>
                        {c.verified ? 'verified' : 'unverified'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {clusters.unreachable?.length > 0 && (
          <div className={`mt-4 pt-3 border-t ${dk ? 'border-[#232323]' : 'border-gray-200'}`}>
            <div className="flex items-start gap-2">
              <CircleSlash size={13} className={`shrink-0 mt-0.5 ${dk ? 'text-gray-600' : 'text-gray-400'}`} />
              <div>
                <p className={`text-[12px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>
                  {clusters.unreachable.length} cluster{clusters.unreachable.length > 1 ? 's' : ''} could not be read and {clusters.unreachable.length > 1 ? 'are' : 'is'} excluded from every number above
                </p>
                {clusters.unreachable.map((u) => (
                  <p key={u.id} className={`text-[11.5px] mt-1 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>
                    <strong>{u.name}</strong> — {u.reason}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* ── alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel dk={dk} title="Alert volume" subtitle={`Per hour across the fleet · ${alerts.total || 0} total`}>
          {alertTrend.length < 2 ? <Empty dk={dk}>Not enough history in this window.</Empty> : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={alertTrend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fleetAlertArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={seriesColor(0, dk)} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={seriesColor(0, dk)} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" {...axisProps(dk)} interval="preserveStartEnd" minTickGap={34} />
                <YAxis {...axisProps(dk)} axisLine={false} width={56} allowDecimals={false} />
                <Tooltip {...tip} />
                {/* one series: the title names it, so no legend box */}
                <Area type="monotone" dataKey="Alerts" stroke={seriesColor(0, dk)} strokeWidth={2}
                  fill="url(#fleetAlertArea)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel dk={dk} title="Alert severity by cluster" subtitle="Part-to-whole per cluster">
          {alertsByCluster.length === 0 ? <Empty dk={dk}>No alerts in this window.</Empty> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={alertsByCluster} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="cluster" {...axisProps(dk)} />
                <YAxis {...axisProps(dk)} axisLine={false} width={56} allowDecimals={false} />
                <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
                <Legend wrapperStyle={{ fontSize: 11.5, color: ink.muted, paddingTop: 6 }} iconType="circle" iconSize={8} itemSorter={null} />
                {/* 2px surface gap between stacked segments keeps them readable */}
                <Bar dataKey="Critical" stackId="s" fill={SEVERITY.critical} />
                <Bar dataKey="Warning" stackId="s" fill={SEVERITY.warning} />
                <Bar dataKey="Info" stackId="s" fill={SEVERITY.info} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel dk={dk} title="Most frequent alerts" subtitle="Ranked by occurrences in this window">
          {topAlerts.length === 0 ? <Empty dk={dk}>No alerts in this window.</Empty> : (
            <ResponsiveContainer width="100%" height={Math.max(200, topAlerts.length * 30)}>
              <BarChart data={topAlerts} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" {...axisProps(dk)} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={170} {...axisProps(dk)} axisLine={false} />
                <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }}
                  formatter={(v, _n, p) => [v, p?.payload?.full || 'occurrences']} />
                {/* magnitude -> one hue; severity is carried by the direct label */}
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} fill={seriesColor(0, dk)}>
                  <LabelList dataKey="value" position="right"
                    style={{ fontSize: 11, fill: ink.secondary }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel dk={dk} title="Noisiest namespaces" subtitle="Alert count, fleet-wide">
          {nsAlerts.length === 0 ? <Empty dk={dk}>No alerts in this window.</Empty> : (
            <ResponsiveContainer width="100%" height={Math.max(200, nsAlerts.length * 30)}>
              <BarChart data={nsAlerts} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" {...axisProps(dk)} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} {...axisProps(dk)} axisLine={false} />
                <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} fill={seriesColor(0, dk)}>
                  <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: ink.secondary }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* ── capacity + workload health ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel dk={dk} title="Capacity by cluster" subtitle="Two measures of different scale — shown as two charts, never one dual axis">
          {capacity.length === 0 ? <Empty dk={dk}>No clusters reporting.</Empty> : (
            <div className="grid grid-cols-2 gap-4">
              {[['CPU cores', Cpu, 0], ['Memory Gi', HardDrive, 2]].map(([key, Icon, slot]) => (
                <div key={key}>
                  <div className={`flex items-center gap-1.5 text-[11px] mb-1.5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>
                    <Icon size={11} /> {key}
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={capacity} margin={{ top: 4, right: 6, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="cluster" {...axisProps(dk)} />
                      <YAxis {...axisProps(dk)} axisLine={false} width={56} />
                      <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
                      <Bar dataKey={key} radius={[4, 4, 0, 0]} maxBarSize={44} fill={seriesColor(slot, dk)}>
                        <LabelList dataKey={key} position="top" style={{ fontSize: 10.5, fill: ink.secondary }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel dk={dk} title="Workload health" subtitle="Pod phase and image hygiene across the fleet">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {[
              ['Running', phase.Running || 0, STATUS.good],
              ['Pending', phase.Pending || 0, STATUS.warning],
              ['Failed', (phase.Failed || 0) + (phase.Unknown || 0), STATUS.critical],
              ['Succeeded', phase.Succeeded || 0, STATUS.neutral],
            ].map(([label, v, c]) => (
              <div key={label}>
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>{label}</span>
                  <span className={`text-[12.5px] tabular-nums ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{fmt(v)}</span>
                </div>
                <div className={`h-1.5 rounded-full mt-1.5 ${dk ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                  <div className="h-full rounded-full" style={{ width: `${pct(v, t.pods)}%`, background: c }} />
                </div>
              </div>
            ))}
          </div>
          <div className={`grid grid-cols-3 gap-4 mt-5 pt-4 border-t ${dk ? 'border-[#232323]' : 'border-gray-200'}`}>
            {[
              ['Container restarts', fmt(t.restarts), t.restarts ? STATUS.warning : undefined],
              ['Distinct images', fmt(t.images), undefined],
              ['On a floating tag', fmt(t.imagesFloating), t.imagesFloating ? STATUS.warning : undefined],
            ].map(([label, v, tone]) => (
              <div key={label}>
                <div className="text-[16px] tabular-nums" style={{ color: tone || (dk ? '#fff' : '#0b0b0b') }}>{v}</div>
                <div className={`text-[10.5px] uppercase tracking-[0.07em] mt-0.5 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{label}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ── security + cost ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel dk={dk} title="Vulnerabilities by severity"
          subtitle={vuln.installed ? `${fmt(vuln.scannedWorkloads)} workloads scanned` : undefined}>
          {!vuln.installed ? (
            <Empty dk={dk}>Trivy Operator is not reporting for this fleet.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={vulnSeverity} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" {...axisProps(dk)} />
                <YAxis {...axisProps(dk)} axisLine={false} width={56} />
                <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {vulnSeverity.map((d) => <Cell key={d.key} fill={SEVERITY[d.key]} />)}
                  <LabelList dataKey="value" position="top" style={{ fontSize: 10.5, fill: ink.secondary }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel dk={dk} title="Cost by namespace"
          subtitle={cost.installed ? `${cost.currency} over ${cost.coveredHours}h · from a configured price list` : undefined}>
          {!cost.installed ? (
            <Empty dk={dk}>OpenCost is not reporting for this fleet.</Empty>
          ) : costNs.length === 0 ? (
            <Empty dk={dk}>No allocation rows in this window.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, costNs.length * 26)}>
              <BarChart data={costNs} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" {...axisProps(dk)} axisLine={false} />
                <YAxis type="category" dataKey="name" width={130} {...axisProps(dk)} axisLine={false} />
                <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }}
                  formatter={(v) => [`$${Number(v).toFixed(4)}`, 'cost']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16} fill={seriesColor(0, dk)}>
                  <LabelList dataKey="value" position="right"
                    formatter={(v) => `$${Number(v).toFixed(3)}`}
                    style={{ fontSize: 10.5, fill: ink.secondary }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
};

export default FleetDashboard;
export { Panel, Stat, tooltipStyle, axisProps, Empty, fmt, pct };

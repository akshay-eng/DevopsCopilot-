import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { getCostSummary, getCostAllocation, getClusterCosts } from '../services/api';
import {
  RefreshCw, Calendar, DollarSign, Loader2,
  Server, Layers, Boxes, Info, ArrowRight, ChevronRight, ChevronDown, CircleSlash,
} from 'lucide-react';
import TrendDetail from './TrendDetail';
import {
  PALETTE, Composition, HBars, VBars, TreemapTile, MetricTile,
} from './TrendTiles';

const STATUS = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626', idle: '#64748b' };

// OpenCost windows. Anything longer than Prometheus retention is reported as
// truncated by the API rather than quietly returning a flat line.
const WINDOWS = [['1h', '1H'], ['24h', '24H'], ['2d', '2D'], ['7d', '7D'], ['30d', '30D']];

const AGGREGATIONS = [
  ['namespace', 'Namespace', Layers],
  ['controller', 'Workload', Boxes],
  ['node', 'Node', Server],
  ['pod', 'Pod', Boxes],
];

const CostPage = () => {
  const { theme } = useTheme();
  const dk = theme === 'dark';
  const navigate = useNavigate();

  const [window_, setWindow] = useState('24h');
  const [cost, setCost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const [clusters, setClusters] = useState(null);
  const [openCluster, setOpenCluster] = useState(null);

  const [aggregate, setAggregate] = useState('namespace');
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);

  const page = dk ? 'bg-[#0b0b0b]' : 'bg-white';
  const h1 = dk ? 'text-gray-50' : 'text-gray-900';
  const h2 = dk ? 'text-gray-200' : 'text-gray-800';
  const muted = dk ? 'text-gray-500' : 'text-gray-500';
  const faint = dk ? 'text-gray-600' : 'text-gray-400';
  const divide = dk ? 'divide-[#1e1e1e]' : 'divide-gray-100';
  const borderC = dk ? 'border-[#1e1e1e]' : 'border-gray-100';
  const card = `rounded-xl border ${dk ? 'bg-[#131313] border-[#232323]' : 'bg-white border-gray-200'}`;

  const fetchCost = useCallback(async () => {
    setLoading(true);
    try {
      setCost(await getCostSummary(window_));
    } catch (e) {
      setCost({ installed: false, reason: 'Could not reach the cost API.' });
    } finally { setLoading(false); }
  }, [window_]);
  useEffect(() => { fetchCost(); }, [fetchCost]);

  const fetchClusters = useCallback(async () => {
    try {
      const r = await getClusterCosts(window_);
      setClusters(r || null);
    } catch (e) { setClusters(null); }
  }, [window_]);
  useEffect(() => { fetchClusters(); }, [fetchClusters]);

  const fetchRows = useCallback(async () => {
    if (!cost?.installed) return;
    setRowsLoading(true);
    // Clear first: otherwise the previous dimension's rows stay on screen under
    // the new heading, so namespaces get read as workloads.
    setRows([]);
    try {
      const r = await getCostAllocation(window_, aggregate);
      setRows(r?.rows || []);
    } catch (e) { setRows([]); } finally { setRowsLoading(false); }
  }, [window_, aggregate, cost?.installed]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const money = useCallback((v, dp = 2) => {
    const n = Number(v) || 0;
    const cur = (cost?.currency || 'USD') === 'USD' ? '$' : `${cost?.currency} `;
    return `${cur}${n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  }, [cost]);

  const ns = useMemo(
    () => (cost?.namespaces || []).filter((n) => n.totalCost > 0).map((n) => ({ ...n, value: n.totalCost })),
    [cost]
  );
  const ctl = useMemo(
    () => (cost?.controllers || []).filter((c) => c.totalCost > 0).map((c) => ({ ...c, value: c.totalCost })),
    [cost]
  );
  const liveRows = useMemo(
    () => rows.filter((r) => r.totalCost > 0).map((r) => ({ ...r, value: r.totalCost })),
    [rows]
  );
  const t = cost?.totals || {};
  const share = (v) => (t.total ? Math.round((v / t.total) * 100) : 0);
  const waste = cost?.efficiency != null ? (t.monthly * (100 - cost.efficiency)) / 100 : null;

  // ── loading / not-installed ───────────────────────────────────────────────
  if (loading && !cost) {
    return (
      <div className={`flex-1 overflow-auto ${page}`}>
        <div className="px-8 py-7 max-w-[1500px] mx-auto">
          <div className="py-24 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" style={{ color: PALETTE.indigo }} />
            <span className={`text-[13px] ${muted}`}>Reading cost allocations…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!cost?.installed) {
    return (
      <div className={`flex-1 overflow-auto ${page}`}>
        <div className="px-8 py-7 max-w-[1500px] mx-auto">
          <h1 className={`text-[26px] font-semibold tracking-tight ${h1}`}>Kubernetes Cost</h1>
          <div className={`${card} mt-8 px-8 py-12 text-center`}>
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4"
              style={{ background: `${PALETTE.indigo}1a`, color: PALETTE.indigo }}>
              <DollarSign size={20} />
            </span>
            <h2 className={`text-[16px] font-semibold ${h1}`}>
              {cost?.configured ? `${cost.providerLabel || 'The cost provider'} is not responding` : 'Connect a cost provider'}
            </h2>
            <p className={`text-[13px] mt-2 max-w-xl mx-auto ${muted}`}>{cost?.reason}</p>

            <div className={`mt-6 mx-auto max-w-xl text-left rounded-lg border p-4 ${dk ? 'border-[#232323] bg-[#0e0e0e]' : 'border-gray-200 bg-[#fafbfc]'}`}>
              <p className={`text-[11px] uppercase tracking-[0.07em] mb-2 ${muted}`}>
                {cost?.configured ? 'Check the endpoint' : 'Option 1 — connect an existing instance'}
              </p>
              <p className={`text-[12.5px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>
                Add its URL under <strong>Integrations &rarr; Cost &rarr; OpenCost</strong> or <strong>Kubecost</strong>.
                This page reads whichever of those you configure, including its auth and TLS settings.
              </p>
              <button onClick={() => navigate('/dashboard/integrations')}
                className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium border ${dk ? 'border-[#2a2a2a] text-gray-200 hover:bg-[#1a1a1a]' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}>
                Open Integrations <ArrowRight size={12} />
              </button>

              <p className={`text-[11px] uppercase tracking-[0.07em] mt-5 mb-2 ${muted}`}>
                {cost?.configured ? 'Or reinstall' : 'Option 2 — install OpenCost on this cluster'}
              </p>
              <code className={`block text-[12px] font-mono leading-relaxed ${dk ? 'text-gray-300' : 'text-gray-700'}`}>
                kubectl create namespace opencost<br />
                kubectl apply -f k8s-configs/opencost/opencost.yaml
              </code>
            </div>
            <button onClick={fetchCost}
              className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
              style={{ background: PALETTE.indigo }}>
              <RefreshCw size={13} /> Check again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── main ──────────────────────────────────────────────────────────────────
  return (
    <div className={`flex-1 overflow-auto ${page}`}>
      <div className="px-8 py-7 max-w-[1500px] mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-6 flex-wrap mb-6">
          <div>
            <h1 className={`text-[26px] font-semibold tracking-tight ${h1}`}>Kubernetes Cost</h1>
            <p className={`text-[13px] mt-1 ${muted}`}>
              Where your cluster spend goes, and how much of it is reserved but unused
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10.5px] align-middle ${dk ? 'bg-[#1e1e1e] text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                via {cost.providerLabel}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border ${dk ? 'bg-[#131313] border-[#232323]' : 'bg-white border-gray-200'}`}>
              <Calendar size={13} className={faint} />
              {WINDOWS.map(([val, label]) => (
                <button key={val} onClick={() => setWindow(val)}
                  className={`px-2 py-0.5 rounded text-[12px] font-medium ${window_ === val ? (dk ? 'bg-[#232323] text-gray-100' : 'bg-gray-100 text-gray-900') : muted}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={() => { fetchCost(); fetchRows(); fetchClusters(); }}
              className={`p-2 rounded-lg border ${dk ? 'bg-[#131313] border-[#232323] text-gray-400' : 'bg-white border-gray-200 text-gray-500'}`}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Headline */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-x divide-y ${divide} border rounded-xl overflow-hidden ${dk ? 'border-[#232323]' : 'border-gray-200'} mb-7`}>
          <MetricTile dk={dk} value={money(t.monthly, 0)} caption="Projected monthly run-rate"
            axisLeft={`${money(t.hourly, 3)}/hr · ${money(t.daily)}/day`} axisRight=""
            onClick={() => setDetail({
              title: 'Projected spend',
              subtitle: `Extrapolated from ${cost.coveredHours}h of measured allocation at the configured rates`,
              kind: 'bar', xKey: 'name',
              data: [
                { name: 'Hourly', value: t.hourly },
                { name: 'Daily', value: t.daily },
                { name: 'Monthly', value: t.monthly },
              ],
              unit: 'A projection, not a forecast — it assumes the cluster stays exactly this size.',
              stats: [
                { label: 'Per hour', value: money(t.hourly, 3) },
                { label: 'Per day', value: money(t.daily) },
                { label: 'Per month', value: money(t.monthly, 0) },
                { label: 'Measured', value: money(t.total) },
              ],
              table: { title: 'By namespace', columns: ['Namespace', 'Total', 'CPU', 'RAM', 'Core-hours'],
                rows: ns.map((n) => [n.name, money(n.totalCost, 4), money(n.cpuCost, 4), money(n.ramCost, 4), n.cpuCoreHours] )},
            })}>
            <Composition dk={dk} segments={[
              { label: 'CPU', value: t.cpu, color: PALETTE.indigo },
              { label: 'RAM', value: t.ram, color: PALETTE.blue },
              { label: 'Storage', value: t.pv, color: PALETTE.teal },
              { label: 'Network', value: t.network, color: PALETTE.violet },
            ]} />
          </MetricTile>

          <MetricTile dk={dk} value={money(t.total)} caption={`Measured spend (${cost.coveredHours}h)`}
            axisLeft="0" axisRight={money(Math.max(...ns.map((n) => n.totalCost), 0))}
            onClick={() => setDetail({
              title: 'Cost by namespace', subtitle: `Measured allocation over ${cost.coveredHours}h`,
              kind: 'hbar', xKey: 'name', series: ['CPU', 'RAM'],
              data: ns.slice(0, 12).map((n) => ({ name: n.name, CPU: n.cpuCost, RAM: n.ramCost })),
              unit: `Cost in ${cost.currency} over the covered window.`,
              stats: [
                { label: 'Namespaces', value: String(ns.length) },
                { label: 'Most expensive', value: ns[0]?.name || '—' },
                { label: 'Its share', value: `${share(ns[0]?.totalCost || 0)}%` },
                { label: 'Total', value: money(t.total) },
              ],
              table: { title: 'Namespaces', columns: ['Namespace', 'Total', 'CPU', 'RAM', 'Core-hours', 'GB-hours'],
                rows: ns.map((n) => [n.name, money(n.totalCost, 4), money(n.cpuCost, 4), money(n.ramCost, 4), n.cpuCoreHours, n.ramGbHours]) },
            })}>
            <HBars items={ns.slice(0, 6)} color={PALETTE.indigo} dk={dk} />
          </MetricTile>

          <MetricTile dk={dk} value={cost.efficiency != null ? `${cost.efficiency}%` : '—'}
            caption="Resource efficiency"
            axisLeft={cost.efficiency != null && cost.efficiency < 50 ? 'requests far exceed usage' : 'usage vs requests'}
            axisRight=""
            onClick={() => setDetail({
              title: 'Resource efficiency',
              subtitle: 'Usage as a share of what was requested — low values mean you are paying for reserved capacity nobody uses',
              kind: 'hbar', xKey: 'name',
              data: ns.filter((n) => n.efficiency != null).map((n) => ({ name: n.name, value: n.efficiency })),
              unit: 'Percent. OpenCost compares measured usage against requests.',
              stats: [
                { label: 'Average', value: `${cost.efficiency}%` },
                { label: 'Best', value: `${Math.max(...ns.filter((n) => n.efficiency != null).map((n) => n.efficiency), 0)}%`, tone: STATUS.ok },
                { label: 'Worst', value: `${Math.min(...ns.filter((n) => n.efficiency != null).map((n) => n.efficiency), 100)}%`, tone: STATUS.warn },
                { label: 'Namespaces', value: String(ns.filter((n) => n.efficiency != null).length) },
              ],
              table: { title: 'Efficiency by namespace', columns: ['Namespace', 'Efficiency %', 'Spend'],
                rows: ns.filter((n) => n.efficiency != null).map((n) => [n.name, n.efficiency, money(n.totalCost, 4)]) },
            })}>
            {cost.efficiency != null
              ? <Composition dk={dk} segments={[
                { label: 'Used', value: Math.round(cost.efficiency * 10) / 10, color: STATUS.ok },
                { label: 'Requested, unused', value: Math.max(0, Math.round((100 - cost.efficiency) * 10) / 10), color: STATUS.warn },
              ]} />
              : <div className={`flex items-center justify-center text-[11.5px] ${faint}`} style={{ height: 96 }}>No efficiency data</div>}
          </MetricTile>

          <MetricTile dk={dk} value={waste != null ? money(waste, 0) : '—'}
            caption="Monthly cost of unused requests"
            axisLeft="right-sizing opportunity" axisRight=""
            onClick={() => setDetail({
              title: 'Right-sizing opportunity',
              subtitle: 'The share of the monthly run-rate attributable to requested-but-unused CPU and memory. Lowering requests to match real usage recovers most of this.',
              kind: 'hbar', xKey: 'name',
              data: ns.filter((n) => n.efficiency != null)
                .map((n) => ({ name: n.name, value: Math.round(n.totalCost * (100 - n.efficiency)) / 100 }))
                .sort((a, b) => b.value - a.value).slice(0, 12),
              unit: 'Cost of the unused portion over the covered window, by namespace.',
              stats: [
                { label: 'Monthly waste', value: money(waste, 0), tone: STATUS.warn },
                { label: 'Efficiency', value: `${cost.efficiency}%` },
                { label: 'Monthly total', value: money(t.monthly, 0) },
                { label: 'Worst namespace', value: ns.filter((n) => n.efficiency != null).sort((a, b) => a.efficiency - b.efficiency)[0]?.name || '—' },
              ],
              table: { title: 'Unused by namespace', columns: ['Namespace', 'Efficiency %', 'Spend', 'Unused'],
                rows: ns.filter((n) => n.efficiency != null)
                  .map((n) => [n.name, n.efficiency, money(n.totalCost, 4), money((n.totalCost * (100 - n.efficiency)) / 100, 4)]) },
            })}>
            <VBars data={ns.filter((n) => n.efficiency != null).slice(0, 10).map((n) => Math.round(n.totalCost * (100 - n.efficiency)))}
              labels={ns.filter((n) => n.efficiency != null).slice(0, 10).map((n) => n.name)}
              color={STATUS.warn} dk={dk} />
          </MetricTile>
        </div>

        {/* Resource split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-7">
          <div className={`${card} p-5`}>
            <h3 className={`text-[11px] uppercase tracking-[0.07em] mb-4 ${muted}`}>Spend by resource</h3>
            {[
              ['CPU', t.cpu, PALETTE.indigo, cost.pricing?.cpuPerCoreHour, 'core-hour'],
              ['Memory', t.ram, PALETTE.blue, cost.pricing?.ramPerGbHour, 'GB-hour'],
              ['Storage', t.pv, PALETTE.teal, null, null],
              ['Network', t.network, PALETTE.violet, null, null],
            ].map(([label, val, color, rate, unit]) => (
              <div key={label} className="mb-3.5 last:mb-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
                    <span className={`text-[12.5px] ${h2}`}>{label}</span>
                    {rate != null && <span className={`text-[11px] ${faint}`}>{money(rate, 4)}/{unit}</span>}
                  </span>
                  <span className={`text-[12.5px] tabular-nums ${h2}`}>{money(val, 3)} <span className={faint}>· {share(val)}%</span></span>
                </div>
                <div className={`h-1.5 rounded-full ${dk ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                  <div className="h-full rounded-full" style={{ width: `${share(val)}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>

          <div className={`${card} p-5`}>
            <h3 className={`text-[11px] uppercase tracking-[0.07em] mb-4 ${muted}`}>Share by namespace</h3>
            <TreemapTile data={ns.map((n) => ({ name: n.name, value: Math.round(n.totalCost * 10000) }))} height={180} dk={dk} />
          </div>

          <div className={`${card} p-5`}>
            <h3 className={`text-[11px] uppercase tracking-[0.07em] mb-4 ${muted}`}>Most expensive workloads</h3>
            {ctl.length === 0 ? (
              <p className={`text-[12px] ${faint}`}>No workload-level allocation yet.</p>
            ) : (
              <div className="space-y-2.5">
                {ctl.slice(0, 7).map((c) => (
                  <div key={c.name} className="flex items-center justify-between gap-3">
                    <span className={`text-[12px] truncate ${h2}`} title={c.name}>{c.name}</span>
                    <span className={`text-[12px] tabular-nums shrink-0 ${muted}`}>{money(c.totalCost, 4)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Per-cluster */}
        <div className={`${card} overflow-hidden mb-7`}>
          <div className={`flex items-center justify-between gap-4 px-5 py-4 border-b ${borderC}`}>
            <div>
              <h2 className={`text-[14px] font-semibold ${h1}`}>Clusters</h2>
              <p className={`text-[11.5px] mt-0.5 ${faint}`}>
                Cost per cluster — expand one for its nodes and namespaces
              </p>
            </div>
            {clusters?.clusters?.length > 0 && (
              <span className={`text-[11.5px] ${faint}`}>
                {clusters.clusters.length} reporting
                {clusters.unreported?.length > 0 && ` · ${clusters.unreported.length} without cost data`}
              </span>
            )}
          </div>

          {!clusters ? (
            <div className="py-10 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" style={{ color: PALETTE.indigo }} />
              <span className={`text-[12.5px] ${muted}`}>Loading clusters…</span>
            </div>
          ) : (
            <>
              {(clusters.clusters || []).map((c) => {
                const open = openCluster === c.reportedAs;
                return (
                  <div key={c.reportedAs} className={`border-b last:border-b-0 ${borderC}`}>
                    <button onClick={() => setOpenCluster(open ? null : c.reportedAs)}
                      className={`w-full flex items-center gap-4 px-5 py-4 text-left ${dk ? 'hover:bg-[#161616]' : 'hover:bg-gray-50'}`}>
                      {open ? <ChevronDown size={15} className={faint} /> : <ChevronRight size={15} className={faint} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13.5px] font-medium ${h1}`}>
                            {c.registeredName || c.reportedAs}
                          </span>
                          {c.registeredName && c.registeredName !== c.reportedAs && (
                            <span className={`text-[11px] ${faint}`}>reported as {c.reportedAs}</span>
                          )}
                          {c.status && (
                            <span className="text-[11px]" style={{ color: c.status === 'connected' ? STATUS.ok : STATUS.warn }}>
                              ● {c.status}
                            </span>
                          )}
                        </div>
                        <div className={`text-[11.5px] mt-0.5 ${faint}`}>
                          {c.nodeCount != null && `${c.nodeCount} nodes · `}
                          {c.namespaceCount != null && `${c.namespaceCount} namespaces · `}
                          {c.cpuCoreHours} core-hrs · {c.ramGbHours} GB-hrs
                        </div>
                      </div>
                      <div className="hidden sm:block text-right shrink-0">
                        <div className={`text-[12.5px] tabular-nums ${h2}`}>{money(c.monthly, 0)}<span className={faint}>/mo</span></div>
                        <div className={`text-[11px] ${faint}`}>{money(c.totalCost, 3)} measured</div>
                      </div>
                      <div className="hidden md:block text-right shrink-0 w-24">
                        {c.efficiency == null ? <span className={`text-[12px] ${faint}`}>—</span> : (
                          <>
                            <div className="text-[12.5px] tabular-nums"
                              style={{ color: c.efficiency >= 60 ? STATUS.ok : c.efficiency >= 30 ? STATUS.warn : STATUS.bad }}>
                              {c.efficiency}%
                            </div>
                            <div className={`text-[11px] ${faint}`}>efficient</div>
                          </>
                        )}
                      </div>
                      <div className="hidden lg:block text-right shrink-0 w-28">
                        <div className="text-[12.5px] tabular-nums" style={{ color: STATUS.warn }}>
                          {c.wasteMonthly != null ? money(c.wasteMonthly, 0) : '—'}
                        </div>
                        <div className={`text-[11px] ${faint}`}>wasted/mo</div>
                      </div>
                    </button>

                    {open && (
                      <div className={`px-5 pb-5 pt-1 grid grid-cols-1 lg:grid-cols-2 gap-6 ${dk ? 'bg-[#0e0e0e]' : 'bg-[#fafbfc]'}`}>
                        <div>
                          <h4 className={`text-[10.5px] uppercase tracking-[0.07em] mb-3 ${muted}`}>Nodes</h4>
                          {(c.nodes || []).length === 0 ? (
                            <p className={`text-[12px] ${faint}`}>No node-level allocation reported.</p>
                          ) : (
                            <table className="w-full">
                              <thead>
                                <tr className={`text-[10px] uppercase tracking-wide ${faint}`}>
                                  <th className="text-left font-medium pb-1.5">Node</th>
                                  <th className="text-right font-medium pb-1.5">Cost</th>
                                  <th className="text-right font-medium pb-1.5">Core-hrs</th>
                                  <th className="text-right font-medium pb-1.5">Share</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${divide}`}>
                                {c.nodes.map((n) => (
                                  <tr key={n.name}>
                                    <td className={`py-1.5 text-[12px] ${h2}`}>{n.name}</td>
                                    <td className={`py-1.5 text-[12px] text-right tabular-nums ${muted}`}>{money(n.totalCost, 4)}</td>
                                    <td className={`py-1.5 text-[12px] text-right tabular-nums ${muted}`}>{n.cpuCoreHours}</td>
                                    <td className={`py-1.5 text-[12px] text-right tabular-nums ${muted}`}>
                                      {c.totalCost ? Math.round((n.totalCost / c.totalCost) * 100) : 0}%
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                        <div>
                          <h4 className={`text-[10.5px] uppercase tracking-[0.07em] mb-3 ${muted}`}>Top namespaces</h4>
                          {(c.namespaces || []).length === 0 ? (
                            <p className={`text-[12px] ${faint}`}>No namespace allocation reported.</p>
                          ) : (
                            <div className="space-y-2">
                              {c.namespaces.slice(0, 8).map((n) => (
                                <div key={n.name} className="flex items-center gap-3">
                                  <span className={`text-[12px] w-36 truncate ${h2}`} title={n.name}>{n.name}</span>
                                  <div className={`flex-1 h-1.5 rounded-full ${dk ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                                    <div className="h-full rounded-full"
                                      style={{ width: `${c.totalCost ? Math.round((n.totalCost / c.totalCost) * 100) : 0}%`, background: PALETTE.indigo }} />
                                  </div>
                                  <span className={`text-[11.5px] tabular-nums w-16 text-right ${muted}`}>{money(n.totalCost, 4)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Clusters with no cost provider. Naming them beats implying the
                  reporting cluster's spend covers the whole fleet. */}
              {(clusters.unreported || []).length > 0 && (
                <div className={`px-5 py-4 ${dk ? 'bg-[#0e0e0e]' : 'bg-[#fafbfc]'}`}>
                  <div className="flex items-start gap-2">
                    <CircleSlash size={13} className={`shrink-0 mt-0.5 ${faint}`} />
                    <div className="flex-1">
                      <p className={`text-[12px] ${h2}`}>
                        No cost data for {clusters.unreported.length} registered cluster{clusters.unreported.length > 1 ? 's' : ''}
                      </p>
                      <p className={`text-[11.5px] mt-1 ${faint}`}>
                        {clusters.providerLabel} only reports the cluster it is installed on. Install it on these too,
                        or set <span className="font-mono">Registered cluster ID</span> on the integration if one of them
                        is in fact the reporting cluster under a different name.
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {clusters.unreported.map((u) => (
                          <span key={u.id}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] border ${dk ? 'border-[#232323] text-gray-400' : 'border-gray-200 text-gray-600'}`}>
                            {u.name}
                            <span className={faint} style={{ color: u.status === 'connected' ? STATUS.ok : undefined }}>· {u.status}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Breakdown explorer */}
        <div className={`${card} overflow-hidden`}>
          <div className={`flex items-center justify-between gap-4 flex-wrap px-5 py-4 border-b ${borderC}`}>
            <div>
              <h2 className={`text-[14px] font-semibold ${h1}`}>Cost breakdown</h2>
              <p className={`text-[11.5px] mt-0.5 ${faint}`}>Group the same spend by a different dimension</p>
            </div>
            <div className="flex items-center gap-1.5">
              {AGGREGATIONS.map(([val, label, Icon]) => (
                <button key={val} onClick={() => setAggregate(val)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                    aggregate === val
                      ? (dk ? 'bg-[#1e1e1e] border-[#333] text-gray-100' : 'bg-gray-100 border-gray-300 text-gray-900')
                      : (dk ? 'border-[#232323] text-gray-500 hover:border-[#333]' : 'border-gray-200 text-gray-500 hover:border-gray-300')
                  }`}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          </div>

          {rowsLoading ? (
            <div className="py-12 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" style={{ color: PALETTE.indigo }} />
              <span className={`text-[12.5px] ${muted}`}>Loading…</span>
            </div>
          ) : liveRows.length === 0 ? (
            <div className={`py-12 text-center text-[12.5px] ${faint}`}>
              No allocation data for this grouping in the covered window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className={`text-[10.5px] uppercase tracking-wide ${faint}`}>
                    <th className="text-left font-medium px-5 py-2.5">{AGGREGATIONS.find((a) => a[0] === aggregate)?.[1]}</th>
                    <th className="text-right font-medium py-2.5">Total</th>
                    <th className="text-right font-medium py-2.5">CPU</th>
                    <th className="text-right font-medium py-2.5">Memory</th>
                    <th className="text-right font-medium py-2.5">Core-hrs</th>
                    <th className="text-right font-medium py-2.5">GB-hrs</th>
                    <th className="text-right font-medium py-2.5">Efficiency</th>
                    <th className="text-right font-medium px-5 py-2.5">Share</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${divide}`}>
                  {liveRows.slice(0, 40).map((r) => {
                    const total = liveRows.reduce((s, x) => s + x.totalCost, 0);
                    const pct = total ? Math.round((r.totalCost / total) * 100) : 0;
                    return (
                      <tr key={r.name} className={dk ? 'hover:bg-[#161616]' : 'hover:bg-gray-50'}>
                        <td className={`px-5 py-2.5 text-[12.5px] truncate max-w-[280px] ${h2}`} title={r.name}>{r.name}</td>
                        <td className={`py-2.5 text-[12.5px] text-right tabular-nums ${h2}`}>{money(r.totalCost, 4)}</td>
                        <td className={`py-2.5 text-[12px] text-right tabular-nums ${muted}`}>{money(r.cpuCost, 4)}</td>
                        <td className={`py-2.5 text-[12px] text-right tabular-nums ${muted}`}>{money(r.ramCost, 4)}</td>
                        <td className={`py-2.5 text-[12px] text-right tabular-nums ${muted}`}>{r.cpuCoreHours}</td>
                        <td className={`py-2.5 text-[12px] text-right tabular-nums ${muted}`}>{r.ramGbHours}</td>
                        <td className="py-2.5 text-[12px] text-right tabular-nums">
                          {r.efficiency == null ? <span className={faint}>—</span> : (
                            <span style={{ color: r.efficiency >= 60 ? STATUS.ok : r.efficiency >= 30 ? STATUS.warn : STATUS.bad }}>
                              {r.efficiency}%
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <div className={`w-16 h-1.5 rounded-full ${dk ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE.indigo }} />
                            </div>
                            <span className={`text-[11.5px] tabular-nums w-8 text-right ${muted}`}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Provenance */}
        <div className={`flex items-start gap-2 mt-5 text-[11.5px] ${faint}`}>
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>
            Source: <strong>{cost.providerLabel}</strong> at <span className="font-mono">{cost.opencostUrl}</span>
            {cost.providerSource === 'integration'
              ? ' (from your saved integration)'
              : ' (from the backend OPENCOST_URL setting — configure it under Integrations → Cost to manage it here)'}
            {' '}· rates derived from the applied price list · efficiency compares usage against requests.
            Edit the rates in the <span className="font-mono">opencost-pricing</span> ConfigMap to match your real hardware cost.
          </span>
        </div>
      </div>

      {detail && <TrendDetail detail={detail} onClose={() => setDetail(null)} dk={dk} />}
    </div>
  );
};

export default CostPage;

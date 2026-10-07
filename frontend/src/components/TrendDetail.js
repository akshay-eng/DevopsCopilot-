import React, { useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, BarChart, Bar, Line,
  Treemap, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { X, Download } from 'lucide-react';
import { PALETTE } from './TrendTiles';

/**
 * Expanded analytics for one tile.
 *
 * Every chart ships a hover layer and a legend when it has more than one series,
 * and every panel also renders its numbers as a table — identity and value are
 * never carried by colour alone.
 */

const STATUS = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626', idle: '#64748b' };
const SERIES = [PALETTE.indigo, PALETTE.blue, PALETTE.teal, PALETTE.violet, PALETTE.orange, PALETTE.yellow];
export const colorFor = (name, i = 0) => ({
  Critical: STATUS.bad, High: '#e06a30', Warning: STATUS.warn, Medium: '#d9a441',
  Info: STATUS.idle, Low: '#94a3b8', Running: STATUS.ok, Resolved: STATUS.ok,
  Pending: STATUS.warn, Failed: STATUS.bad, Firing: STATUS.bad, Other: STATUS.bad,
}[name] || SERIES[i % SERIES.length]);

/** Recharts reorders a stacked legend on its own; pin it to the stack order. */
const legendPayload = (keys) => keys.map((k, i) => ({ value: k, type: 'circle', color: colorFor(k, i), id: k }));

const TreeCell = ({ x, y, width, height, name, value, dk }) => {
  if (width < 2 || height < 2) return null;
  return (
    <g>
      <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} rx={6}
        fill={PALETTE.indigo} fillOpacity={0.25 + 0.6 * Math.min(1, (value || 0) / 100)}
        stroke={dk ? '#171719' : '#fff'} strokeWidth={1} />
      {width > 60 && height > 28 && (
        <>
          <text x={x + 10} y={y + 20} fill={dk ? '#e5e7eb' : '#1f2937'} fontSize={11} fontWeight={600}>
            {String(name).slice(0, Math.floor(width / 7))}
          </text>
          {height > 44 && (
            <text x={x + 10} y={y + 36} fill={dk ? '#9ca3af' : '#6b7280'} fontSize={10}>{value}</text>
          )}
        </>
      )}
    </g>
  );
};

const TrendDetail = ({ detail, onClose, dk }) => {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);

  const csv = useMemo(() => {
    if (!detail?.table?.rows?.length) return null;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [detail.table.columns.map(esc).join(','), ...detail.table.rows.map((r) => r.map(esc).join(','))].join('\n');
  }, [detail]);

  if (!detail) return null;

  const grid = dk ? '#2b2b31' : '#ededed';
  const axis = dk ? '#8b8b8b' : '#6b7280';
  // In dark mode the panel sits ABOVE the page colour, not at it — otherwise the
  // scrim flattens it into the background and it stops reading as a layer.
  const panel = dk ? 'bg-[#171719] border-[#2e2e33]' : 'bg-white border-gray-200';
  const tip = {
    contentStyle: {
      background: dk ? '#232329' : '#fff', border: `1px solid ${dk ? '#3f3f46' : '#e5e5e5'}`,
      borderRadius: 8, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.18)',
    },
    labelStyle: { color: dk ? '#e5e7eb' : '#111', fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: dk ? '#d4d4d8' : '#374151' },
  };
  const legendStyle = { fontSize: 11.5, color: axis, paddingTop: 8 };
  const { kind, data = [], series = [], xKey = 'name', valueKey = 'value', unit } = detail;

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(detail.title || 'data').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chart = () => {
    if (!data.length) {
      return <div className={`flex items-center justify-center h-[340px] text-[13px] ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
        No data for this metric in the selected window.
      </div>;
    }
    if (kind === 'area') {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <defs>
              {series.map((s, i) => (
                <linearGradient key={s} id={`td-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colorFor(s, i)} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colorFor(s, i)} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={{ stroke: grid }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} width={46} />
            <Tooltip {...tip} />
            {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} itemSorter={null} payload={legendPayload(series)} />}
            {series.map((s, i) => (
              <Area key={s} type="monotone" dataKey={s} stackId="1" stroke={colorFor(s, i)} strokeWidth={2} fill={`url(#td-${i})`} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    if (kind === 'stackedBar' || kind === 'bar') {
      const keys = series.length ? series : [valueKey];
      // Past ~14 categories there is no room to label every one; thin them out and
      // keep the labels horizontal rather than rotating an unreadable smear.
      const dense = data.length > 14;
      const longLabels = !dense && data.some((d) => String(d[xKey]).length > 8);
      return (
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={{ stroke: grid }}
              interval={dense ? 'preserveStartEnd' : 0} minTickGap={dense ? 48 : 12}
              angle={longLabels ? -22 : 0} textAnchor={longLabels ? 'end' : 'middle'} height={longLabels ? 62 : 28} />
            <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} width={46} />
            <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
            {keys.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} itemSorter={null} payload={legendPayload(keys)} />}
            {keys.map((s, i) => (
              <Bar key={s} dataKey={s} stackId={kind === 'stackedBar' ? 'a' : undefined}
                fill={colorFor(s, i)} radius={kind === 'stackedBar' ? 0 : [4, 4, 0, 0]} maxBarSize={46}>
                {keys.length === 1 && data.map((d, idx) => <Cell key={idx} fill={colorFor(d[xKey], idx)} />)}
              </Bar>
            ))}
            {detail.trendKey && <Line type="monotone" dataKey={detail.trendKey} stroke={PALETTE.violet} strokeWidth={2} dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }
    if (kind === 'hbar') {
      const keys = series.length ? series : [valueKey];
      return (
        <ResponsiveContainer width="100%" height={Math.max(260, Math.min(460, data.length * 34 + 60))}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey={xKey} width={168} tick={{ fontSize: 11, fill: axis }} tickLine={false} axisLine={false} />
            <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff0a' : '#00000008' }} />
            {keys.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} itemSorter={null} payload={legendPayload(keys)} />}
            {keys.map((s, i) => (
              <Bar key={s} dataKey={s} stackId={keys.length > 1 ? 'a' : undefined} fill={colorFor(s, i)}
                radius={keys.length > 1 ? 0 : [0, 4, 4, 0]} maxBarSize={22}>
                {keys.length === 1 && data.map((d, idx) => <Cell key={idx} fill={colorFor(d[xKey], idx)} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }
    if (kind === 'treemap') {
      return (
        <ResponsiveContainer width="100%" height={340}>
          <Treemap data={data.map((d) => ({ name: d[xKey], size: Math.max(1, d[valueKey]), value: d[valueKey] }))}
            dataKey="size" isAnimationActive={false} content={<TreeCell dk={dk} />}>
            <Tooltip {...tip} formatter={(v, n, p) => [p?.payload?.value ?? v, 'count']} />
          </Treemap>
        </ResponsiveContainer>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div className={`relative w-full max-w-5xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-2xl border shadow-2xl ${panel}`}>
        {/* header */}
        <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-5 border-b ${dk ? 'border-[#2e2e33] bg-[#171719]' : 'border-gray-200 bg-white'}`}>
          <div className="min-w-0">
            <h2 className={`text-[17px] font-semibold tracking-tight ${dk ? 'text-gray-50' : 'text-gray-900'}`}>{detail.title}</h2>
            {detail.subtitle && <p className={`text-[12.5px] mt-1 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{detail.subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {csv && (
              <button onClick={downloadCsv}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border ${dk ? 'border-[#2a2a2a] text-gray-300 hover:bg-[#232329]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                <Download size={12} /> CSV
              </button>
            )}
            <button onClick={onClose} aria-label="Close"
              className={`p-1.5 rounded-lg ${dk ? 'text-gray-400 hover:bg-[#232329]' : 'text-gray-500 hover:bg-gray-100'}`}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* headline stats */}
        {detail.stats?.length > 0 && (
          <div className={`grid grid-cols-2 sm:grid-cols-4 divide-x border-b ${dk ? 'divide-[#242429] border-[#2e2e33]' : 'divide-gray-100 border-gray-200'}`}>
            {detail.stats.map((s) => (
              <div key={s.label} className="px-5 py-4">
                <div className={`text-[20px] font-medium tabular-nums ${s.tone ? '' : (dk ? 'text-gray-50' : 'text-gray-900')}`}
                  style={s.tone ? { color: s.tone } : undefined}>{s.value}</div>
                <div className={`text-[10.5px] uppercase tracking-[0.07em] mt-1 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* chart */}
        <div className="px-5 pt-5 pb-2">{chart()}</div>
        {unit && <div className={`px-6 pb-2 text-[11px] ${dk ? 'text-gray-600' : 'text-gray-400'}`}>{unit}</div>}

        {/* table — the numbers behind the picture */}
        {detail.table?.rows?.length > 0 && (
          <div className="px-6 pb-6 pt-2">
            <h3 className={`text-[10.5px] uppercase tracking-[0.07em] mb-3 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>
              {detail.table.title || 'Detail'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`text-[10px] uppercase tracking-wide ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
                    {detail.table.columns.map((c, i) => (
                      <th key={c} className={`pb-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${dk ? 'divide-[#242429]' : 'divide-gray-100'}`}>
                  {detail.table.rows.slice(0, 40).map((r, i) => (
                    <tr key={i} className={detail.onRow ? `cursor-pointer ${dk ? 'hover:bg-[#161616]' : 'hover:bg-gray-50'}` : ''}
                      onClick={detail.onRow ? () => detail.onRow(i) : undefined}>
                      {r.map((c, j) => (
                        <td key={j} className={`py-2 text-[12.5px] ${j === 0
                          ? `text-left ${dk ? 'text-gray-300' : 'text-gray-700'}`
                          : `text-right tabular-nums ${dk ? 'text-gray-500' : 'text-gray-500'}`}`}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.table.rows.length > 40 && (
              <p className={`text-[11px] mt-3 ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
                Showing 40 of {detail.table.rows.length} rows — export the CSV for the rest.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrendDetail;

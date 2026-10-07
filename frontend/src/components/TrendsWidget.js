import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

// Restrained palette: one accent plus neutral slates. Severity keeps colour
// because it carries meaning, but in muted tones rather than saturated ones.
// Severity is a ranked scale, so it reads as a red→amber→slate ramp rather than
// four unrelated hues, and matches the status tokens the Trends tiles use.
const SERIES_COLORS = ['#4f46e5', '#64748b', '#0ea5e9', '#94a3b8', '#6366f1', '#475569'];
const SEV_COLOR = {
  Critical: '#dc2626', High: '#e06a30', Warning: '#d97706', Medium: '#d9a441',
  Info: '#64748b', Low: '#94a3b8', Resolved: '#16a34a', Running: '#16a34a',
};
const colorFor = (name, i) => SEV_COLOR[name] || SERIES_COLORS[i % SERIES_COLORS.length];

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n ?? 0}`);

/**
 * Renders one widget spec against the resolved data catalog.
 * @param spec { type, dataSource, title, series }
 * @param sources object mapping dataSource -> array (or object for stat)
 */
const TrendsWidget = ({ spec, sources, theme, height = 220 }) => {
  const dk = theme === 'dark';
  const grid = dk ? '#27272a' : '#eaeaea';
  const axis = dk ? '#a1a1aa' : '#71717a';
  const data = sources?.[spec.dataSource];
  const tip = {
    contentStyle: { background: dk ? '#18181b' : '#fff', border: `1px solid ${dk ? '#3f3f46' : '#e5e5e5'}`, borderRadius: 8, fontSize: 12 },
    labelStyle: { color: dk ? '#e5e7eb' : '#111' },
  };

  if (data == null || (Array.isArray(data) && data.length === 0)) {
    return <div className="flex items-center justify-center" style={{ height }}><span className={`text-[12px] ${dk ? 'text-slate-600' : 'text-gray-400'}`}>No data</span></div>;
  }

  // ── stat ──
  if (spec.type === 'stat') {
    const v = typeof data === 'object' && !Array.isArray(data) ? (data[spec.metric] ?? data.total ?? data.value ?? 0) : 0;
    const delta = data?.delta;
    return (
      <div className="flex flex-col justify-center" style={{ height }}>
        <span className="text-[40px] leading-none font-bold tracking-tight" style={{ color: dk ? '#fff' : '#111827' }}>{fmt(v)}</span>
        {delta != null && <span className={`text-[12px] mt-2 font-medium ${delta > 0 ? 'text-red-400' : 'text-green-400'}`}>{delta > 0 ? '↑' : '↓'} {Math.abs(delta)} vs prev</span>}
      </div>
    );
  }

  // ── funnel / stage bars (pill rows) ──
  if (spec.type === 'funnel') {
    const max = Math.max(1, ...data.map((d) => d.value || 0));
    return (
      <div className="flex flex-col justify-center gap-2.5" style={{ height, overflowY: 'auto' }}>
        {data.slice(0, 8).map((d, i) => {
          const c = colorFor(d.name, i);
          const pct = Math.round(((d.value || 0) / max) * 100);
          return (
            <div key={i} className="flex items-center gap-2">
              <span className={`text-[12px] w-24 truncate ${dk ? 'text-slate-400' : 'text-gray-500'}`} title={d.name}>{d.name}</span>
              <div className={`flex-1 h-5 rounded-full ${dk ? 'bg-[#1e1e1e]' : 'bg-gray-100'}`}>
                <div className="h-full rounded-full flex items-center justify-end pr-2 transition-all" style={{ width: `${Math.max(pct, 6)}%`, background: c }}>
                  <span className="text-[10px] font-bold text-white">{fmt(d.value)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── donut ──
  if (spec.type === 'donut') {
    const total = data.reduce((s, d) => s + (d.value || 0), 0);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={Math.round(height * 0.24)} outerRadius={Math.round(height * 0.38)} paddingAngle={3} dataKey="value" stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.color || colorFor(d.name, i)} />)}
          </Pie>
          <Tooltip {...tip} formatter={(v, n) => [`${v} (${total ? Math.round((v / total) * 100) : 0}%)`, n]} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // ── radar ──
  if (spec.type === 'radar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={grid} />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: axis }} />
          <PolarRadiusAxis tick={{ fontSize: 9, fill: axis }} axisLine={false} />
          <Radar dataKey="value" stroke={dk ? '#60a5fa' : '#2563eb'} fill={dk ? '#60a5fa' : '#2563eb'} fillOpacity={0.28} strokeWidth={2} />
          <Tooltip {...tip} />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  // ── horizontal bar ──
  if (spec.type === 'horizontalBar') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid stroke={grid} horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} />
          <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff08' : '#00000008' }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
            {data.map((d, i) => <Cell key={i} fill={colorFor(d.name, i)} fillOpacity={0.9} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── line / area ──
  if (spec.type === 'line' || spec.type === 'area') {
    const series = spec.series && spec.series.length ? spec.series : ['value'];
    const Chart = spec.type === 'area' ? AreaChart : LineChart;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data} margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s} id={`g-${spec.id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorFor(s, i)} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colorFor(s, i)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: axis }} tickLine={false} axisLine={{ stroke: grid }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip {...tip} />
          {series.map((s, i) => spec.type === 'area'
            ? <Area key={s} type="monotone" dataKey={s} stackId="1" stroke={colorFor(s, i)} strokeWidth={2} fill={`url(#g-${spec.id}-${i})`} />
            : <Line key={s} type="monotone" dataKey={s} stroke={colorFor(s, i)} strokeWidth={2} dot={false} />)}
        </Chart>
      </ResponsiveContainer>
    );
  }

  // ── bar / stackedBar ──
  const multi = spec.series && spec.series.length;
  const series = multi ? spec.series : ['value'];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 10, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 9, fill: axis }} tickLine={false} axisLine={{ stroke: grid }} interval={0} angle={data.length > 6 ? -18 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 46 : 24} />
        <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tip} cursor={{ fill: dk ? '#ffffff08' : '#00000008' }} />
        {series.map((s, i) => (
          <Bar key={s} dataKey={s} stackId={spec.type === 'stackedBar' ? 'a' : undefined} fill={colorFor(s, i)} radius={spec.type === 'stackedBar' ? 0 : [4, 4, 0, 0]}>
            {!multi && data.map((d, idx) => <Cell key={idx} fill={colorFor(d.name, idx)} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default TrendsWidget;

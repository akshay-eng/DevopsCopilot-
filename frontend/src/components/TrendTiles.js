import React from 'react';
import { ResponsiveContainer, AreaChart, Area, Treemap } from 'recharts';
import { TrendingDown, TrendingUp, ArrowRight, Maximize2 } from 'lucide-react';

/**
 * Visual primitives for the Analytics tiles.
 *
 * Deliberately one distinct visualisation per metric — a grid of identical
 * line charts tells you nothing at a glance, whereas shape becomes a cue for
 * "which metric am I looking at".
 */

export const PALETTE = {
  indigo: '#6366f1',
  violet: '#8b5cf6',
  orange: '#e08a45',
  orangeSoft: '#f0b07a',
  teal: '#5eb8a8',
  yellow: '#f0c44c',
  blue: '#4a9eff',
  grey: '#d8d8de',
  greyDark: '#3a3a3f',
};

/** Bar spacing has to shrink as the bar count grows, or the gaps eat the row. */
const gapFor = (n) => (n > 60 ? 1 : n > 28 ? 2 : 3);

/* ── gradient area + line ─────────────────────────────────────────────── */
export const GradientLine = ({ data, color = PALETTE.indigo, height = 96, dk }) => {
  if (!data || data.length < 2) return <Blank height={height} dk={dk} />;
  const id = `gl-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="linear" dataKey="v" stroke={color} strokeWidth={1.6} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/* ── composition: one part-to-whole bar + legend ──────────────────────── */
export const Composition = ({ segments, height = 96, dk }) => {
  const live = (segments || []).filter((s) => s.value > 0);
  const total = live.reduce((s, x) => s + x.value, 0);
  if (!total) return <Blank height={height} dk={dk} />;
  return (
    <div className="flex flex-col justify-center gap-3.5" style={{ height }}>
      {/* 2px surface gaps keep adjacent segments readable without outlines */}
      <div className="flex gap-[2px] h-[11px]">
        {live.map((s, i) => (
          <div key={i} className="rounded-[2px]" title={`${s.label}: ${s.value}`}
            style={{ flexGrow: s.value, background: s.color, minWidth: 3 }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {live.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className={`text-[11.5px] ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{s.label}</span>
            <span className={`text-[11.5px] tabular-nums ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
              {s.value} · {Math.round((s.value / total) * 100)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
};

/* ── violin / ridge distribution ──────────────────────────────────────── */
/** Bin raw observations into a smoothed density the violin can draw. */
export const densityOf = (values, bins = 14) => {
  const v = (values || []).filter((n) => Number.isFinite(n));
  if (v.length < 4) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  if (hi === lo) return null;
  const counts = new Array(bins).fill(0);
  v.forEach((n) => { counts[Math.min(bins - 1, Math.floor(((n - lo) / (hi - lo)) * bins))] += 1; });
  // 3-point moving average so a sparse histogram still reads as a shape
  const sm = counts.map((_, i) => (counts[i - 1] || 0) + counts[i] * 2 + (counts[i + 1] || 0));
  const max = Math.max(...sm) || 1;
  return sm.map((c) => c / max);
};

export const Violin = ({ density, color = PALETTE.orange, height = 96, dk }) => {
  const vals = density && density.length >= 3 ? density : null;
  if (!vals) return <Blank height={height} dk={dk} />;
  const W = 400, H = 120, mid = H / 2;
  const pts = vals.map((v, i) => ({ x: (i / (vals.length - 1)) * W, r: Math.max(0.04, Math.min(1, v)) * (H / 2 - 4) }));
  const band = (scale) => {
    const top = pts.map((p) => `${p.x.toFixed(1)},${(mid - p.r * scale).toFixed(1)}`).join(' L');
    const bot = [...pts].reverse().map((p) => `${p.x.toFixed(1)},${(mid + p.r * scale).toFixed(1)}`).join(' L');
    return `M${top} L${bot} Z`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none">
      <path d={band(1)} fill={color} opacity={0.22} />
      <path d={band(0.62)} fill={color} opacity={0.5} />
      <path d={band(0.3)} fill={color} opacity={0.85} />
      {/* quartile rules, drawn in the surface colour so they read as cuts */}
      {[0.33, 0.66].map((f) => (
        <line key={f} x1={W * f} y1={6} x2={W * f} y2={H - 6} stroke={dk ? '#0b0b0b' : '#fff'} strokeWidth="1.5" opacity={0.9} />
      ))}
    </svg>
  );
};

/* ── stacked micro bars (categorical mix over time) ───────────────────── */
export const StackedMicroBars = ({ data, colors, labels, height = 96, dk }) => {
  if (!data || !data.length) return <Blank height={height} dk={dk} />;
  const max = Math.max(1, ...data.map((d) => d.reduce((s, x) => s + x, 0)));
  const plot = labels ? height - 18 : height;
  return (
    <div style={{ height }}>
      {/* A fixed gap would consume the whole row once there are many buckets,
          collapsing every bar to zero width — so it scales with the count. */}
      <div className="flex items-end justify-between" style={{ height: plot, gap: gapFor(data.length) }}>
        {data.map((stack, i) => {
          const total = stack.reduce((s, x) => s + x, 0);
          return (
            <div key={i} className="flex-1 flex flex-col justify-end gap-[2px]"
              style={{ height: `${(total / max) * 100}%`, minHeight: 3 }}
              title={labels ? `${labels[i]}: ${total}` : undefined}>
              {stack.map((v, j) => v > 0 && (
                <div key={j} style={{ flexGrow: v, background: colors[j % colors.length], minHeight: 2 }} />
              ))}
            </div>
          );
        })}
      </div>
      {labels && (
        <div className="flex justify-between mt-1.5" style={{ gap: gapFor(labels.length) }}>
          {labels.map((l, i) => (
            <span key={i} className={`flex-1 text-[9px] truncate text-center ${dk ? 'text-gray-600' : 'text-gray-400'}`} title={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── horizontal bars (ranking, fixed 0..100 scale) ────────────────────── */
export const HBars = ({ items, color = PALETTE.blue, height = 96, dk }) => {
  if (!items || !items.length) return <Blank height={height} dk={dk} />;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col justify-center gap-[7px]" style={{ height }}>
      {items.slice(0, 6).map((it, i) => (
        <div key={i} className="h-[6px] rounded-full" title={`${it.name}: ${it.value}`}
          style={{ width: `${Math.max(4, (it.value / max) * 100)}%`, background: color }} />
      ))}
    </div>
  );
};

/* ── vertical bars (volume over time) ─────────────────────────────────── */
export const VBars = ({ data, color = PALETTE.violet, height = 96, labels, dk }) => {
  if (!data || !data.length) return <Blank height={height} dk={dk} />;
  const max = Math.max(1, ...data);
  const plot = labels ? height - 18 : height;
  const gap = gapFor(data.length);
  return (
    <div style={{ height }}>
      {/* Few values would otherwise stretch into solid blocks, so cap the width. */}
      <div className="flex items-end" style={{ height: plot, gap }}>
        {data.map((v, i) => (
          <div key={i} className="flex-1 rounded-t-[2px] max-w-[34px]"
            title={labels ? `${labels[i]}: ${v}` : String(v)}
            style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: color }} />
        ))}
      </div>
      {labels && (
        <div className="flex mt-1.5" style={{ gap }}>
          {labels.map((l, i) => (
            <span key={i} className={`flex-1 max-w-[34px] text-[9px] truncate ${dk ? 'text-gray-600' : 'text-gray-400'}`} title={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── treemap (share of a whole) ───────────────────────────────────────── */
// A light neutral reads as a hole punched in a dark surface, so the ramp's
// quiet end has to follow the theme rather than being fixed.
const TREE_LIGHT = [PALETTE.violet, PALETTE.yellow, PALETTE.grey, '#a78bfa', '#fcd34d', '#e5e5ea'];
const TREE_DARK = [PALETTE.violet, PALETTE.yellow, '#4b4b55', '#a78bfa', '#d4a843', '#35353d'];

const TreeCell = ({ x, y, width, height, name, colorIndex, dk }) => {
  const colors = dk ? TREE_DARK : TREE_LIGHT;
  if (width < 2 || height < 2) return null;
  const fill = colors[colorIndex % colors.length];
  // Pale fills need dark ink; saturated ones need light.
  const pale = /^#(e5|fc|d8|d4a)/i.test(fill);
  return (
    <g>
      <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={Math.max(0, height - 4)} rx={6} fill={fill} />
      {width > 58 && height > 24 && (
        <text x={x + 10} y={y + 20} fill={pale ? '#1f2937' : '#fff'} fontSize={11} fontWeight={600} opacity={0.95}>
          {String(name).slice(0, Math.floor(width / 8))}
        </text>
      )}
    </g>
  );
};

export const TreemapTile = ({ data, height = 96, dk }) => {
  if (!data || !data.length) return <Blank height={height} dk={dk} />;
  const shaped = data.slice(0, 8).map((d, i) => ({ name: d.name, size: Math.max(1, d.value), colorIndex: i }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap data={shaped} dataKey="size" isAnimationActive={false}
        content={<TreeCell dk={dk} />} />
    </ResponsiveContainer>
  );
};

const Blank = ({ height, dk }) => (
  <div className="flex items-center justify-center" style={{ height }}>
    <span className={`text-[11.5px] ${dk ? 'text-gray-700' : 'text-gray-300'}`}>No data</span>
  </div>
);

/* ── tile shell: big number, caption, delta pill, viz, axis ───────────── */
export const MetricTile = ({ value, caption, delta, deltaDir, axisLeft, axisRight, children, onClick, dk }) => {
  const down = deltaDir === 'down';
  const clickable = typeof onClick === 'function';
  return (
    <div onClick={onClick} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`group relative px-5 py-5 outline-none ${clickable
        ? `cursor-pointer transition-colors ${dk ? 'hover:bg-[#121212] focus-visible:bg-[#121212]' : 'hover:bg-[#fafafa] focus-visible:bg-[#fafafa]'}` : ''}`}>
      {clickable && (
        <Maximize2 size={12} className={`absolute top-4 right-4 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity ${dk ? 'text-gray-500' : 'text-gray-400'}`} />
      )}
      <div className={`text-[30px] leading-none font-normal tracking-tight ${dk ? 'text-gray-50' : 'text-gray-900'}`}>{value}</div>
      <div className={`text-[10.5px] uppercase tracking-[0.07em] mt-2 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{caption}</div>
      {delta != null && (
        <div className={`inline-flex items-center gap-1 mt-2.5 px-2 py-[3px] rounded-md text-[11px] font-medium
          ${down ? (dk ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600')
                 : (dk ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700')}`}>
          {down ? <TrendingDown size={11} /> : <TrendingUp size={11} />}{delta}
        </div>
      )}
      <div className="mt-4">{children}</div>
      {(axisLeft || axisRight) && (
        <div className={`flex items-center justify-between gap-2 mt-2 text-[10.5px] ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
          <span className="truncate">{axisLeft}</span><span className="truncate shrink-0">{axisRight}</span>
        </div>
      )}
    </div>
  );
};

/* ── signal card (tinted header carousel card) ────────────────────────── */
const TINTS = {
  rose: { bar: '#fdf2f4', text: '#9f3f55', dkBar: '#2a1419' },
  amber: { bar: '#fdf5e9', text: '#9a6a28', dkBar: '#2a2113' },
  teal: { bar: '#eaf7f4', text: '#2f7d6d', dkBar: '#12241f' },
  blue: { bar: '#eef4fd', text: '#3a6ea8', dkBar: '#131d2a' },
};
const SEV_STYLE = {
  High: 'text-red-600', Medium: 'text-amber-600', Low: 'text-gray-400',
};

export const SignalCard = ({ tint = 'blue', icon: Icon, label, value, description, actionLabel, onAction, severity, dk }) => {
  const t = TINTS[tint] || TINTS.blue;
  return (
    // Grows to fill the row when all cards fit; below that the row scrolls.
    <div className={`shrink-0 grow basis-[290px] max-w-[360px] rounded-xl overflow-hidden border ${dk ? 'border-[#232323] bg-[#131313]' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: dk ? t.dkBar : t.bar }}>
        {Icon && <Icon size={13} style={{ color: t.text }} />}
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: t.text }}>{label}</span>
      </div>
      <div className="px-4 pt-4 pb-3.5">
        <div className={`text-[19px] font-semibold ${dk ? 'text-gray-50' : 'text-gray-900'}`}>{value}</div>
        <p className={`text-[12.5px] leading-snug mt-1.5 min-h-[36px] ${dk ? 'text-gray-500' : 'text-gray-500'}`}>{description}</p>
        <div className="flex items-center justify-between mt-3.5">
          <button onClick={onAction}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium border transition-colors
              ${dk ? 'border-[#2a2a2a] text-gray-200 hover:bg-[#1c1c1c]' : 'border-gray-200 text-gray-800 hover:bg-gray-50'}`}>
            {actionLabel} <ArrowRight size={12} />
          </button>
          {severity && (
            <span className={`text-[11.5px] font-medium ${SEV_STYLE[severity] || 'text-gray-400'}`}>▮ {severity}</span>
          )}
        </div>
      </div>
    </div>
  );
};

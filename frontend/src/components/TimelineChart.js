import { useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

// ─── Constants ────────────────────────────────────────────────────────────────
const ROW_HEIGHT = 40;
const SIDEBAR_W  = 220;
const DS         = 4.5;   // diamond half-size (info / k8s events)
const CR         = 4.5;   // circle radius (alert occurrences)

// ─── Severity → colour ────────────────────────────────────────────────────────
const SEV_COLOR = {
  critical: '#ef4444', high: '#ef4444',
  warning:  '#a855f7', medium: '#a855f7',   // purple for warning/medium (Robusta style)
  low:      '#eab308',
  info:     '#3b82f6',                       // blue for info (Robusta style)
};
const NET_COLOR = '#f97316'; // orange for network errors
const GREEN    = '#22c55e';
const getColor = (sev, type) => {
  if (type === 'network') return NET_COLOR;
  return SEV_COLOR[(sev || 'info').toLowerCase()] ?? SEV_COLOR.info;
};
// high/medium/low use circles + span line; info uses grey diamonds; network uses triangles
const isCircleSev = (sev) => {
  const s = (sev || '').toLowerCase();
  return s === 'critical' || s === 'high' || s === 'warning' || s === 'medium' || s === 'low';
};
const msOf = (v) => { const d = new Date(v); return isNaN(d) ? null : d.getTime(); };

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtCard = (v) => {
  const d = new Date(v);
  if (isNaN(d)) return '—';
  return d.toLocaleString([], {
    month: 'short', day: 'numeric', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
};

// ─── Circle (alert occurrence marker) ────────────────────────────────────────
const Circle = ({ pctX, cy, r = CR, fill, stroke = 'transparent', sw = 1.5, onEnter, onLeave, onClick }) => (
  <g transform={`translate(0,${cy})`} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick} style={{ cursor: 'pointer' }}>
    <svg x={`${pctX}%`} y={0} width={0} height={0} overflow="visible">
      <circle r={r + 9} fill="transparent" />
      <circle r={r} fill={fill} stroke={stroke} strokeWidth={sw} />
    </svg>
  </g>
);

// ─── Diamond (k8s-event / info marker) ───────────────────────────────────────
const Dia = ({ pctX, cy, s = DS, fill, stroke = 'transparent', sw = 1, onEnter, onLeave, onClick }) => (
  <g transform={`translate(0,${cy})`} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick} style={{ cursor: 'pointer' }}>
    <svg x={`${pctX}%`} y={0} width={0} height={0} overflow="visible">
      <rect x={-(s + 8)} y={-(s + 8)} width={(s + 8) * 2} height={(s + 8) * 2} fill="transparent" />
      <rect x={-s} y={-s} width={s * 2} height={s * 2} transform="rotate(45)" fill={fill} stroke={stroke} strokeWidth={sw} />
    </svg>
  </g>
);

// ─── Triangle (network error marker) ──────────────────────────────────────────
const Tri = ({ pctX, cy, s = 5, fill, stroke = 'transparent', sw = 1, onEnter, onLeave, onClick }) => (
  <g transform={`translate(0,${cy})`} onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick} style={{ cursor: 'pointer' }}>
    <svg x={`${pctX}%`} y={0} width={0} height={0} overflow="visible">
      <rect x={-(s + 8)} y={-(s + 8)} width={(s + 8) * 2} height={(s + 8) * 2} fill="transparent" />
      <polygon points={`0,${-s} ${s},${s} ${-s},${s}`} fill={fill} stroke={stroke} strokeWidth={sw} />
    </svg>
  </g>
);

// ─── Tooltip card (portal) ────────────────────────────────────────────────────
const Tooltip = ({ data, group, x, y, isDark }) => {
  if (!data || !group) return null;
  const isNet    = group.type === 'network';
  const color    = getColor(group.severity, group.type);
  const isFiring = group.status !== 'resolved';

  return createPortal(
    <div className="fixed z-[9999] pointer-events-none" style={{ left: x + 18, top: y - 24 }}>
      <div
        className="w-80 rounded-xl overflow-hidden text-sm"
        style={{
          background:  isDark ? '#1c1c2e' : '#ffffff',
          border:      `1px solid ${isDark ? 'rgba(51,65,85,0.8)' : '#e5e7eb'}`,
          boxShadow:   isDark
            ? '0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)'
            : '0 10px 30px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {/* Row 1: count + sort */}
        <div
          className="flex items-center justify-between px-3 py-2.5"
          style={{ borderBottom: `1px solid ${isDark ? 'rgba(51,65,85,0.6)' : '#f3f4f6'}` }}
        >
          <span className={`font-semibold text-sm ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
            {group.count} event{group.count !== 1 ? 's' : ''}
          </span>
          <span className={`flex items-center gap-1 text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            Newest
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>

        {/* Row 2: alert name + view */}
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ borderBottom: `1px solid ${isDark ? 'rgba(51,65,85,0.6)' : '#f3f4f6'}` }}
        >
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span className={`font-semibold flex-1 truncate text-sm ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
            {group.name}
          </span>
          <span
            className={`text-xs px-2.5 py-1 rounded font-medium flex-shrink-0 ${
              isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'
            }`}
          >
            View
          </span>
        </div>

        {/* Row 3: started + status + description + cluster */}
        <div className="px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
              {fmtCard(data.receivedAt || data.startsAt)}
            </span>
            {isFiring ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                Still firing
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}>
                Resolved
              </span>
            )}
          </div>

          {isNet ? (
            <div className={`text-xs space-y-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
              {data.httpStatus && (
                <div className="flex gap-2">
                  <span className={isDark ? 'text-slate-500' : 'text-gray-400'}>Status:</span>
                  <span className={`font-mono font-semibold ${data.httpStatus >= 500 ? 'text-red-400' : 'text-orange-400'}`}>{data.httpStatus}</span>
                </div>
              )}
              {data.dstSvc && (
                <div className="flex gap-2">
                  <span className={isDark ? 'text-slate-500' : 'text-gray-400'}>Service:</span>
                  <span className="font-mono">{data.dstSvc}</span>
                </div>
              )}
              {data.dstPod && (
                <div className="flex gap-2">
                  <span className={isDark ? 'text-slate-500' : 'text-gray-400'}>Pod:</span>
                  <span className="font-mono truncate">{data.dstPod}</span>
                </div>
              )}
              {data.avgLatency > 0 && (
                <div className="flex gap-2">
                  <span className={isDark ? 'text-slate-500' : 'text-gray-400'}>Avg latency:</span>
                  <span className="font-mono">{data.avgLatency}ms</span>
                </div>
              )}
            </div>
          ) : (data.message || data.annotations?.description || data.annotations?.summary) && (
            <p className={`text-xs leading-relaxed line-clamp-3 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
              {data.message || data.annotations?.description || data.annotations?.summary}
            </p>
          )}

          {(data.clusterId || group.cluster) && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <span
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: isDark ? 'rgba(15,23,42,0.8)' : '#f3f4f6',
                  color:      isDark ? '#64748b' : '#6b7280',
                  border:     `1px solid ${isDark ? 'rgba(51,65,85,0.5)' : '#e5e7eb'}`,
                }}
              >
                cluster: {data.clusterId || group.cluster}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const TimelineChart = ({ alertGroups = [], onGroupClick, onDotClick, theme = 'dark', timeRangeHours = 48, loading = false }) => {
  const isDark = theme === 'dark';
  const [tip, setTip] = useState(null); // { data, group, x, y }
  const [panOffsetMs, setPanOffsetMs] = useState(0);
  const chartRef   = useRef(null);
  const isPanning  = useRef(false);
  const panStartX  = useRef(0);
  const panStartMs = useRef(0);

  // ── Time domain ──────────────────────────────────────────────────────────────
  // Standard timeline: oldest is on the LEFT (0%), now is on the RIGHT (100%)
  const { minTime, maxTime, timeRange } = useMemo(() => {
    const now = Date.now() + panOffsetMs;
    if (!alertGroups.length) {
      const r = (timeRangeHours > 0 ? timeRangeHours : 48) * 3_600_000;
      return { minTime: now - r, maxTime: now, timeRange: r };
    }
    const all = [];
    alertGroups.forEach(g => {
      if (g.startTime) all.push(g.startTime);
      if (g.lastSeen)  all.push(g.lastSeen);
    });
    let min = Math.min(...all);
    if (timeRangeHours > 0) min = Math.max(min, Date.now() - timeRangeHours * 3_600_000);
    const raw = Math.max(now - min, 60_000);
    const pad = raw * 0.02;
    return { minTime: min - pad, maxTime: now + pad, timeRange: raw + pad * 2 };
  }, [alertGroups, timeRangeHours, panOffsetMs]);

  // pct: 0% = left = OLDEST, 100% = right = NOW (matches Robusta direction)
  const pct = useCallback((t) => {
    const ms = typeof t === 'number' ? t : msOf(t);
    if (ms === null) return 0;
    return Math.max(0, Math.min(100, ((ms - minTime) / timeRange) * 100));
  }, [minTime, timeRange]);

  const ticks = useMemo(() => {
    const rangeH = timeRange / 3_600_000;
    // Choose a nice interval based on the visible range
    let intervalMs;
    if      (rangeH <=  2)  intervalMs = 15 * 60_000;          // 15 min
    else if (rangeH <=  6)  intervalMs = 30 * 60_000;          // 30 min
    else if (rangeH <= 12)  intervalMs = 60 * 60_000;          // 1 h
    else if (rangeH <= 24)  intervalMs = 2  * 3_600_000;       // 2 h
    else if (rangeH <= 72)  intervalMs = 6  * 3_600_000;       // 6 h
    else if (rangeH <= 336) intervalMs = 24 * 3_600_000;       // 1 day
    else                    intervalMs = 3  * 24 * 3_600_000;  // 3 days

    // "Now" pinned at RIGHT edge
    const tks = [{ pctPos: 100, label: 'Now', align: 'right' }];

    // Walk from oldest boundary forward in nice-interval steps
    const firstTick = Math.ceil(minTime / intervalMs) * intervalMs;
    for (let t = firstTick; t < maxTime - intervalMs * 0.25; t += intervalMs) {
      const p = ((t - minTime) / timeRange) * 100;
      if (p > 97) continue; // skip if too close to "Now"
      const d = new Date(t);
      const dt = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const tm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const label = `${dt} ${tm}`;
      tks.push({ pctPos: p, label, align: 'center' });
    }
    return tks;
  }, [minTime, maxTime, timeRange]);

  const hover = useCallback((e, occ, group) => {
    if (!e || !occ) { setTip(null); return; }
    const r = e.target.getBoundingClientRect();
    setTip({ data: occ, group, x: r.left, y: r.top });
  }, []);

  // ── Pan handlers (Alt+Drag) ───────────────────────────────────────────────────
  const onChartMouseDown = useCallback((e) => {
    if (!e.altKey) return;
    isPanning.current = true;
    panStartX.current = e.clientX;
    panStartMs.current = panOffsetMs;
    e.preventDefault();
  }, [panOffsetMs]);

  const onChartMouseMove = useCallback((e) => {
    if (!isPanning.current || !chartRef.current) return;
    const chartW = Math.max(1, chartRef.current.getBoundingClientRect().width - SIDEBAR_W);
    const dx = e.clientX - panStartX.current;
    setPanOffsetMs(panStartMs.current - (dx / chartW) * timeRange);
  }, [timeRange]);

  const onChartMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!alertGroups.length) {
    return (
      <div className={`flex flex-col items-center justify-center h-full min-h-[120px] gap-3 ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
        {loading ? (
          <>
            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <span className="text-sm">Loading alerts…</span>
          </>
        ) : (
          <span className="text-sm">No alert data for selected time range</span>
        )}
      </div>
    );
  }

  const totalH    = alertGroups.length * ROW_HEIGHT;
  const nowPct    = pct(Date.now());
  const bg        = isDark ? '#0d0d18' : '#ffffff';
  const headerBg  = isDark ? '#0d0d18' : '#f9fafb';
  const sepLine   = isDark ? 'rgba(30,41,59,0.4)' : '#f3f4f6';
  const gridLine  = isDark ? 'rgba(30,41,59,0.5)' : '#e5e7eb';
  const greyDot   = isDark ? '#475569' : '#9ca3af';
  const borderClr = isDark ? 'rgba(30,41,59,1)' : '#e5e7eb';

  return (
    <>
    {/* Single scroll container — horizontal scroll moves ticks + chart together */}
    {/* Sidebar stays fixed via sticky left-0; header stays fixed via sticky top-0 */}
    <div
      ref={chartRef}
      className="w-full h-full overflow-auto select-none"
      style={{ background: bg, fontSize: 11 }}
      onMouseDown={onChartMouseDown}
      onMouseMove={onChartMouseMove}
      onMouseUp={onChartMouseUp}
      onMouseLeave={onChartMouseUp}
    >
      {/* CSS Grid: 2 cols (sidebar | chart), 2 rows (header | body) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${SIDEBAR_W}px minmax(0, 1fr)`,
          gridTemplateRows: '36px auto',
          // Fit the whole time range to the pane width (like Robusta) instead of a
          // fixed 3000px that forces horizontal scroll and crams everything at the edge.
          minWidth: '100%',
        }}
      >

        {/* ── [R1 C1] Alert corner — sticky top + left ──────────────── */}
        <div
          className={`sticky top-0 left-0 z-30 flex items-end pb-1.5 px-3 font-semibold uppercase tracking-widest border-b border-r`}
          style={{
            background: headerBg,
            color: isDark ? '#475569' : '#9ca3af',
            fontSize: 10,
            borderColor: borderClr,
          }}
        >
          Alert
        </div>

        {/* ── [R1 C2] Tick-label header — sticky top ────────────────── */}
        <div
          className="sticky top-0 z-20 relative border-b"
          style={{ background: headerBg, height: 36, borderColor: borderClr }}
        >
          {ticks.map((tk, i) => (
            <div
              key={i}
              className={`absolute bottom-1.5 font-mono whitespace-nowrap ${isDark ? 'text-slate-500' : 'text-gray-400'}`}
              style={{
                left:      tk.align === 'right' ? 'auto' : `${tk.pctPos}%`,
                right:     tk.align === 'right' ? 0 : 'auto',
                transform: tk.align === 'center' ? 'translateX(-50%)' : 'none',
                fontSize:  10,
                fontWeight: tk.align === 'right' ? 600 : 400,
                color: tk.align === 'right' ? (isDark ? '#64748b' : '#6b7280') : undefined,
              }}
            >
              {tk.label}
            </div>
          ))}
        </div>

        {/* ── [R2 C1] Sidebar — sticky left ─────────────────────────── */}
        <div
          className="sticky left-0 z-10 border-r"
          style={{ background: bg, borderColor: borderClr }}
        >
          {alertGroups.map((group) => {
            const color    = getColor(group.severity, group.type);
            const isFiring = group.status === 'firing';
            return (
              <div
                key={group.id}
                onClick={() => onGroupClick?.(group)}
                className={`flex items-center px-3 border-b cursor-pointer gap-2 ${isDark ? 'hover:bg-slate-800/30' : 'hover:bg-blue-50/40'}`}
                style={{ height: ROW_HEIGHT, borderColor: sepLine }}
              >
                <span
                  className="truncate font-medium leading-none flex-1"
                  style={{ color: isDark ? '#94a3b8' : '#374151', fontSize: 11 }}
                  title={`${group.name} (${group.count})`}
                >
                  {group.name}
                  <span style={{ color: isDark ? '#475569' : '#9ca3af' }}> ({group.count})</span>
                </span>
                {isFiring && group.type === 'network' ? (
                  <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 animate-pulse">
                    <polygon points="4,0.5 7.5,7.5 0.5,7.5" fill={color} />
                  </svg>
                ) : isFiring ? (
                  <span
                    className="flex-shrink-0 w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: color }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* ── [R2 C2] Chart area ────────────────────────────────────── */}
        <div className="relative" style={{ height: totalH, background: bg }}>

          {/* Grid lines */}
          <div className="absolute inset-0 pointer-events-none">
            {ticks.map((tk, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-l"
                style={{ left: `${tk.pctPos}%`, borderColor: gridLine }}
              />
            ))}
            {/* "Now" dashed line at right edge */}
            <div
              className="absolute top-0 bottom-0 border-l border-dashed"
              style={{ left: `${nowPct}%`, borderColor: isDark ? '#334155' : '#d1d5db' }}
            />
          </div>

          <svg width="100%" height={totalH} style={{ display: 'block' }}>
            {alertGroups.map((group, idx) => {
              const cy      = idx * ROW_HEIGHT + ROW_HEIGHT / 2;
              const isNet   = group.type === 'network';
              const color   = getColor(group.severity, group.type);
              const circles = !isNet && isCircleSev(group.severity);

              // Dot positions use receivedAt — each repeat_interval re-fire is a separate dot
              const occs = group.occurrences
                .map(o => ({ o, t: msOf(o.receivedAt || o.startsAt || o.timestamp) }))
                .filter(e => e.t !== null)
                .sort((a, b) => a.t - b.t);

              const lastT = occs.length ? occs[occs.length - 1].t : null; // newest dot → right

              // Bar origin = first receivedAt (when we actually got the notification).
              // We intentionally do NOT use startsAt here — Prometheus startsAt can be months old
              // (e.g. a condition detected in February still fires today). The bar should represent
              // "notification history" not "Prometheus detection age".
              const barOriginT = occs.length ? occs[0].t : null;

              // Standard layout: left = oldest, right = now/most-recent
              // Bar left edge:  pct(barOriginT) — first notification received (oldest = left)
              // Bar right edge: nowPct (firing) or pct(lastT) (resolved)
              const barLeftPct  = barOriginT !== null ? pct(barOriginT) : null;
              const barRightPct = group.status === 'firing'
                ? nowPct
                : (lastT !== null ? pct(lastT) : null);
              const barWidth    = (barLeftPct !== null && barRightPct !== null)
                ? Math.max(0.3, barRightPct - barLeftPct)
                : 0;

              // Downsample occurrence markers so a high-frequency alert (which
              // re-fires every few minutes → hundreds of dots) renders as a clean
              // dotted span instead of a solid wall. Always keep the newest dot and
              // any resolved-status transitions.
              const MIN_GAP_PCT = 2.6;
              let lastP = -Infinity;
              const renderOccs = [];
              occs.forEach((e, i) => {
                const p = pct(e.t);
                if (e.o.status === 'resolved' || i === occs.length - 1 || p - lastP >= MIN_GAP_PCT) {
                  renderOccs.push(e);
                  lastP = p;
                }
              });

              return (
                <g key={group.id}>
                  {/* Row separator */}
                  <line
                    x1="0%" x2="100%"
                    y1={(idx + 1) * ROW_HEIGHT} y2={(idx + 1) * ROW_HEIGHT}
                    stroke={sepLine} strokeWidth={1}
                  />

                  {/* Span bar (circle-severity + network) — Robusta-style thick colored bar */}
                  {(circles || isNet) && barLeftPct !== null && barRightPct !== null && barWidth > 0 && (
                    <>
                      {/* Background glow for firing alerts */}
                      {group.status === 'firing' && (
                        <rect
                          x={`${barLeftPct}%`} y={cy - 4}
                          width={`${barWidth}%`} height={8}
                          fill={color} opacity={0.06} rx={4}
                        />
                      )}
                      {/* Main span track — thin line, not a filled bar (Robusta style) */}
                      <rect
                        x={`${barLeftPct}%`} y={cy - 1.5}
                        width={`${barWidth}%`} height={3}
                        fill={color}
                        opacity={group.status === 'firing' ? 0.4 : 0.2}
                        rx={1.5}
                      />
                    </>
                  )}

                  {/* "First fire" origin dot — marks when we FIRST received a notification for this alert.
                      This is the leftmost anchor of the bar = first receivedAt across all occurrences. */}
                  {(circles || isNet) && barOriginT !== null && barLeftPct !== null && (
                    <g>
                      <circle cx={`${barLeftPct}%`} cy={cy} r={CR + 5} fill={color} opacity={0.12} />
                      <circle
                        cx={`${barLeftPct}%`} cy={cy} r={CR + 1}
                        fill={color} stroke={bg} strokeWidth={2}
                      />
                    </g>
                  )}

                  {/* Occurrence markers (downsampled) */}
                  {renderOccs.map(({ o, t }, oi) => {
                    const dotColor = o.status === 'resolved' ? GREEN : color;
                    const isTip    = tip?.data === o;
                    const handleClick = (e) => { e.stopPropagation(); onDotClick?.(o, group); };
                    return isNet ? (
                      <Tri
                        key={oi}
                        pctX={pct(t)} cy={cy}
                        s={isTip ? 7 : 5}
                        fill={dotColor}
                        stroke={bg} sw={1}
                        onEnter={(e) => hover(e, o, group)}
                        onLeave={() => setTip(null)}
                        onClick={handleClick}
                      />
                    ) : circles ? (
                      <Circle
                        key={oi}
                        pctX={pct(t)} cy={cy}
                        r={isTip ? CR + 2 : CR}
                        fill={dotColor}
                        stroke={bg} sw={1.5}
                        onEnter={(e) => hover(e, o, group)}
                        onLeave={() => setTip(null)}
                        onClick={handleClick}
                      />
                    ) : (
                      <Dia
                        key={oi}
                        pctX={pct(t)} cy={cy}
                        s={isTip ? DS + 2 : DS}
                        fill={greyDot}
                        stroke={bg} sw={1}
                        onEnter={(e) => hover(e, o, group)}
                        onLeave={() => setTip(null)}
                        onClick={handleClick}
                      />
                    );
                  })}

                  {/* Firing "now" pulse — network triangles */}
                  {group.status === 'firing' && isNet && (
                    <>
                      <circle cx={`${nowPct}%`} cy={cy} r={7} fill={color} opacity={0.08} />
                      <Tri pctX={nowPct} cy={cy} s={6} fill={color} stroke={bg} sw={1} />
                    </>
                  )}

                  {/* Firing "now" pulse — circles */}
                  {group.status === 'firing' && circles && (
                    <>
                      <circle cx={`${nowPct}%`} cy={cy} r={CR + 7} fill={color} opacity={0.08} />
                      <circle cx={`${nowPct}%`} cy={cy} r={CR + 4} fill={color} opacity={0.13} />
                      <Circle pctX={nowPct} cy={cy} r={CR + 1.5} fill={color} stroke={bg} sw={2} />
                    </>
                  )}

                  {/* Firing "now" pulse — diamonds */}
                  {group.status === 'firing' && !circles && (
                    <>
                      <circle cx={`${nowPct}%`} cy={cy} r={DS + 6} fill={greyDot} opacity={0.08} />
                      <Dia pctX={nowPct} cy={cy} s={DS + 1} fill={greyDot} stroke={bg} sw={1} />
                    </>
                  )}

                  {/* Resolution marker */}
                  {group.status !== 'firing' && group.resolvedAt && (
                    circles
                      ? <Circle pctX={pct(group.resolvedAt)} cy={cy} r={CR} fill={GREEN} stroke={bg} sw={1.5} />
                      : <Dia    pctX={pct(group.resolvedAt)} cy={cy} s={DS} fill={GREEN} stroke={bg} sw={1} />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

      </div>
    </div>

    {tip && <Tooltip data={tip.data} group={tip.group} x={tip.x} y={tip.y} isDark={isDark} />}
  </>
  );
};

export default TimelineChart;

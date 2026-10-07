import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import { backendApi } from '../services/api';
import { getClusters } from '../redux/slices/clusterSlice';
import ForceGraph2D from 'react-force-graph-2d';

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------
const SEV = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-400', color: '#ef4444' },
  high:     { bg: 'bg-red-500/20', text: 'text-red-400', color: '#ef4444' },
  warning:  { bg: 'bg-amber-500/20', text: 'text-amber-400', color: '#f59e0b' },
  medium:   { bg: 'bg-amber-500/20', text: 'text-amber-400', color: '#f59e0b' },
  low:      { bg: 'bg-yellow-500/20', text: 'text-yellow-400', color: '#eab308' },
  info:     { bg: 'bg-blue-500/20', text: 'text-blue-400', color: '#3b82f6' },
};
const getSev = (s) => SEV[(s || 'info').toLowerCase()] || SEV.info;

// ---------------------------------------------------------------------------
// Topology Graph — enhanced with traffic lines, labels, and flow animation
// ---------------------------------------------------------------------------
const TopologyGraph = ({ cluster, dark }) => {
  const graphRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const rca = cluster.root_cause_analysis || {};
  const topology = rca.topology || { nodes: [], edges: [] };
  const rootPod = rca.root_cause?.pod;
  const chainSet = new Set((rca.causal_chain || []).map(c => c.pod));
  const downSet = new Set(rca.downstream_impact || []);
  const [hoveredNode, setHoveredNode] = useState(null);

  useEffect(() => {
    if (containerRef.current) {
      const w = containerRef.current.offsetWidth;
      setDimensions({ width: w, height: Math.max(380, Math.min(500, w * 0.5)) });
    }
  }, []);

  const graphData = useMemo(() => {
    if (topology.nodes?.length > 0) {
      return {
        nodes: topology.nodes.map(n => ({ ...n })),
        links: topology.edges.map(e => ({ ...e })),
      };
    }
    // Build from causal chain + anomaly details
    const nodes = []; const links = []; const seen = new Set();
    const chain = rca.causal_chain || [];
    chain.forEach((c, i) => {
      if (!seen.has(c.pod)) {
        seen.add(c.pod);
        nodes.push({
          id: c.pod, is_root_cause: c.pod === rootPod, is_affected: true, score: c.score || 0,
          alert_count: (cluster.alerts || []).filter(a => a.pod === c.pod).length,
          anomaly_score: (cluster.anomaly_details || {})[c.pod]?.overall_anomaly_score || 0,
          severity: _maxSev(c.pod, cluster),
        });
      }
      if (i > 0) links.push({ source: chain[i - 1].pod, target: c.pod, request_count: 0, error_rate: 0, avg_latency: 0 });
    });
    Object.keys(cluster.anomaly_details || {}).forEach(pod => {
      if (!seen.has(pod)) {
        seen.add(pod);
        const ad = cluster.anomaly_details[pod];
        nodes.push({
          id: pod, is_root_cause: false, is_affected: true, score: 0,
          alert_count: (cluster.alerts || []).filter(a => a.pod === pod).length,
          anomaly_score: ad?.overall_anomaly_score || 0,
          severity: _maxSev(pod, cluster),
        });
        if (rootPod && pod !== rootPod) links.push({ source: rootPod, target: pod, request_count: 0, error_rate: 0, avg_latency: 0 });
      }
    });
    return { nodes, links };
  }, [topology, rca, rootPod, cluster]);

  if (!graphData.nodes.length) return null;

  return (
    <div ref={containerRef} className={`rounded-xl border-2 ${dark ? 'border-slate-700/50 bg-[#080812]' : 'border-gray-200 bg-gray-50'} overflow-hidden relative`}>
      {/* Legend overlay */}
      <div className={`absolute top-3 left-3 z-10 flex flex-col gap-1 p-2 rounded-lg ${dark ? 'bg-slate-900/90' : 'bg-white/90'} backdrop-blur-sm border ${dark ? 'border-slate-700' : 'border-gray-200'}`}>
        {[
          ['#ef4444', 'Root Cause'],
          ['#f59e0b', 'Downstream'],
          ['#a855f7', 'Causal Chain'],
          ['#f97316', 'Affected'],
          [dark ? '#475569' : '#94a3b8', 'Service'],
        ].map(([c, l]) => (
          <div key={l} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: c }} />
            <span className={`text-[10px] ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{l}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 mt-1 border-t pt-1" style={{ borderColor: dark ? '#334155' : '#e5e7eb' }}>
          <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#ef4444" strokeWidth="2" strokeDasharray="3,2" /></svg>
          <span className={`text-[10px] ${dark ? 'text-slate-400' : 'text-gray-500'}`}>High error</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#22c55e" strokeWidth="2" /></svg>
          <span className={`text-[10px] ${dark ? 'text-slate-400' : 'text-gray-500'}`}>Healthy</span>
        </div>
      </div>

      {/* Hovered node info */}
      {hoveredNode && (
        <div className={`absolute top-3 right-3 z-10 p-2.5 rounded-lg ${dark ? 'bg-slate-900/95' : 'bg-white/95'} backdrop-blur-sm border ${dark ? 'border-slate-600' : 'border-gray-300'} max-w-[200px]`}>
          <div className={`text-xs font-mono font-bold ${dark ? 'text-white' : 'text-gray-900'} truncate`}>{hoveredNode.id}</div>
          <div className={`text-[10px] ${dark ? 'text-slate-400' : 'text-gray-500'} mt-1 space-y-0.5`}>
            {hoveredNode.alert_count > 0 && <div>Alerts: {hoveredNode.alert_count}</div>}
            {hoveredNode.anomaly_score > 0 && <div>Anomaly: {(hoveredNode.anomaly_score * 100).toFixed(0)}%</div>}
            {hoveredNode.score > 0 && <div>RCA Score: {hoveredNode.score.toFixed(3)}</div>}
            {hoveredNode.namespace && <div>ns/{hoveredNode.namespace}</div>}
          </div>
        </div>
      )}

      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeRelSize={5}
        nodeVal={node => {
          if (node.is_root_cause || node.id === rootPod) return 4;
          if (node.alert_count > 5) return 3;
          return 2;
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          if (!isFinite(node.x) || !isFinite(node.y)) return;
          const isRoot = node.is_root_cause || node.id === rootPod;
          const isDown = downSet.has(node.id);
          const isChain = chainSet.has(node.id);
          const isHovered = hoveredNode?.id === node.id;
          const r = isRoot ? 12 : (node.alert_count > 5 ? 9 : 7);

          // Glow for root cause
          if (isRoot) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 8, 0, 2 * Math.PI);
            const gradient = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r + 8);
            gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
            gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
            ctx.fillStyle = gradient;
            ctx.fill();
          }

          // Hover glow
          if (isHovered) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
            ctx.fill();
          }

          // Node circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          const nodeColor = isRoot ? '#ef4444' : isDown ? '#f59e0b' : isChain ? '#a855f7' : node.is_affected ? '#f97316' : (dark ? '#475569' : '#94a3b8');
          ctx.fillStyle = nodeColor;
          ctx.fill();
          ctx.strokeStyle = isRoot ? '#fca5a5' : isHovered ? '#c084fc' : (dark ? '#1e293b' : '#ffffff');
          ctx.lineWidth = isRoot ? 2.5 : 1.5;
          ctx.stroke();

          // Inner icon for root cause
          if (isRoot) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r * 0.4, 0, 2 * Math.PI);
            ctx.fillStyle = '#fef2f2';
            ctx.fill();
          }

          // Label
          const name = node.id || '';
          const label = name.length > 25 ? name.slice(0, 22) + '...' : name;
          const fontSize = Math.min(11, Math.max(8, 12 / globalScale));
          ctx.font = `${isRoot ? 'bold ' : ''}${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // Label background
          const tw = ctx.measureText(label).width + 6;
          const th = fontSize + 4;
          ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.roundRect(node.x - tw / 2, node.y + r + 2, tw, th, 3);
          ctx.fill();

          ctx.fillStyle = isRoot ? '#fca5a5' : (dark ? '#cbd5e1' : '#334155');
          ctx.fillText(label, node.x, node.y + r + 4);

          // Alert count badge
          if (node.alert_count > 0) {
            const badgeText = `${node.alert_count}`;
            ctx.font = 'bold 8px Inter, sans-serif';
            const bw = ctx.measureText(badgeText).width + 8;
            ctx.fillStyle = isRoot ? '#dc2626' : '#7c3aed';
            ctx.beginPath();
            ctx.roundRect(node.x - bw / 2, node.y - r - 13, bw, 13, 4);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(badgeText, node.x, node.y - r - 6.5);
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
        onNodeHover={node => setHoveredNode(node || null)}
        linkCanvasObject={(link, ctx) => {
          const src = link.source;
          const tgt = link.target;
          if (!src || !tgt || !isFinite(src.x) || !isFinite(src.y) || !isFinite(tgt.x) || !isFinite(tgt.y)) return;

          const err = link.error_rate || 0;
          const hasTraffic = (link.request_count || 0) > 0;
          const isError = err > 0.05;

          // Draw line
          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.strokeStyle = isError ? '#ef4444' : hasTraffic ? '#22c55e' : (dark ? '#334155' : '#d1d5db');
          ctx.lineWidth = isError ? 2.5 : hasTraffic ? 1.8 : 1;
          if (isError) ctx.setLineDash([5, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Arrow
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1) return;
          const ux = dx / len;
          const uy = dy / len;
          const arrowPos = 0.75;
          const ax = src.x + dx * arrowPos;
          const ay = src.y + dy * arrowPos;
          const arrowLen = 7;
          const arrowW = 3.5;
          ctx.beginPath();
          ctx.moveTo(ax + ux * arrowLen, ay + uy * arrowLen);
          ctx.lineTo(ax - uy * arrowW, ay + ux * arrowW);
          ctx.lineTo(ax + uy * arrowW, ay - ux * arrowW);
          ctx.closePath();
          ctx.fillStyle = isError ? '#ef4444' : hasTraffic ? '#22c55e' : (dark ? '#475569' : '#94a3b8');
          ctx.fill();

          // Traffic label on link
          if (hasTraffic || link.avg_latency > 0) {
            const mx = (src.x + tgt.x) / 2;
            const my = (src.y + tgt.y) / 2;
            const parts = [];
            if (link.request_count > 0) parts.push(`${link.request_count} req`);
            if (err > 0) parts.push(`${(err * 100).toFixed(1)}% err`);
            if (link.avg_latency > 0) parts.push(`${Math.round(link.avg_latency)}ms`);
            const text = parts.join(' · ');
            ctx.font = '8px Inter, sans-serif';
            const tw = ctx.measureText(text).width + 6;
            // Background
            ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.roundRect(mx - tw / 2, my - 6, tw, 12, 3);
            ctx.fill();
            ctx.strokeStyle = isError ? 'rgba(239,68,68,0.3)' : (dark ? '#1e293b' : '#e5e7eb');
            ctx.lineWidth = 0.5;
            ctx.stroke();
            // Text
            ctx.fillStyle = isError ? '#f87171' : (dark ? '#94a3b8' : '#6b7280');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, mx, my);
          }
        }}
        linkCanvasObjectMode={() => 'replace'}
        linkDirectionalParticles={link => (link.request_count > 0 || link.error_rate > 0) ? 3 : 1}
        linkDirectionalParticleWidth={link => link.error_rate > 0.05 ? 3 : 2}
        linkDirectionalParticleSpeed={0.006}
        linkDirectionalParticleColor={link => link.error_rate > 0.05 ? '#ef4444' : '#22c55e'}
        cooldownTicks={80}
        onEngineStop={() => graphRef.current?.zoomToFit(300, 50)}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.25}
        d3Force="charge"
      />
    </div>
  );
};

function _maxSev(pod, cluster) {
  const rank = { critical: 5, high: 4, warning: 3, medium: 2, low: 1, info: 0 };
  let best = 'info';
  for (const a of (cluster.alerts || [])) {
    if (a.pod === pod) {
      const s = (a.severity || 'info').toLowerCase();
      if ((rank[s] || 0) > (rank[best] || 0)) best = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Traffic Flow Table
// ---------------------------------------------------------------------------
const TrafficFlowTable = ({ cluster, networkFlows, dark }) => {
  const text1 = dark ? 'text-white' : 'text-gray-900';
  const text2 = dark ? 'text-slate-400' : 'text-gray-500';
  const rootPod = cluster.root_cause_analysis?.root_cause?.pod;
  const clusterPods = new Set(cluster.pods || []);
  const edges = cluster.root_cause_analysis?.topology?.edges || [];

  const flows = useMemo(() => {
    const relevant = (networkFlows || []).filter(f => {
      const src = f.sourcePod || f.source_pod || '';
      const dst = f.destPod || f.dest_pod || f.destinationPod || '';
      return clusterPods.has(src) || clusterPods.has(dst);
    }).slice(0, 20);
    return relevant.length > 0 ? relevant : edges;
  }, [networkFlows, clusterPods, edges]);

  if (!flows.length) return <div className={`text-center py-8 ${text2} text-sm`}>No traffic data available.</div>;

  const fmtBytes = (b) => !b ? '-' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className={dark ? 'bg-slate-800/50' : 'bg-gray-50'}>
            {['Source', '', 'Destination', 'Requests', 'Error Rate', 'Latency', 'Bytes'].map(h => (
              <th key={h} className={`px-3 py-2 ${h === '' ? 'text-center' : 'text-left'} ${text2} font-medium`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className={`divide-y ${dark ? 'divide-slate-800' : 'divide-gray-100'}`}>
          {flows.map((f, i) => {
            const src = f.source || f.sourcePod || '-';
            const dst = f.target || f.destPod || f.destinationPod || '-';
            const err = f.error_rate || f.errorRate || 0;
            const lat = f.avg_latency || f.avgLatency || 0;
            return (
              <tr key={i} className={`${(src === rootPod || dst === rootPod) ? (dark ? 'bg-red-500/5' : 'bg-red-50/50') : ''}`}>
                <td className={`px-3 py-2 font-mono ${src === rootPod ? 'text-red-400 font-bold' : text1}`}>{src}</td>
                <td className="px-3 py-2 text-center">
                  <svg className="w-5 h-3 inline" viewBox="0 0 20 12"><line x1="0" y1="6" x2="14" y2="6" stroke={err > 0.1 ? '#ef4444' : '#64748b'} strokeWidth="2"/><polygon points="14,2 20,6 14,10" fill={err > 0.1 ? '#ef4444' : '#64748b'}/></svg>
                </td>
                <td className={`px-3 py-2 font-mono ${dst === rootPod ? 'text-red-400 font-bold' : text1}`}>{dst}</td>
                <td className={`px-3 py-2 font-mono ${text2}`}>{f.request_count || f.requestCount || '-'}</td>
                <td className="px-3 py-2 font-mono"><span className={err > 0.1 ? 'text-red-400' : 'text-green-400'}>{err > 0 ? `${(err * 100).toFixed(1)}%` : '0%'}</span></td>
                <td className={`px-3 py-2 font-mono ${lat > 500 ? 'text-red-400' : text2}`}>{lat > 0 ? `${lat.toFixed(0)}ms` : '-'}</td>
                <td className={`px-3 py-2 font-mono ${text2}`}>{fmtBytes(f.total_bytes || f.totalBytes || 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Impact Analysis
// ---------------------------------------------------------------------------
const ImpactAnalysis = ({ cluster, dark }) => {
  const text1 = dark ? 'text-white' : 'text-gray-900';
  const text2 = dark ? 'text-slate-400' : 'text-gray-500';
  const rca = cluster.root_cause_analysis || {};
  const rootPod = rca.root_cause?.pod;
  const chain = rca.causal_chain || [];
  const downstream = new Set(rca.downstream_impact || []);

  const entries = useMemo(() => chain.filter(c => c.pod !== rootPod).map(c => {
    const podAlerts = (cluster.alerts || []).filter(a => a.pod === c.pod);
    const ad = (cluster.anomaly_details || {})[c.pod] || {};
    return {
      ...c, isDownstream: downstream.has(c.pod), alertCount: podAlerts.length,
      alertNames: [...new Set(podAlerts.map(a => a.alertname))],
      severities: [...new Set(podAlerts.map(a => a.severity))],
      firingCount: podAlerts.filter(a => a.status === 'firing').length,
      anomalyScore: ad.overall_anomaly_score || 0,
    };
  }), [chain, rootPod, cluster, downstream]);

  if (!entries.length) return <div className={`text-center py-8 ${text2} text-sm`}>Only one pod — no cross-pod impact.</div>;

  return (
    <div className="space-y-2">
      {entries.map((e, i) => (
        <div key={i} className={`p-3 rounded-lg border ${dark ? 'bg-slate-800/30 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${e.isDownstream ? 'bg-amber-500' : 'bg-purple-500'}`} />
              <span className={`text-sm font-mono font-medium ${text1}`}>{e.pod}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${e.isDownstream ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'}`}>
                {e.isDownstream ? 'Downstream' : 'Affected'}
              </span>
            </div>
            <span className={`text-xs font-mono ${text2}`}>score: {e.score?.toFixed(3)}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><span className={text2}>Alerts</span><div className={`font-mono font-bold ${text1}`}>{e.alertCount} ({e.firingCount} firing)</div></div>
            <div><span className={text2}>Anomaly</span><div className={`font-mono font-bold ${e.anomalyScore > 0.5 ? 'text-red-400' : 'text-green-400'}`}>{(e.anomalyScore * 100).toFixed(0)}%</div></div>
            <div><span className={text2}>Alert Types</span><div className="flex gap-1 flex-wrap mt-0.5">{e.alertNames.map((n, j) => <span key={j} className={`px-1 py-0.5 rounded text-xs font-mono ${dark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-700'}`}>{n}</span>)}</div></div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Correlated Alerts Tab (stored incidents)
// ---------------------------------------------------------------------------
const CorrelatedAlertsTab = ({ dark }) => {
  const text1 = dark ? 'text-white' : 'text-gray-900';
  const text2 = dark ? 'text-slate-400' : 'text-gray-500';
  const text3 = dark ? 'text-slate-300' : 'text-gray-700';
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await backendApi.get('/api/correlation/incidents?limit=50');
      setIncidents(data.incidents || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadIncidents(); }, [loadIncidents]);

  const updateStatus = async (id, status) => {
    await backendApi.patch(`/api/correlation/incidents/${id}`, { status });
    loadIncidents();
  };

  const createSnowTicket = async (id) => {
    try {
      const data = await backendApi.post(`/api/correlation/incidents/${id}/snow`);
      if (data.success) loadIncidents();
      else alert(data.error || 'Failed to create ServiceNow incident');
    } catch (e) { alert(e.message); }
  };

  const fmtTime = (t) => t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

  if (loading) return <div className={`text-center py-12 ${text2}`}>Loading correlated incidents...</div>;
  if (!incidents.length) return (
    <div className={`text-center py-12 ${text2}`}>
      <p className="text-sm">No correlated incidents stored yet.</p>
      <p className="text-xs mt-1">Run a correlation analysis or set up a cron job to start storing incidents.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {incidents.map((inc, i) => (
        <div key={inc._id} className={`rounded-lg border ${dark ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} overflow-hidden`}>
          <button onClick={() => setExpanded(expanded === i ? null : i)}
            className={`w-full p-4 flex items-center justify-between ${dark ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'} transition-colors`}>
            <div className="flex items-center gap-3 text-left">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${inc.status === 'active' ? 'bg-red-500 animate-pulse' : inc.status === 'acknowledged' ? 'bg-amber-500' : 'bg-green-500'}`} />
              <div>
                <div className={`text-sm font-mono font-medium ${text1}`}>{inc.rootCause?.pod || 'Unknown'}</div>
                <div className={`text-xs ${text2}`}>
                  {(inc.alertNames || []).slice(0, 3).join(', ')}
                  {inc.alertNames?.length > 3 && ` +${inc.alertNames.length - 3} more`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {inc.snowIncident?.number && (
                <a href={inc.snowIncident.url} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="px-2 py-1 rounded text-xs font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20">
                  {inc.snowIncident.number}
                </a>
              )}
              <div className={`px-2 py-1 rounded text-xs font-bold ${
                inc.status === 'active' ? 'bg-red-500/20 text-red-400' :
                inc.status === 'acknowledged' ? 'bg-amber-500/20 text-amber-400' :
                'bg-green-500/20 text-green-400'
              }`}>{inc.status}</div>
              <div className="text-right">
                <div className={`text-xs font-mono ${text1}`}>x{inc.occurrences}</div>
                <div className={`text-xs ${text2}`}>occurrences</div>
              </div>
              <div className="text-right">
                <div className={`text-xs ${text2}`}>{inc.alertCount} alerts</div>
                <div className={`text-xs ${text2}`}>{fmtTime(inc.lastSeenAt)}</div>
              </div>
              <svg className={`w-4 h-4 ${text2} transition-transform ${expanded === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {expanded === i && (
            <div className={`border-t ${dark ? 'border-slate-800' : 'border-gray-200'} p-4`}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div><div className={`text-xs ${text2}`}>Root Cause</div><div className={`text-sm font-mono font-bold ${text1}`}>{inc.rootCause?.pod}</div><div className={`text-xs ${text2}`}>ns/{inc.rootCause?.namespace} | score: {inc.rootCause?.score?.toFixed(3)}</div></div>
                <div><div className={`text-xs ${text2}`}>First Seen</div><div className={`text-sm ${text1}`}>{fmtTime(inc.firstSeenAt)}</div></div>
                <div><div className={`text-xs ${text2}`}>Last Seen</div><div className={`text-sm ${text1}`}>{fmtTime(inc.lastSeenAt)}</div></div>
                <div><div className={`text-xs ${text2}`}>Severities</div><div className="flex gap-1 mt-1">{Object.entries(inc.severities || {}).map(([s, c]) => <span key={s} className={`px-1.5 py-0.5 rounded text-xs ${getSev(s).bg} ${getSev(s).text}`}>{s}: {c}</span>)}</div></div>
              </div>

              {inc.causalChain?.length > 0 && (
                <div className="mb-4">
                  <div className={`text-xs font-semibold ${text2} uppercase mb-2`}>Causal Chain</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {inc.causalChain.map((c, j) => (
                      <React.Fragment key={j}>
                        <span className={`px-2 py-1 rounded text-xs font-mono ${j === 0 ? (dark ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-600 border border-red-200') : (dark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700')}`}>
                          {c.pod} <span className={text2}>({c.score?.toFixed(2)})</span>
                        </span>
                        {j < inc.causalChain.length - 1 && <span className={text2}>→</span>}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              {inc.evidence?.length > 0 && (
                <div className="mb-4">
                  <div className={`text-xs font-semibold ${text2} uppercase mb-2`}>Evidence</div>
                  <div className={`p-3 rounded ${dark ? 'bg-slate-800/50' : 'bg-gray-50'} space-y-1`}>
                    {inc.evidence.map((e, j) => <div key={j} className={`text-xs ${text3} flex gap-2`}><span className="text-purple-400">&#x2022;</span>{e}</div>)}
                  </div>
                </div>
              )}

              {inc.snowIncident?.number && (
                <div className={`mb-4 p-3 rounded-lg border ${dark ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'}`}>
                  <div className={`text-xs font-semibold ${text2} uppercase mb-2`}>ServiceNow Incident</div>
                  <div className="flex items-center gap-4">
                    <a href={inc.snowIncident.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-mono font-bold text-cyan-400 hover:underline">{inc.snowIncident.number}</a>
                    <span className={`text-xs px-2 py-0.5 rounded ${dark ? 'bg-slate-800 text-slate-300' : 'bg-gray-200 text-gray-700'}`}>{inc.snowIncident.state}</span>
                    <span className={`text-xs ${text2}`}>Created: {fmtTime(inc.snowIncident.createdAt)}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                {inc.status === 'active' && (
                  <button onClick={() => updateStatus(inc._id, 'acknowledged')}
                    className="px-3 py-1.5 text-xs rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20">Acknowledge</button>
                )}
                {inc.status !== 'resolved' && (
                  <button onClick={() => updateStatus(inc._id, 'resolved')}
                    className="px-3 py-1.5 text-xs rounded bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20">Resolve</button>
                )}
                {!inc.snowIncident?.number && (
                  <span className="px-3 py-1.5 text-xs rounded bg-slate-500/10 text-slate-400 border border-slate-500/30 italic">
                    SNOW: No integration configured
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      <button onClick={loadIncidents} className={`w-full text-center text-xs ${text2} hover:${dark ? 'text-white' : 'text-gray-900'} py-2`}>
        Refresh
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
const CorrelationEngine = () => {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const dispatch = useDispatch();
  const clusters = useSelector(state => state.cluster?.clusters || []);

  useEffect(() => { if (!clusters.length) dispatch(getClusters()); }, [dispatch, clusters.length]);

  const [selectedCluster, setSelectedCluster] = useState('');
  const [hours, setHours] = useState(48);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [expandedCluster, setExpandedCluster] = useState(null);
  const [expandedPod, setExpandedPod] = useState(null);
  const [activeTab, setActiveTab] = useState({});
  const [pageTab, setPageTab] = useState('analyze');

  // Cron state
  const [cronActive, setCronActive] = useState(false);
  const [cronInterval, setCronInterval] = useState(15);
  const [cronLoading, setCronLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await backendApi.get('/api/correlation/cron');
        if (data.jobs?.length > 0) {
          setCronActive(true);
          setCronInterval(data.jobs[0].intervalMinutes);
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const setClusterTab = (idx, tab) => setActiveTab(prev => ({ ...prev, [idx]: tab }));
  const getClusterTab = (idx) => activeTab[idx] || 'topology';

  // Single "Run Analysis" always does analyze-and-store
  const runCorrelation = useCallback(async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const body = { hours: parseInt(hours) };
      if (selectedCluster) body.clusterId = selectedCluster;
      const data = await backendApi.post('/api/correlation/analyze-and-store', body);
      if (data.success) { setResult(data); if (data.clusters?.length > 0) setExpandedCluster(0); }
      else setError(data.error || 'Correlation failed');
    } catch (err) { setError(err.message || 'Failed to connect to correlation engine'); }
    setLoading(false);
  }, [hours, selectedCluster]);

  const toggleCron = async () => {
    setCronLoading(true);
    try {
      if (cronActive) {
        await backendApi.delete(`/api/correlation/cron?clusterId=${selectedCluster || ''}`);
        setCronActive(false);
      } else {
        const body = { intervalMinutes: parseInt(cronInterval), hours: parseInt(hours) };
        if (selectedCluster) body.clusterId = selectedCluster;
        const data = await backendApi.post('/api/correlation/cron', body);
        if (data.success) setCronActive(true);
      }
    } catch (e) { console.error(e); }
    setCronLoading(false);
  };

  const formatTime = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const bg = dark ? 'bg-[#0a0a0f]' : 'bg-gray-50';
  const card = dark ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200';
  const text1 = dark ? 'text-white' : 'text-gray-900';
  const text2 = dark ? 'text-slate-400' : 'text-gray-500';
  const text3 = dark ? 'text-slate-300' : 'text-gray-700';

  const clusterTabs = [
    { id: 'topology', label: 'Topology & Root Cause' },
    { id: 'impact', label: 'Impact Analysis' },
    { id: 'traffic', label: 'Traffic Flows' },
    { id: 'anomaly', label: 'Anomaly Detection' },
    { id: 'alerts', label: 'Alert List' },
  ];

  return (
    <div className={`flex-1 overflow-y-auto ${bg} p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${text1} flex items-center gap-3`}>
            <svg className="w-7 h-7 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            Alert Correlation Engine
            <span className="px-2 py-0.5 bg-gradient-to-r from-purple-500 to-violet-600 text-white text-xs rounded font-bold">ML</span>
          </h1>
          <p className={`${text2} mt-1 text-sm`}>DBSCAN clustering + Isolation Forest anomaly detection + PageRank root cause analysis</p>
        </div>
        {cronActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">Auto-running every {cronInterval}m</span>
          </div>
        )}
      </div>

      {/* Page-level tabs */}
      <div className={`flex gap-1 mb-6 border-b ${dark ? 'border-slate-800' : 'border-gray-200'}`}>
        <button onClick={() => setPageTab('analyze')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${pageTab === 'analyze' ? `${dark ? 'text-purple-400 border-purple-400' : 'text-purple-600 border-purple-600'}` : `${dark ? 'text-slate-400 border-transparent hover:text-white' : 'text-gray-500 border-transparent hover:text-gray-900'}`}`}>
          Run Analysis
        </button>
        <button onClick={() => setPageTab('correlated')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${pageTab === 'correlated' ? `${dark ? 'text-purple-400 border-purple-400' : 'text-purple-600 border-purple-600'}` : `${dark ? 'text-slate-400 border-transparent hover:text-white' : 'text-gray-500 border-transparent hover:text-gray-900'}`}`}>
          Correlated Alerts
        </button>
      </div>

      {pageTab === 'correlated' && <CorrelatedAlertsTab dark={dark} />}

      {pageTab === 'analyze' && (
        <>
          {/* Controls — single row */}
          <div className={`${card} border rounded-lg p-4 mb-6`}>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className={`block text-xs font-medium ${text2} mb-1`}>Cluster</label>
                <select value={selectedCluster} onChange={(e) => setSelectedCluster(e.target.value)}
                  className={`px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                  <option value="">All Clusters</option>
                  {clusters.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium ${text2} mb-1`}>Time Window</label>
                <select value={hours} onChange={(e) => setHours(e.target.value)}
                  className={`px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                  {[6, 12, 24, 48, 72, 168].map(h => <option key={h} value={h}>Last {h < 48 ? `${h} hours` : `${h / 24} days`}</option>)}
                </select>
              </div>

              {/* Single Run Analysis button */}
              <button onClick={runCorrelation} disabled={loading}
                className="px-5 py-2 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-violet-700 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-purple-500/20">
                {loading ? (
                  <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Analyzing...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Run Analysis</>
                )}
              </button>

              <div className={`w-px h-8 ${dark ? 'bg-slate-700' : 'bg-gray-300'}`} />

              {/* Cron controls */}
              <div>
                <label className={`block text-xs font-medium ${text2} mb-1`}>Auto-run Interval</label>
                <div className="flex items-center gap-2">
                  <select value={cronInterval} onChange={(e) => setCronInterval(e.target.value)}
                    className={`px-3 py-2 rounded-lg border text-sm ${dark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    disabled={cronActive}>
                    {[5, 10, 15, 20, 30, 60].map(m => <option key={m} value={m}>Every {m}m</option>)}
                  </select>
                  <button onClick={toggleCron} disabled={cronLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                      cronActive
                        ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                    }`}>
                    {cronActive ? (
                      <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>Stop</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>Start</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}

          {/* Loading */}
          {loading && (
            <div className={`${card} border rounded-lg p-12 text-center mb-6`}>
              <svg className="w-12 h-12 animate-spin mx-auto text-purple-500 mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p className={`${text1} font-medium`}>Running ML Pipeline...</p>
              <p className={`${text2} text-sm mt-1`}>Fetching alerts, clustering with DBSCAN, running anomaly detection, computing PageRank...</p>
              <p className={`${text2} text-xs mt-3`}>This may take 30-90 seconds depending on alert volume</p>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {/* Summary */}
              <div className={`${card} border rounded-lg p-4 mb-6`}>
                <div className="flex flex-wrap items-center gap-6">
                  <div><div className={`text-2xl font-bold ${text1}`}>{result.total_alerts}</div><div className={`text-xs ${text2}`}>Alerts</div></div>
                  <div><div className="text-2xl font-bold text-purple-400">{result.total_clusters}</div><div className={`text-xs ${text2}`}>Clusters</div></div>
                  <div><div className={`text-2xl font-bold ${text1}`}>{(result.execution_time_ms / 1000).toFixed(1)}s</div><div className={`text-xs ${text2}`}>Time</div></div>
                  {result.storedIncidents && <div><div className="text-2xl font-bold text-green-400">{result.storedIncidents.length}</div><div className={`text-xs ${text2}`}>Stored</div></div>}
                  <div className="flex-1 min-w-0"><p className={`text-sm ${text3}`}>{result.summary}</p></div>
                </div>
                {result.storedIncidents?.some(s => s.snowIncident?.number) && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {result.storedIncidents.filter(s => s.snowIncident?.number).map((s, i) => (
                      <a key={i} href={s.snowIncident.url} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-1 rounded text-xs font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20">
                        {s.snowIncident.number}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Incident Clusters */}
              {result.clusters?.map((cluster, idx) => {
                const isExpanded = expandedCluster === idx;
                const rca = cluster.root_cause_analysis || {};
                const rootCause = rca.root_cause;
                const chain = rca.causal_chain || [];
                const evidence = rca.evidence || [];
                const tab = getClusterTab(idx);

                return (
                  <div key={idx} className={`${card} border rounded-lg mb-4 overflow-hidden`}>
                    <button onClick={() => setExpandedCluster(isExpanded ? null : idx)}
                      className={`w-full p-4 flex items-center justify-between ${dark ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center gap-3 text-left">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white text-sm ${
                          cluster.severities?.critical ? 'bg-red-500' : cluster.severities?.warning ? 'bg-amber-500' : 'bg-blue-500'
                        }`}>#{cluster.cluster_id}</div>
                        <div>
                          <div className={`font-semibold ${text1} text-sm`}>
                            Incident Cluster {cluster.cluster_id}
                            <span className={`ml-2 font-normal ${text2}`}>{cluster.alert_count} alerts, {cluster.pods?.length || 0} pods</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {Object.entries(cluster.severities || {}).map(([s, c]) => <span key={s} className={`px-2 py-0.5 rounded-full text-xs ${getSev(s).bg} ${getSev(s).text}`}>{s}: {c}</span>)}
                            {rootCause && <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400">Root: <span className="font-mono">{rootCause.pod}</span></span>}
                          </div>
                        </div>
                      </div>
                      <svg className={`w-5 h-5 ${text2} transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className={`border-t ${dark ? 'border-slate-800' : 'border-gray-200'}`}>
                        <div className={`flex border-b ${dark ? 'border-slate-800' : 'border-gray-200'} px-4 pt-2 gap-1 overflow-x-auto`}>
                          {clusterTabs.map(t => (
                            <button key={t.id} onClick={() => setClusterTab(idx, t.id)}
                              className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap ${
                                tab === t.id ? `${dark ? 'text-purple-400 border-purple-400 bg-purple-500/5' : 'text-purple-600 border-purple-600 bg-purple-50'}` :
                                `${dark ? 'text-slate-400 border-transparent hover:text-white' : 'text-gray-500 border-transparent hover:text-gray-900'}`
                              }`}>{t.label}</button>
                          ))}
                        </div>

                        <div className="p-4">
                          {tab === 'topology' && (
                            <div className="space-y-4">
                              {rootCause && (
                                <div className={`p-3 rounded-lg border ${dark ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                                      <span className={`text-sm font-bold ${dark ? 'text-red-400' : 'text-red-600'}`}>Root Cause</span>
                                    </div>
                                    <span className="text-xs text-purple-400 font-mono">PageRank: {rootCause.score?.toFixed(3)}</span>
                                  </div>
                                  <span className={`text-base font-mono font-bold ${dark ? 'text-red-400' : 'text-red-600'}`}>{rootCause.pod}</span>
                                  <span className={`text-xs ${text2} ml-2`}>ns/{rootCause.namespace}</span>
                                  {rootCause.anomaly_summary && <p className={`text-xs ${text2} mt-1`}>{rootCause.anomaly_summary}</p>}
                                </div>
                              )}
                              {chain.length > 1 && (
                                <div>
                                  <div className={`text-xs font-semibold ${text2} uppercase mb-2`}>Causal Chain</div>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {chain.map((n, i) => (
                                      <React.Fragment key={i}>
                                        <span className={`px-2 py-1.5 rounded text-xs font-mono border ${i === 0 ? (dark ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-red-50 text-red-600 border-red-200') : (dark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-gray-100 text-gray-700 border-gray-200')}`}>
                                          {n.pod} <span className={text2}>({n.score?.toFixed(2)})</span>
                                        </span>
                                        {i < chain.length - 1 && <span className="text-purple-400">→</span>}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <div className={`text-xs font-semibold ${text2} uppercase mb-2`}>Service Dependency Topology</div>
                                <TopologyGraph cluster={cluster} dark={dark} />
                              </div>
                              {evidence.length > 0 && (
                                <div>
                                  <div className={`text-xs font-semibold ${text2} uppercase mb-2`}>Evidence</div>
                                  <div className={`p-3 rounded ${dark ? 'bg-slate-800/50' : 'bg-gray-50'} space-y-1`}>
                                    {evidence.map((e, i) => <div key={i} className={`text-xs ${text3} flex gap-2`}><span className="text-purple-400">&#x2022;</span>{e}</div>)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {tab === 'impact' && <ImpactAnalysis cluster={cluster} dark={dark} />}
                          {tab === 'traffic' && <TrafficFlowTable cluster={cluster} networkFlows={result.network_flows} dark={dark} />}

                          {tab === 'anomaly' && (
                            Object.keys(cluster.anomaly_details || {}).length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {Object.entries(cluster.anomaly_details).map(([pod, ad]) => (
                                  <div key={pod} onClick={() => setExpandedPod(expandedPod === pod ? null : pod)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${ad.is_anomalous ? (dark ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200') : (dark ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50 border-gray-200')}`}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className={`text-xs font-mono font-medium ${text1} truncate`}>{pod}</span>
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${ad.is_anomalous ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{ad.is_anomalous ? 'Anomalous' : 'Normal'}</span>
                                    </div>
                                    <div className="mt-2">
                                      <div className="flex justify-between text-xs mb-1"><span className={text2}>Score</span><span className={`font-mono ${ad.overall_anomaly_score > 0.7 ? 'text-red-400' : ad.overall_anomaly_score > 0.4 ? 'text-amber-400' : 'text-green-400'}`}>{(ad.overall_anomaly_score * 100).toFixed(0)}%</span></div>
                                      <div className={`h-1.5 rounded-full ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}><div className={`h-full rounded-full ${ad.overall_anomaly_score > 0.7 ? 'bg-red-500' : ad.overall_anomaly_score > 0.4 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, ad.overall_anomaly_score * 100)}%` }} /></div>
                                    </div>
                                    {expandedPod === pod && ad.per_metric && (
                                      <div className={`mt-3 pt-3 border-t ${dark ? 'border-slate-700' : 'border-gray-200'} space-y-2`}>
                                        {Object.entries(ad.per_metric).map(([m, d]) => (
                                          <div key={m} className="text-xs">
                                            <div className="flex justify-between"><span className={`font-mono ${text3}`}>{m}</span><span className={d.is_anomalous ? 'text-red-400' : 'text-green-400'}>z={d.zscore?.toFixed(1)}</span></div>
                                            {d.current !== undefined && <div className={text2}>curr: {d.current?.toFixed(2)} | base: {d.baseline_mean?.toFixed(2)} ± {d.baseline_std?.toFixed(2)}</div>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <p className={`text-xs ${text2} mt-2`}>{ad.summary}</p>
                                  </div>
                                ))}
                              </div>
                            ) : <div className={`text-center py-8 ${text2} text-sm`}>No anomaly data.</div>
                          )}

                          {tab === 'alerts' && cluster.alerts?.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead><tr className={dark ? 'bg-slate-800/50' : 'bg-gray-50'}>
                                  {['Alert', 'Severity', 'Status', 'Pod', 'Namespace', 'Time', 'Message'].map(h => <th key={h} className={`px-3 py-2 text-left ${text2} font-medium`}>{h}</th>)}
                                </tr></thead>
                                <tbody className={`divide-y ${dark ? 'divide-slate-800' : 'divide-gray-100'}`}>
                                  {cluster.alerts.map((a, i) => {
                                    const s = getSev(a.severity);
                                    const isRoot = a.pod === rootCause?.pod;
                                    return (
                                      <tr key={i} className={isRoot ? (dark ? 'bg-red-500/5' : 'bg-red-50/50') : ''}>
                                        <td className={`px-3 py-2 font-mono ${text1}`}>{a.alertname}</td>
                                        <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>{a.severity}</span></td>
                                        <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded ${a.status === 'firing' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{a.status}</span></td>
                                        <td className={`px-3 py-2 font-mono ${isRoot ? 'text-red-400 font-bold' : text3}`}>{a.pod || '-'}</td>
                                        <td className={`px-3 py-2 ${text3}`}>{a.namespace || '-'}</td>
                                        <td className={`px-3 py-2 ${text2}`}>{formatTime(a.receivedAt)}</td>
                                        <td className={`px-3 py-2 ${text2} max-w-xs truncate`}>{a.message || '-'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {result.clusters?.length === 0 && (
                <div className={`${card} border rounded-lg p-12 text-center`}>
                  <p className={`${text1} font-medium`}>No alerts found in the specified time window.</p>
                </div>
              )}
            </>
          )}

          {!result && !loading && !error && (
            <div className={`${card} border rounded-lg p-12 text-center`}>
              <svg className="w-16 h-16 mx-auto text-purple-500/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              <p className={`${text1} font-medium`}>Run the Correlation Engine</p>
              <p className={`${text2} text-sm mt-1 max-w-md mx-auto`}>
                Select a cluster and time window, then click "Run Analysis" to correlate alerts, detect anomalies, and identify root causes.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CorrelationEngine;

import React, { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { Box, Globe, Server, Database, Network, Loader2 } from 'lucide-react';

const NODE_W = 190;
const NODE_H = 64;

// ── Custom node ──────────────────────────────────────────────────────────────
const kindIcon = (kind, external) => {
  if (external) return Globe;
  const k = (kind || '').toLowerCase();
  if (k.includes('service')) return Network;
  if (k.includes('stateful') || k.includes('db') || k.includes('data')) return Database;
  if (k.includes('daemon') || k.includes('node')) return Server;
  return Box;
};

const fmt = (n) => {
  if (n == null) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${n}`;
};

const WorkloadNode = ({ data }) => {
  const { dk, label, namespace, external, kind, inReq, outReq, accent } = data;
  const Icon = kindIcon(kind, external);
  return (
    <div
      className="rounded-xl border shadow-sm transition-shadow hover:shadow-md"
      style={{
        width: NODE_W, height: NODE_H,
        background: dk ? '#161616' : '#ffffff',
        borderColor: dk ? '#2a2a2a' : '#e5e7eb',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: accent, width: 7, height: 7, border: 'none' }} />
      <div className="flex items-center gap-2.5 px-3 h-full">
        <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: `${accent}1f`, color: accent }}>
          <Icon size={16} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold truncate" style={{ color: dk ? '#e5e7eb' : '#111827' }} title={label}>{label}</div>
          <div className="text-[10.5px] truncate" style={{ color: dk ? '#8b8b8b' : '#9ca3af' }}>
            {external ? 'external' : (namespace || 'default')}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-[9.5px] font-medium" style={{ color: '#22c55e' }} title="inbound requests">↓{fmt(inReq)}</span>
          <span className="text-[9.5px] font-medium" style={{ color: '#3b82f6' }} title="outbound requests">↑{fmt(outReq)}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: accent, width: 7, height: 7, border: 'none' }} />
    </div>
  );
};

const nodeTypes = { workload: WorkloadNode };

// ── Dagre layout (deterministic, fixed positions) ────────────────────────────
function layout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 110, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 } };
  });
}

function buildGraph(serviceMap, dk) {
  const rawNodes = serviceMap.nodes || [];
  const rawLinks = serviceMap.links || [];

  const inMap = {}, outMap = {};
  rawLinks.forEach((l) => {
    const c = l.requestCount || l.value || 0;
    outMap[l.source] = (outMap[l.source] || 0) + c;
    inMap[l.target] = (inMap[l.target] || 0) + c;
  });
  const maxLink = Math.max(1, ...rawLinks.map((l) => l.requestCount || l.value || 0));

  const palette = ['#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16'];
  const nsColor = {};
  let ci = 0;

  const nodes = rawNodes.map((n) => {
    const external = n.external || n.type === 'external' || !n.namespace || n.namespace === 'external';
    const ns = n.namespace || 'external';
    if (!nsColor[ns]) { nsColor[ns] = external ? '#64748b' : palette[ci++ % palette.length]; }
    const accent = external ? '#64748b' : nsColor[ns];
    return {
      id: n.id,
      type: 'workload',
      data: {
        dk, accent, external, kind: n.kind || n.type,
        label: n.name || n.id,
        namespace: n.namespace,
        inReq: inMap[n.id] || 0,
        outReq: outMap[n.id] || 0,
      },
      position: { x: 0, y: 0 },
    };
  });

  const edges = rawLinks.map((l, i) => {
    const c = l.requestCount || l.value || 0;
    const ratio = c / maxLink;
    const width = 1 + ratio * 3;
    const active = c > 0;
    const color = dk ? (active ? '#3b82f6' : '#333') : (active ? '#3b82f6' : '#d1d5db');
    return {
      id: `e-${i}-${l.source}-${l.target}`,
      source: l.source,
      target: l.target,
      animated: active && ratio > 0.15,
      label: c ? fmt(c) : undefined,
      labelStyle: { fill: dk ? '#9ca3af' : '#6b7280', fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: dk ? '#0f0f0f' : '#ffffff', fillOpacity: 0.85 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      style: { stroke: color, strokeWidth: width, opacity: active ? 0.9 : 0.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    };
  });

  return { nodes: layout(nodes, edges), edges };
}

// ── Inner (has access to the flow instance) ──────────────────────────────────
const FlowInner = ({ theme, serviceMap }) => {
  const dk = theme === 'dark';
  const { nodes: initNodes, edges: initEdges } = useMemo(() => buildGraph(serviceMap, dk), [serviceMap, dk]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const { fitView } = useReactFlow();

  useEffect(() => { setNodes(initNodes); setEdges(initEdges); }, [initNodes, initEdges, setNodes, setEdges]);
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.18, duration: 400 }), 60);
    return () => clearTimeout(t);
  }, [initNodes, fitView]);

  const nodeColor = useCallback((n) => n.data?.accent || '#3b82f6', []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: 'default' }}
      style={{ background: dk ? '#0a0a0a' : '#f8fafc' }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color={dk ? '#1e1e1e' : '#e2e8f0'} />
      <Controls showInteractive={false} className="!shadow-md" />
      <MiniMap
        nodeColor={nodeColor}
        nodeStrokeWidth={0}
        maskColor={dk ? 'rgba(0,0,0,0.6)' : 'rgba(241,245,249,0.7)'}
        style={{ background: dk ? '#111' : '#fff', border: `1px solid ${dk ? '#262626' : '#e5e7eb'}`, borderRadius: 8 }}
        pannable zoomable
      />
    </ReactFlow>
  );
};

// ── Public component (replaces the old ForceGraph2D ServiceMapView) ───────────
const WorkloadTrafficMap = ({ theme, serviceMap, loading }) => {
  const dk = theme === 'dark';
  const hasData = (serviceMap?.nodes || []).length > 0;
  const nodeCount = (serviceMap?.nodes || []).length;
  const linkCount = (serviceMap?.links || []).length;
  const totalReq = (serviceMap?.links || []).reduce((s, l) => s + (l.requestCount || l.value || 0), 0);

  return (
    <div className="flex-1 p-4 flex flex-col min-h-0">
      <div className={`flex-1 min-h-0 rounded-xl border overflow-hidden flex flex-col ${dk ? 'bg-[#0a0a0a] border-[#262626]' : 'bg-white border-gray-200'}`}>
        {/* Header / legend */}
        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${dk ? 'border-[#1e1e1e]' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2">
            <Network size={15} className="text-blue-500" />
            <span className={`text-[13px] font-semibold ${dk ? 'text-slate-200' : 'text-gray-800'}`}>Workload Traffic Map</span>
          </div>
          <div className="flex items-center gap-4 text-[11.5px]">
            <span className={dk ? 'text-slate-500' : 'text-gray-500'}>{nodeCount} workloads</span>
            <span className={dk ? 'text-slate-500' : 'text-gray-500'}>{linkCount} connections</span>
            <span className={dk ? 'text-slate-500' : 'text-gray-500'}>{fmt(totalReq)} requests</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 rounded" style={{ background: '#3b82f6' }} /><span className={dk ? 'text-slate-500' : 'text-gray-500'}>active</span></span>
          </div>
        </div>

        {/* Canvas — fixed frame */}
        <div className="flex-1 min-h-0 relative">
          {loading ? (
            <div className={`flex items-center justify-center h-full gap-2 ${dk ? 'text-slate-500' : 'text-gray-400'}`}>
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-[13px]">Loading service map…</span>
            </div>
          ) : !hasData ? (
            <div className={`flex flex-col items-center justify-center h-full ${dk ? 'text-slate-600' : 'text-gray-400'}`}>
              <Network className="w-11 h-11 mb-3 opacity-40" strokeWidth={1.4} />
              <p className="text-sm font-medium mb-1">No service map data</p>
              <p className="text-xs">Dependencies appear once traffic is captured between workloads.</p>
            </div>
          ) : (
            <ReactFlowProvider>
              <FlowInner theme={theme} serviceMap={serviceMap} />
            </ReactFlowProvider>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkloadTrafficMap;

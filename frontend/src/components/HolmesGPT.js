import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Plus, ChevronDown, Mic, ArrowUp, Square, Sparkles } from 'lucide-react';
import {
  sendAgentMessage,
  getConversations,
  getConversation,
  deleteConversation,
} from '../services/agentApi';

// SOP PDF generator
function generateSOPPdf(ticketNumber, content, messages) {
  const doc = new jsPDF();
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(88, 28, 135); // purple-900
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Standard Operating Procedure', 14, 16);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${ticketNumber || 'SOP'} | ${dateStr} ${timeStr}`, 14, 24);
  doc.text('DevOps Copilot - HolmesGPT', pageW - 14, 16, { align: 'right' });
  doc.text('Auto-generated Report', pageW - 14, 24, { align: 'right' });

  let y = 42;
  doc.setTextColor(30, 30, 30);

  // Summary section
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Summary', 14, y); y += 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  // Extract key info from content
  const lines = content.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const cleaned = line.replace(/[#*`]/g, '').trim();
    if (!cleaned) continue;
    const wrapped = doc.splitTextToSize(cleaned, pageW - 28);
    if (y + wrapped.length * 5 > 270) { doc.addPage(); y = 20; }
    doc.text(wrapped, 14, y);
    y += wrapped.length * 5 + 2;
  }

  // Conversation log
  if (messages && messages.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    y += 6;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Full Investigation Log', 14, y); y += 8;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    for (const msg of messages) {
      if (y > 265) { doc.addPage(); y = 20; }
      const role = msg.type === 'user' ? 'USER' : 'HOLMES';
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(msg.type === 'user' ? 88 : 107, msg.type === 'user' ? 28 : 33, msg.type === 'user' ? 135 : 168);
      doc.text(`[${msg.timestamp}] ${role}:`, 14, y); y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const text = (msg.content || '').slice(0, 800).replace(/[#*`]/g, '');
      const wrapped2 = doc.splitTextToSize(text, pageW - 28);
      const showLines = wrapped2.slice(0, 20);
      doc.text(showLines, 14, y);
      y += showLines.length * 4 + 4;

      // Tool calls
      if (msg.toolCalls?.length > 0) {
        doc.setTextColor(100, 100, 100);
        for (const tc of msg.toolCalls.slice(0, 5)) {
          if (y > 265) { doc.addPage(); y = 20; }
          doc.text(`  Tool: ${tc.tool}`, 18, y); y += 4;
        }
        y += 2;
      }
      doc.setTextColor(60, 60, 60);
    }
  }

  // Footer on each page
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${i} of ${totalPages}`, pageW / 2, 290, { align: 'center' });
    doc.text('CONFIDENTIAL - DevOps Copilot', 14, 290);
  }

  return doc;
}

const TOOL_LABELS = {
  list_clusters: 'Listing clusters', get_cluster_details: 'Fetching cluster details', get_cluster_topology: 'Building topology',
  get_namespaces: 'Fetching namespaces', get_resources: 'Listing resources', get_pod_logs: 'Reading logs',
  get_pod_metrics: 'Querying pod metrics', get_node_metrics: 'Querying node metrics', get_cluster_metrics: 'Querying cluster metrics',
  get_k8s_events: 'Scanning events', get_alerts: 'Fetching alerts', get_alert_timeline_grouped: 'Grouping alerts',
  get_managed_alerts: 'Checking alert rules', get_timeline_events: 'Loading timeline',
  get_correlated_incidents: 'Fetching incidents', run_correlation_analysis: 'Running root cause analysis',
  get_network_traffic: 'Analyzing traffic', get_service_map: 'Building service map',
  get_network_flows: 'Analyzing flows', prometheus_query: 'Querying Prometheus',
  prometheus_query_range: 'Querying time series', kubectl_get: 'kubectl get',
  kubectl_describe: 'kubectl describe', kubectl_logs: 'kubectl logs',
  get_integrations: 'Checking integrations', get_resource_yaml: 'Fetching YAML',
};

// Suggestions are handled by the LLM via :::ui blocks — no hardcoded ones

const HolmesGPT = () => {
  const { theme } = useTheme();
  const dk = theme === 'dark';
  const clusters = useSelector((state) => state.cluster?.clusters || []);
  const selectedCluster = useSelector((state) => state.cluster?.selectedCluster);

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState('vllm');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState(selectedCluster?._id || '');
  const [expandedTools, setExpandedTools] = useState({});
  const [expandedThinking, setExpandedThinking] = useState({});
  const [abortController, setAbortController] = useState(null);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [activeTools, setActiveTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const promptCategories = [
    { title: 'Investigate', prompts: ['What pods are crashing or in error state?', 'Analyze recent alerts and find the root cause', 'Are there any unusual patterns in the last 24 hours?'] },
    { title: 'Monitor', prompts: ['Show me cluster health and resource utilization', 'What are the top alerts by frequency?', 'Show the service dependency map'] },
    { title: 'Operate', prompts: ['Help me create a Prometheus alert rule', 'What integrations do I have configured?', 'Check network traffic between services'] },
  ];

  const loadActiveTools = useCallback(async () => {
    setToolsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/agent/tools`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: '{}',
      });
      if (resp.ok) { const d = await resp.json(); setActiveTools(d.tools || []); }
    } catch {} finally { setToolsLoading(false); }
  }, []);

  useEffect(() => { loadConversations(); loadActiveTools(); }, [loadActiveTools]);
  useEffect(() => { if (selectedCluster?._id) setSelectedClusterId(selectedCluster._id); }, [selectedCluster]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadConversations = async () => { try { const d = await getConversations(); setChatHistory(d.conversations || []); } catch {} };
  const loadConversation = async (convId) => {
    try {
      const d = await getConversation(convId);
      setMessages((d.messages || []).map((m, i) => ({
        id: i, type: m.role === 'user' ? 'user' : 'ai', content: m.content,
        toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : [], uiBlocks: [],
        timestamp: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      })));
      setCurrentConversationId(convId);
    } catch {}
  };
  const handleDeleteConversation = async (convId, e) => {
    e.stopPropagation();
    try { await deleteConversation(convId); setChatHistory(p => p.filter(c => c.id !== convId)); if (currentConversationId === convId) handleNewChat(); } catch {}
  };
  const toggleToolExpand = (msgId, toolIdx) => { setExpandedTools(p => ({ ...p, [`${msgId}-${toolIdx}`]: !p[`${msgId}-${toolIdx}`] })); };
  const toggleThinking = (msgId) => { setExpandedThinking(p => ({ ...p, [msgId]: !p[msgId] })); };
  // Auto-expand the Thinking block while it streams (no answer text yet); once the
  // answer starts or streaming ends it collapses — unless the user toggled it manually.
  const isThinkingOpen = (m) => (m.id in expandedThinking) ? expandedThinking[m.id] : (isStreaming && !(m.content || '').trim());
  const handleStop = () => { if (abortController) { abortController.abort(); setAbortController(null); setIsStreaming(false); } };
  const handleNewChat = () => { setMessages([]); setCurrentConversationId(null); };

  const handleSend = useCallback(async (overrideMessage) => {
    const msgText = overrideMessage || inputValue;
    if (!msgText.trim() || isStreaming) return;
    const userMessage = { id: Date.now(), type: 'user', content: msgText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    const aiMessageId = Date.now() + 1;
    const aiMessage = { id: aiMessageId, type: 'ai', content: '', reasoning: '', toolCalls: [], uiBlocks: [], thinkingLabel: 'Processing...', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setMessages(p => [...p, userMessage, aiMessage]);
    if (!overrideMessage) setInputValue('');
    setIsStreaming(true);
    const controller = new AbortController();
    setAbortController(controller);
    try {
      const reader = await sendAgentMessage({ message: msgText, conversationId: currentConversationId, modelProvider: selectedModel, clusterId: selectedClusterId });
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) { reader.cancel(); break; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type === 'token') {
            setMessages(p => p.map(m => m.id === aiMessageId ? { ...m, content: m.content + ev.content, thinkingLabel: null } : m));
          } else if (ev.type === 'reasoning') {
            setMessages(p => p.map(m => m.id === aiMessageId ? { ...m, reasoning: (m.reasoning || '') + ev.content } : m));
          } else if (ev.type === 'tool_start') {
            setMessages(p => p.map(m => m.id === aiMessageId ? { ...m, thinkingLabel: `${TOOL_LABELS[ev.tool] || ev.tool}...`, toolCalls: [...m.toolCalls, { tool: ev.tool, input: ev.input, output: '', status: 'running' }] } : m));
          } else if (ev.type === 'tool_end') {
            setMessages(p => p.map(m => m.id === aiMessageId ? { ...m, toolCalls: m.toolCalls.map(tc => tc.tool === ev.tool && tc.status === 'running' ? { ...tc, output: ev.output, status: 'done' } : tc) } : m));
          } else if (ev.type === 'done') {
            setCurrentConversationId(ev.conversationId); loadConversations();
          } else if (ev.type === 'error') {
            setMessages(p => p.map(m => m.id === aiMessageId ? { ...m, content: m.content + `\n\n**Error:** ${ev.error}`, thinkingLabel: null } : m));
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') setMessages(p => p.map(m => m.id === aiMessageId ? { ...m, content: `**Error:** ${err.message}`, thinkingLabel: null } : m));
    } finally {
      setMessages(p => p.map(m => m.id === aiMessageId ? { ...m, thinkingLabel: null } : m));
      setIsStreaming(false); setAbortController(null);
    }
  }, [inputValue, isStreaming, currentConversationId, selectedModel, selectedClusterId]);

  // ── Dynamic UI — renders :::ui blocks from LLM output ──────────────────
  // ── A2UI-inspired Dynamic UI renderer ─────────────────────────────────
  // Renders :::ui JSON blocks emitted by the LLM as native React components.
  // Component catalog: cards, table, buttons, metric, ticket, chart, gauge, progress, document, timeline, tabs, form
  const DynamicUI = ({ data, onAction, dk: b }) => {
    if (!data || !data.type) return null;
    const sc = (s) => s === 'green' ? 'bg-green-500' : s === 'red' ? 'bg-red-500' : s === 'yellow' ? 'bg-amber-500' : 'bg-blue-500';

    // ── CARDS ──
    if (data.type === 'cards' && data.items) {
      return (
        <div className={`my-3 rounded-md border ${b ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'}`}>
          {data.title && <div className={`px-3 py-2 text-[11px] font-medium border-b ${b ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'}`}>{data.title}</div>}
          <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.items.map((item, i) => (
              <button key={i} onClick={() => item.click && onAction(item.click)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-colors ${b ? 'bg-gray-800 border-gray-700 hover:border-purple-500/50 text-gray-200' : 'bg-white border-gray-200 hover:border-purple-400 text-gray-900 shadow-sm'} ${item.click ? 'cursor-pointer' : ''}`}>
                {item.status && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sc(item.status)}`} />}
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] font-medium`}>{item.title}</div>
                  {item.subtitle && <div className={`text-[10px] ${b ? 'text-gray-500' : 'text-gray-400'}`}>{item.subtitle}</div>}
                </div>
                {item.click && <svg className={`w-3.5 h-3.5 flex-shrink-0 ${b ? 'text-gray-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // ── TABLE ──
    if (data.type === 'table' && data.rows) {
      return (
        <div className={`my-3 rounded-md border overflow-hidden ${b ? 'border-gray-700' : 'border-gray-200'}`}>
          {data.title && <div className={`px-3 py-2 text-[11px] font-medium border-b ${b ? 'border-gray-700 bg-gray-800/40 text-gray-500' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>{data.title}</div>}
          <table className="w-full text-[12px]">
            {data.columns && <thead><tr className={b ? 'bg-gray-800/30' : 'bg-gray-50'}>
              {data.columns.map((c, ci) => <th key={ci} className={`px-3 py-2 text-left font-medium ${b ? 'text-gray-500' : 'text-gray-400'}`}>{c}</th>)}
            </tr></thead>}
            <tbody className={`divide-y ${b ? 'divide-gray-800' : 'divide-gray-100'}`}>
              {data.rows.map((row, ri) => (
                <tr key={ri} onClick={() => row.click && onAction(row.click)}
                  className={`transition-colors ${row.click ? 'cursor-pointer' : ''} ${b ? 'hover:bg-gray-800/40' : 'hover:bg-gray-50'}`}>
                  {(row.cells || []).map((cell, ci) => (
                    <td key={ci} className={`px-3 py-2 ${b ? 'text-gray-300' : 'text-gray-700'}`}>
                      {row.status && ci === (row.cells.length - 1) ? (
                        <span className={`inline-flex items-center gap-1 ${row.status === 'green' ? (b ? 'text-green-400' : 'text-green-700') : row.status === 'red' ? (b ? 'text-red-400' : 'text-red-700') : (b ? 'text-amber-400' : 'text-amber-700')}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc(row.status)}`} />{cell}
                        </span>
                      ) : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // ── BUTTONS ──
    if (data.type === 'buttons' && data.items) {
      return (
        <div className="my-3 flex flex-wrap gap-2">
          {data.items.map((btn, i) => (
            <button key={i} onClick={() => btn.click && onAction(btn.click)}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                btn.style === 'primary' ? 'bg-purple-600 hover:bg-purple-500 text-white'
                : btn.style === 'danger' ? 'bg-red-600 hover:bg-red-500 text-white'
                : btn.style === 'success' ? 'bg-green-600 hover:bg-blue-500 text-white'
                : (b ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300')
              }`}>{btn.label}</button>
          ))}
        </div>
      );
    }

    // ── METRIC CARDS ──
    if (data.type === 'metric' && data.items) {
      return (
        <div className="my-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {data.items.map((m, i) => (
            <div key={i} onClick={() => m.click && onAction(m.click)}
              className={`rounded-md border p-3 ${m.click ? 'cursor-pointer' : ''} ${b ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white shadow-sm'}`}>
              <div className={`text-[10px] font-medium uppercase tracking-wider ${b ? 'text-gray-500' : 'text-gray-400'}`}>{m.label}</div>
              <div className={`text-lg font-semibold mt-1 ${m.status ? (m.status === 'green' ? (b ? 'text-green-400' : 'text-green-700') : m.status === 'red' ? (b ? 'text-red-400' : 'text-red-700') : (b ? 'text-amber-400' : 'text-amber-700')) : (b ? 'text-gray-200' : 'text-gray-900')}`}>{m.value}</div>
              {m.subtitle && <div className={`text-[10px] mt-0.5 ${b ? 'text-gray-600' : 'text-gray-400'}`}>{m.subtitle}</div>}
            </div>
          ))}
        </div>
      );
    }

    // ── TICKET (ServiceNow) ──
    if (data.type === 'ticket') {
      const isInc = (data.number || '').startsWith('INC');
      const stateColor = data.state === 'Closed' || data.state === 'Resolved' ? 'bg-green-500' : data.state === 'New' ? 'bg-blue-500' : data.state === 'In Progress' ? 'bg-purple-500' : 'bg-amber-500';
      const stateLabel = data.state || 'New';
      // Collect all fields for display (skip type, number, title, state — shown in header)
      const fields = Object.entries(data).filter(([k]) => !['type', 'number', 'title', 'state'].includes(k) && data[k]);
      return (
        <div className={`my-3 rounded-lg border overflow-hidden ${b ? 'border-gray-700' : 'border-gray-200'}`}>
          {/* Header */}
          <div className={`px-4 py-3 flex items-center justify-between ${b ? 'bg-gray-800/50 border-b border-gray-700' : 'bg-gray-50 border-b border-gray-200'}`}>
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${stateColor}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[14px] font-semibold tracking-tight ${b ? 'text-gray-100' : 'text-gray-900'}`}>{data.number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${b ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>{isInc ? 'Incident' : 'Change Request'}</span>
                </div>
                {data.title && <div className={`text-[12px] mt-0.5 ${b ? 'text-gray-400' : 'text-gray-600'}`}>{data.title}</div>}
              </div>
            </div>
            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-md ${
              stateLabel === 'New' ? (b ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700')
              : stateLabel === 'Closed' || stateLabel === 'Resolved' ? (b ? 'bg-green-500/15 text-green-400' : 'bg-blue-100 text-blue-700')
              : stateLabel === 'In Progress' ? (b ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-100 text-purple-700')
              : (b ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700')
            }`}>{stateLabel}</span>
          </div>
          {/* Fields grid */}
          {fields.length > 0 && (
            <div className={`px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5`}>
              {fields.map(([key, val]) => (
                <div key={key}>
                  <div className={`text-[10px] font-medium uppercase tracking-wider ${b ? 'text-gray-600' : 'text-gray-400'}`}>{key.replace(/_/g, ' ')}</div>
                  <div className={`text-[12px] mt-0.5 ${b ? 'text-gray-300' : 'text-gray-700'}`}>{String(val)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // ── CHART (time series) ──
    if (data.type === 'chart' && data.series?.length > 0) {
      const COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];
      const timeMap = {};
      data.series.forEach(s => (s.points || []).forEach(p => { if (!timeMap[p.t]) timeMap[p.t] = { t: p.t }; timeMap[p.t][s.label] = p.v; }));
      const chartData = Object.values(timeMap).sort((a, c) => a.t - c.t);
      const fmtTime = t => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return (
        <div className={`my-3 rounded-lg border overflow-hidden ${b ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className={`px-4 py-2 flex items-center justify-between text-[11px] font-medium border-b ${b ? 'border-gray-700 bg-gray-800/40 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
            <span className="font-mono truncate">{data.title || 'Metrics'}</span>
            {data.duration && <span className={b ? 'text-gray-600' : 'text-gray-400'}>{data.duration}</span>}
          </div>
          <div className="p-3" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={b ? '#1f2937' : '#f3f4f6'} />
                <XAxis dataKey="t" tickFormatter={fmtTime} tick={{ fontSize: 10, fill: b ? '#6b7280' : '#9ca3af' }} axisLine={{ stroke: b ? '#374151' : '#e5e7eb' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: b ? '#6b7280' : '#9ca3af' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1e9 ? `${(v/1e9).toFixed(1)}G` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(1)}K` : Number(v).toFixed(2)} />
                <Tooltip contentStyle={{ backgroundColor: b ? '#1f2937' : '#fff', border: `1px solid ${b ? '#374151' : '#e5e7eb'}`, borderRadius: 6, fontSize: 11 }}
                  labelFormatter={fmtTime} formatter={v => [typeof v === 'number' ? v.toFixed(4) : v]} />
                {data.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {data.series.map((s, si) => <Line key={si} type="monotone" dataKey={s.label} stroke={COLORS[si % COLORS.length]} strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    // ── GAUGE / DONUT (utilization) ──
    if (data.type === 'gauge' && data.items) {
      return (
        <div className="my-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.items.map((g, i) => {
            const pct = parseFloat(g.value) || 0;
            const color = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#10b981';
            const radius = 36; const circumference = 2 * Math.PI * radius;
            const offset = circumference - (pct / 100) * circumference;
            return (
              <div key={i} className={`rounded-lg border p-3 flex flex-col items-center ${b ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white shadow-sm'}`}>
                <svg width="84" height="84" className="-rotate-90">
                  <circle cx="42" cy="42" r={radius} fill="none" stroke={b ? '#1f2937' : '#f3f4f6'} strokeWidth="6" />
                  <circle cx="42" cy="42" r={radius} fill="none" stroke={color} strokeWidth="6"
                    strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
                </svg>
                <div className={`-mt-[56px] mb-3 text-center`}>
                  <div className={`text-lg font-bold ${b ? 'text-gray-100' : 'text-gray-900'}`}>{g.value}</div>
                </div>
                <div className={`text-[10px] font-medium mt-1 ${b ? 'text-gray-500' : 'text-gray-400'}`}>{g.label}</div>
              </div>
            );
          })}
        </div>
      );
    }

    // ── PROGRESS BARS ──
    if (data.type === 'progress' && data.items) {
      return (
        <div className={`my-3 rounded-lg border p-4 space-y-3 ${b ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-white shadow-sm'}`}>
          {data.title && <div className={`text-[11px] font-medium mb-1 ${b ? 'text-gray-400' : 'text-gray-500'}`}>{data.title}</div>}
          {data.items.map((p, i) => {
            const pct = parseFloat(p.value) || 0;
            const barColor = p.status === 'red' ? 'bg-red-500' : p.status === 'yellow' ? 'bg-amber-500' : p.status === 'green' ? 'bg-green-500' : 'bg-purple-500';
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-medium ${b ? 'text-gray-300' : 'text-gray-700'}`}>{p.label}</span>
                  <span className={`text-[11px] font-semibold ${b ? 'text-gray-200' : 'text-gray-900'}`}>{p.value}</span>
                </div>
                <div className={`w-full h-2 rounded-full ${b ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div className={`h-2 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // ── DOCUMENT VIEWER ──
    if (data.type === 'document') {
      return (
        <div className={`my-3 rounded-lg border overflow-hidden ${b ? 'border-gray-700' : 'border-gray-200'}`}>
          {/* Document header bar */}
          <div className={`px-4 py-2.5 flex items-center justify-between border-b ${b ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 ${b ? 'text-purple-400' : 'text-purple-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span className={`text-[12px] font-medium ${b ? 'text-gray-200' : 'text-gray-900'}`}>{data.title || 'Document'}</span>
            </div>
            {data.downloadable && (
              <button onClick={() => {
                const pdf = generateSOPPdf(data.ticket || '', data.content || '', messages);
                pdf.save(`${data.title || 'report'}.pdf`);
              }} className={`text-[10px] px-2.5 py-1 rounded-md font-medium ${b ? 'bg-purple-500/15 text-purple-300 hover:bg-purple-500/25' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                Download PDF
              </button>
            )}
          </div>
          {/* Document body */}
          <div className={`px-5 py-4 max-h-80 overflow-y-auto ${b ? 'bg-gray-900/30' : 'bg-white'}`} style={{ scrollbarWidth: 'thin', fontFamily: 'Georgia, serif' }}>
            <div className={`prose max-w-none ${b ? 'prose-invert' : ''}`} style={{ fontSize: '12px', lineHeight: '1.8' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{data.content || ''}</ReactMarkdown>
            </div>
          </div>
        </div>
      );
    }

    // ── TIMELINE ──
    if (data.type === 'timeline' && data.items) {
      return (
        <div className={`my-3 rounded-lg border overflow-hidden ${b ? 'border-gray-700' : 'border-gray-200'}`}>
          {data.title && <div className={`px-4 py-2 text-[11px] font-medium border-b ${b ? 'border-gray-700 bg-gray-800/40 text-gray-500' : 'border-gray-200 bg-gray-50 text-gray-400'}`}>{data.title}</div>}
          <div className="px-4 py-3">
            {data.items.map((item, i) => (
              <div key={i} className="flex gap-3 pb-3 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sc(item.status || 'blue')}`} />
                  {i < data.items.length - 1 && <div className={`w-px flex-1 mt-1 ${b ? 'bg-gray-800' : 'bg-gray-200'}`} />}
                </div>
                <div className="flex-1 min-w-0 -mt-0.5" onClick={() => item.click && onAction(item.click)} style={item.click ? { cursor: 'pointer' } : {}}>
                  <div className={`text-[12px] font-medium ${b ? 'text-gray-200' : 'text-gray-900'}`}>{item.title}</div>
                  {item.subtitle && <div className={`text-[10px] mt-0.5 ${b ? 'text-gray-500' : 'text-gray-400'}`}>{item.subtitle}</div>}
                  {item.time && <div className={`text-[9px] mt-0.5 ${b ? 'text-gray-600' : 'text-gray-400'}`}>{item.time}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };


  // ── Markdown components ───────────────────────────────────────────────────
  const mdComponents = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <div className="relative group my-3">
          <button onClick={() => navigator.clipboard.writeText(String(children))}
            className={`absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-2 py-1 rounded ${dk ? 'bg-gray-700 text-gray-400 hover:text-gray-200' : 'bg-gray-200 text-gray-500 hover:text-gray-700'}`}>Copy</button>
          <SyntaxHighlighter style={dk ? oneDark : oneLight} language={match[1]} PreTag="div"
            customStyle={{ borderRadius: '6px', fontSize: '12px', margin: 0 }} {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
        </div>
      ) : (
        <code className={`${dk ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-800'} px-1 py-0.5 rounded text-[11px] font-mono`} {...props}>{children}</code>
      );
    },
    table({ children }) { return <div className={`overflow-x-auto my-3 rounded-lg border ${dk ? 'border-gray-700' : 'border-gray-200'}`}><table className={`w-full text-sm ${dk ? 'bg-gray-800/40' : 'bg-white'}`}>{children}</table></div>; },
    th({ children }) { return <th className={`px-4 py-2 text-left text-xs font-medium ${dk ? 'text-gray-400 bg-gray-800/60 border-b border-gray-700' : 'text-gray-500 bg-gray-50 border-b border-gray-200'}`}>{children}</th>; },
    td({ children }) { return <td className={`px-4 py-2 text-sm ${dk ? 'border-b border-gray-800' : 'border-b border-gray-100'}`}>{children}</td>; },
    h2({ children }) { return <h2 className={`text-[13px] font-semibold mt-4 mb-1.5 pb-1 border-b ${dk ? 'text-gray-200 border-gray-800' : 'text-gray-900 border-gray-200'}`}>{children}</h2>; },
    h3({ children }) { return <h3 className={`text-[13px] font-semibold mt-3 mb-1 ${dk ? 'text-gray-300' : 'text-gray-800'}`}>{children}</h3>; },
    li({ children }) {
      const text = String(children);
      let dot = null;
      if (/running|active|healthy|connected|ready/i.test(text)) dot = 'bg-green-500';
      else if (/crash|error|failed|critical|oom/i.test(text)) dot = 'bg-red-500';
      else if (/warning|pending|not.?ready|restart/i.test(text)) dot = 'bg-amber-500';
      return <li className="flex items-start gap-1.5">{dot && <span className={`w-1 h-1 rounded-full ${dot} mt-[7px] flex-shrink-0`} />}<span className="flex-1">{children}</span></li>;
    },
    strong({ children }) {
      const t = String(children);
      if (/critical|error|failed|crash/i.test(t)) return <strong className="text-red-400 font-medium">{children}</strong>;
      if (/warning|caution/i.test(t)) return <strong className="text-amber-400 font-medium">{children}</strong>;
      if (/running|active|healthy|success/i.test(t)) return <strong className="text-green-400 font-medium">{children}</strong>;
      return <strong className={`font-medium ${dk ? 'text-gray-200' : 'text-gray-900'}`}>{children}</strong>;
    },
  };

  return (
    <div className={`h-full flex ${dk ? 'bg-[#0b0b11]' : 'bg-white'}`}>
      {/* Sidebar */}
      <div className={`${showHistory ? 'w-64' : 'w-0'} transition-all duration-200 overflow-hidden flex-shrink-0 ${dk ? 'bg-[#0f0f18] border-r border-gray-800' : 'bg-gray-50 border-r border-gray-200'}`}>
        <div className="p-3 h-full flex flex-col w-64">
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium ${dk ? 'text-gray-400' : 'text-gray-500'}`}>Sessions</span>
            <button onClick={() => setShowHistory(false)} className={`p-1 rounded ${dk ? 'hover:bg-gray-800 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <button onClick={handleNewChat} className="w-full mb-3 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-medium transition-colors">
            New session
          </button>
          <div className="flex-1 overflow-y-auto space-y-0.5" style={{ scrollbarWidth: 'thin' }}>
            {chatHistory.map(chat => (
              <button key={chat.id} onClick={() => loadConversation(chat.id)}
                className={`w-full text-left px-3 py-2.5 rounded-md text-xs transition-colors group relative ${
                  currentConversationId === chat.id ? (dk ? 'bg-purple-500/15 text-purple-300' : 'bg-purple-50 text-purple-700') : (dk ? 'text-gray-400 hover:bg-gray-800/60' : 'text-gray-600 hover:bg-gray-100')
                }`}>
                <div className="truncate pr-5 font-medium">{chat.title || 'Untitled'}</div>
                <div className={`mt-0.5 ${dk ? 'text-gray-600' : 'text-gray-400'}`}>{chat.updated_at ? new Date(chat.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</div>
                <button onClick={e => handleDeleteConversation(chat.id, e)} className={`absolute right-2 top-2.5 p-1 rounded opacity-0 group-hover:opacity-100 ${dk ? 'hover:bg-gray-700 text-gray-600' : 'hover:bg-gray-200 text-gray-400'}`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-2 border-b flex-shrink-0 ${dk ? 'border-gray-800 bg-[#0b0b11]' : 'border-gray-200 bg-white'}`}>
          <div className="flex items-center gap-3">
            {!showHistory && <button onClick={() => setShowHistory(true)} className={`p-1.5 rounded-md ${dk ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>}
            <span className={`text-[13px] font-semibold ${dk ? 'text-gray-200' : 'text-gray-900'}`}>HolmesGPT</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Model & cluster selectors moved into the composer (below) */}

            {/* Tools button */}
            <button onClick={() => setShowToolsPanel(p => !p)}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                showToolsPanel
                  ? (dk ? 'bg-purple-500/15 border-purple-500/40 text-purple-300' : 'bg-purple-50 border-purple-300 text-purple-700')
                  : (dk ? 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700')
              }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Tools
              {activeTools.filter(t => t.status === 'connected').length > 0 && (
                <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${dk ? 'bg-purple-500 text-white' : 'bg-purple-600 text-white'}`}>
                  {activeTools.filter(t => t.status === 'connected').length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto px-6">
              <h2 className={`text-base font-semibold mb-1 ${dk ? 'text-gray-200' : 'text-gray-900'}`}>How can I help?</h2>
              <p className={`text-[13px] mb-8 ${dk ? 'text-gray-500' : 'text-gray-500'}`}>Ask about your clusters, alerts, metrics, or incidents</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
                {promptCategories.map(cat => (
                  <div key={cat.title}>
                    <div className={`text-[10px] font-medium uppercase tracking-wider mb-2 ${dk ? 'text-gray-500' : 'text-gray-400'}`}>{cat.title}</div>
                    <div className="space-y-1.5">
                      {cat.prompts.map((p, i) => (
                        <button key={i} onClick={() => handleSend(p)}
                          className={`w-full text-left text-xs p-3 rounded-md border transition-colors ${dk
                            ? 'border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700 hover:bg-gray-800/40'
                            : 'border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50'}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-4 space-y-0">
              {messages.map(message => (
                <div key={message.id} className="py-3">
                  {message.type === 'user' ? (
                    <div className="flex gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${dk ? 'bg-gray-700' : 'bg-gray-200'}`}>
                        <svg className={`w-3.5 h-3.5 ${dk ? 'text-gray-300' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <div>
                        <div className={`text-[11px] font-medium mb-0.5 ${dk ? 'text-gray-500' : 'text-gray-400'}`}>You</div>
                        <div className={`text-[13px] leading-normal ${dk ? 'text-gray-300' : 'text-gray-800'}`}>{message.content}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-purple-600">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-[11px] font-medium mb-0.5 ${dk ? 'text-gray-500' : 'text-gray-400'}`}>HolmesGPT</div>

                        {/* Thinking / reasoning (collapsible, collapsed by default) */}
                        {message.reasoning && (
                          <div className={`mb-3 rounded-md border ${dk ? 'border-gray-800' : 'border-gray-200'}`}>
                            <button onClick={() => toggleThinking(message.id)}
                              className={`flex items-center w-full px-3 py-1.5 text-xs transition-colors ${dk ? 'bg-gray-800/40 hover:bg-gray-800/60 text-gray-400' : 'bg-gray-50 hover:bg-gray-100 text-gray-500'}`}>
                              <svg className="w-3 h-3 mr-2 flex-shrink-0 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                              <span className={`font-medium ${dk ? 'text-gray-300' : 'text-gray-700'}`}>Thinking</span>
                              {isStreaming && !(message.content || '').trim() && (
                                <span className="ml-2 w-2.5 h-2.5 rounded-full border-[1.5px] border-purple-500 border-t-transparent animate-spin" />
                              )}
                              <svg className={`w-3 h-3 ml-auto flex-shrink-0 transition-transform ${isThinkingOpen(message) ? 'rotate-180' : ''} ${dk ? 'text-gray-600' : 'text-gray-400'}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {isThinkingOpen(message) && (
                              <div className={`px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap border-t ${dk ? 'bg-gray-900/40 text-gray-400 border-gray-800' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                                style={{ maxHeight: '18rem', overflowY: 'auto', scrollbarWidth: 'thin' }}>{message.reasoning}</div>
                            )}
                          </div>
                        )}

                        {/* Tool calls */}
                        {message.toolCalls?.length > 0 && (
                          <div className="mb-3 space-y-1">
                            {message.toolCalls.map((tc, i) => {
                              const isExp = expandedTools[`${message.id}-${i}`];
                              return (
                                <div key={i} className={`rounded-md overflow-hidden border ${dk ? 'border-gray-800' : 'border-gray-200'}`}>
                                  <button onClick={() => toggleToolExpand(message.id, i)}
                                    className={`flex items-center w-full px-3 py-1.5 text-xs transition-colors ${dk ? 'bg-gray-800/40 hover:bg-gray-800/60 text-gray-400' : 'bg-gray-50 hover:bg-gray-100 text-gray-500'}`}>
                                    {tc.status === 'running'
                                      ? <span className="w-3 h-3 mr-2 rounded-full border-[1.5px] border-purple-500 border-t-transparent animate-spin flex-shrink-0" />
                                      : <svg className="w-3 h-3 mr-2 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                                    <span className={`font-mono ${dk ? 'text-gray-300' : 'text-gray-700'}`}>{tc.tool}</span>
                                    {tc.input && Object.keys(tc.input).length > 0 && (
                                      <span className={`ml-1.5 truncate ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
                                        ({Object.entries(tc.input).slice(0, 2).map(([k, v]) => `${k}=${String(v).slice(0, 20)}`).join(', ')})
                                      </span>
                                    )}
                                    <svg className={`w-3 h-3 ml-auto flex-shrink-0 transition-transform ${isExp ? 'rotate-180' : ''} ${dk ? 'text-gray-600' : 'text-gray-400'}`}
                                      fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                  </button>
                                  {isExp && tc.output && (
                                    <pre className={`px-3 py-2 text-[11px] overflow-x-auto max-h-48 overflow-y-auto font-mono border-t ${dk ? 'bg-[#0a0a12] text-gray-400 border-gray-800' : 'bg-gray-900 text-gray-300 border-gray-200'}`}
                                      style={{ scrollbarWidth: 'thin' }}>{tc.output}</pre>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Thinking */}
                        {message.thinkingLabel && !message.content && (
                          <div className={`flex items-center gap-2 py-2 ${dk ? 'text-gray-500' : 'text-gray-400'}`}>
                            <div className="w-3.5 h-3.5 rounded-full border-[1.5px] border-purple-500 border-t-transparent animate-spin" />
                            <span className="text-xs">{message.thinkingLabel}</span>
                          </div>
                        )}

                        {/* Content with inline :::ui blocks */}
                        {message.content && (() => {
                          // Split content into text parts and :::ui blocks
                          const parts = [];
                          const raw = message.content;
                          const uiRegex = /:::ui\n([\s\S]*?)(?:\n:::|\n$)/g;
                          let lastIdx = 0;
                          let match;
                          while ((match = uiRegex.exec(raw)) !== null) {
                            if (match.index > lastIdx) {
                              parts.push({ type: 'text', content: raw.slice(lastIdx, match.index) });
                            }
                            try {
                              parts.push({ type: 'ui', data: JSON.parse(match[1].trim()) });
                            } catch { parts.push({ type: 'text', content: match[0] }); }
                            lastIdx = match.index + match[0].length;
                          }
                          if (lastIdx < raw.length) {
                            parts.push({ type: 'text', content: raw.slice(lastIdx) });
                          }

                          return parts.map((part, pi) => {
                            if (part.type === 'text' && part.content.trim()) {
                              return (
                                <div key={pi} className={`prose max-w-none ${dk ? 'prose-invert' : ''} prose-pre:p-0 prose-pre:bg-transparent prose-ul:my-1 prose-li:my-0.5 prose-p:my-1.5 prose-headings:mb-1.5`}
                                  style={{ fontSize: '13px', lineHeight: '1.6' }}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{part.content}</ReactMarkdown>
                                </div>
                              );
                            }
                            if (part.type === 'ui') {
                              return <DynamicUI key={pi} data={part.data} onAction={handleSend} dk={dk} />;
                            }
                            return null;
                          });
                        })()}

                        {/* Suggestions are rendered via :::ui blocks from the LLM */}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer — rebuilt to match the Fable/Claude reference exactly */}
        <div className={`flex-shrink-0 px-6 pb-5 pt-2 ${dk ? 'bg-[#0b0b11]' : 'bg-white'}`}>
          <div className="max-w-3xl mx-auto">
            <div className={`rounded-[26px] border px-3 pt-3 pb-2.5 transition-colors ${dk
              ? 'bg-[#1e1e1e] border-[#2f2f2f] focus-within:border-[#3d3d3d]'
              : 'bg-white border-gray-200 focus-within:border-gray-300 shadow-[0_6px_28px_-10px_rgba(0,0,0,0.18)]'}`}>
              <textarea ref={textareaRef} value={inputValue} onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Investigate, plan, automate  /  @ for context"
                rows={1} disabled={isStreaming}
                className={`w-full bg-transparent resize-none outline-none text-[15px] leading-relaxed px-2 pt-1 pb-2.5 ${dk ? 'text-gray-100 placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'} max-h-44 disabled:opacity-50`} />

              {/* Controls row */}
              <div className="flex items-center gap-2">
                {/* Add files */}
                <button title="Attach context"
                  className={`inline-flex items-center gap-1.5 text-[13px] px-3 py-[7px] rounded-full border transition-colors ${dk ? 'bg-[#2b2b2b] hover:bg-[#343434] border-white/[0.06] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600'}`}>
                  <Plus size={15} strokeWidth={2.2} /> Add files
                </button>

                {/* Cluster selector */}
                {clusters.length > 0 && (
                  <div className="relative">
                    <select value={selectedClusterId} onChange={e => setSelectedClusterId(e.target.value)}
                      className={`appearance-none cursor-pointer text-[13px] pl-3 pr-7 py-[7px] rounded-full border transition-colors focus:outline-none ${dk ? 'bg-[#2b2b2b] hover:bg-[#343434] border-white/[0.06] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600'}`}>
                      <option value="">All clusters</option>
                      {clusters.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                    <ChevronDown size={13} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${dk ? 'text-gray-500' : 'text-gray-400'}`} />
                  </div>
                )}

                {/* Model selector */}
                <div className="relative">
                  <button onClick={() => setModelMenuOpen(o => !o)}
                    className={`inline-flex items-center gap-1.5 text-[13px] px-3 py-[7px] rounded-full border transition-colors ${dk ? 'bg-[#2b2b2b] hover:bg-[#343434] border-white/[0.06] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600'}`}>
                    <Sparkles size={14} className="text-blue-500" />
                    <span className={dk ? 'text-gray-100 font-medium' : 'text-gray-800 font-medium'}>
                      {selectedModel === 'vllm' ? 'qwopus3.5-9b-v3' : selectedModel === 'bedrock' ? 'AWS Bedrock' : selectedModel === 'anthropic' ? 'Claude' : selectedModel === 'openai' ? 'GPT-4o' : selectedModel}
                    </span>
                    <span className={dk ? 'text-gray-500' : 'text-gray-400'}>High</span>
                    <ChevronDown size={13} className="opacity-60" />
                  </button>
                  {modelMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setModelMenuOpen(false)} />
                      <div className={`absolute bottom-full mb-2 left-0 z-40 w-52 rounded-xl border shadow-xl py-1.5 ${dk ? 'bg-[#1e1e1e] border-[#333]' : 'bg-white border-gray-200'}`}>
                        {[['vllm', 'qwopus3.5-9b-v3'], ['bedrock', 'AWS Bedrock'], ['anthropic', 'Claude'], ['openai', 'GPT-4o']].map(([val, label]) => (
                          <button key={val} onClick={() => { setSelectedModel(val); setModelMenuOpen(false); }}
                            className={`flex items-center gap-2.5 w-full px-3 py-2 text-[13px] ${dk ? 'text-gray-300 hover:bg-white/[0.05]' : 'text-gray-700 hover:bg-gray-50'}`}>
                            <Sparkles size={14} className={selectedModel === val ? 'text-blue-500' : 'opacity-40'} />
                            <span className="flex-1 text-left">{label}</span>
                            {selectedModel === val && <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex-1" />

                {/* Mic */}
                <button title="Voice input"
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${dk ? 'bg-[#2b2b2b] hover:bg-[#343434] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                  <Mic size={16} />
                </button>

                {/* Send / Stop */}
                {isStreaming ? (
                  <button onClick={handleStop} title="Stop"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-400 text-white transition-colors">
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : (
                  <button onClick={() => handleSend()} disabled={!inputValue.trim()} title="Send"
                    className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${inputValue.trim()
                      ? (dk ? 'bg-white text-black hover:bg-gray-100' : 'bg-gray-900 text-white hover:bg-gray-800')
                      : (dk ? 'bg-[#2b2b2b] border border-white/[0.08] text-gray-600 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}`}>
                    <ArrowUp size={18} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            </div>
            <div className={`text-[10px] mt-2.5 text-center ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
              HolmesGPT may produce inaccurate information. Verify critical actions before proceeding.
            </div>
          </div>
        </div>

        {/* Tools Panel */}
        {showToolsPanel && (
          <div className={`absolute top-0 right-0 h-full w-72 border-l flex flex-col z-20 ${dk ? 'bg-[#0f0f18] border-gray-800' : 'bg-white border-gray-200'}`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${dk ? 'border-gray-800' : 'border-gray-200'}`}>
              <span className={`text-[13px] font-semibold ${dk ? 'text-gray-200' : 'text-gray-900'}`}>Active Tools</span>
              <button onClick={() => setShowToolsPanel(false)} className={`p-1 rounded ${dk ? 'hover:bg-gray-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'thin' }}>
              {toolsLoading ? (
                <div className={`flex items-center gap-2 p-3 text-xs ${dk ? 'text-gray-500' : 'text-gray-400'}`}>
                  <div className="w-3 h-3 rounded-full border-[1.5px] border-purple-500 border-t-transparent animate-spin" />
                  Loading tools...
                </div>
              ) : activeTools.length === 0 ? (
                <div className={`text-xs p-3 ${dk ? 'text-gray-600' : 'text-gray-400'}`}>No tools available</div>
              ) : (
                activeTools.map((tool, ti) => (
                  <div key={ti} className={`rounded-md border ${
                    tool.status === 'connected'
                      ? (dk ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white')
                      : (dk ? 'border-red-500/20 bg-red-500/5' : 'border-red-200 bg-red-50')
                  }`}>
                    <div className="px-3 py-2.5 flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tool.status === 'connected' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-[12px] font-medium ${dk ? 'text-gray-200' : 'text-gray-900'}`}>{tool.name}</div>
                        <div className={`text-[10px] ${dk ? 'text-gray-600' : 'text-gray-400'}`}>
                          {tool.toolCount} tool{tool.toolCount !== 1 ? 's' : ''} {tool.status === 'connected' ? 'available' : '- ' + (tool.error || 'disconnected')}
                        </div>
                      </div>
                    </div>
                    {tool.tools && tool.tools.length > 0 && (
                      <div className={`px-3 pb-2.5 flex flex-wrap gap-1`}>
                        {tool.tools.slice(0, 8).map((t, i) => (
                          <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${dk ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-500'}`}>
                            {t}
                          </span>
                        ))}
                        {tool.tools.length > 8 && (
                          <span className={`text-[9px] px-1.5 py-0.5 ${dk ? 'text-gray-600' : 'text-gray-400'}`}>+{tool.tools.length - 8} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Refresh button */}
              <button onClick={loadActiveTools} disabled={toolsLoading}
                className={`w-full text-center text-[11px] py-2 rounded-md border transition-colors ${dk
                  ? 'border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700'
                  : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }`}>
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HolmesGPT;

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import ForceGraph2D from 'react-force-graph-2d';
import WorkloadTrafficMap from './WorkloadTrafficMap';
import {
  fetchNetworkTraffic,
  fetchServiceMap,
  toggleCapture,
  selectTrafficEvents,
  selectServiceMap,
  selectCaptureEnabled,
  selectIsLoadingTraffic,
  selectIsLoadingServiceMap,
  selectIsTogglingCapture,
  selectTrafficError,
  selectServiceMapError,
  makeSelectFilteredTrafficEvents
} from '../redux/slices/networkSlice';
import { getClusters } from '../services/api';

// ========================================
// Constants & Helpers
// ========================================

const PROTOCOL_COLORS = {
  HTTP:  { bg: '#e8f5e9', text: '#2e7d32', darkBg: '#1b5e20', darkText: '#81c784', border: '#4caf50' },
  HTTPS: { bg: '#e3f2fd', text: '#1565c0', darkBg: '#0d47a1', darkText: '#64b5f6', border: '#2196f3' },
  TLS:   { bg: '#f3e5f5', text: '#7b1fa2', darkBg: '#4a148c', darkText: '#ce93d8', border: '#9c27b0' },
  DNS:   { bg: '#fff3e0', text: '#e65100', darkBg: '#bf360c', darkText: '#ffb74d', border: '#ff9800' },
  TCP:   { bg: '#e0f2f1', text: '#00695c', darkBg: '#004d40', darkText: '#80cbc4', border: '#009688' },
};

const STATUS_COLORS = {
  '1xx': '#64b5f6',
  '2xx': '#4caf50',
  '3xx': '#42a5f5',
  '4xx': '#ffa726',
  '5xx': '#ef5350',
};

const METHOD_COLORS = {
  GET:    { bg: '#e8f5e9', text: '#2e7d32', darkBg: '#1b5e20', darkText: '#81c784' },
  POST:   { bg: '#e3f2fd', text: '#1565c0', darkBg: '#0d47a1', darkText: '#64b5f6' },
  PUT:    { bg: '#fff8e1', text: '#f57f17', darkBg: '#f57f17', darkText: '#fff176' },
  DELETE: { bg: '#ffebee', text: '#c62828', darkBg: '#b71c1c', darkText: '#ef9a9a' },
  PATCH:  { bg: '#f3e5f5', text: '#7b1fa2', darkBg: '#4a148c', darkText: '#ce93d8' },
  HEAD:   { bg: '#eceff1', text: '#546e7a', darkBg: '#37474f', darkText: '#b0bec5' },
  OPTIONS:{ bg: '#eceff1', text: '#546e7a', darkBg: '#37474f', darkText: '#b0bec5' },
};

const NS_COLORS = [
  { bg: '#e3f2fd', text: '#1565c0', darkBg: '#0d47a1', darkText: '#64b5f6' },
  { bg: '#fce4ec', text: '#c62828', darkBg: '#880e4f', darkText: '#f48fb1' },
  { bg: '#e8f5e9', text: '#2e7d32', darkBg: '#1b5e20', darkText: '#81c784' },
  { bg: '#fff3e0', text: '#e65100', darkBg: '#bf360c', darkText: '#ffb74d' },
  { bg: '#f3e5f5', text: '#7b1fa2', darkBg: '#4a148c', darkText: '#ce93d8' },
  { bg: '#e0f7fa', text: '#00695c', darkBg: '#004d40', darkText: '#80cbc4' },
  { bg: '#fff8e1', text: '#f57f17', darkBg: '#f57f17', darkText: '#fff176' },
  { bg: '#e8eaf6', text: '#283593', darkBg: '#1a237e', darkText: '#9fa8da' },
];

function getNsColor(ns) {
  if (!ns) return NS_COLORS[0];
  let hash = 0;
  for (let i = 0; i < ns.length; i++) hash = ((hash << 5) - hash + ns.charCodeAt(i)) | 0;
  return NS_COLORS[Math.abs(hash) % NS_COLORS.length];
}

function getStatusColor(status) {
  if (!status) return '#9e9e9e';
  if (status >= 200 && status < 300) return STATUS_COLORS['2xx'];
  if (status >= 300 && status < 400) return STATUS_COLORS['3xx'];
  if (status >= 400 && status < 500) return STATUS_COLORS['4xx'];
  if (status >= 500) return STATUS_COLORS['5xx'];
  return STATUS_COLORS['1xx'];
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)}${sizes[i]}`;
}

function formatFullTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, fractionalSecondDigits: 3
    });
  } catch { return ts; }
}

function formatLatency(ms) {
  if (ms == null) return '';
  if (ms < 1) return `${Math.round(ms * 1000)} \u00B5s`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function getEndpointDisplay(ep) {
  if (!ep) return { name: 'unknown', type: '?' };
  if (ep.pod) return { name: ep.pod, type: 'P' };
  if (ep.svc) return { name: ep.svc, type: 'S' };
  return { name: ep.ip || 'unknown', type: '?' };
}

// ========================================
// Main Component
// ========================================

const ServiceDependency = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const dispatch = useDispatch();

  const [activeTab, setActiveTab] = useState('traffic');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [detailTab, setDetailTab] = useState('request');
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef(null);
  const [goToNew, setGoToNew] = useState(false);

  const clusterId = selectedCluster?._id;

  const trafficEvents = useSelector(state => selectTrafficEvents(state, clusterId));
  const serviceMap = useSelector(state => selectServiceMap(state, clusterId));
  const captureEnabled = useSelector(state => selectCaptureEnabled(state, clusterId));
  const loadingTraffic = useSelector(state => selectIsLoadingTraffic(state, clusterId));
  const loadingServiceMap = useSelector(state => selectIsLoadingServiceMap(state, clusterId));
  const togglingCapture = useSelector(state => selectIsTogglingCapture(state, clusterId));
  const trafficError = useSelector(state => selectTrafficError(state, clusterId));
  const serviceMapError = useSelector(state => selectServiceMapError(state, clusterId));

  const selectFiltered = useMemo(() => makeSelectFilteredTrafficEvents(), []);
  const filteredByMethodStatus = useSelector(state => selectFiltered(state, clusterId, methodFilter, statusFilter));

  const filteredEvents = useMemo(() => {
    if (!searchQuery) return filteredByMethodStatus;
    const q = searchQuery.toLowerCase();
    return filteredByMethodStatus.filter(e =>
      (e.http?.path || '').toLowerCase().includes(q) ||
      (e.src?.pod || '').toLowerCase().includes(q) ||
      (e.dst?.pod || '').toLowerCase().includes(q) ||
      (e.src?.svc || '').toLowerCase().includes(q) ||
      (e.dst?.svc || '').toLowerCase().includes(q) ||
      (e.src?.ns || '').toLowerCase().includes(q) ||
      (e.dst?.ns || '').toLowerCase().includes(q)
    );
  }, [filteredByMethodStatus, searchQuery]);

  // Fetch clusters on mount
  useEffect(() => {
    const fetchClustersData = async () => {
      try {
        const data = await getClusters();
        const clusterList = data.clusters || data.data || [];
        clusterList.sort((a, b) => {
          if (a.status === 'connected' && b.status !== 'connected') return -1;
          if (b.status === 'connected' && a.status !== 'connected') return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
        setClusters(clusterList);
        if (clusterList.length > 0) setSelectedCluster(clusterList[0]);
      } catch (err) {
        console.error('Failed to fetch clusters:', err);
      }
    };
    fetchClustersData();
  }, []);

  useEffect(() => {
    if (!clusterId) return;
    dispatch(fetchNetworkTraffic({ clusterId, options: { limit: 200 } }));
    dispatch(fetchServiceMap({ clusterId }));
  }, [clusterId, dispatch]);

  // Auto-scroll & "go to new items" detection
  const prevEventCountRef = useRef(0);
  useEffect(() => {
    if (captureEnabled && activeTab === 'traffic') {
      const currentCount = trafficEvents.length;
      if (currentCount > prevEventCountRef.current) {
        if (listRef.current && listRef.current.scrollTop > 100) {
          setGoToNew(true);
        } else if (listRef.current) {
          listRef.current.scrollTop = 0;
        }
      }
      prevEventCountRef.current = currentCount;
    }
  }, [trafficEvents.length, captureEnabled, activeTab]);

  const handleToggleCapture = useCallback(() => {
    if (!clusterId) return;
    dispatch(toggleCapture({ clusterId, enabled: !captureEnabled }));
  }, [clusterId, captureEnabled, dispatch]);

  const handleEventClick = useCallback((event) => {
    setSelectedEvent(event);
    setDetailTab('request');
  }, []);

  const scrollToTop = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
      setGoToNew(false);
    }
  }, []);

  const hasError = trafficError || serviceMapError;

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isDark ? 'bg-[#0d1117]' : 'bg-white'}`}>
      {/* ====== Kubeshark-style Top Bar ====== */}
      <div className={`flex-shrink-0 ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-gray-200'} border-b`}>
        <div className="px-4 py-2 flex items-center justify-between">
          {/* Left: Streaming status */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleToggleCapture}
              disabled={!clusterId || togglingCapture}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors ${
                captureEnabled
                  ? isDark ? 'bg-green-900/30 hover:bg-green-900/50' : 'bg-green-50 hover:bg-green-100'
                  : isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'
              } ${(!clusterId || togglingCapture) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {captureEnabled ? (
                <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              ) : (
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
              <span className={`text-xs font-medium ${isDark ? 'text-[#c9d1d9]' : 'text-gray-700'}`}>
                {captureEnabled ? 'streaming live traffic' : 'paused'}
              </span>
              <div className={`w-2 h-2 rounded-full ${captureEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            </button>
          </div>

          {/* Center: Tab Navigation (Kubeshark style) */}
          <div className="flex items-center space-x-1">
            {[
              { id: 'traffic', label: 'API STREAM' },
              { id: 'service-map', label: 'WORKLOAD MAP' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 text-xs font-semibold tracking-wider transition-colors rounded ${
                  activeTab === tab.id
                    ? isDark ? 'bg-[#1f6feb] text-white' : 'bg-blue-600 text-white'
                    : isDark ? 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right: Cluster selector */}
          <div className="flex items-center space-x-2">
            <select
              value={clusterId || ''}
              onChange={(e) => {
                const c = clusters.find(cl => cl._id === e.target.value);
                setSelectedCluster(c || null);
                setSelectedEvent(null);
              }}
              className={`px-2.5 py-1.5 rounded text-xs font-medium border ${
                isDark ? 'bg-[#21262d] border-[#30363d] text-[#c9d1d9]' : 'bg-white border-gray-300 text-gray-900'
              }`}
            >
              {clusters.length === 0 && <option value="">No clusters</option>}
              {clusters.map(c => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter bar (Kubeshark-style) */}
        {activeTab === 'traffic' && (
          <div className={`px-4 pb-2 flex items-center space-x-2`}>
            <div className={`flex-1 flex items-center rounded-lg border ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-gray-50 border-gray-300'}`}>
              <svg className={`w-4 h-4 ml-3 flex-shrink-0 ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <input
                type="text"
                placeholder="Filter by path, pod, service, or namespace..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`flex-1 px-3 py-2 text-sm bg-transparent outline-none ${isDark ? 'text-[#c9d1d9] placeholder-[#484f58]' : 'text-gray-900 placeholder-gray-400'}`}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className={`mr-2 p-1 rounded ${isDark ? 'hover:bg-[#30363d] text-[#8b949e]' : 'hover:bg-gray-200 text-gray-500'}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              )}
            </div>
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}
              className={`px-2.5 py-2 rounded-lg text-xs font-medium border ${isDark ? 'bg-[#21262d] border-[#30363d] text-[#c9d1d9]' : 'bg-white border-gray-300 text-gray-900'}`}>
              <option value="">All Methods</option>
              {['GET','POST','PUT','DELETE','PATCH'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-2.5 py-2 rounded-lg text-xs font-medium border ${isDark ? 'bg-[#21262d] border-[#30363d] text-[#c9d1d9]' : 'bg-white border-gray-300 text-gray-900'}`}>
              <option value="">All Status</option>
              <option value="2xx">2xx Success</option>
              <option value="4xx">4xx Client Error</option>
              <option value="5xx">5xx Server Error</option>
            </select>
          </div>
        )}

        {hasError && (
          <div className={`mx-4 mb-2 px-3 py-2 rounded text-xs flex items-center space-x-2 ${isDark ? 'bg-red-900/20 text-red-400 border border-red-900/40' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            <span>{trafficError?.message || serviceMapError?.message}</span>
          </div>
        )}
      </div>

      {/* ====== Main Content ====== */}
      {activeTab === 'traffic' ? (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left: Traffic List */}
          <div className={`flex flex-col ${selectedEvent ? 'w-[55%]' : 'w-full'} transition-all duration-200`}>
            <div ref={listRef} className="flex-1 overflow-y-auto" onScroll={() => {
              if (listRef.current && listRef.current.scrollTop < 50) setGoToNew(false);
            }}>
              {loadingTraffic ? (
                <div className={`flex items-center justify-center h-64 ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`}>
                  <div className="flex items-center space-x-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                    <span className="text-xs">Loading traffic data...</span>
                  </div>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className={`flex flex-col items-center justify-center h-64 ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`}>
                  <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                  </svg>
                  <p className="text-sm font-medium mb-1">No traffic captured yet</p>
                  <p className="text-xs">Deploy the network-monitor agent to start capturing.</p>
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <KubesharkRow
                    key={event.id}
                    event={event}
                    isSelected={selectedEvent?.id === event.id}
                    isDark={isDark}
                    onClick={() => handleEventClick(event)}
                  />
                ))
              )}
            </div>

            {/* "Go to new items" floating button (like Kubeshark) */}
            {goToNew && (
              <div className="absolute bottom-12 left-1/4 transform -translate-x-1/2 z-10">
                <button onClick={scrollToTop}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-full shadow-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>
                  <span>Go to new items</span>
                </button>
              </div>
            )}

            {/* Footer bar (Kubeshark-style) */}
            <div className={`flex-shrink-0 flex items-center justify-between px-4 py-1.5 text-[11px] ${isDark ? 'bg-[#161b22] text-[#8b949e] border-[#30363d]' : 'bg-gray-50 text-gray-500 border-gray-200'} border-t`}>
              <span>
                Displayed items: <strong className={isDark ? 'text-[#c9d1d9]' : 'text-gray-800'}>{filteredEvents.length}</strong>
                {' \u00B7 '}
                {formatFullTimestamp(new Date().toISOString())}
              </span>
              <span>
                Total: <strong className={isDark ? 'text-[#c9d1d9]' : 'text-gray-800'}>{trafficEvents.length}</strong> TCP streams
              </span>
            </div>
          </div>

          {/* Right: Detail Panel */}
          {selectedEvent && (
            <KubesharkDetailPanel
              event={selectedEvent}
              isDark={isDark}
              detailTab={detailTab}
              setDetailTab={setDetailTab}
              onClose={() => setSelectedEvent(null)}
            />
          )}
        </div>
      ) : (
        <WorkloadTrafficMap theme={theme} serviceMap={serviceMap} loading={loadingServiceMap} />
      )}
    </div>
  );
};

// ========================================
// Kubeshark-style Traffic Row
// ========================================

const KubesharkRow = React.memo(({ event, isSelected, isDark, onClick }) => {
  const method = event.http?.method;
  const status = event.http?.status;
  const path = event.http?.path || '/';
  const protocol = event.protocol || 'HTTP';
  const bytes = event.bytes || 0;
  const latency = event.http?.latency_ms;

  const src = getEndpointDisplay(event.src);
  const dst = getEndpointDisplay(event.dst);
  const srcNs = event.src?.ns || '';
  const dstNs = event.dst?.ns || '';
  const nsColor = getNsColor(dstNs || srcNs);

  const srcAddr = event.src ? `${event.src.ip || ''}:${event.src.port || ''}` : '';
  const dstAddr = event.dst ? `${event.dst.ip || ''}:${event.dst.port || ''}` : '';

  // Determine protocol display
  const protoLabel = method ? 'HTTP' : protocol.toUpperCase();
  const protoColor = PROTOCOL_COLORS[protoLabel] || PROTOCOL_COLORS.TCP;

  const mc = METHOD_COLORS[method] || METHOD_COLORS.HEAD;

  return (
    <div
      onClick={onClick}
      className={`flex items-start px-3 py-2 cursor-pointer border-l-4 transition-colors ${
        isSelected
          ? isDark ? 'bg-[#1f6feb]/10 border-l-blue-500' : 'bg-blue-50 border-l-blue-500'
          : isDark ? 'border-l-transparent hover:bg-[#161b22] border-b border-b-[#21262d]' : 'border-l-transparent hover:bg-gray-50 border-b border-b-gray-100'
      }`}
    >
      {/* Left section: Protocol + Status + Namespace + Method + Path */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Protocol badge */}
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide"
            style={{
              backgroundColor: isDark ? protoColor.darkBg : protoColor.bg,
              color: isDark ? protoColor.darkText : protoColor.text,
            }}>
            {protoLabel}
          </span>

          {/* Status code pill */}
          {status && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: getStatusColor(status) }}>
              {status}
            </span>
          )}
          {!status && method && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
              ---
            </span>
          )}

          {/* Namespace badge */}
          {(dstNs || srcNs) && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: isDark ? nsColor.darkBg : nsColor.bg,
                color: isDark ? nsColor.darkText : nsColor.text,
              }}>
              {dstNs || srcNs}
            </span>
          )}

          {/* eBPF indicator */}
          <span className={`inline-flex items-center text-[9px] font-medium ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`}>
            <svg className="w-3 h-3 mr-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11zM7 4h2v4H7V4zm0 5h2v2H7V9z"/></svg>
            eBPF
          </span>

          {/* Method badge + Path */}
          {method && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{
                backgroundColor: isDark ? mc.darkBg : mc.bg,
                color: isDark ? mc.darkText : mc.text,
              }}>
              {method}
            </span>
          )}

          <span className={`text-xs font-semibold truncate ${isDark ? 'text-[#e6edf3]' : 'text-gray-900'}`}>
            {path}
          </span>
        </div>

        {/* Second line: Pod → Pod with P/S badges, sizes */}
        <div className="flex items-center mt-1 gap-1">
          {/* Source endpoint */}
          <span className={`inline-flex items-center text-[10px] font-medium px-1 py-0.5 rounded ${
            src.type === 'P' ? (isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-100 text-blue-700')
            : src.type === 'S' ? (isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700')
            : (isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600')
          }`}>
            {src.type}
          </span>
          <span className={`text-[10px] truncate max-w-[180px] ${isDark ? 'text-[#8b949e]' : 'text-gray-600'}`} title={src.name}>
            {src.name}
          </span>

          {/* Bytes sent */}
          {bytes > 0 && (
            <span className={`text-[10px] font-mono ${isDark ? 'text-[#7ee787]' : 'text-green-600'}`}>
              {formatBytes(bytes)}
            </span>
          )}

          {/* Arrow */}
          <span className={`text-[10px] font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
            <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
          </span>

          {/* Destination endpoint */}
          <span className={`inline-flex items-center text-[10px] font-medium px-1 py-0.5 rounded ${
            dst.type === 'P' ? (isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-100 text-blue-700')
            : dst.type === 'S' ? (isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700')
            : (isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600')
          }`}>
            {dst.type}
          </span>
          <span className={`text-[10px] truncate max-w-[180px] ${isDark ? 'text-[#8b949e]' : 'text-gray-600'}`} title={dst.name}>
            {dst.name}
          </span>

          {/* Latency */}
          {latency != null && (
            <span className={`text-[10px] font-mono ml-auto ${
              latency > 1000 ? 'text-red-400' : latency > 200 ? 'text-yellow-400' : isDark ? 'text-[#484f58]' : 'text-gray-400'
            }`}>
              ET: {formatLatency(latency)}
            </span>
          )}
        </div>
      </div>

      {/* Right: IP addresses */}
      <div className="flex-shrink-0 ml-3 text-right">
        <div className={`text-[10px] font-mono ${isDark ? 'text-[#8b949e]' : 'text-gray-500'}`}>
          {srcAddr}
        </div>
        <div className={`text-[10px] font-mono ${isDark ? 'text-[#8b949e]' : 'text-gray-500'}`}>
          {dstAddr}
        </div>
      </div>
    </div>
  );
});

// ========================================
// Kubeshark-style Detail Panel
// ========================================

const KubesharkDetailPanel = ({ event, isDark, detailTab, setDetailTab, onClose }) => {
  const method = event.http?.method;
  const status = event.http?.status;
  const path = event.http?.path || '/';
  const latency = event.http?.latency_ms;
  const bytes = event.bytes || 0;
  const protocol = event.protocol || 'HTTP';

  const protoLabel = method ? 'HTTP' : protocol.toUpperCase();

  const tabs = [
    { id: 'request', label: 'REQUEST' },
    { id: 'response', label: 'RESPONSE' },
    { id: 'k8s', label: 'K8S' },
    { id: 'metadata', label: 'METADATA' },
  ];

  return (
    <div className={`w-[45%] flex flex-col border-l overflow-hidden ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-white border-gray-200'}`}>
      {/* Header: Protocol summary bar */}
      <div className={`flex-shrink-0 px-4 py-3 ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-gray-50 border-gray-200'} border-b`}>
        {/* Protocol info line */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-1 rounded text-[11px] font-bold text-white bg-[#1565c0]">
              {protoLabel === 'HTTP' ? `Hypertext Transfer Protocol -- HTTP/1.1` : protoLabel}
            </span>
            {bytes > 0 && (
              <span className={`text-xs ${isDark ? 'text-[#8b949e]' : 'text-gray-500'}`}>
                Req: {formatBytes(bytes)}{latency != null ? ` \u00B7 ET: ${formatLatency(latency)}` : ''}
              </span>
            )}
          </div>
          <button onClick={onClose} className={`p-1 rounded ${isDark ? 'hover:bg-[#30363d] text-[#8b949e]' : 'hover:bg-gray-200 text-gray-500'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Method + status + path + endpoint summary */}
        <div className="flex items-center flex-wrap gap-1.5 mb-2">
          {method && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{
                backgroundColor: isDark ? (METHOD_COLORS[method]?.darkBg || '#37474f') : (METHOD_COLORS[method]?.bg || '#eceff1'),
                color: isDark ? (METHOD_COLORS[method]?.darkText || '#b0bec5') : (METHOD_COLORS[method]?.text || '#546e7a'),
              }}>
              {method}
            </span>
          )}
          {status && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: getStatusColor(status) }}>
              {status}
            </span>
          )}
          {(event.dst?.ns || event.src?.ns) && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: isDark ? getNsColor(event.dst?.ns || event.src?.ns).darkBg : getNsColor(event.dst?.ns || event.src?.ns).bg,
                color: isDark ? getNsColor(event.dst?.ns || event.src?.ns).darkText : getNsColor(event.dst?.ns || event.src?.ns).text,
              }}>
              {event.dst?.ns || event.src?.ns}
            </span>
          )}
          <span className={`text-[9px] ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`}>eBPF</span>
          <span className={`text-xs font-semibold ${isDark ? 'text-[#e6edf3]' : 'text-gray-900'}`}>{path}</span>
        </div>

        {/* Pod flow line */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <PodBadge type={getEndpointDisplay(event.src).type} name={getEndpointDisplay(event.src).name} isDark={isDark} />
          <span className={`font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
            <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
          </span>
          <PodBadge type={getEndpointDisplay(event.dst).type} name={getEndpointDisplay(event.dst).name} isDark={isDark} />
        </div>

        {/* Stream info */}
        <div className={`mt-2 text-[10px] flex items-center space-x-4 ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`}>
          <span>Stream: {event.src?.ip}:{event.src?.port} {'\u2192'} {event.dst?.ip}:{event.dst?.port}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex-shrink-0 flex px-4 pt-1 space-x-0 ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-gray-50 border-gray-200'} border-b`}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setDetailTab(tab.id)}
            className={`px-4 py-2 text-[11px] font-semibold tracking-wider border-b-2 transition-colors ${
              detailTab === tab.id
                ? isDark ? 'border-[#1f6feb] text-[#c9d1d9]' : 'border-blue-600 text-gray-900'
                : isDark ? 'border-transparent text-[#484f58] hover:text-[#8b949e]' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {detailTab === 'request' && <RequestTab event={event} isDark={isDark} />}
        {detailTab === 'response' && <ResponseTab event={event} isDark={isDark} />}
        {detailTab === 'k8s' && <K8sTab event={event} isDark={isDark} />}
        {detailTab === 'metadata' && <MetadataTab event={event} isDark={isDark} />}
      </div>
    </div>
  );
};

// Pod/Service badge (Kubeshark-style P/S)
const PodBadge = ({ type, name, isDark }) => (
  <span className="inline-flex items-center gap-1">
    <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold ${
      type === 'P' ? (isDark ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-700')
      : type === 'S' ? (isDark ? 'bg-green-900/50 text-green-400' : 'bg-green-100 text-green-700')
      : (isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600')
    }`}>
      {type}
    </span>
    <span className={`text-[10px] truncate max-w-[200px] ${isDark ? 'text-[#c9d1d9]' : 'text-gray-700'}`}>{name}</span>
  </span>
);

// ========================================
// REQUEST Tab
// ========================================

const RequestTab = ({ event, isDark }) => {
  const headers = event.http?.headers || {};
  const query = event.http?.query || {};
  const body = event.http?.body;
  const hasHeaders = Object.keys(headers).length > 0;
  const hasQuery = Object.keys(query).length > 0;

  return (
    <div className="p-4 space-y-4">
      {/* Details section (collapsed style like Kubeshark) */}
      <CollapsibleSection title="Details" isDark={isDark} defaultOpen>
        <KVRow label="Body Size (bytes)" value={body ? new Blob([body]).size : 0} isDark={isDark} />
        <KVRow label="Method" value={event.http?.method || '?'} isDark={isDark} />
        <KVRow label="Path" value={event.http?.path || '/'} isDark={isDark} mono />
        <KVRow label="URL" value={event.http?.path || '/'} isDark={isDark} mono />
      </CollapsibleSection>

      {/* Headers table (Kubeshark-style) */}
      {hasHeaders && (
        <CollapsibleSection title="Headers" isDark={isDark} defaultOpen>
          {Object.entries(headers).map(([key, value]) => (
            <KVRow key={key} label={key} value={String(value)} isDark={isDark} labelGreen />
          ))}
        </CollapsibleSection>
      )}

      {/* Query Parameters */}
      {hasQuery && (
        <CollapsibleSection title="Query Parameters" isDark={isDark} defaultOpen>
          {Object.entries(query).map(([key, value]) => (
            <KVRow key={key} label={key} value={String(value)} isDark={isDark} labelGreen />
          ))}
        </CollapsibleSection>
      )}

      {/* Body */}
      {body && (
        <CollapsibleSection title="Body" isDark={isDark} defaultOpen>
          <CodeBlock content={body} isDark={isDark} truncated={event.http?.bodyTruncated} bodySize={event.http?.bodySize} />
        </CollapsibleSection>
      )}

      {!hasHeaders && !hasQuery && !body && (
        <EmptyState isDark={isDark} message="No request payload captured" />
      )}
    </div>
  );
};

// ========================================
// RESPONSE Tab
// ========================================

const ResponseTab = ({ event, isDark }) => {
  const status = event.http?.status;
  const latency = event.http?.latency_ms;

  return (
    <div className="p-4 space-y-4">
      <CollapsibleSection title="Details" isDark={isDark} defaultOpen>
        <KVRow label="Status Code" value={status || '---'} isDark={isDark}
          valueStyle={{ color: getStatusColor(status), fontWeight: 700 }} />
        <KVRow label="Status Text" value={
          status >= 200 && status < 300 ? 'OK' :
          status >= 300 && status < 400 ? 'Redirect' :
          status >= 400 && status < 500 ? 'Client Error' :
          status >= 500 ? 'Server Error' : 'Unknown'
        } isDark={isDark} />
        {latency != null && <KVRow label="Elapsed Time" value={formatLatency(latency)} isDark={isDark} />}
      </CollapsibleSection>

      <EmptyState isDark={isDark} message="Response headers and body not captured by eBPF probe" />
    </div>
  );
};

// ========================================
// K8S Tab (Kubernetes metadata)
// ========================================

const K8sTab = ({ event, isDark }) => {
  return (
    <div className="p-4 space-y-4">
      <CollapsibleSection title="Source" isDark={isDark} defaultOpen>
        <KVRow label="IP" value={event.src?.ip || 'N/A'} isDark={isDark} mono />
        <KVRow label="Port" value={event.src?.port || 'N/A'} isDark={isDark} mono />
        <KVRow label="Pod" value={event.src?.pod || 'N/A'} isDark={isDark} mono />
        <KVRow label="Namespace" value={event.src?.ns || 'N/A'} isDark={isDark} />
        <KVRow label="Service" value={event.src?.svc || 'N/A'} isDark={isDark} />
      </CollapsibleSection>

      <CollapsibleSection title="Destination" isDark={isDark} defaultOpen>
        <KVRow label="IP" value={event.dst?.ip || 'N/A'} isDark={isDark} mono />
        <KVRow label="Port" value={event.dst?.port || 'N/A'} isDark={isDark} mono />
        <KVRow label="Pod" value={event.dst?.pod || 'N/A'} isDark={isDark} mono />
        <KVRow label="Namespace" value={event.dst?.ns || 'N/A'} isDark={isDark} />
        <KVRow label="Service" value={event.dst?.svc || 'N/A'} isDark={isDark} />
      </CollapsibleSection>
    </div>
  );
};

// ========================================
// METADATA Tab
// ========================================

const MetadataTab = ({ event, isDark }) => {
  const host = event.http?.headers?.Host || event.http?.headers?.host || event.dst?.svc || event.dst?.ip || '';

  return (
    <div className="p-4 space-y-4">
      <CollapsibleSection title="General" isDark={isDark} defaultOpen>
        <KVRow label="Event ID" value={event.id || 'N/A'} isDark={isDark} mono />
        <KVRow label="Protocol" value={event.protocol || 'TCP'} isDark={isDark} />
        <KVRow label="Timestamp" value={formatFullTimestamp(event.timestamp)} isDark={isDark} />
        {host && <KVRow label="Host" value={host} isDark={isDark} mono />}
        {event.http?.path && <KVRow label="Target URI" value={`http://${host}${event.http.path}`} isDark={isDark} mono />}
      </CollapsibleSection>

      <CollapsibleSection title="TCP Stream" isDark={isDark} defaultOpen>
        <KVRow label="Source" value={`${event.src?.ip || '?'}:${event.src?.port || '?'}`} isDark={isDark} mono />
        <KVRow label="Destination" value={`${event.dst?.ip || '?'}:${event.dst?.port || '?'}`} isDark={isDark} mono />
        <KVRow label="Bytes" value={formatBytes(event.bytes || 0)} isDark={isDark} />
        {event.http?.latency_ms != null && <KVRow label="Latency" value={`${event.http.latency_ms} ms`} isDark={isDark} />}
      </CollapsibleSection>

      {/* Path segments */}
      {event.http?.path && event.http.path !== '/' && (
        <CollapsibleSection title="Path Segments" isDark={isDark}>
          {event.http.path.split('/').filter(Boolean).map((seg, i) => (
            <KVRow key={i} label={`[${i}]`} value={seg} isDark={isDark} mono />
          ))}
        </CollapsibleSection>
      )}
    </div>
  );
};

// ========================================
// Reusable Sub-Components
// ========================================

const CollapsibleSection = ({ title, isDark, defaultOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-lg border ${isDark ? 'border-[#30363d]' : 'border-gray-200'} overflow-hidden`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 text-left ${isDark ? 'bg-[#161b22] hover:bg-[#1c2129]' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
      >
        <span className={`text-[11px] font-semibold ${isDark ? 'text-[#c9d1d9]' : 'text-gray-700'}`}>
          {isOpen ? '\u25BC' : '\u25B6'} {title}
        </span>
      </button>
      {isOpen && (
        <div className={`${isDark ? 'bg-[#0d1117]' : 'bg-white'}`}>
          {children}
        </div>
      )}
    </div>
  );
};

const KVRow = ({ label, value, isDark, mono, labelGreen, valueStyle }) => (
  <div className={`flex items-start px-3 py-1.5 text-xs border-b last:border-b-0 ${isDark ? 'border-[#21262d]' : 'border-gray-100'}`}>
    <span className={`w-36 flex-shrink-0 font-medium ${
      labelGreen ? (isDark ? 'text-[#7ee787]' : 'text-green-700') : (isDark ? 'text-[#8b949e]' : 'text-gray-500')
    }`}>{label}</span>
    <span
      className={`flex-1 break-all ${mono ? 'font-mono' : ''} ${isDark ? 'text-[#c9d1d9]' : 'text-gray-800'}`}
      style={valueStyle}
    >
      {String(value)}
    </span>
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(value)); }}
      className={`ml-1 p-0.5 rounded opacity-0 hover:opacity-100 group-hover:opacity-50 ${isDark ? 'hover:bg-[#30363d] text-[#484f58]' : 'hover:bg-gray-200 text-gray-400'}`}
      title="Copy"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth={2}/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeWidth={2}/></svg>
    </button>
  </div>
);

const CodeBlock = ({ content, isDark, truncated, bodySize }) => {
  let formatted = content;
  let isJSON = false;
  try {
    const parsed = JSON.parse(content);
    formatted = JSON.stringify(parsed, null, 2);
    isJSON = true;
  } catch { /* keep as-is */ }

  return (
    <div>
      {truncated && (
        <div className={`px-3 py-2 text-xs ${isDark ? 'bg-yellow-900/20 text-yellow-400' : 'bg-yellow-50 text-yellow-700'}`}>
          Body truncated at 100KB. Original size: {formatBytes(bodySize || 0)}
        </div>
      )}
      <div className="relative">
        <button
          onClick={() => navigator.clipboard.writeText(formatted)}
          className={`absolute top-2 right-2 px-2 py-0.5 text-[10px] rounded ${isDark ? 'bg-[#21262d] hover:bg-[#30363d] text-[#8b949e]' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}
        >
          Copy
        </button>
        <pre className={`p-3 text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto ${isDark ? 'text-[#c9d1d9]' : 'text-gray-800'}`}>
          {formatted}
        </pre>
      </div>
    </div>
  );
};

const EmptyState = ({ isDark, message }) => (
  <div className={`text-center py-8 text-xs ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`}>
    {message}
  </div>
);

// ========================================
// Service Map Component
// ========================================

const NODE_BASE_RADIUS = 18;
const NODE_MAX_RADIUS = 50;
const LINK_COLOR = '#7eb8da';
const LINK_ARROW_COLOR = '#5a9bbf';
const NODE_FILL = '#d4ecfa';
const NODE_STROKE = '#7eb8da';
const NODE_FILL_DARK = '#1e3a5f';
const NODE_STROKE_DARK = '#5a9bbf';

const ServiceMapView = ({ theme, serviceMap, loading }) => {
  const isDark = theme === 'dark';
  const graphRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });
  const [hoveredNode, setHoveredNode] = useState(null);

  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('graph-container');
      if (container) {
        setDimensions({ width: container.offsetWidth, height: container.offsetHeight });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const maxLinkValue = useMemo(() => {
    if (!serviceMap.links?.length) return 1;
    return Math.max(1, ...serviceMap.links.map(l => l.requestCount || l.value || 0));
  }, [serviceMap.links]);

  const nodeTrafficMap = useMemo(() => {
    const map = {};
    (serviceMap.links || []).forEach(l => {
      const count = l.requestCount || l.value || 0;
      map[l.source] = (map[l.source] || 0) + count;
      map[l.target] = (map[l.target] || 0) + count;
    });
    return map;
  }, [serviceMap.links]);

  const maxNodeTraffic = useMemo(() => Math.max(1, ...Object.values(nodeTrafficMap).concat([1])), [nodeTrafficMap]);
  const nodeCount = (serviceMap.nodes || []).length;

  const radiusScale = useMemo(() => {
    if (nodeCount <= 10) return 1;
    if (nodeCount <= 25) return 0.8;
    if (nodeCount <= 50) return 0.6;
    return 0.5;
  }, [nodeCount]);

  const getNodeRadius = useCallback((nodeId) => {
    const traffic = nodeTrafficMap[nodeId] || 0;
    const ratio = traffic / maxNodeTraffic;
    return (NODE_BASE_RADIUS + ratio * (NODE_MAX_RADIUS - NODE_BASE_RADIUS)) * radiusScale;
  }, [nodeTrafficMap, maxNodeTraffic, radiusScale]);

  const graphData = useMemo(() => ({
    nodes: (serviceMap.nodes || []).map(n => ({
      ...n,
      _radius: getNodeRadius(n.id),
      _label: `${n.name}.${n.namespace || 'unknown'}`,
      _sublabel: n.ip || ''
    })),
    links: (serviceMap.links || []).map(l => ({
      ...l,
      _count: l.requestCount || l.value || 0
    }))
  }), [serviceMap, getNodeRadius]);

  const hasData = graphData.nodes.length > 0;

  useEffect(() => {
    if (!graphRef.current || !hasData) return;
    const fg = graphRef.current;
    const chargeStrength = nodeCount > 30 ? -800 : nodeCount > 15 ? -600 : -400;
    fg.d3Force('charge')?.strength(chargeStrength);
    const linkDist = nodeCount > 30 ? 200 : nodeCount > 15 ? 160 : 120;
    fg.d3Force('link')?.distance(linkDist);
    fg.d3Force('center')?.strength(0.05);
    try {
      const { forceCollide } = require('d3-force-3d');
      fg.d3Force('collision', forceCollide().radius(node => (node._radius || NODE_BASE_RADIUS) + 35).strength(1).iterations(3));
    } catch { /* fallback */ }
    fg.d3ReheatSimulation();
  }, [hasData, nodeCount]);

  return (
    <div id="graph-container" className="flex-1 p-4 relative">
      <div className={`h-full rounded border overflow-hidden relative ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-[#f8fbff] border-gray-200'}`}>
        {loading ? (
          <div className={`flex items-center justify-center h-full ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`}>
            <div className="flex items-center space-x-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
              <span className="text-xs">Loading service map...</span>
            </div>
          </div>
        ) : !hasData ? (
          <div className={`flex flex-col items-center justify-center h-full ${isDark ? 'text-[#484f58]' : 'text-gray-400'}`}>
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
            <p className="text-sm font-medium mb-1">No service map data</p>
            <p className="text-xs">Service dependencies appear once traffic is captured between pods.</p>
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor={isDark ? '#0d1117' : '#f8fbff'}
            nodeRelSize={1}
            nodeVal={node => node._radius * node._radius}
            nodeLabel=""
            nodeCanvasObject={(node, ctx, globalScale) => {
              const r = node._radius;
              const isHovered = hoveredNode === node.id;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
              ctx.fillStyle = isDark ? NODE_FILL_DARK : NODE_FILL;
              ctx.fill();
              ctx.strokeStyle = isHovered ? '#3b82f6' : (isDark ? NODE_STROKE_DARK : NODE_STROKE);
              ctx.lineWidth = isHovered ? 3 / globalScale : 2 / globalScale;
              ctx.stroke();
              const mainFontSize = Math.max(9, 11 / globalScale);
              ctx.font = `bold ${mainFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = isDark ? '#c9d1d9' : '#1e3a5f';
              ctx.fillText(node.name || '', node.x, node.y + r + 4);
              const subFontSize = Math.max(7, 9 / globalScale);
              ctx.font = `${subFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
              ctx.fillStyle = isDark ? '#8b949e' : '#5a7ea0';
              const subText = node._sublabel ? `${node.namespace || ''} (${node._sublabel})` : (node.namespace || '');
              ctx.fillText(subText, node.x, node.y + r + 4 + mainFontSize + 2);
            }}
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.beginPath();
              ctx.arc(node.x, node.y, node._radius + 5, 0, 2 * Math.PI, false);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            onNodeHover={node => setHoveredNode(node?.id || null)}
            linkDirectionalArrowLength={link => {
              const ratio = link._count / maxLinkValue;
              return Math.max(6, 6 + ratio * 10);
            }}
            linkDirectionalArrowRelPos={0.85}
            linkDirectionalArrowColor={() => isDark ? LINK_ARROW_COLOR : '#4a90b8'}
            linkColor={() => isDark ? LINK_COLOR : '#a8d0e8'}
            linkWidth={link => {
              const ratio = link._count / maxLinkValue;
              return Math.max(1, Math.min(12, 1 + ratio * 11));
            }}
            linkCurvature={0.15}
            linkLabel={link => {
              const parts = [`${link._count} requests`];
              if (link.totalBytes) parts.push(`${formatBytes(link.totalBytes)}`);
              if (link.avgLatency) parts.push(`avg: ${link.avgLatency}ms`);
              if (link.errorRate > 0) parts.push(`err: ${(link.errorRate * 100).toFixed(1)}%`);
              return parts.join(' | ');
            }}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link, ctx, globalScale) => {
              const count = link._count;
              if (count <= 0) return;
              const fontSize = Math.max(9, 11 / globalScale);
              ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
              const midX = (link.source.x + link.target.x) / 2;
              const midY = (link.source.y + link.target.y) / 2;
              const dx = link.target.x - link.source.x;
              const dy = link.target.y - link.source.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const offsetX = -(dy / len) * 10 / globalScale;
              const offsetY = (dx / len) * 10 / globalScale;
              const labelText = String(count);
              const tw = ctx.measureText(labelText).width;
              const px = 4 / globalScale;
              const py = 2 / globalScale;
              ctx.fillStyle = isDark ? 'rgba(13,17,23,0.85)' : 'rgba(248,251,255,0.9)';
              ctx.beginPath();
              const rx = midX + offsetX - tw / 2 - px;
              const ry = midY + offsetY - fontSize / 2 - py;
              const rw = tw + px * 2;
              const rh = fontSize + py * 2;
              const cornerR = 3 / globalScale;
              ctx.moveTo(rx + cornerR, ry);
              ctx.lineTo(rx + rw - cornerR, ry);
              ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + cornerR);
              ctx.lineTo(rx + rw, ry + rh - cornerR);
              ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - cornerR, ry + rh);
              ctx.lineTo(rx + cornerR, ry + rh);
              ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - cornerR);
              ctx.lineTo(rx, ry + cornerR);
              ctx.quadraticCurveTo(rx, ry, rx + cornerR, ry);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = isDark ? '#93c5fd' : '#1e5a8a';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(labelText, midX + offsetX, midY + offsetY);
            }}
            d3AlphaDecay={0.015}
            d3VelocityDecay={0.25}
            cooldownTicks={250}
            warmupTicks={50}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 80)}
          />
        )}

        {/* Legend */}
        <div className={`absolute top-3 right-3 rounded-lg px-3 py-2 text-[10px] ${isDark ? 'bg-[#161b22]/95 border border-[#30363d]' : 'bg-white/95 border border-gray-200'} backdrop-blur-sm shadow-sm`}>
          <div className={`font-semibold text-[11px] mb-1.5 ${isDark ? 'text-[#c9d1d9]' : 'text-gray-700'}`}>Service Map</div>
          <div className="flex items-center space-x-2 mb-1">
            <div className={`w-3 h-3 rounded-full border ${isDark ? 'bg-[#1e3a5f] border-[#5a9bbf]' : 'bg-[#d4ecfa] border-[#7eb8da]'}`} />
            <span className={isDark ? 'text-[#8b949e]' : 'text-gray-500'}>Service (size = traffic volume)</span>
          </div>
          <div className="flex items-center space-x-2 mb-1">
            <div className={`w-4 h-0.5 ${isDark ? 'bg-[#7eb8da]' : 'bg-[#a8d0e8]'}`} />
            <span className={isDark ? 'text-[#8b949e]' : 'text-gray-500'}>Connection (number = requests)</span>
          </div>
          <div className={`mt-1 pt-1 border-t ${isDark ? 'border-[#30363d] text-[#484f58]' : 'border-gray-100 text-gray-400'}`}>
            Scroll to zoom / Drag to pan
          </div>
        </div>

        {/* Stats footer */}
        <div className={`absolute bottom-3 left-3 rounded-lg px-3 py-1.5 text-[10px] flex items-center space-x-4 ${isDark ? 'bg-[#161b22]/90 text-[#8b949e] border border-[#30363d]' : 'bg-white/90 text-gray-500 border border-gray-200'} backdrop-blur-sm`}>
          <span>Services: {graphData.nodes.length}</span>
          <span>Connections: {graphData.links.length}</span>
          {graphData.links.length > 0 && (
            <span>Total requests: {graphData.links.reduce((sum, l) => sum + l._count, 0)}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceDependency;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const NodeDetailPage = () => {
  const { clusterId, nodeName } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('overview');
  const [metricsHistory, setMetricsHistory] = useState({
    cpu: [],
    memory: [],
    network: [],
    disk: [],
    loadAvg: [],
    diskUsage: []
  });
  const [currentMetrics, setCurrentMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch 24-hour historical node metrics
  const fetchNodeMetrics = useCallback(async () => {
    try {
      const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${BASE_URL}/api/metrics/node?node=${nodeName}`);
      const data = await response.json();

      console.log('📊 Historical node metrics data received:', {
        cpu: data.cpu_percent?.length || 0,
        memory: data.memory_percent?.length || 0,
        network: data.network_receive_bytes?.length || 0
      });

      const newHistory = { cpu: [], memory: [], network: [], disk: [], loadAvg: [], diskUsage: [] };

      // Helper to format timestamp
      const formatTime = (timestamp) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString();
      };

      // Helper to aggregate metrics by timestamp
      const aggregateByTimestamp = (dataArray) => {
        const timestampMap = new Map();
        dataArray.forEach(item => {
          const existing = timestampMap.get(item.timestamp) || 0;
          timestampMap.set(item.timestamp, existing + parseFloat(item.value));
        });
        return Array.from(timestampMap.entries()).sort((a, b) => a[0] - b[0]);
      };

      // CPU percentage
      if (data.cpu_percent && data.cpu_percent.length > 0) {
        const aggregated = aggregateByTimestamp(data.cpu_percent);
        newHistory.cpu = aggregated.map(([timestamp, value]) => ({
          time: formatTime(timestamp),
          value: value
        }));
      }

      // Memory percentage
      if (data.memory_percent && data.memory_percent.length > 0) {
        const aggregated = aggregateByTimestamp(data.memory_percent);
        newHistory.memory = aggregated.map(([timestamp, value]) => ({
          time: formatTime(timestamp),
          value: value
        }));
      }

      // Network - aggregate by timestamp
      if (data.network_receive_bytes && data.network_receive_bytes.length > 0) {
        const rxMap = new Map();
        const txMap = new Map();

        data.network_receive_bytes.forEach(item => {
          rxMap.set(item.timestamp, (rxMap.get(item.timestamp) || 0) + parseFloat(item.value));
        });

        if (data.network_transmit_bytes) {
          data.network_transmit_bytes.forEach(item => {
            txMap.set(item.timestamp, (txMap.get(item.timestamp) || 0) + parseFloat(item.value));
          });
        }

        const timestamps = Array.from(new Set([...rxMap.keys(), ...txMap.keys()])).sort((a, b) => a - b);
        newHistory.network = timestamps.map(timestamp => ({
          time: formatTime(timestamp),
          receive: (rxMap.get(timestamp) || 0) / (1024 * 1024), // Convert to MB/s
          transmit: (txMap.get(timestamp) || 0) / (1024 * 1024)
        }));
      }

      // Disk I/O
      if (data.disk_io && data.disk_io.length > 0) {
        const aggregated = aggregateByTimestamp(data.disk_io);
        newHistory.disk = aggregated.map(([timestamp, value]) => ({
          time: formatTime(timestamp),
          value: value
        }));
      }

      // Load Average - combine 1m, 5m, 15m
      if (data.load_avg_1m && data.load_avg_1m.length > 0) {
        const timestamps = new Set(data.load_avg_1m.map(d => d.timestamp));

        newHistory.loadAvg = Array.from(timestamps).sort((a, b) => a - b).map(timestamp => {
          const load1 = data.load_avg_1m.find(d => d.timestamp === timestamp);
          const load5 = data.load_avg_5m?.find(d => d.timestamp === timestamp);
          const load15 = data.load_avg_15m?.find(d => d.timestamp === timestamp);

          return {
            time: formatTime(timestamp),
            load1m: load1?.value || 0,
            load5m: load5?.value || 0,
            load15m: load15?.value || 0
          };
        });
      }

      // Disk Usage
      if (data.disk_usage_percent && data.disk_usage_percent.length > 0) {
        const aggregated = aggregateByTimestamp(data.disk_usage_percent);
        newHistory.diskUsage = aggregated.map(([timestamp, value]) => ({
          time: formatTime(timestamp),
          value: value
        }));
      }

      setMetricsHistory(newHistory);

      // Set current metrics to the latest values
      const latestCpu = newHistory.cpu[newHistory.cpu.length - 1]?.value || 0;
      const latestMem = newHistory.memory[newHistory.memory.length - 1]?.value || 0;
      const latestDiskUsage = newHistory.diskUsage[newHistory.diskUsage.length - 1]?.value || 0;
      const latestLoad1m = newHistory.loadAvg[newHistory.loadAvg.length - 1]?.load1m || 0;

      setCurrentMetrics({
        cpu: latestCpu,
        memory: latestMem,
        diskUsage: latestDiskUsage,
        load1m: latestLoad1m
      });

      console.log('✅ 24-hour node metrics loaded:', {
        cpu: newHistory.cpu.length,
        memory: newHistory.memory.length,
        network: newHistory.network.length,
        disk: newHistory.disk.length,
        loadAvg: newHistory.loadAvg.length
      });

    } catch (err) {
      console.error('❌ Failed to fetch node metrics:', err);
      setError(err.message || 'Failed to load node metrics');
    }
  }, [nodeName]);

  // Fetch node metrics on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      await fetchNodeMetrics();
      setLoading(false);
    };

    fetchData();
  }, [fetchNodeMetrics]);

  // Auto-refresh metrics every 5 minutes
  useEffect(() => {
    if (activeTab === 'metrics') {
      console.log('🔄 Starting 24-hour node metrics refresh...');

      const interval = setInterval(() => {
        console.log('♻️ Refreshing 24-hour node metrics...');
        fetchNodeMetrics();
      }, 300000); // Refresh every 5 minutes

      return () => {
        console.log('🛑 Stopping node metrics refresh');
        clearInterval(interval);
      };
    }
  }, [activeTab, fetchNodeMetrics]);

  // Memoize chart data to prevent unnecessary re-renders
  const cpuChartData = useMemo(() => metricsHistory.cpu || [], [metricsHistory.cpu]);
  const memoryChartData = useMemo(() => metricsHistory.memory || [], [metricsHistory.memory]);
  const networkChartData = useMemo(() => metricsHistory.network || [], [metricsHistory.network]);
  const diskChartData = useMemo(() => metricsHistory.disk || [], [metricsHistory.disk]);
  const loadAvgChartData = useMemo(() => metricsHistory.loadAvg || [], [metricsHistory.loadAvg]);
  const diskUsageChartData = useMemo(() => metricsHistory.diskUsage || [], [metricsHistory.diskUsage]);

  if (loading) {
    return (
      <div className={`flex-1 flex items-center justify-center ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4"></div>
          <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Loading node details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-auto ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} border-b`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(`/dashboard/nodes`)}
                className={`p-2 rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} transition-colors`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {nodeName}
                </h1>
                <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                  Node Details
                </p>
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className={`px-4 py-2 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded transition-colors flex items-center space-x-2`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 border-b border-slate-800">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'overview'
                  ? theme === 'dark'
                    ? 'text-violet-400 border-b-2 border-violet-500'
                    : 'text-violet-600 border-b-2 border-violet-600'
                  : theme === 'dark'
                    ? 'text-slate-400 hover:text-white'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'metrics'
                  ? theme === 'dark'
                    ? 'text-violet-400 border-b-2 border-violet-500'
                    : 'text-violet-600 border-b-2 border-violet-600'
                  : theme === 'dark'
                    ? 'text-slate-400 hover:text-white'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Metrics
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className={`mb-6 p-4 rounded-lg ${theme === 'dark' ? 'bg-red-900/20 border border-red-500 text-red-400' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            <p>{error}</p>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards - Larger with more details */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* CPU Usage Card */}
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border p-8`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>CPU Usage</p>
                    <p className={`text-4xl font-bold mt-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {currentMetrics.cpu?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-violet-500/20' : 'bg-violet-100'}`}>
                    <svg className="w-8 h-8 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  </div>
                </div>
                <div className={`pt-4 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
                  <div className="flex justify-between items-center text-sm">
                    <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Cores</span>
                    <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {navigator.hardwareConcurrency || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Memory Usage Card */}
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border p-8`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Memory Usage</p>
                    <p className={`text-4xl font-bold mt-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {currentMetrics.memory?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-green-500/20' : 'bg-green-100'}`}>
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                  </div>
                </div>
                <div className={`pt-4 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
                  <div className="flex justify-between items-center text-sm">
                    <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Status</span>
                    <span className={`font-medium ${currentMetrics.memory > 80 ? 'text-red-500' : currentMetrics.memory > 60 ? 'text-yellow-500' : 'text-green-500'}`}>
                      {currentMetrics.memory > 80 ? 'High' : currentMetrics.memory > 60 ? 'Medium' : 'Normal'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Disk Usage Card */}
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border p-8`}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Disk Usage</p>
                    <p className={`text-4xl font-bold mt-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {currentMetrics.diskUsage?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                    <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                  </div>
                </div>
                <div className={`pt-4 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
                  <div className="flex justify-between items-center text-sm">
                    <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Status</span>
                    <span className={`font-medium ${currentMetrics.diskUsage > 80 ? 'text-red-500' : currentMetrics.diskUsage > 60 ? 'text-yellow-500' : 'text-green-500'}`}>
                      {currentMetrics.diskUsage > 80 ? 'Critical' : currentMetrics.diskUsage > 60 ? 'Warning' : 'Healthy'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Load Average Card */}
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Load Average</p>
                  <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-yellow-500/20' : 'bg-yellow-100'}`}>
                    <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>1 min</span>
                    <span className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {currentMetrics.load1m?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>5 min</span>
                    <span className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {metricsHistory.loadAvg[metricsHistory.loadAvg.length - 1]?.load5m?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>15 min</span>
                    <span className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {metricsHistory.loadAvg[metricsHistory.loadAvg.length - 1]?.load15m?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Network Stats Card */}
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Network Traffic</p>
                  <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-cyan-500/20' : 'bg-cyan-100'}`}>
                    <svg className="w-5 h-5 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>RX</span>
                    <span className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {(metricsHistory.network[metricsHistory.network.length - 1]?.receive || 0).toFixed(2)} MB/s
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>TX</span>
                    <span className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {(metricsHistory.network[metricsHistory.network.length - 1]?.transmit || 0).toFixed(2)} MB/s
                    </span>
                  </div>
                </div>
              </div>

              {/* Node Info Card */}
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border p-6`}>
                <div className="flex items-center justify-between mb-4">
                  <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Node Information</p>
                  <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-indigo-500/20' : 'bg-indigo-100'}`}>
                    <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Name</span>
                    <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} truncate max-w-[150px]`}>
                      {nodeName}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Status</span>
                    <span className="text-sm font-medium text-green-500">Ready</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>OS</span>
                    <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Linux
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="space-y-6">
            {/* CPU Usage */}
            {cpuChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>CPU Usage Over Time</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 24 hours</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={cpuChartData}>
                      <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis
                        dataKey="time"
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                        label={{ value: '%', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorCpu)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Memory Usage */}
            {memoryChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Memory Usage Over Time</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 24 hours</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={memoryChartData}>
                      <defs>
                        <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis
                        dataKey="time"
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                        label={{ value: '%', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#colorMemory)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Network Traffic */}
            {networkChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Network Traffic</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 24 hours</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={networkChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis
                        dataKey="time"
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                        label={{ value: 'MB/s', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="receive" stroke="#3b82f6" name="Receive" strokeWidth={2} isAnimationActive={false} />
                      <Line type="monotone" dataKey="transmit" stroke="#f59e0b" name="Transmit" strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Disk I/O */}
            {diskChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Disk I/O</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 24 hours</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={diskChartData}>
                      <defs>
                        <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis
                        dataKey="time"
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                        label={{ value: '%', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorDisk)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Load Average */}
            {loadAvgChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Load Average</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 24 hours</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={loadAvgChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis
                        dataKey="time"
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="load1m" stroke="#ef4444" name="1 minute" strokeWidth={2} isAnimationActive={false} />
                      <Line type="monotone" dataKey="load5m" stroke="#f59e0b" name="5 minutes" strokeWidth={2} isAnimationActive={false} />
                      <Line type="monotone" dataKey="load15m" stroke="#10b981" name="15 minutes" strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Disk Usage */}
            {diskUsageChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Disk Usage</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 24 hours</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={diskUsageChartData}>
                      <defs>
                        <linearGradient id="colorDiskUsage" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis
                        dataKey="time"
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                        label={{ value: '%', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                        }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#f59e0b" fillOpacity={1} fill="url(#colorDiskUsage)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {cpuChartData.length === 0 && memoryChartData.length === 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border p-12 text-center`}>
                <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-slate-700' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className={`text-lg font-medium ${theme === 'dark' ? 'text-slate-500' : 'text-gray-600'}`}>No metrics available</p>
                <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-500'}`}>Metrics will appear once Prometheus starts collecting data</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeDetailPage;

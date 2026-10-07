import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Editor from '@monaco-editor/react';
import { getResourceDetails, getResourceYAML, getPodLogs } from '../services/api';
import { selectMetricTimeSeries, selectResourceMetrics } from '../redux/slices/metricsSlice';
import { Cpu, MemoryStick, RotateCcw, Box } from 'lucide-react';
import VulnerabilitiesTab from './VulnerabilitiesTab';

// Workload kinds that carry container images (and therefore vulnerability reports)
const SCANNABLE_KINDS = ['pod', 'deployment', 'statefulset', 'daemonset', 'replicaset'];

// ── Modern metric primitives (sparkline stat card + area chart card) ──────────
const MiniSpark = ({ data, color }) => {
  const id = `sp-${color.replace('#', '')}`;
  if (!data || data.length < 2) return <div className="h-[38px]" />;
  return (
    <ResponsiveContainer width="100%" height={38}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

const StatCard = ({ dk, label, value, unit, sub, color, icon, spark }) => (
  <div className={`rounded-2xl border p-5 ${dk ? 'bg-[#161616] border-[#262626]' : 'bg-white border-gray-200'}`}>
    <div className="flex items-center justify-between mb-3">
      <span className={`text-[13px] font-medium ${dk ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
      <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: `${color}1f`, color }}>{icon}</span>
    </div>
    <div className="flex items-end gap-1">
      <span className={`text-[28px] leading-none font-bold tracking-tight ${dk ? 'text-white' : 'text-gray-900'}`}>{value}</span>
      {unit && <span className={`text-sm mb-0.5 ${dk ? 'text-gray-500' : 'text-gray-400'}`}>{unit}</span>}
    </div>
    <div className={`text-[11px] mt-1.5 ${dk ? 'text-gray-600' : 'text-gray-400'}`}>{sub}</div>
    <div className="mt-3 -mx-1"><MiniSpark data={spark} color={color} /></div>
  </div>
);

const ChartCard = ({ dk, title, subtitle, data, color, unit }) => {
  const id = `c-${color.replace('#', '')}`;
  return (
    <div className={`rounded-2xl border ${dk ? 'bg-[#161616] border-[#262626]' : 'bg-white border-gray-200'}`}>
      <div className={`px-5 py-3.5 border-b ${dk ? 'border-[#262626]' : 'border-gray-100'} flex items-center justify-between`}>
        <div>
          <h3 className={`text-[14px] font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
          <p className={`text-[11px] ${dk ? 'text-gray-500' : 'text-gray-400'}`}>{subtitle}</p>
        </div>
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="p-4 pt-4">
        {(!data || data.length < 2) ? (
          <div className={`h-[200px] flex items-center justify-center text-sm ${dk ? 'text-gray-600' : 'text-gray-400'}`}>Waiting for metrics…</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={dk ? '#262626' : '#f1f1f1'} vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 11, fill: dk ? '#666' : '#9ca3af' }} tickLine={false} axisLine={false} minTickGap={44} />
              <YAxis tick={{ fontSize: 11, fill: dk ? '#666' : '#9ca3af' }} tickLine={false} axisLine={false} width={46} />
              <Tooltip contentStyle={{ background: dk ? '#1e1e1e' : '#fff', border: `1px solid ${dk ? '#333' : '#e5e7eb'}`, borderRadius: 10, fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                labelStyle={{ color: dk ? '#9ca3af' : '#6b7280' }} formatter={(v) => [`${v} ${unit}`, title]} />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

const AppResourceDetailPage = () => {
  const { theme } = useTheme();
  const { clusterId, resourceType, namespace, name } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState({ cpu: [], memory: [], network: [], disk: [], restarts: [] });
  const [currentMetrics, setCurrentMetrics] = useState({});
  const [resourceDetails, setResourceDetails] = useState(null);
  const [yamlContent, setYamlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [prefetchStatus, setPrefetchStatus] = useState({ logs: false, metrics: false });
  const logsEndRef = useRef(null);
  const [directMetrics, setDirectMetrics] = useState({ cpu: [], memory: [], network_receive: [], network_transmit: [] });

  // Get metrics from Redux (real-time from Kafka)
  const reduxMetrics = useSelector(state =>
    selectResourceMetrics(state, clusterId, resourceType + 's', namespace, name)
  );

  // Get metrics from Redux - use actual metric names from Prometheus/Kafka
  const cpuTimeSeries = useSelector(state =>
    selectMetricTimeSeries(state, clusterId, resourceType + 's', namespace, name, 'cpu_usage_cores')
  );

  const memoryTimeSeries = useSelector(state =>
    selectMetricTimeSeries(state, clusterId, resourceType + 's', namespace, name, 'memory_usage_bytes')
  );

  const networkReceiveTimeSeries = useSelector(state =>
    selectMetricTimeSeries(state, clusterId, resourceType + 's', namespace, name, 'network_receive_bytes')
  );

  const networkTransmitTimeSeries = useSelector(state =>
    selectMetricTimeSeries(state, clusterId, resourceType + 's', namespace, name, 'network_transmit_bytes')
  );

  // DEBUG: Log Redux key and metrics data
  useEffect(() => {
    const reduxKey = `${clusterId}/${resourceType}s/${namespace}/${name}`;
    console.log('=== METRICS DEBUG ===');
    console.log('Redux Key:', reduxKey);
    console.log('URL Params:', { clusterId, resourceType, namespace, name });
    console.log('CPU Time Series:', cpuTimeSeries);
    console.log('Memory Time Series:', memoryTimeSeries);
    console.log('Network Receive:', networkReceiveTimeSeries);
    console.log('Network Transmit:', networkTransmitTimeSeries);
    console.log('===================');
  }, [clusterId, resourceType, namespace, name, cpuTimeSeries, memoryTimeSeries, networkReceiveTimeSeries, networkTransmitTimeSeries]);

  // Update metrics history when Redux data changes
  useEffect(() => {
    console.log('📊 Processing metrics for charts...');

    if (cpuTimeSeries.length > 0) {
      console.log('✅ Processing CPU metrics:', cpuTimeSeries.length, 'data points');
      const cpuData = cpuTimeSeries.map(item => ({
        time: new Date(item.timestamp * 1000).toLocaleTimeString(), // Convert Unix timestamp to JS timestamp
        value: (parseFloat(item.value) * 1000).toFixed(2) // Convert cores to millicores for better visualization
      }));
      console.log('CPU Chart Data:', cpuData);
      setMetricsHistory(prev => ({ ...prev, cpu: cpuData }));
      setCurrentMetrics(prev => ({ ...prev, cpu: parseFloat(cpuData[cpuData.length - 1]?.value || 0) }));
    } else {
      console.log('⚠️ No CPU time series data');
    }

    if (memoryTimeSeries.length > 0) {
      console.log('✅ Processing Memory metrics:', memoryTimeSeries.length, 'data points');
      const memData = memoryTimeSeries.map(item => ({
        time: new Date(item.timestamp * 1000).toLocaleTimeString(),
        value: (parseFloat(item.value) / (1024 * 1024)).toFixed(2) // Convert bytes to MB
      }));
      console.log('Memory Chart Data:', memData);
      setMetricsHistory(prev => ({ ...prev, memory: memData }));
      setCurrentMetrics(prev => ({ ...prev, memory: parseFloat(memData[memData.length - 1]?.value || 0) }));
    } else {
      console.log('⚠️ No Memory time series data');
    }

    if (networkReceiveTimeSeries.length > 0 && networkTransmitTimeSeries.length > 0) {
      console.log('✅ Processing Network metrics');
      const networkData = networkReceiveTimeSeries.map((item, idx) => ({
        time: new Date(item.timestamp * 1000).toLocaleTimeString(),
        receive: (parseFloat(item.value) / 1024).toFixed(2), // Convert bytes to KB
        transmit: networkTransmitTimeSeries[idx]
          ? (parseFloat(networkTransmitTimeSeries[idx].value) / 1024).toFixed(2)
          : 0
      }));
      console.log('Network Chart Data:', networkData);
      setMetricsHistory(prev => ({ ...prev, network: networkData }));
    } else {
      console.log('⚠️ No Network time series data');
    }
  }, [cpuTimeSeries, memoryTimeSeries, networkReceiveTimeSeries, networkTransmitTimeSeries]);

  // Fetch resource details, YAML, logs, and metrics on mount - prefetch everything
  useEffect(() => {
    const fetchResourceData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch resource details and YAML in parallel
        const [details, yamlData] = await Promise.all([
          getResourceDetails(clusterId, resourceType, namespace, name),
          getResourceYAML(clusterId, resourceType, namespace, name)
        ]);

        setResourceDetails(details);
        setYamlContent(yamlData.yaml || '');

        // For pods, prefetch logs and metrics
        if (resourceType === 'pod') {
          // Prefetch logs (don't block on this)
          getPodLogs(clusterId, namespace, name, 200)
            .then(logsData => {
              const logsString = logsData.logs || '';
              const logLines = typeof logsString === 'string'
                ? logsString.split('\n').filter(line => line.trim() !== '')
                : [];
              setLogs(logLines);
              setPrefetchStatus(prev => ({ ...prev, logs: true }));
              console.log('✅ Logs prefetched:', logLines.length, 'lines');
            })
            .catch(err => {
              console.error('Failed to prefetch logs:', err);
              setPrefetchStatus(prev => ({ ...prev, logs: true })); // Mark as done even on error
            });

          // Prefetch 24-hour historical metrics (don't block on this)
          if (resourceType === 'pod') {
            const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
            fetch(`${BASE_URL}/api/metrics/pod?namespace=${namespace}&pod=${name}`)
              .then(res => res.json())
              .then(data => {
                console.log('📊 Historical metrics data received:', {
                  cpu: data.cpu_usage_cores?.length || 0,
                  memory: data.memory_usage_bytes?.length || 0,
                  network: data.network_receive_bytes?.length || 0
                });

                const newHistory = { cpu: [], memory: [], network: [], disk: [], restarts: [], throttle: [] };

                // Helper to format timestamp
                const formatTime = (timestamp) => {
                  const date = new Date(timestamp * 1000);
                  return date.toLocaleTimeString();
                };

                // Helper to aggregate metrics by timestamp (sum across all containers)
                const aggregateByTimestamp = (dataArray) => {
                  const timestampMap = new Map();
                  dataArray.forEach(item => {
                    const existing = timestampMap.get(item.timestamp) || 0;
                    timestampMap.set(item.timestamp, existing + parseFloat(item.value));
                  });
                  return Array.from(timestampMap.entries()).sort((a, b) => a[0] - b[0]);
                };

                // CPU - aggregate all containers by timestamp
                if (data.cpu_usage_cores && data.cpu_usage_cores.length > 0) {
                  const aggregated = aggregateByTimestamp(data.cpu_usage_cores);
                  newHistory.cpu = aggregated.map(([timestamp, value]) => ({
                    time: formatTime(timestamp),
                    value: value * 100 // Convert to percentage
                  }));
                }

                // Memory - aggregate all containers by timestamp
                if (data.memory_usage_bytes && data.memory_usage_bytes.length > 0) {
                  const aggregated = aggregateByTimestamp(data.memory_usage_bytes);
                  newHistory.memory = aggregated.map(([timestamp, value]) => ({
                    time: formatTime(timestamp),
                    value: value / (1024 * 1024) // Convert to MB
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
                    receive: (rxMap.get(timestamp) || 0) / 1024, // Convert to KB/s
                    transmit: (txMap.get(timestamp) || 0) / 1024
                  }));
                }

                // Disk I/O - aggregate by timestamp
                if (data.disk_read_bytes && data.disk_read_bytes.length > 0) {
                  const readMap = new Map();
                  const writeMap = new Map();

                  data.disk_read_bytes.forEach(item => {
                    readMap.set(item.timestamp, (readMap.get(item.timestamp) || 0) + parseFloat(item.value));
                  });

                  if (data.disk_write_bytes) {
                    data.disk_write_bytes.forEach(item => {
                      writeMap.set(item.timestamp, (writeMap.get(item.timestamp) || 0) + parseFloat(item.value));
                    });
                  }

                  const timestamps = Array.from(new Set([...readMap.keys(), ...writeMap.keys()])).sort((a, b) => a - b);
                  newHistory.disk = timestamps.map(timestamp => ({
                    time: formatTime(timestamp),
                    read: (readMap.get(timestamp) || 0) / 1024, // Convert to KB/s
                    write: (writeMap.get(timestamp) || 0) / 1024
                  }));
                }

                // Restarts - aggregate by timestamp
                if (data.container_restarts && data.container_restarts.length > 0) {
                  const aggregated = aggregateByTimestamp(data.container_restarts);
                  newHistory.restarts = aggregated.map(([timestamp, value]) => ({
                    time: formatTime(timestamp),
                    value: value
                  }));
                }

                // CPU Throttling - aggregate by timestamp
                if (data.cpu_throttled && data.cpu_throttled.length > 0) {
                  const aggregated = aggregateByTimestamp(data.cpu_throttled);
                  newHistory.throttle = aggregated.map(([timestamp, value]) => ({
                    time: formatTime(timestamp),
                    value: value * 100 // Convert to percentage
                  }));
                }

                setMetricsHistory(newHistory);

                // Set current metrics to the latest values
                const latestCpu = newHistory.cpu[newHistory.cpu.length - 1]?.value || 0;
                const latestMem = newHistory.memory[newHistory.memory.length - 1]?.value || 0;
                setCurrentMetrics({
                  cpu: latestCpu,
                  memory: latestMem
                });

                setPrefetchStatus(prev => ({ ...prev, metrics: true }));
                console.log('✅ 24-hour metrics loaded:', {
                  cpu: newHistory.cpu.length,
                  memory: newHistory.memory.length,
                  network: newHistory.network.length,
                  disk: newHistory.disk.length
                });
              })
              .catch(err => {
                console.error('Failed to prefetch metrics:', err);
                setPrefetchStatus(prev => ({ ...prev, metrics: true })); // Mark as done even on error
              });
          }
        }
      } catch (err) {
        console.error('Failed to fetch resource data:', err);
        setError(err.message || 'Failed to load resource details');
      } finally {
        setLoading(false);
      }
    };

    fetchResourceData();
  }, [clusterId, resourceType, namespace, name]);

  // DIRECT METRICS FETCH - Now loads full 24-hour historical data
  const fetchDirectMetrics = useCallback(async () => {
    if (resourceType !== 'pod') return;

    try {
      const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';
      const response = await fetch(`${BASE_URL}/api/metrics/pod?namespace=${namespace}&pod=${name}`);
      const data = await response.json();

      const newHistory = { cpu: [], memory: [], network: [], disk: [], restarts: [], throttle: [] };

      // Helper to format timestamp
      const formatTime = (timestamp) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString();
      };

      // Helper to aggregate metrics by timestamp (sum across all containers)
      const aggregateByTimestamp = (dataArray) => {
        const timestampMap = new Map();
        dataArray.forEach(item => {
          const existing = timestampMap.get(item.timestamp) || 0;
          timestampMap.set(item.timestamp, existing + parseFloat(item.value));
        });
        return Array.from(timestampMap.entries()).sort((a, b) => a[0] - b[0]);
      };

      // CPU - aggregate all containers by timestamp
      if (data.cpu_usage_cores && data.cpu_usage_cores.length > 0) {
        const aggregated = aggregateByTimestamp(data.cpu_usage_cores);
        newHistory.cpu = aggregated.map(([timestamp, value]) => ({
          time: formatTime(timestamp),
          value: value * 100 // Convert to percentage
        }));
      }

      // Memory - aggregate all containers by timestamp
      if (data.memory_usage_bytes && data.memory_usage_bytes.length > 0) {
        const aggregated = aggregateByTimestamp(data.memory_usage_bytes);
        newHistory.memory = aggregated.map(([timestamp, value]) => ({
          time: formatTime(timestamp),
          value: value / (1024 * 1024) // Convert to MB
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
          receive: (rxMap.get(timestamp) || 0) / 1024, // Convert to KB/s
          transmit: (txMap.get(timestamp) || 0) / 1024
        }));
      }

      // Disk I/O - aggregate by timestamp
      if (data.disk_read_bytes && data.disk_read_bytes.length > 0) {
        const readMap = new Map();
        const writeMap = new Map();

        data.disk_read_bytes.forEach(item => {
          readMap.set(item.timestamp, (readMap.get(item.timestamp) || 0) + parseFloat(item.value));
        });

        if (data.disk_write_bytes) {
          data.disk_write_bytes.forEach(item => {
            writeMap.set(item.timestamp, (writeMap.get(item.timestamp) || 0) + parseFloat(item.value));
          });
        }

        const timestamps = Array.from(new Set([...readMap.keys(), ...writeMap.keys()])).sort((a, b) => a - b);
        newHistory.disk = timestamps.map(timestamp => ({
          time: formatTime(timestamp),
          read: (readMap.get(timestamp) || 0) / 1024, // Convert to KB/s
          write: (writeMap.get(timestamp) || 0) / 1024
        }));
      }

      // Restarts - aggregate by timestamp
      if (data.container_restarts && data.container_restarts.length > 0) {
        const aggregated = aggregateByTimestamp(data.container_restarts);
        newHistory.restarts = aggregated.map(([timestamp, value]) => ({
          time: formatTime(timestamp),
          value: value
        }));
      }

      // CPU Throttling - aggregate by timestamp
      if (data.cpu_throttled && data.cpu_throttled.length > 0) {
        const aggregated = aggregateByTimestamp(data.cpu_throttled);
        newHistory.throttle = aggregated.map(([timestamp, value]) => ({
          time: formatTime(timestamp),
          value: value * 100 // Convert to percentage
        }));
      }

      setMetricsHistory(newHistory);

      // Set current metrics to the latest values
      const latestCpu = newHistory.cpu[newHistory.cpu.length - 1]?.value || 0;
      const latestMem = newHistory.memory[newHistory.memory.length - 1]?.value || 0;
      setCurrentMetrics({
        cpu: latestCpu,
        memory: latestMem
      });

    } catch (err) {
      console.error('❌ Failed to fetch metrics:', err);
    }
  }, [resourceType, namespace, name]);

  // Fetch pod logs function
  const fetchLogs = async () => {
    if (resourceType !== 'pod') return;

    setLogsLoading(true);
    try {
      const logsData = await getPodLogs(clusterId, namespace, name, 200);
      // Logs come as a string, split into lines
      const logsString = logsData.logs || '';
      const logLines = typeof logsString === 'string'
        ? logsString.split('\n').filter(line => line.trim() !== '')
        : [];
      setLogs(logLines);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([`Error fetching logs: ${err.message}`]);
    } finally {
      setLogsLoading(false);
    }
  };

  // Pre-fetch metrics on mount for pods so data is ready before tab is clicked
  useEffect(() => {
    if (resourceType === 'pod') {
      fetchDirectMetrics();
    }
  }, [resourceType, fetchDirectMetrics]);

  // Refresh metrics every 60 seconds when the metrics tab is active
  useEffect(() => {
    if (resourceType === 'pod' && activeTab === 'metrics') {
      const interval = setInterval(() => {
        fetchDirectMetrics();
      }, 60000);

      return () => clearInterval(interval);
    }
  }, [resourceType, activeTab, fetchDirectMetrics]);

  // Fetch logs when switching to logs tab (only if not already loaded)
  useEffect(() => {
    if (resourceType === 'pod' && activeTab === 'logs' && logs.length === 0) {
      fetchLogs();
    }
  }, [activeTab]); // Only depend on activeTab to avoid refetching

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current && activeTab === 'logs') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const getStatusText = () => {
    if (!resourceDetails) return 'Unknown';

    if (resourceType === 'pod') {
      // Check for container statuses to get detailed state
      const containerStatuses = resourceDetails.status?.containerStatuses || [];

      if (containerStatuses.length > 0) {
        // Check for waiting state (CrashLoopBackOff, ImagePullBackOff, etc.)
        for (const container of containerStatuses) {
          if (container.state?.waiting) {
            return container.state.waiting.reason || resourceDetails.status?.phase || 'Unknown';
          }
          if (container.state?.terminated) {
            return container.state.terminated.reason || 'Terminated';
          }
        }
      }

      // Fallback to phase
      return resourceDetails.status?.phase || 'Unknown';
    } else if (resourceType === 'deployment') {
      const ready = resourceDetails.status?.readyReplicas || 0;
      const desired = resourceDetails.spec?.replicas || 0;
      return ready === desired ? 'Ready' : 'Progressing';
    } else if (resourceType === 'service') {
      return 'Active';
    } else if (resourceType === 'statefulset') {
      const ready = resourceDetails.status?.readyReplicas || 0;
      const desired = resourceDetails.spec?.replicas || 0;
      return ready === desired ? 'Ready' : 'Progressing';
    }
    return 'Unknown';
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'Running': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      'Ready': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      'Active': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      'Completed': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      'Succeeded': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      'Progressing': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      'ContainerCreating': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      'PodInitializing': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      'Failed': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      'CrashLoopBackOff': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      'Error': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      'ImagePullBackOff': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      'ErrImagePull': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      'CreateContainerConfigError': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      'InvalidImageName': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      'Terminated': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
      'OOMKilled': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
  };

  // Memoize chart data to prevent unnecessary re-renders
  const cpuChartData = useMemo(() => metricsHistory.cpu || [], [metricsHistory.cpu]);
  const memoryChartData = useMemo(() => metricsHistory.memory || [], [metricsHistory.memory]);
  const networkChartData = useMemo(() => metricsHistory.network || [], [metricsHistory.network]);
  const diskChartData = useMemo(() => metricsHistory.disk || [], [metricsHistory.disk]);
  const restartsChartData = useMemo(() => metricsHistory.restarts || [], [metricsHistory.restarts]);
  const throttleChartData = useMemo(() => metricsHistory.throttle || [], [metricsHistory.throttle]);

  // Prepare pie chart data for container distribution
  const containerDistribution = useMemo(() =>
    resourceDetails?.status?.containerStatuses?.map((container, index) => ({
      name: container.name,
      value: 1,
      color: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'][index % 5]
    })) || []
  , [resourceDetails]);

  if (loading) {
    return (
      <div className={`flex-1 flex items-center justify-center ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4"></div>
          <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Loading resource details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex-1 flex items-center justify-center ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <div className="text-center">
          <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-red-500' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className={`text-lg font-medium ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>Failed to load resource</p>
          <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-500'}`}>{error}</p>
          <button
            onClick={() => navigate('/dashboard/apps')}
            className={`mt-4 px-4 py-2 ${theme === 'dark' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-lg transition-colors`}
          >
            Back to Apps
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/dashboard/apps')}
              className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}
            >
              <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{name}</h1>
              <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                {resourceType} in {namespace} namespace
              </p>
            </div>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(getStatusText())}`}>
              {getStatusText()}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            {resourceType === 'pod' && (!prefetchStatus.logs || !prefetchStatus.metrics) && (
              <div className={`flex items-center space-x-2 px-3 py-2 rounded ${theme === 'dark' ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-600'}`}>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-violet-500"></div>
                <span className="text-sm">Loading data...</span>
              </div>
            )}
            {resourceType === 'pod' && prefetchStatus.logs && prefetchStatus.metrics && (
              <div className={`flex items-center space-x-2 px-3 py-2 rounded ${theme === 'dark' ? 'bg-green-900/20 text-green-400' : 'bg-blue-100 text-blue-700'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm">All data loaded</span>
              </div>
            )}
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
        </div>
      </div>

      {/* Tabs */}
      <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} border-b`}>
        <div className="px-6">
          <div className="flex space-x-8">
            {['overview', 'metrics', 'vulnerabilities', 'logs', 'yaml']
              .filter(tab => {
                // Only show metrics and logs tabs for pods
                if ((tab === 'metrics' || tab === 'logs') && resourceType !== 'pod') {
                  return false;
                }
                // Only show vulnerabilities for image-bearing workloads
                if (tab === 'vulnerabilities' && !SCANNABLE_KINDS.includes((resourceType || '').toLowerCase())) {
                  return false;
                }
                return true;
              })
              .map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab
                      ? theme === 'dark'
                        ? 'border-blue-500 text-blue-400'
                        : 'border-blue-600 text-blue-700'
                      : theme === 'dark'
                      ? 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats + analytics */}
            {resourceType === 'pod' && (() => {
              const dk = theme === 'dark';
              const restarts = resourceDetails?.status?.containerStatuses?.reduce((s, c) => s + (c.restartCount || 0), 0) || 0;
              const ready = resourceDetails?.status?.containerStatuses?.filter(c => c.ready).length || 0;
              const total = resourceDetails?.status?.containerStatuses?.length || 0;
              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard dk={dk} label="CPU Usage" value={currentMetrics.cpu?.toFixed(1) || '0.0'} unit="%" sub="Current" color="#22c55e" spark={cpuChartData} icon={<Cpu size={15} />} />
                    <StatCard dk={dk} label="Memory" value={currentMetrics.memory?.toFixed(0) || '0'} unit="MB" sub="Current" color="#3b82f6" spark={memoryChartData} icon={<MemoryStick size={15} />} />
                    <StatCard dk={dk} label="Total Restarts" value={restarts} sub="Lifetime" color={restarts > 0 ? '#f59e0b' : '#3b82f6'} spark={[]} icon={<RotateCcw size={15} />} />
                    <StatCard dk={dk} label="Containers" value={`${ready}/${total}`} sub="Ready" color="#14b8a6" spark={[]} icon={<Box size={15} />} />
                  </div>
                  {(cpuChartData.length > 1 || memoryChartData.length > 1) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <ChartCard dk={dk} title="CPU Usage" subtitle="millicores · last 2h" data={cpuChartData} color="#22c55e" unit="m" />
                      <ChartCard dk={dk} title="Memory Usage" subtitle="MB · last 2h" data={memoryChartData} color="#3b82f6" unit="MB" />
                    </div>
                  )}
                </>
              );
            })()}

            {/* Resource Details */}
            <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
              <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Resource Information</h2>
              </div>
              <div className="p-6">
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Name</dt>
                    <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono`}>{resourceDetails?.metadata?.name}</dd>
                  </div>
                  <div>
                    <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Namespace</dt>
                    <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{resourceDetails?.metadata?.namespace}</dd>
                  </div>
                  <div>
                    <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Created</dt>
                    <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {resourceDetails?.metadata?.creationTimestamp ? new Date(resourceDetails.metadata.creationTimestamp).toLocaleString() : 'Unknown'}
                    </dd>
                  </div>
                  <div>
                    <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>UID</dt>
                    <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono text-xs`}>{resourceDetails?.metadata?.uid}</dd>
                  </div>
                  {resourceType === 'pod' && (
                    <>
                      <div>
                        <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Node</dt>
                        <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{resourceDetails?.spec?.nodeName || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Pod IP</dt>
                        <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono`}>{resourceDetails?.status?.podIP || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>QoS Class</dt>
                        <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{resourceDetails?.status?.qosClass || 'BestEffort'}</dd>
                      </div>
                    </>
                  )}
                  {resourceDetails?.metadata?.labels && (
                    <div className="col-span-2">
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-2`}>Labels</dt>
                      <dd className="flex flex-wrap gap-2">
                        {Object.entries(resourceDetails.metadata.labels).map(([key, value]) => (
                          <span key={key} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                            {key}: <span className="font-semibold ml-1">{value}</span>
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {/* Container Status - Only for pods */}
            {resourceType === 'pod' && resourceDetails?.status?.containerStatuses && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Containers</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {resourceDetails.status.containerStatuses.map((container, index) => (
                      <div key={index} className={`${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'} rounded-lg p-5 border`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className={`font-semibold text-lg ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{container.name}</h3>
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${container.ready ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {container.ready ? '● Ready' : '● Not Ready'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-medium`}>Restart Count:</span>
                            <span className={`ml-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-semibold`}>{container.restartCount}</span>
                          </div>
                          <div>
                            <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-medium`}>Container ID:</span>
                            <span className={`ml-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono text-xs`}>
                              {container.containerID?.split('://')[1]?.substring(0, 12) || 'N/A'}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} font-medium`}>Image</span>
                            <div className={`mt-1.5 font-mono text-[12px] break-all px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-white/[0.03] text-gray-300 border-white/[0.06]' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                              {resourceDetails.spec.containers.find(c => c.name === container.name)?.image}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Deployment Specific Information */}
            {resourceType === 'deployment' && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Deployment Details</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-violet-900/20 to-violet-800/10 border-violet-500/20' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'} rounded-xl border p-6`}>
                      <div className={`text-sm font-medium ${theme === 'dark' ? 'text-violet-400' : 'text-blue-600'} mb-2`}>Desired Replicas</div>
                      <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {resourceDetails?.spec?.replicas || 0}
                      </div>
                    </div>
                    <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-500/20' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'} rounded-xl border p-6`}>
                      <div className={`text-sm font-medium ${theme === 'dark' ? 'text-green-400' : 'text-green-600'} mb-2`}>Ready Replicas</div>
                      <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {resourceDetails?.status?.readyReplicas || 0}
                      </div>
                    </div>
                    <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-500/20' : 'bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200'} rounded-xl border p-6`}>
                      <div className={`text-sm font-medium ${theme === 'dark' ? 'text-blue-400' : 'text-cyan-600'} mb-2`}>Available Replicas</div>
                      <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {resourceDetails?.status?.availableReplicas || 0}
                      </div>
                    </div>
                    <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-500/20' : 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200'} rounded-xl border p-6`}>
                      <div className={`text-sm font-medium ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'} mb-2`}>Updated Replicas</div>
                      <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {resourceDetails?.status?.updatedReplicas || 0}
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Strategy</dt>
                      <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{resourceDetails?.spec?.strategy || 'RollingUpdate'}</dd>
                    </div>
                    {resourceDetails?.spec?.selector && (
                      <div className="col-span-2">
                        <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-2`}>Selector</dt>
                        <dd className="flex flex-wrap gap-2">
                          {Object.entries(resourceDetails.spec.selector).map(([key, value]) => (
                            <span key={key} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                              {key}: <span className="font-semibold ml-1">{value}</span>
                            </span>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            )}

            {/* Service Specific Information */}
            {resourceType === 'service' && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Service Details</h2>
                </div>
                <div className="p-6">
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Type</dt>
                      <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${theme === 'dark' ? 'bg-violet-900/30 text-violet-400' : 'bg-blue-100 text-blue-800'}`}>
                          {resourceDetails?.spec?.type || 'ClusterIP'}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Cluster IP</dt>
                      <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono`}>{resourceDetails?.spec?.clusterIP || 'None'}</dd>
                    </div>
                    <div>
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Session Affinity</dt>
                      <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{resourceDetails?.spec?.sessionAffinity || 'None'}</dd>
                    </div>
                    {resourceDetails?.spec?.externalIPs && resourceDetails.spec.externalIPs.length > 0 && (
                      <div>
                        <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>External IPs</dt>
                        <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono`}>{resourceDetails.spec.externalIPs.join(', ')}</dd>
                      </div>
                    )}
                  </dl>

                  {/* Service Ports */}
                  {resourceDetails?.spec?.ports && resourceDetails.spec.ports.length > 0 && (
                    <div>
                      <h3 className={`text-md font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>Ports</h3>
                      <div className="space-y-3">
                        {resourceDetails.spec.ports.map((port, index) => (
                          <div key={index} className={`${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'} rounded-lg p-4 border`}>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-medium`}>Name:</span>
                                <span className={`ml-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{port.name || '-'}</span>
                              </div>
                              <div>
                                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-medium`}>Port:</span>
                                <span className={`ml-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono`}>{port.port}</span>
                              </div>
                              <div>
                                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-medium`}>Target Port:</span>
                                <span className={`ml-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono`}>{port.targetPort || '-'}</span>
                              </div>
                              <div>
                                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-medium`}>Protocol:</span>
                                <span className={`ml-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{port.protocol || 'TCP'}</span>
                              </div>
                              {port.nodePort && (
                                <div>
                                  <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-medium`}>Node Port:</span>
                                  <span className={`ml-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono`}>{port.nodePort}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Service Selector */}
                  {resourceDetails?.spec?.selector && (
                    <div className="mt-6">
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-2`}>Selector</dt>
                      <dd className="flex flex-wrap gap-2">
                        {Object.entries(resourceDetails.spec.selector).map(([key, value]) => (
                          <span key={key} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                            {key}: <span className="font-semibold ml-1">{value}</span>
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* StatefulSet Specific Information */}
            {resourceType === 'statefulset' && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>StatefulSet Details</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-violet-900/20 to-violet-800/10 border-violet-500/20' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'} rounded-xl border p-6`}>
                      <div className={`text-sm font-medium ${theme === 'dark' ? 'text-violet-400' : 'text-blue-600'} mb-2`}>Desired Replicas</div>
                      <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {resourceDetails?.spec?.replicas || 0}
                      </div>
                    </div>
                    <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-500/20' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'} rounded-xl border p-6`}>
                      <div className={`text-sm font-medium ${theme === 'dark' ? 'text-green-400' : 'text-green-600'} mb-2`}>Ready Replicas</div>
                      <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {resourceDetails?.status?.readyReplicas || 0}
                      </div>
                    </div>
                    <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-500/20' : 'bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200'} rounded-xl border p-6`}>
                      <div className={`text-sm font-medium ${theme === 'dark' ? 'text-blue-400' : 'text-cyan-600'} mb-2`}>Current Replicas</div>
                      <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {resourceDetails?.status?.currentReplicas || 0}
                      </div>
                    </div>
                    <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-500/20' : 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200'} rounded-xl border p-6`}>
                      <div className={`text-sm font-medium ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'} mb-2`}>Updated Replicas</div>
                      <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {resourceDetails?.status?.updatedReplicas || 0}
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Service Name</dt>
                      <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{resourceDetails?.spec?.serviceName || 'None'}</dd>
                    </div>
                    <div>
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Update Strategy</dt>
                      <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{resourceDetails?.spec?.updateStrategy || 'RollingUpdate'}</dd>
                    </div>
                    <div>
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Pod Management Policy</dt>
                      <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{resourceDetails?.spec?.podManagementPolicy || 'OrderedReady'}</dd>
                    </div>
                    <div>
                      <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Current Revision</dt>
                      <dd className={`text-base ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono text-xs`}>{resourceDetails?.status?.currentRevision || 'N/A'}</dd>
                    </div>
                    {resourceDetails?.spec?.selector && (
                      <div className="col-span-2">
                        <dt className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-2`}>Selector</dt>
                        <dd className="flex flex-wrap gap-2">
                          {Object.entries(resourceDetails.spec.selector).map(([key, value]) => (
                            <span key={key} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>
                              {key}: <span className="font-semibold ml-1">{value}</span>
                            </span>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'metrics' && resourceType === 'pod' && (
          <div className="space-y-6">
            {/* CPU Metrics */}
            {cpuChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>CPU Usage Over Time</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 2 hours</p>
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
                        label={{ value: 'CPU %', angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#6b7280' } }}
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

            {/* Memory Metrics */}
            {memoryChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Memory Usage Over Time</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 2 hours</p>
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
                        label={{ value: 'Memory (MB)', angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#6b7280' } }}
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

            {/* Network Metrics */}
            {networkChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Network Traffic</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 2 hours</p>
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
                        label={{ value: 'KB/s', angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#6b7280' } }}
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

            {/* Disk I/O Metrics */}
            {diskChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Disk I/O</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 2 hours</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={diskChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis
                        dataKey="time"
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke={theme === 'dark' ? '#64748b' : '#6b7280'}
                        style={{ fontSize: '12px' }}
                        label={{ value: 'KB/s', angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#6b7280' } }}
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
                      <Line type="monotone" dataKey="read" stroke="#8b5cf6" name="Read" strokeWidth={2} isAnimationActive={false} />
                      <Line type="monotone" dataKey="write" stroke="#ec4899" name="Write" strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Restart Count Over Time */}
            {restartsChartData.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Container Restarts Over Time</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 2 hours</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={restartsChartData}>
                      <defs>
                        <linearGradient id="colorRestarts" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
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
                        label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#6b7280' } }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                        }}
                      />
                      <Area type="stepAfter" dataKey="value" stroke="#ef4444" fillOpacity={1} fill="url(#colorRestarts)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Container Distribution Pie Chart */}
            {containerDistribution.length > 1 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Container Distribution</h2>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={containerDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name }) => name}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        isAnimationActive={false}
                      >
                        {containerDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          color: theme === 'dark' ? '#ffffff' : '#000000',
                        }}
                      />
                    </PieChart>
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

        {activeTab === 'logs' && resourceType === 'pod' && (
          <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Pod Logs</h2>
                <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last 200 lines</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLogs}
                  disabled={logsLoading}
                  className={`px-4 py-2 flex items-center gap-2 ${theme === 'dark' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <svg className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {logsLoading ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  onClick={() => setLogs([])}
                  className={`px-3 py-2 text-sm ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded transition-colors`}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className={`p-4 ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-900'} font-mono text-xs overflow-y-auto`} style={{ maxHeight: '600px' }}>
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
                  <span className={`ml-3 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-400'}`}>Loading logs...</span>
                </div>
              ) : logs.length === 0 ? (
                <div className="text-slate-500 text-center py-16">
                  <div className="mb-4">
                    <svg className="w-12 h-12 mx-auto text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p>No logs available</p>
                  <p className="text-xs mt-2 text-slate-600">Click refresh to fetch logs</p>
                </div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="text-green-400 py-0.5 hover:bg-slate-900 px-2 -mx-2 rounded">
                    <span className="text-slate-600 mr-2">{index + 1}</span>
                    {log}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {activeTab === 'vulnerabilities' && (
          <VulnerabilitiesTab theme={theme} namespace={namespace} kind={resourceType} name={name} />
        )}

        {activeTab === 'yaml' && (
          <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>YAML Configuration</h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Resource definition from Kubernetes</p>
            </div>
            <Editor
              height="700px"
              defaultLanguage="yaml"
              value={yamlContent}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              options={{
                readOnly: true,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                fontSize: 13,
                lineNumbers: 'on',
                folding: true,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AppResourceDetailPage;

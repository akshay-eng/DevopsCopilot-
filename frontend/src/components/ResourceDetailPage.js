import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import { getResourceYAML, calculateAge } from '../services/api';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ResourceDetailPage = () => {
  const { clusterId, resourceType, namespace, name } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const [yaml, setYaml] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [yamlLoading, setYamlLoading] = useState(false);

  // Get resource details from Redux cache
  const resource = useSelector(state => {
    const clusterData = state.resources.resources[clusterId];
    if (!clusterData) return null;

    const typeData = clusterData[resourceType + 's'] || clusterData[resourceType];
    if (!typeData || !typeData[namespace]) return null;

    return typeData[namespace][name] || null;
  });

  // Get metrics from Redux (using timeSeries data for charts)
  const metrics = useSelector(state => {
    const key = `${clusterId}/${resourceType}s/${namespace}/${name}`;
    const timeSeries = state.metrics.timeSeries[key];

    if (!timeSeries) return [];

    // Combine all metric time series into a single array of data points
    const metricKeys = Object.keys(timeSeries);
    if (metricKeys.length === 0) return [];

    // Get the length of the longest time series
    const maxLength = Math.max(...metricKeys.map(k => timeSeries[k].length));

    // Combine all metrics into unified data points
    const combined = [];
    for (let i = 0; i < maxLength; i++) {
      const dataPoint = {
        timestamp: null,
        cpuUsageCores: 0,
        memoryUsageBytes: 0,
        networkReceiveBytesPerSec: 0,
        networkTransmitBytesPerSec: 0,
        diskReadBytesPerSec: 0,
        diskWriteBytesPerSec: 0,
        uptimeSeconds: 0
      };

      metricKeys.forEach(metricName => {
        if (timeSeries[metricName][i]) {
          const point = timeSeries[metricName][i];
          dataPoint.timestamp = point.timestamp;

          // Map metric names to data point properties (actual Prometheus metric names)
          if (metricName === 'cpu_usage_cores' || metricName === 'cpu_usage') dataPoint.cpuUsageCores = point.value;
          else if (metricName === 'memory_usage_bytes' || metricName === 'memory_usage') dataPoint.memoryUsageBytes = point.value;
          else if (metricName === 'network_receive_bytes' || metricName === 'network_receive') dataPoint.networkReceiveBytesPerSec = point.value;
          else if (metricName === 'network_transmit_bytes' || metricName === 'network_transmit') dataPoint.networkTransmitBytesPerSec = point.value;
          else if (metricName === 'disk_read_bytes' || metricName === 'disk_read') dataPoint.diskReadBytesPerSec = point.value;
          else if (metricName === 'disk_write_bytes' || metricName === 'disk_write') dataPoint.diskWriteBytesPerSec = point.value;
          else if (metricName === 'uptime') dataPoint.uptimeSeconds = point.value;
        }
      });

      if (dataPoint.timestamp) {
        combined.push(dataPoint);
      }
    }

    return combined;
  });

  // Get alerts from Redux
  const alerts = useSelector(state => {
    const clusterAlerts = state.alerts.alerts[clusterId] || [];
    return clusterAlerts.filter(alert =>
      alert.namespace === namespace &&
      (alert.pod === name || alert.labels?.pod === name || alert.labels?.deployment === name)
    );
  });

  useEffect(() => {
    setLoading(!resource);
  }, [resource]);

  const fetchYAML = async () => {
    if (yamlLoading) return;

    try {
      setYamlLoading(true);
      const response = await getResourceYAML(clusterId, resourceType, namespace, name);
      setYaml(response.yaml || '');
    } catch (error) {
      console.error('Error fetching YAML:', error);
      setYaml('# Error loading YAML\n# ' + error.message);
    } finally {
      setYamlLoading(false);
    }
  };

  // Fetch YAML when tab is activated
  useEffect(() => {
    if (activeTab === 'yaml' && !yaml && !yamlLoading) {
      fetchYAML();
    }
  }, [activeTab]);

  // Transform metrics for charts
  const chartData = useMemo(() => {
    if (!metrics || metrics.length === 0) return [];

    return metrics.slice(-50).map((m, idx) => ({
      time: new Date(m.timestamp).toLocaleTimeString(),
      cpu: parseFloat((m.cpuUsageCores || 0) * 1000).toFixed(2), // Convert to millicores
      memory: parseFloat((m.memoryUsageBytes || 0) / (1024 * 1024)).toFixed(2), // Convert to MB
      networkIn: parseFloat((m.networkReceiveBytesPerSec || 0) / 1024).toFixed(2), // KB/s
      networkOut: parseFloat((m.networkTransmitBytesPerSec || 0) / 1024).toFixed(2), // KB/s
      diskRead: parseFloat((m.diskReadBytesPerSec || 0) / 1024).toFixed(2), // KB/s
      diskWrite: parseFloat((m.diskWriteBytesPerSec || 0) / 1024).toFixed(2), // KB/s
    }));
  }, [metrics]);

  // Get latest metrics
  const latestMetrics = useMemo(() => {
    if (!metrics || metrics.length === 0) return null;
    const latest = metrics[metrics.length - 1];

    return {
      cpu: ((latest.cpuUsageCores || 0) * 1000).toFixed(2) + ' m',
      memory: ((latest.memoryUsageBytes || 0) / (1024 * 1024)).toFixed(2) + ' MB',
      networkIn: ((latest.networkReceiveBytesPerSec || 0) / 1024).toFixed(2) + ' KB/s',
      networkOut: ((latest.networkTransmitBytesPerSec || 0) / 1024).toFixed(2) + ' KB/s',
      diskRead: ((latest.diskReadBytesPerSec || 0) / 1024).toFixed(2) + ' KB/s',
      diskWrite: ((latest.diskWriteBytesPerSec || 0) / 1024).toFixed(2) + ' KB/s',
      uptime: latest.uptimeSeconds ? Math.floor(latest.uptimeSeconds / 3600) + 'h' : 'N/A'
    };
  }, [metrics]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Running': return theme === 'dark' ? 'text-green-400' : 'text-green-600';
      case 'Pending': return theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600';
      case 'Failed': return theme === 'dark' ? 'text-red-400' : 'text-red-600';
      case 'Succeeded': return theme === 'dark' ? 'text-blue-400' : 'text-blue-600';
      default: return theme === 'dark' ? 'text-slate-400' : 'text-gray-600';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'Running': return 'bg-green-500';
      case 'Pending': return 'bg-yellow-500';
      case 'Failed': return 'bg-red-500';
      case 'Succeeded': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className={`flex-1 flex items-center justify-center ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4 mx-auto"></div>
          <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Loading resource details...</p>
        </div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className={`flex-1 flex items-center justify-center ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className="text-center">
          <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-red-500' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Resource not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
        <button
          onClick={() => navigate('/dashboard/apps')}
          className={`flex items-center ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'} transition-colors mb-4`}
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Apps
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`p-3 ${theme === 'dark' ? 'bg-violet-500/20' : 'bg-blue-100'} rounded-lg`}>
              <svg className={`w-6 h-6 ${theme === 'dark' ? 'text-violet-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{name}</h1>
              <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mt-1`}>
                <span className={theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}>Namespace:</span> {namespace}
              </p>
            </div>
          </div>
          <div className={`flex items-center space-x-2`}>
            <div className={`w-3 h-3 rounded-full ${getStatusBg(resource.status)}`}></div>
            <span className={`font-medium ${getStatusColor(resource.status)}`}>{resource.status}</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className={`flex space-x-1 px-6 ${theme === 'dark' ? 'bg-[#0a0a0f] border-slate-800' : 'bg-gray-50 border-gray-200'} border-b`}>
        {['overview', 'metrics', 'yaml', 'alerts'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? theme === 'dark'
                  ? 'text-violet-400 border-b-2 border-violet-400'
                  : 'text-blue-600 border-b-2 border-blue-600'
                : theme === 'dark'
                  ? 'text-slate-400 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab}
            {tab === 'alerts' && alerts.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">{alerts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Card */}
              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} text-sm`}>Status</p>
                    <p className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mt-1`}>{resource.status}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg ${getStatusBg(resource.status)}/10 flex items-center justify-center`}>
                    <svg className={`w-5 h-5 ${getStatusColor(resource.status)}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Restarts Card */}
              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} text-sm`}>Restarts</p>
                    <p className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mt-1`}>{resource.restarts || 0}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Age Card */}
              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} text-sm`}>Age</p>
                    <p className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mt-1`}>{calculateAge(resource.age)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Uptime Card */}
              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} text-sm`}>Uptime</p>
                    <p className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mt-1`}>{latestMetrics?.uptime || 'N/A'}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Resource Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>Resource Information</h3>
                <div className="space-y-3">
                  <div className={`flex justify-between py-2 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
                    <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Namespace</span>
                    <span className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-medium`}>{resource.namespace}</span>
                  </div>
                  <div className={`flex justify-between py-2 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
                    <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Node</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>{resource.nodeName || 'N/A'}</span>
                  </div>
                  <div className={`flex justify-between py-2 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
                    <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Pod IP</span>
                    <span className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono text-sm`}>{resource.podIP || 'N/A'}</span>
                  </div>
                  <div className={`flex justify-between py-2 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
                    <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Created</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>{new Date(resource.age).toLocaleString()}</span>
                  </div>
                  <div className={`flex justify-between py-2`}>
                    <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Ready</span>
                    <span className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-medium`}>{resource.ready}</span>
                  </div>
                </div>
              </div>

              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>Containers</h3>
                <div className="space-y-3">
                  {resource.containers && resource.containers.length > 0 ? (
                    resource.containers.map((container, idx) => (
                      <div key={idx} className={`p-3 ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'} rounded-lg`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{container.name}</span>
                          <span className={`text-xs px-2 py-1 rounded ${container.ready ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {container.ready ? 'Ready' : 'Not Ready'}
                          </span>
                        </div>
                        <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-mono truncate`}>{container.image}</p>
                      </div>
                    ))
                  ) : (
                    <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>No container information available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Current Metrics */}
            {latestMetrics && (
              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>Current Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className={`p-3 ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'} rounded-lg text-center`}>
                    <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>CPU</p>
                    <p className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{latestMetrics.cpu}</p>
                  </div>
                  <div className={`p-3 ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'} rounded-lg text-center`}>
                    <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Memory</p>
                    <p className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{latestMetrics.memory}</p>
                  </div>
                  <div className={`p-3 ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'} rounded-lg text-center`}>
                    <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Net In</p>
                    <p className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{latestMetrics.networkIn}</p>
                  </div>
                  <div className={`p-3 ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'} rounded-lg text-center`}>
                    <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Net Out</p>
                    <p className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{latestMetrics.networkOut}</p>
                  </div>
                  <div className={`p-3 ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'} rounded-lg text-center`}>
                    <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Disk Read</p>
                    <p className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{latestMetrics.diskRead}</p>
                  </div>
                  <div className={`p-3 ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'} rounded-lg text-center`}>
                    <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Disk Write</p>
                    <p className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{latestMetrics.diskWrite}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="space-y-6">
            {chartData.length > 0 ? (
              <>
                {/* CPU & Memory */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                    <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>CPU Usage (millicores)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                        <XAxis dataKey="time" stroke={theme === 'dark' ? '#64748b' : '#9ca3af'} style={{ fontSize: '12px' }} />
                        <YAxis stroke={theme === 'dark' ? '#64748b' : '#9ca3af'} style={{ fontSize: '12px' }} />
                        <Tooltip contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px'
                        }} />
                        <Area type="monotone" dataKey="cpu" stroke="#ef4444" fillOpacity={1} fill="url(#cpuGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                    <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>Memory Usage (MB)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                        <XAxis dataKey="time" stroke={theme === 'dark' ? '#64748b' : '#9ca3af'} style={{ fontSize: '12px' }} />
                        <YAxis stroke={theme === 'dark' ? '#64748b' : '#9ca3af'} style={{ fontSize: '12px' }} />
                        <Tooltip contentStyle={{
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                          border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                          borderRadius: '8px'
                        }} />
                        <Area type="monotone" dataKey="memory" stroke="#3b82f6" fillOpacity={1} fill="url(#memGradient)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Network I/O */}
                <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                  <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>Network I/O (KB/s)</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis dataKey="time" stroke={theme === 'dark' ? '#64748b' : '#9ca3af'} style={{ fontSize: '12px' }} />
                      <YAxis stroke={theme === 'dark' ? '#64748b' : '#9ca3af'} style={{ fontSize: '12px' }} />
                      <Tooltip contentStyle={{
                        backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                        border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                        borderRadius: '8px'
                      }} />
                      <Legend />
                      <Line type="monotone" dataKey="networkIn" stroke="#10b981" name="Receive" strokeWidth={2} />
                      <Line type="monotone" dataKey="networkOut" stroke="#f59e0b" name="Transmit" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Disk I/O */}
                <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                  <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>Disk I/O (KB/s)</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e5e7eb'} />
                      <XAxis dataKey="time" stroke={theme === 'dark' ? '#64748b' : '#9ca3af'} style={{ fontSize: '12px' }} />
                      <YAxis stroke={theme === 'dark' ? '#64748b' : '#9ca3af'} style={{ fontSize: '12px' }} />
                      <Tooltip contentStyle={{
                        backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                        border: `1px solid ${theme === 'dark' ? '#334155' : '#e5e7eb'}`,
                        borderRadius: '8px'
                      }} />
                      <Legend />
                      <Line type="monotone" dataKey="diskRead" stroke="#8b5cf6" name="Read" strokeWidth={2} />
                      <Line type="monotone" dataKey="diskWrite" stroke="#ec4899" name="Write" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-12 text-center`}>
                <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-slate-700' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>No metrics data available yet</p>
                <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-500'}`}>Metrics will appear here as they are collected</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'yaml' && (
          <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>YAML Configuration</h3>
              <button
                onClick={fetchYAML}
                disabled={yamlLoading}
                className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-lg transition-colors flex items-center text-sm`}
              >
                <svg className={`w-4 h-4 mr-2 ${yamlLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reload
              </button>
            </div>
            <div className={`${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'} rounded-lg p-4 font-mono text-sm overflow-x-auto`}>
              <pre className={theme === 'dark' ? 'text-slate-300' : 'text-gray-800'}>
                {yamlLoading ? 'Loading YAML...' : yaml || 'Click "Reload" to fetch YAML configuration'}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div>
            {alerts.length > 0 ? (
              <div className="space-y-4">
                {alerts.map((alert, idx) => (
                  <div key={alert.id || idx} className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <div className={`w-10 h-10 rounded-lg ${
                          alert.severity === 'critical' ? 'bg-red-500/20' :
                          alert.severity === 'warning' ? 'bg-yellow-500/20' :
                          'bg-blue-500/20'
                        } flex items-center justify-center flex-shrink-0`}>
                          <svg className={`w-5 h-5 ${
                            alert.severity === 'critical' ? 'text-red-400' :
                            alert.severity === 'warning' ? 'text-yellow-400' :
                            'text-blue-400'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                              {alert.alertname || alert.name || 'Alert'}
                            </h4>
                            {alert.status && (
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                alert.status === 'firing' ? 'bg-red-500/20 text-red-400' :
                                'bg-green-500/20 text-green-400'
                              }`}>
                                {alert.status}
                              </span>
                            )}
                          </div>
                          <p className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-2`}>
                            {alert.message || alert.annotations?.summary || alert.annotations?.description || 'No description available'}
                          </p>

                          {/* Additional metadata */}
                          <div className="flex flex-wrap gap-3 text-sm mt-3">
                            <div className={`flex items-center ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>Started: {new Date(alert.startsAt || alert.timestamp).toLocaleString()}</span>
                            </div>
                            {alert.labels && Object.keys(alert.labels).length > 0 && (
                              <div className={`flex items-center ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                </svg>
                                <span>
                                  {Object.entries(alert.labels).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(', ')}
                                  {Object.keys(alert.labels).length > 2 && ` +${Object.keys(alert.labels).length - 2} more`}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`px-3 py-1 text-xs font-medium rounded flex-shrink-0 ${
                        alert.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                        alert.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {alert.severity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-12 text-center`}>
                <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-slate-700' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>No active alerts for this resource</p>
                <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-500'}`}>
                  Alerts will appear here when triggered by monitoring rules
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceDetailPage;

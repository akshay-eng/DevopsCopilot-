import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Editor from '@monaco-editor/react';
import { getResourceDetails, getResourceYAML, getPodMetrics, getPodLogs } from '../services/api';

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
  const logsEndRef = useRef(null);

  // Fetch resource details and metrics
  useEffect(() => {
    const fetchResourceData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch resource details
        const details = await getResourceDetails(clusterId, resourceType, namespace, name);
        setResourceDetails(details);

        // Fetch YAML
        const yamlData = await getResourceYAML(clusterId, resourceType, namespace, name);
        setYamlContent(yamlData.yaml || '');

        // Fetch metrics only for pods
        if (resourceType === 'pod') {
          try {
            const metricsData = await getPodMetrics(clusterId, namespace, name, '1h');

            // Parse and store current metrics
            if (metricsData.cpu && metricsData.cpu.length > 0) {
              const cpuData = metricsData.cpu.map(item => ({
                time: new Date(item.value[0] * 1000).toLocaleTimeString(),
                value: (parseFloat(item.value[1]) * 100).toFixed(2)
              }));
              setMetricsHistory(prev => ({ ...prev, cpu: cpuData }));
              setCurrentMetrics(prev => ({ ...prev, cpu: parseFloat(cpuData[cpuData.length - 1]?.value || 0) }));
            }

            if (metricsData.memory && metricsData.memory.length > 0) {
              const memData = metricsData.memory.map(item => ({
                time: new Date(item.value[0] * 1000).toLocaleTimeString(),
                value: (parseFloat(item.value[1]) / (1024 * 1024)).toFixed(2) // Convert to MB
              }));
              setMetricsHistory(prev => ({ ...prev, memory: memData }));
              setCurrentMetrics(prev => ({ ...prev, memory: parseFloat(memData[memData.length - 1]?.value || 0) }));
            }

            // Network metrics
            if (metricsData.network_receive && metricsData.network_receive.length > 0) {
              const networkData = metricsData.network_receive.map((item, idx) => ({
                time: new Date(item.value[0] * 1000).toLocaleTimeString(),
                receive: (parseFloat(item.value[1]) / 1024).toFixed(2), // KB/s
                transmit: metricsData.network_transmit?.[idx]
                  ? (parseFloat(metricsData.network_transmit[idx].value[1]) / 1024).toFixed(2)
                  : 0
              }));
              setMetricsHistory(prev => ({ ...prev, network: networkData }));
            }

            // Disk I/O metrics
            if (metricsData.disk_read && metricsData.disk_read.length > 0) {
              const diskData = metricsData.disk_read.map((item, idx) => ({
                time: new Date(item.value[0] * 1000).toLocaleTimeString(),
                read: (parseFloat(item.value[1]) / 1024).toFixed(2), // KB/s
                write: metricsData.disk_write?.[idx]
                  ? (parseFloat(metricsData.disk_write[idx].value[1]) / 1024).toFixed(2)
                  : 0
              }));
              setMetricsHistory(prev => ({ ...prev, disk: diskData }));
            }

            // Restart count over time
            if (metricsData.restarts && metricsData.restarts.length > 0) {
              const restartsData = metricsData.restarts.map(item => ({
                time: new Date(item.value[0] * 1000).toLocaleTimeString(),
                count: parseFloat(item.value[1])
              }));
              setMetricsHistory(prev => ({ ...prev, restarts: restartsData }));
            }
          } catch (metricsError) {
            console.warn('Failed to fetch metrics:', metricsError);
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

  // Fetch pod logs function
  const fetchLogs = async () => {
    if (resourceType !== 'pod') return;

    setLogsLoading(true);
    try {
      const logsData = await getPodLogs(clusterId, namespace, name, 200);
      const logLines = logsData.logs || [];
      setLogs(logLines.filter(line => line.trim() !== '')); // Filter empty lines
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([`Error fetching logs: ${err.message}`]);
    } finally {
      setLogsLoading(false);
    }
  };

  // Fetch logs when switching to logs tab
  useEffect(() => {
    if (resourceType === 'pod' && activeTab === 'logs') {
      fetchLogs();
    }
  }, [clusterId, namespace, name, resourceType, activeTab]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current && activeTab === 'logs') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const getStatusText = () => {
    if (!resourceDetails) return 'Unknown';

    if (resourceType === 'pod') {
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
      'Pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      'Progressing': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      'Failed': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
      'Succeeded': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
  };

  // Prepare pie chart data for container distribution
  const containerDistribution = resourceDetails?.status?.containerStatuses?.map((container, index) => ({
    name: container.name,
    value: 1,
    color: ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'][index % 5]
  })) || [];

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
            {['overview', 'metrics', 'logs', 'yaml']
              .filter(tab => {
                // Only show metrics and logs tabs for pods
                if ((tab === 'metrics' || tab === 'logs') && resourceType !== 'pod') {
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
                        ? 'border-violet-500 text-violet-400'
                        : 'border-blue-500 text-blue-600'
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
            {/* Quick Stats */}
            {resourceType === 'pod' && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-violet-900/20 to-violet-800/10 border-violet-500/20' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'} rounded-xl border p-6`}>
                  <div className={`text-sm font-medium ${theme === 'dark' ? 'text-violet-400' : 'text-blue-600'} mb-2`}>CPU Usage</div>
                  <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {currentMetrics.cpu?.toFixed(1) || '0.0'}%
                  </div>
                  <div className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} mt-1`}>Current</div>
                </div>

                <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-green-900/20 to-green-800/10 border-green-500/20' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'} rounded-xl border p-6`}>
                  <div className={`text-sm font-medium ${theme === 'dark' ? 'text-green-400' : 'text-green-600'} mb-2`}>Memory</div>
                  <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {currentMetrics.memory?.toFixed(0) || '0'} MB
                  </div>
                  <div className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} mt-1`}>Current</div>
                </div>

                <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-blue-900/20 to-blue-800/10 border-blue-500/20' : 'bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200'} rounded-xl border p-6`}>
                  <div className={`text-sm font-medium ${theme === 'dark' ? 'text-blue-400' : 'text-cyan-600'} mb-2`}>Total Restarts</div>
                  <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {resourceDetails.status.containerStatuses?.reduce((sum, c) => sum + (c.restartCount || 0), 0) || 0}
                  </div>
                  <div className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} mt-1`}>Lifetime</div>
                </div>

                <div className={`${theme === 'dark' ? 'bg-gradient-to-br from-amber-900/20 to-amber-800/10 border-amber-500/20' : 'bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200'} rounded-xl border p-6`}>
                  <div className={`text-sm font-medium ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'} mb-2`}>Containers</div>
                  <div className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {resourceDetails.status.containerStatuses?.filter(c => c.ready).length || 0}/
                    {resourceDetails.status.containerStatuses?.length || 0}
                  </div>
                  <div className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} mt-1`}>Ready</div>
                </div>
              </div>
            )}

            {/* Resource Details */}
            <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
              <div className="px-6 py-4 border-b border-slate-800">
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
                <div className="px-6 py-4 border-b border-slate-800">
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
                            <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} font-medium`}>Image:</span>
                            <div className={`mt-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'} font-mono text-xs break-all bg-slate-950 dark:bg-slate-950 p-2 rounded`}>
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
                <div className="px-6 py-4 border-b border-slate-800">
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
                <div className="px-6 py-4 border-b border-slate-800">
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
                <div className="px-6 py-4 border-b border-slate-800">
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
            {metricsHistory.cpu.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>CPU Usage Over Time</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last hour</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={metricsHistory.cpu}>
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
                      <Area type="monotone" dataKey="value" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorCpu)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Memory Metrics */}
            {metricsHistory.memory.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Memory Usage Over Time</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last hour</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={metricsHistory.memory}>
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
                      <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#colorMemory)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Network Metrics */}
            {metricsHistory.network.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Network Traffic</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last hour</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={metricsHistory.network}>
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
                      <Line type="monotone" dataKey="receive" stroke="#3b82f6" name="Receive" strokeWidth={2} />
                      <Line type="monotone" dataKey="transmit" stroke="#f59e0b" name="Transmit" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Disk I/O Metrics */}
            {metricsHistory.disk.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Disk I/O</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last hour</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={metricsHistory.disk}>
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
                      <Line type="monotone" dataKey="read" stroke="#8b5cf6" name="Read" strokeWidth={2} />
                      <Line type="monotone" dataKey="write" stroke="#ec4899" name="Write" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Restart Count Over Time */}
            {metricsHistory.restarts.length > 0 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Container Restarts Over Time</h2>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Last hour</p>
                </div>
                <div className="p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={metricsHistory.restarts}>
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
                      <Area type="stepAfter" dataKey="count" stroke="#ef4444" fillOpacity={1} fill="url(#colorRestarts)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Container Distribution Pie Chart */}
            {containerDistribution.length > 1 && (
              <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border`}>
                <div className="px-6 py-4 border-b border-slate-800">
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

            {metricsHistory.cpu.length === 0 && metricsHistory.memory.length === 0 && (
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

        {activeTab === 'yaml' && (
          <div className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} rounded-xl border overflow-hidden`}>
            <div className="px-6 py-4 border-b border-slate-800">
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

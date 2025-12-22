import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, AlertTriangle, Activity, Server, Box,
  Calendar, Clock, MapPin, Database, HardDrive, Cpu, MemoryStick,
  Network, RotateCw, Power, Trash2, Terminal, FileText, Tag
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const ResourceDetailPage = () => {
  const { clusterId, resourceType, namespace, name } = useParams();
  const navigate = useNavigate();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState('');
  const [metrics, setMetrics] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchResourceDetails();
    if (resourceType === 'pods') {
      fetchLogs();
      fetchMetrics();
    }
  }, [clusterId, resourceType, namespace, name]);

  const fetchResourceDetails = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `http://localhost:5003/api/clusters/${clusterId}/resources/${resourceType}/${namespace}/${name}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      setResource(data.resource);
    } catch (error) {
      console.error('Error fetching resource details:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `http://localhost:5003/api/clusters/${clusterId}/pods/${namespace}/${name}/logs`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      setLogs(data.logs || '');
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const fetchMetrics = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `http://localhost:5003/api/clusters/${clusterId}/pods/${namespace}/${name}/metrics`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      const data = await response.json();
      setMetrics(data.metrics || []);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  const handleAction = async (action) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `http://localhost:5003/api/clusters/${clusterId}/${resourceType}/${namespace}/${name}/${action}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      if (response.ok) {
        fetchResourceDetails();
      }
    } catch (error) {
      console.error(`Error performing ${action}:`, error);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Running': 'bg-emerald-500',
      'Pending': 'bg-yellow-500',
      'Failed': 'bg-red-500',
      'Succeeded': 'bg-blue-500',
      'Unknown': 'bg-gray-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading resource details...</p>
        </div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-400">Resource not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/dashboard/clusters')}
          className="flex items-center text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {resourceType}
        </button>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
              <Box className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{name}</h1>
              <p className="text-slate-400 mt-1">
                <span className="text-slate-500">Namespace:</span> {namespace}
              </p>
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${getStatusColor(resource.status)}`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 border-b border-slate-800">
        {['overview', 'yaml', 'alerts', 'vulnerabilities'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Status</p>
                  <p className="text-2xl font-bold text-white mt-1">{resource.status || 'Unknown'}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${getStatusColor(resource.status)}/10 flex items-center justify-center`}>
                  <Activity className={`w-6 h-6 ${getStatusColor(resource.status).replace('bg-', 'text-')}`} />
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Age</p>
                  <p className="text-2xl font-bold text-white mt-1">{resource.age || 'Unknown'}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Restarts</p>
                  <p className="text-2xl font-bold text-white mt-1">{resource.restarts || 0}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <RotateCw className="w-6 h-6 text-yellow-400" />
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Ready</p>
                  <p className="text-2xl font-bold text-white mt-1">{resource.ready || '0/0'}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Database className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Resource Info Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Details */}
            <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Details
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Namespace:</span>
                  <span className="text-white font-medium">{resource.namespace}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">UID:</span>
                  <span className="text-white font-mono text-sm">{resource.uid || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Node:</span>
                  <span className="text-white">{resource.node || 'Unknown'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Restart Policy:</span>
                  <span className="text-white">{resource.restartPolicy || 'Always'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400">Created:</span>
                  <span className="text-white">{resource.created || 'Unknown'}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">Uptime:</span>
                  <span className="text-white font-medium">{resource.uptime || 'Unknown'}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                <Power className="w-5 h-5 mr-2" />
                Actions
              </h3>
              <div className="space-y-3">
                <button
                  onClick={() => handleAction('restart')}
                  className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center"
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  Restart Pod
                </button>
                <button
                  onClick={() => {
                    fetchLogs();
                    setActiveTab('logs');
                  }}
                  className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center justify-center"
                >
                  <Terminal className="w-4 h-4 mr-2" />
                  Refresh Logs
                </button>
                <button
                  onClick={() => fetchMetrics()}
                  className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Refresh Metrics
                </button>
                <button
                  onClick={() => handleAction('delete')}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Pod
                </button>
              </div>
            </div>
          </div>

          {/* Resource Usage & Performance */}
          {resourceType === 'pods' && metrics.length > 0 && (
            <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-6 flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                Resource Usage & Performance
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* CPU Usage Chart */}
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-4">CPU Usage (Last Hour)</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={metrics}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="time"
                        stroke="#64748b"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke="#64748b"
                        style={{ fontSize: '12px' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="cpu"
                        stroke="#ef4444"
                        name="CPU Usage (%)"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Memory Usage Chart */}
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-4">Memory Usage (Last Hour)</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={metrics}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="time"
                        stroke="#64748b"
                        style={{ fontSize: '12px' }}
                      />
                      <YAxis
                        stroke="#64748b"
                        style={{ fontSize: '12px' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="memory"
                        stroke="#3b82f6"
                        name="Memory Usage (GB)"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Network I/O */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <Network className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{resource.networkIn || '0.01'}</p>
                  <p className="text-sm text-slate-400 mt-1">MB/s IN</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <Network className="w-6 h-6 text-green-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{resource.networkOut || '0.00'}</p>
                  <p className="text-sm text-slate-400 mt-1">MB/s OUT</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                  <Clock className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">{resource.uptime || '75'}</p>
                  <p className="text-sm text-slate-400 mt-1">Hours</p>
                </div>
              </div>
            </div>
          )}

          {/* Logs */}
          {resourceType === 'pods' && (
            <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center">
                  <Terminal className="w-5 h-5 mr-2" />
                  Logs (Last 100 lines)
                </h3>
                <button
                  onClick={fetchLogs}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center text-sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </button>
              </div>
              <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre className="text-emerald-400">{logs || 'No logs available'}</pre>
              </div>
            </div>
          )}

          {/* Labels */}
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <Tag className="w-5 h-5 mr-2" />
              Labels
            </h3>
            <div className="flex flex-wrap gap-2">
              {resource.labels && Object.entries(resource.labels).map(([key, value]) => (
                <span
                  key={key}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-sm border border-slate-700"
                >
                  <span className="text-slate-400">{key}:</span> {value}
                </span>
              ))}
              {(!resource.labels || Object.keys(resource.labels).length === 0) && (
                <p className="text-slate-400">No labels found</p>
              )}
            </div>
          </div>

          {/* Annotations */}
          <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Annotations
            </h3>
            <div className="space-y-2">
              {resource.annotations && Object.entries(resource.annotations).map(([key, value]) => (
                <div key={key} className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400 text-sm">{key}</span>
                  <span className="text-white text-sm font-mono">{value}</span>
                </div>
              ))}
              {(!resource.annotations || Object.keys(resource.annotations).length === 0) && (
                <p className="text-slate-400">No annotations found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'yaml' && (
        <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-6">
          <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm overflow-x-auto">
            <pre className="text-slate-300">
              {JSON.stringify(resource, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No active alerts for this resource</p>
        </div>
      )}

      {activeTab === 'vulnerabilities' && (
        <div className="bg-slate-900/50 backdrop-blur-xl rounded-xl border border-slate-800/50 p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Vulnerability scanning coming soon</p>
        </div>
      )}
    </div>
  );
};

export default ResourceDetailPage;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { getClusters } from '../services/api';
import {
  Search, Filter, RefreshCw, Server, Box, Database, Globe, HardDrive,
  Folder, ChevronRight, AlertCircle, CheckCircle, XCircle, Plus,
  MoreVertical, Settings, Eye, Trash2
} from 'lucide-react';

const ClustersPage = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState('');
  const [activeView, setActiveView] = useState('list'); // 'list' or 'table'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch clusters function
  const fetchClustersData = async () => {
    try {
      setLoading(true);
      setError(null);
      const clustersData = await getClusters();

      // Transform clusters data to match UI expectations
      const transformedClusters = (clustersData.clusters || []).map(cluster => ({
        _id: cluster.id || cluster._id,
        name: cluster.name || 'Unnamed Cluster',
        clusterType: cluster.clusterType || cluster.type || 'unknown',
        status: cluster.status || 'Unknown',
        health: cluster.health || 'Unknown',
        alerts: cluster.alerts || 0,
        unhealthyApps: cluster.unhealthyApps || 0,
        unhealthyNodes: cluster.unhealthyNodes || 0,
        k8sVersion: cluster.k8sVersion || cluster.version || 'Unknown',
        robusta: cluster.robusta || 'Unknown',
        integrations: cluster.integrations || [],
        connection: cluster.connection || cluster.status || 'Unknown',
        lastSeen: cluster.lastSeen || 'Unknown',
        apps: cluster.apps || 0,
        nodes: cluster.nodes || 0,
        jobs: cluster.jobs || 0
      }));

      setClusters(transformedClusters);
      if (transformedClusters.length > 0) {
        setSelectedCluster(transformedClusters[0]._id);
      }
    } catch (err) {
      console.error('Failed to fetch clusters:', err);
      setError('Failed to load clusters. Please try again.');
      setClusters([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch clusters on mount
  useEffect(() => {
    fetchClustersData();
  }, []);

  const handleRefresh = () => {
    fetchClustersData();
  };

  const stats = {
    total: clusters.length,
    connected: clusters.filter(c => c.status === 'Connected').length,
    unhealthyApps: clusters.reduce((sum, c) => sum + (c.unhealthyApps || 0), 0),
    unhealthyNodes: clusters.reduce((sum, c) => sum + (c.unhealthyNodes || 0), 0),
    disconnected: clusters.filter(c => c.status === 'Disconnected').length,
  };

  const getStatusBadge = (status) => {
    const styles = {
      'Connected': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      'Disconnected': 'bg-red-500/10 text-red-400 border-red-500/30',
      'Pending': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    };
    return styles[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/30';
  };

  const handleNewCluster = () => {
    // Navigate to onboarding or cluster setup
    navigate('/onboarding');
  };

  const handleClusterClick = (cluster) => {
    // Navigate to cluster details or apps view
    navigate(`/dashboard`);
  };

  const filteredClusters = clusters.filter(cluster => {
    const matchesSearch = cluster.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || cluster.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className={`flex-1 overflow-y-auto p-6 ${theme === 'dark' ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Clusters</h1>
          <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Manage your Kubernetes clusters</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-200'} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-200'}`}>
            <Settings className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} />
          </button>
          <button
            onClick={handleNewCluster}
            className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
              theme === 'dark'
                ? 'bg-violet-600 hover:bg-violet-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Plus className="w-5 h-5" />
            <span>New Cluster</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        {/* All Clusters */}
        <div className={`backdrop-blur-xl rounded-xl border p-6 transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>All Clusters</h3>
            <div className={`p-1 rounded ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'}`}>
              <Server className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} />
            </div>
          </div>
          <div className={`text-3xl font-bold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{stats.total}</div>
        </div>

        {/* Connected */}
        <div className={`backdrop-blur-xl rounded-xl border-2 border-emerald-500/30 p-6 hover:border-emerald-500/50 transition-all cursor-pointer ${
          theme === 'dark' ? 'bg-slate-900/50' : 'bg-emerald-50'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-700'}`}>Connected</h3>
            <div className="p-1 bg-emerald-500/10 rounded">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-emerald-400 mb-1">{stats.connected}</div>
        </div>

        {/* With Unhealthy Apps */}
        <div className={`backdrop-blur-xl rounded-xl border p-6 transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>With Unhealthy Apps</h3>
            <div className="p-1 bg-red-500/10 rounded">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-red-400 mb-1">{stats.unhealthyApps}</div>
        </div>

        {/* With Unhealthy Nodes */}
        <div className={`backdrop-blur-xl rounded-xl border p-6 transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>With Unhealthy Nodes</h3>
            <div className="p-1 bg-red-500/10 rounded">
              <XCircle className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-red-400 mb-1">{stats.unhealthyNodes}</div>
        </div>

        {/* Disconnected */}
        <div className={`backdrop-blur-xl rounded-xl border p-6 transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-slate-900/50 border-slate-800/50 hover:border-slate-700'
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Disconnected</h3>
            <div className="p-1 bg-orange-500/10 rounded">
              <AlertCircle className="w-4 h-4 text-orange-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-orange-400 mb-1">{stats.disconnected}</div>
        </div>
      </div>

      {/* Filters and Actions Bar */}
      <div className={`backdrop-blur-xl rounded-xl border p-4 mb-6 ${
        theme === 'dark'
          ? 'bg-slate-900/50 border-slate-800/50'
          : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            {/* Filters Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors text-sm ${
                theme === 'dark'
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </button>

            {/* Health Status Filter */}
            <div className="flex items-center space-x-2 text-sm">
              <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Health Status</span>
              <div className="flex items-center space-x-1">
                <button className={`px-3 py-1.5 rounded-lg transition-colors ${
                  theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}>
                  All
                </button>
              </div>
            </div>

            {/* Integrations Filter */}
            <div className="flex items-center space-x-2 text-sm">
              <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Integrations</span>
            </div>

            {/* K8s Version Filter */}
            <div className="flex items-center space-x-2 text-sm">
              <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>K8s version</span>
            </div>

            {/* Robusta Version Filter */}
            <div className="flex items-center space-x-2 text-sm">
              <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Robusta version</span>
            </div>

            {/* Connection Status Filter */}
            <div className="flex items-center space-x-2 text-sm">
              <div className="flex items-center px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <span className="text-emerald-400 mr-2">Connected</span>
                <button className={`${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>×</button>
              </div>
            </div>

            {/* Clear All */}
            <button className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
              Clear All
            </button>
          </div>

          {/* Search */}
          <div className="relative w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type / to search"
              className={`w-full border rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`} />
          </div>
        </div>
      </div>

      {/* Clusters Count and Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
          <span className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{filteredClusters.length}</span> Clusters
        </div>
        <div className="flex items-center space-x-2">
          <button className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-200'}`}>
            <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
          <button className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-200'}`}>
            <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-200'}`}>
            <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={handleNewCluster}
            className="flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm ml-2"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Cluster
          </button>
        </div>
      </div>

      {/* Clusters Table */}
      {filteredClusters.length === 0 ? (
        <div className={`backdrop-blur-xl rounded-xl border p-12 text-center ${
          theme === 'dark'
            ? 'bg-slate-900/50 border-slate-800/50'
            : 'bg-white border-gray-200'
        }`}>
          <Server className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`} />
          <h3 className={`text-xl font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>No Clusters Found</h3>
          <p className={`mb-6 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Get started by connecting your first Kubernetes cluster</p>
          <button
            onClick={handleNewCluster}
            className="inline-flex items-center px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Connect New Cluster
          </button>
        </div>
      ) : (
        <div className={`backdrop-blur-xl rounded-xl border overflow-hidden ${
          theme === 'dark'
            ? 'bg-slate-900/50 border-slate-800/50'
            : 'bg-white border-gray-200'
        }`}>
          <table className="w-full">
            <thead className={`border-b ${
              theme === 'dark'
                ? 'bg-slate-800/50 border-slate-700'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <tr>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Name
                </th>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Alerts
                </th>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Apps
                </th>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Nodes
                </th>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Jobs
                </th>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Integrations
                </th>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  K8s
                </th>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Robusta
                </th>
                <th className={`px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Connection
                </th>
                <th className={`px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider ${
                  theme === 'dark' ? 'text-slate-400' : 'text-gray-600'
                }`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${theme === 'dark' ? 'divide-slate-800' : 'divide-gray-200'}`}>
              {filteredClusters.map((cluster) => (
                <tr
                  key={cluster._id}
                  onClick={() => handleClusterClick(cluster)}
                  className={`cursor-pointer transition-colors ${
                    theme === 'dark' ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Server className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{cluster.name}</div>
                        <div className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>{cluster.clusterType}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{cluster.alerts}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{cluster.apps}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{cluster.nodes}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{cluster.jobs}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-1">
                      {cluster.integrations.map((integration, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-1 text-xs rounded ${
                            theme === 'dark'
                              ? 'bg-slate-800 text-slate-300'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                          title={integration}
                        >
                          {integration.charAt(0)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{cluster.k8sVersion}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${getStatusBadge('Connected')}`}>
                      {cluster.robusta}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border ${getStatusBadge(cluster.status)}`}>
                        {cluster.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className={`p-1 rounded transition-colors ${
                          theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-200'
                        }`}
                        title="View Details"
                      >
                        <Eye className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className={`p-1 rounded transition-colors ${
                          theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-200'
                        }`}
                        title="Settings"
                      >
                        <Settings className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className={`p-1 rounded transition-colors ${
                          theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-200'
                        }`}
                        title="More"
                      >
                        <MoreVertical className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ClustersPage;

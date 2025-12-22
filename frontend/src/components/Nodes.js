import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getClusters, getNodes, getNodeMetrics, calculateAge } from '../services/api';

const Nodes = () => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [selectedCluster, setSelectedCluster] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [clusters, setClusters] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [nodeMetrics, setNodeMetrics] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch clusters on component mount
  useEffect(() => {
    const fetchClusters = async () => {
      try {
        const data = await getClusters();
        setClusters(data.clusters || []);

        // Auto-select first cluster if available
        if (data.clusters && data.clusters.length > 0) {
          setSelectedCluster(data.clusters[0]._id || data.clusters[0].id);
        }
      } catch (err) {
        console.error('Error fetching clusters:', err);
        setError('Failed to load clusters');
      }
    };

    fetchClusters();
  }, []);

  // Fetch nodes when cluster is selected
  useEffect(() => {
    if (!selectedCluster) {
      setNodes([]);
      return;
    }

    const fetchNodes = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getNodes(selectedCluster);
        setNodes(data.nodes || []);

        // Fetch metrics for each node
        if (data.nodes && data.nodes.length > 0) {
          fetchMetricsForNodes(data.nodes);
        }
      } catch (err) {
        console.error('Error fetching nodes:', err);
        setError('Failed to load nodes');
        setNodes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNodes();
  }, [selectedCluster]);

  // Fetch metrics for all nodes
  const fetchMetricsForNodes = async (nodesList) => {
    const metricsPromises = nodesList.map(async (node) => {
      try {
        const metrics = await getNodeMetrics(selectedCluster, node.name, '1h');
        return { nodeName: node.name, metrics };
      } catch (err) {
        console.error(`Error fetching metrics for node ${node.name}:`, err);
        return { nodeName: node.name, metrics: null };
      }
    });

    const metricsResults = await Promise.all(metricsPromises);
    const metricsMap = {};
    metricsResults.forEach(({ nodeName, metrics }) => {
      metricsMap[nodeName] = metrics;
    });
    setNodeMetrics(metricsMap);
  };

  // Filter nodes based on search query and preset
  const filteredNodes = nodes.filter((node) => {
    const matchesSearch = !searchQuery ||
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.internal_ip?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesPreset = !selectedPreset || (() => {
      const metrics = nodeMetrics[node.name];
      const cpuPercent = metrics?.current?.cpu_percent || 0;
      const memoryPercent = metrics?.current?.memory_percent || 0;

      switch (selectedPreset) {
        case 'high-cpu':
          return cpuPercent > 70;
        case 'high-memory':
          return memoryPercent > 70;
        case 'unhealthy':
          return node.status !== 'Ready';
        case 'critical-alerts':
          return false; // TODO: implement alerts
        default:
          return true;
      }
    })();

    return matchesSearch && matchesPreset;
  });

  // Format memory size from bytes
  const formatMemory = (bytes) => {
    if (!bytes) return 'N/A';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  // Get status badge color
  const getStatusColor = (status) => {
    if (status === 'Ready') {
      return theme === 'dark'
        ? 'bg-green-900 text-green-300'
        : 'bg-green-100 text-green-800';
    }
    return theme === 'dark'
      ? 'bg-red-900 text-red-300'
      : 'bg-red-100 text-red-800';
  };

  // Get metric color based on percentage
  const getMetricColor = (percent) => {
    if (percent >= 80) return 'text-red-500';
    if (percent >= 60) return 'text-yellow-500';
    return theme === 'dark' ? 'text-green-400' : 'text-green-600';
  };

  const handleExport = (format) => {
    console.log(`Exporting as ${format}`);
    setShowExportMenu(false);
  };

  // Get selected cluster name
  const getClusterName = () => {
    const cluster = clusters.find(c => (c._id || c.id) === selectedCluster);
    return cluster?.name || 'Unknown';
  };

  return (
    <div className={`h-full ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Filters and Search Bar */}
      <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} p-4`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            {/* Presets Dropdown */}
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${
                theme === 'dark'
                  ? 'bg-[#1a1a2e] border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all`}
            >
              <option value="">All Nodes</option>
              <option value="high-cpu">High CPU Usage (&gt;70%)</option>
              <option value="high-memory">High Memory Usage (&gt;70%)</option>
              <option value="unhealthy">Unhealthy Nodes</option>
            </select>

            {/* Cluster Dropdown */}
            <select
              value={selectedCluster}
              onChange={(e) => setSelectedCluster(e.target.value)}
              disabled={clusters.length === 0}
              className={`px-4 py-2 rounded-lg border ${
                theme === 'dark'
                  ? 'bg-[#1a1a2e] border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all disabled:opacity-50`}
            >
              {clusters.length === 0 ? (
                <option value="">No Clusters Available</option>
              ) : (
                <>
                  <option value="">Select Cluster</option>
                  {clusters.map((cluster) => (
                    <option key={cluster._id || cluster.id} value={cluster._id || cluster.id}>
                      {cluster.name} ({cluster.clusterType})
                    </option>
                  ))}
                </>
              )}
            </select>

            {/* Search Bar */}
            <div className="flex-1 relative">
              <svg className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or IP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-[#1a1a2e] border-gray-700 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>
          </div>

          {/* Export Button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={filteredNodes.length === 0}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Export Dropdown Menu */}
            {showExportMenu && (
              <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg ${
                theme === 'dark' ? 'bg-[#1a1a2e] border border-gray-700' : 'bg-white border border-gray-200'
              } z-10`}>
                <div className="py-1">
                  <button
                    onClick={() => handleExport('csv')}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}
                  >
                    Export as CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}
                  >
                    Export as PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg text-red-500">
            {error}
          </div>
        )}

        {loading ? (
          <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg border ${
            theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
          } p-12`}>
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4"></div>
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                Loading nodes...
              </p>
            </div>
          </div>
        ) : !selectedCluster ? (
          <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg border ${
            theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
          } p-12`}>
            <div className="text-center">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
              } mb-4`}>
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Select a Cluster
              </h3>
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                Please select a cluster from the dropdown above to view nodes
              </p>
            </div>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg border ${
            theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
          } p-12`}>
            <div className="text-center">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
              } mb-4`}>
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                No Nodes Found
              </h3>
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                {searchQuery || selectedPreset
                  ? 'No nodes match your search criteria'
                  : 'No nodes available in this cluster'}
              </p>
            </div>
          </div>
        ) : (
          <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg border ${
            theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
          } overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}>
                  <tr>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Name
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Cluster
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Age
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Status
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Roles
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Internal IP
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      External IP
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Pods
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Taints
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      CPU (%)
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      CPU Capacity
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Memory (%)
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Memory Capacity
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      OS / Kernel
                    </th>
                  </tr>
                </thead>
                <tbody className={`${theme === 'dark' ? 'divide-gray-800' : 'divide-gray-200'} divide-y`}>
                  {filteredNodes.map((node) => {
                    const metrics = nodeMetrics[node.name];
                    const cpuPercent = metrics?.current?.cpu_percent || 0;
                    const memoryPercent = metrics?.current?.memory_percent || 0;

                    return (
                      <tr key={node.name} className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                          {node.name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {getClusterName()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {calculateAge(node.age)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(node.status)}`}>
                            {node.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {Array.isArray(node.roles) ? node.roles.join(', ') : node.roles}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-xs">
                          {node.internal_ip || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-xs">
                          {node.external_ip || '<none>'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className="px-2 py-1 rounded bg-blue-500 bg-opacity-20 text-blue-400 text-xs">
                            {node.pod_count} / {node.capacity?.pods || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {node.taints && node.taints.length > 0 ? (
                            <span className="px-2 py-1 rounded bg-yellow-500 bg-opacity-20 text-yellow-400 text-xs">
                              {node.taints.length}
                            </span>
                          ) : (
                            <span className={theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}>
                              None
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`font-medium ${getMetricColor(cpuPercent)}`}>
                            {cpuPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {node.capacity?.cpu || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`font-medium ${getMetricColor(memoryPercent)}`}>
                            {memoryPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {node.capacity?.memory || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="max-w-xs truncate">
                            {node.node_info?.os_image || 'N/A'}
                            <br />
                            <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                              {node.node_info?.kernel_version || 'N/A'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className={`px-4 py-3 border-t ${
              theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="flex items-center justify-between text-sm">
                <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  Showing {filteredNodes.length} of {nodes.length} nodes
                </span>
                <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                  Total Pods: {filteredNodes.reduce((sum, node) => sum + (node.pod_count || 0), 0)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Nodes;

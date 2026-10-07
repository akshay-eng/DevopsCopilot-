import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useSelector } from 'react-redux';
import { backendApi } from '../services/api';
import ForceGraph3D from 'react-force-graph-3d';
import ForceGraph2D from 'react-force-graph-2d';
import * as THREE from 'three';

const ClusterVisualization = () => {
  const { theme } = useTheme();

  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [selectedResourceType, setSelectedResourceType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTraffic, setShowTraffic] = useState(true);
  const [namespaces, setNamespaces] = useState([]);

  // Stats
  const [stats, setStats] = useState({
    totalServices: 0,
    totalPods: 0,
    totalConnections: 0,
    healthyNodes: 0,
    unhealthyNodes: 0
  });

  const [viewMode, setViewMode] = useState('3d'); // '3d' or '2d'
  const [layoutType, setLayoutType] = useState('force'); // 'force', 'hierarchical'
  const [highlightedNode, setHighlightedNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const graphRef = useRef();

  // Fetch clusters on mount
  useEffect(() => {
    const fetchClusters = async () => {
      try {
        console.log('📡 Fetching clusters...');
        // backendApi.get returns the JSON data directly, not wrapped in response.data
        const data = await backendApi.get('/api/clusters');
        console.log('✅ Clusters data received:', data);
        console.log('Data type:', typeof data);
        console.log('Clusters array:', data?.clusters);
        console.log('Clusters length:', data?.clusters?.length);

        if (data && data.clusters && data.clusters.length > 0) {
          console.log('✅ Setting clusters:', data.clusters);
          setClusters(data.clusters);

          // Auto-select first cluster
          const firstCluster = data.clusters[0];
          const clusterId = firstCluster._id || firstCluster.id;
          console.log('✅ Auto-selecting first cluster:', clusterId, firstCluster.name);
          setSelectedCluster(clusterId);
        } else {
          console.log('⚠️ No clusters found in response');
          console.log('Condition check:', {
            hasData: !!data,
            hasClusters: !!data?.clusters,
            clustersLength: data?.clusters?.length
          });
          setError('No clusters found. Please add a cluster first.');
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ Error fetching clusters:', err);
        setError('Failed to load clusters: ' + err.message);
        setLoading(false);
      }
    };

    fetchClusters();
  }, []);

  // Resource type icons and colors
  const resourceConfig = {
    service: {
      color: '#8b5cf6',
      icon: '🔷',
      label: 'Service',
      size: 8
    },
    deployment: {
      color: '#3b82f6',
      icon: '📦',
      label: 'Deployment',
      size: 7
    },
    pod: {
      color: '#10b981',
      icon: '🟢',
      label: 'Pod',
      size: 5
    },
    statefulset: {
      color: '#f59e0b',
      icon: '📊',
      label: 'StatefulSet',
      size: 7
    },
    daemonset: {
      color: '#ef4444',
      icon: '⚡',
      label: 'DaemonSet',
      size: 7
    },
    ingress: {
      color: '#ec4899',
      icon: '🌐',
      label: 'Ingress',
      size: 6
    },
    configmap: {
      color: '#6366f1',
      icon: '⚙️',
      label: 'ConfigMap',
      size: 4
    },
    secret: {
      color: '#8b5cf6',
      icon: '🔐',
      label: 'Secret',
      size: 4
    }
  };

  // Fetch cluster topology data
  const fetchTopologyData = useCallback(async () => {
    if (!selectedCluster) {
      console.log('❌ No cluster selected');
      return;
    }

    console.log('🔄 Fetching topology for cluster:', selectedCluster);
    setLoading(true);
    setError(null);

    try {
      // Fetch cluster topology using the new endpoint
      console.log('📡 Making API call to:', `/api/clusters/${selectedCluster}/topology`);
      // backendApi.get returns the JSON data directly, not wrapped in response.data
      const data = await backendApi.get(`/api/clusters/${selectedCluster}/topology`);
      console.log('✅ Topology data received:', data);

      if (!data || !data.nodes || !data.links) {
        throw new Error('Invalid topology data received');
      }

      const { nodes: topologyNodes, links: topologyLinks } = data;

      // Extract unique namespaces
      const nsSet = new Set();
      topologyNodes.forEach(node => {
        if (node.namespace) nsSet.add(node.namespace);
      });
      setNamespaces(['all', ...Array.from(nsSet).sort()]);

      // Convert topology nodes to graph nodes with proper status mapping
      const nodes = topologyNodes.map(node => ({
        id: node.id,
        name: node.name,
        namespace: node.namespace,
        type: node.type,
        status: node.status?.toLowerCase() || 'healthy',
        labels: node.labels || {},
        annotations: node.annotations || {}
      }));

      // Use the links from topology
      const links = topologyLinks.map(link => ({
        source: link.source,
        target: link.target,
        type: link.type || 'dependency'
      }));

      setGraphData({ nodes, links });

      // Calculate stats
      const serviceNodes = nodes.filter(n => n.type === 'service');
      const podNodes = nodes.filter(n => n.type === 'pod');
      const healthyCount = nodes.filter(n => n.status === 'healthy').length;
      const unhealthyCount = nodes.filter(n => n.status === 'unhealthy').length;

      setStats({
        totalServices: serviceNodes.length,
        totalPods: podNodes.length,
        totalConnections: links.length,
        healthyNodes: healthyCount,
        unhealthyNodes: unhealthyCount
      });

    } catch (err) {
      console.error('❌ Error fetching topology:', err);
      console.error('Error details:', {
        message: err.message
      });
      setError('Failed to load cluster topology: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCluster]);

  useEffect(() => {
    fetchTopologyData();
  }, [fetchTopologyData]);

  // Filter graph data
  const filteredGraphData = React.useMemo(() => {
    let filteredNodes = graphData.nodes;

    // Filter by namespace
    if (selectedNamespace !== 'all') {
      filteredNodes = filteredNodes.filter(n => n.namespace === selectedNamespace);
    }

    // Filter by resource type
    if (selectedResourceType !== 'all') {
      filteredNodes = filteredNodes.filter(n => n.resourceType === selectedResourceType);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(n =>
        n.name.toLowerCase().includes(query) ||
        n.namespace.toLowerCase().includes(query)
      );
    }

    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = graphData.links.filter(l =>
      filteredNodeIds.has(l.source.id || l.source) &&
      filteredNodeIds.has(l.target.id || l.target)
    );

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graphData, selectedNamespace, selectedResourceType, searchQuery]);

  // 3D Graph node rendering
  const nodeThreeObject = useCallback((node) => {
    const config = resourceConfig[node.type] || resourceConfig.pod;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(generateNodeTexture(node, config)),
        transparent: true
      })
    );
    sprite.scale.set(config.size * 2, config.size * 2);

    // Add glow for highlighted/selected nodes
    if (node === highlightedNode || node === selectedNode) {
      const glowSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(generateGlowTexture()),
          transparent: true,
          opacity: 0.5
        })
      );
      glowSprite.scale.set(config.size * 3, config.size * 3);
      sprite.add(glowSprite);
    }

    return sprite;
  }, [highlightedNode, selectedNode]);

  // Generate node texture
  const generateNodeTexture = (node, config) => {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Background circle
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, config.color);
    gradient.addColorStop(1, adjustColorBrightness(config.color, -30));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 10, 0, 2 * Math.PI);
    ctx.fill();

    // Border
    ctx.strokeStyle = node.status === 'healthy' ? '#10b981' : '#f59e0b';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Icon
    ctx.font = 'bold 100px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(config.icon, size/2, size/2);

    return canvas;
  };

  // Generate glow texture
  const generateGlowTexture = () => {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)');
    gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    return canvas;
  };

  // Adjust color brightness
  const adjustColorBrightness = (hex, percent) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255))
      .toString(16).slice(1);
  };

  // Link rendering with traffic animation
  const linkThreeObject = useCallback((link) => {
    if (!showTraffic) return null;

    const material = new THREE.LineBasicMaterial({
      color: link.type === 'http' ? 0xec4899 :
             link.type === 'targets' ? 0x3b82f6 : 0x8b5cf6,
      opacity: 0.6,
      transparent: true,
      linewidth: 2
    });

    return material;
  }, [showTraffic]);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  const handleNodeHover = useCallback((node) => {
    setHighlightedNode(node);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // Reset view
  const handleResetView = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400);
    }
  };

  // Focus on selected node
  const handleFocusNode = (node) => {
    if (graphRef.current && node) {
      const distance = 200;
      const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
      graphRef.current.cameraPosition(
        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
        node,
        3000
      );
    }
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-40 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Cluster Visualization
                </h1>
                <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                  Interactive service dependency and network topology
                </p>
              </div>

              {/* Cluster Selector */}
              {clusters.length > 0 && (
                <div className="flex items-center space-x-2">
                  <label className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                    Cluster:
                  </label>
                  <select
                    value={selectedCluster || ''}
                    onChange={(e) => setSelectedCluster(e.target.value)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      theme === 'dark'
                        ? 'bg-slate-800 border-slate-600 text-white focus:border-violet-500'
                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500'
                    } focus:outline-none focus:ring-2 ${
                      theme === 'dark' ? 'focus:ring-violet-500/50' : 'focus:ring-blue-500/50'
                    }`}
                  >
                    {clusters.map((cluster) => (
                      <option key={cluster._id} value={cluster._id}>
                        {cluster.name} ({cluster.clusterType})
                      </option>
                    ))}
                  </select>
                  <div className={`flex items-center space-x-1 px-3 py-2 rounded-lg ${
                    theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      clusters.find(c => c._id === selectedCluster)?.status === 'connected'
                        ? 'bg-green-500'
                        : clusters.find(c => c._id === selectedCluster)?.status === 'pending'
                        ? 'bg-yellow-500'
                        : 'bg-gray-400'
                    } animate-pulse`}></div>
                    <span className={`text-xs font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                      {clusters.find(c => c._id === selectedCluster)?.status || 'unknown'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {/* View Mode Toggle */}
              <div className={`flex rounded-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'} p-1`}>
                <button
                  onClick={() => setViewMode('3d')}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    viewMode === '3d'
                      ? theme === 'dark'
                        ? 'bg-violet-600 text-white'
                        : 'bg-blue-600 text-white'
                      : theme === 'dark'
                      ? 'text-slate-400 hover:text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  3D View
                </button>
                <button
                  onClick={() => setViewMode('2d')}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    viewMode === '2d'
                      ? theme === 'dark'
                        ? 'bg-violet-600 text-white'
                        : 'bg-blue-600 text-white'
                      : theme === 'dark'
                      ? 'text-slate-400 hover:text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  2D View
                </button>
              </div>

              <button
                onClick={handleResetView}
                className={`px-4 py-2 rounded font-medium border transition-colors ${
                  theme === 'dark'
                    ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Reset View
              </button>

              <button
                onClick={fetchTopologyData}
                disabled={loading}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-violet-600 hover:bg-violet-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-5 gap-4">
            <div className={`px-4 py-3 rounded-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'}`}>
              <div className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Services</div>
              <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {stats.totalServices}
              </div>
            </div>
            <div className={`px-4 py-3 rounded-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'}`}>
              <div className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Pods</div>
              <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {stats.totalPods}
              </div>
            </div>
            <div className={`px-4 py-3 rounded-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'}`}>
              <div className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Connections</div>
              <div className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {stats.totalConnections}
              </div>
            </div>
            <div className={`px-4 py-3 rounded-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'}`}>
              <div className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Healthy</div>
              <div className="text-2xl font-bold text-green-500">{stats.healthyNodes}</div>
            </div>
            <div className={`px-4 py-3 rounded-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'}`}>
              <div className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Issues</div>
              <div className="text-2xl font-bold text-yellow-500">{stats.unhealthyNodes}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-220px)]">
        {/* Sidebar - Filters */}
        <div className={`w-80 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-r p-6 overflow-y-auto`}>
          <h3 className={`text-lg font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Filters
          </h3>

          {/* Search */}
          <div className="mb-6">
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resources..."
              className={`w-full px-3 py-2 rounded border ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } focus:outline-none focus:ring-2 ${
                theme === 'dark' ? 'focus:ring-violet-500' : 'focus:ring-blue-500'
              }`}
            />
          </div>

          {/* Namespace Filter */}
          <div className="mb-6">
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
              Namespace
            </label>
            <select
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-lg border transition-all ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-600 text-white hover:border-violet-500'
                  : 'bg-white border-gray-300 text-gray-900 hover:border-blue-500'
              } focus:outline-none focus:ring-2 ${
                theme === 'dark' ? 'focus:ring-violet-500 focus:border-violet-500' : 'focus:ring-blue-500 focus:border-blue-500'
              } cursor-pointer`}
            >
              {namespaces.map(ns => (
                <option key={ns} value={ns} className={theme === 'dark' ? 'bg-slate-800' : 'bg-white'}>
                  {ns === 'all' ? '📁 All Namespaces' : `📂 ${ns}`}
                </option>
              ))}
            </select>
          </div>

          {/* Resource Type Filter */}
          <div className="mb-6">
            <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
              Resource Type
            </label>
            <select
              value={selectedResourceType}
              onChange={(e) => setSelectedResourceType(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-lg border transition-all ${
                theme === 'dark'
                  ? 'bg-slate-800 border-slate-600 text-white hover:border-violet-500'
                  : 'bg-white border-gray-300 text-gray-900 hover:border-blue-500'
              } focus:outline-none focus:ring-2 ${
                theme === 'dark' ? 'focus:ring-violet-500 focus:border-violet-500' : 'focus:ring-blue-500 focus:border-blue-500'
              } cursor-pointer`}
            >
              <option value="all" className={theme === 'dark' ? 'bg-slate-800' : 'bg-white'}>✨ All Types</option>
              {Object.entries(resourceConfig).map(([key, config]) => (
                <option key={key} value={key} className={theme === 'dark' ? 'bg-slate-800' : 'bg-white'}>
                  {config.icon} {config.label}
                </option>
              ))}
            </select>
          </div>

          {/* Traffic Toggle */}
          <div className="mb-6">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTraffic}
                onChange={(e) => setShowTraffic(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-violet-500 focus:ring-violet-500"
              />
              <span className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                Show Traffic Flow
              </span>
            </label>
          </div>

          {/* Legend */}
          <div className="pt-6 border-t border-slate-700">
            <h4 className={`text-sm font-medium mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Legend
            </h4>
            <div className="space-y-2">
              {Object.entries(resourceConfig).map(([key, config]) => (
                <div key={key} className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                    {config.icon} {config.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-700 space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-0.5 bg-pink-500" />
                <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                  HTTP Traffic
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-0.5 bg-blue-500" />
                <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                  Service Target
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-0.5 bg-purple-500" />
                <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                  Dependency
                </span>
              </div>
            </div>
          </div>

          {/* Selected Node Info */}
          {selectedNode && (
            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Selected Node
                </h4>
                <button
                  onClick={() => setSelectedNode(null)}
                  className={`text-sm ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Clear
                </button>
              </div>
              <div className={`p-3 rounded ${theme === 'dark' ? 'bg-slate-800' : 'bg-gray-100'}`}>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-xl">{resourceConfig[selectedNode.type]?.icon}</span>
                  <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {selectedNode.name}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>
                    <span className="font-medium">Namespace:</span> {selectedNode.namespace}
                  </div>
                  <div className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>
                    <span className="font-medium">Type:</span> {selectedNode.resourceType}
                  </div>
                  <div className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>
                    <span className="font-medium">Status:</span>{' '}
                    <span className={selectedNode.status === 'healthy' ? 'text-green-500' : 'text-yellow-500'}>
                      {selectedNode.status}
                    </span>
                  </div>
                  {selectedNode.replicas && (
                    <div className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>
                      <span className="font-medium">Replicas:</span> {selectedNode.replicas}
                    </div>
                  )}
                  {selectedNode.ports && (
                    <div className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>
                      <span className="font-medium">Ports:</span> {selectedNode.ports}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleFocusNode(selectedNode)}
                  className={`mt-3 w-full px-3 py-1.5 rounded text-xs font-medium ${
                    theme === 'dark'
                      ? 'bg-violet-600 hover:bg-violet-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  Focus on Node
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Graph Area */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4"></div>
                <p className="text-white">Loading cluster topology...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-500 font-medium">{error}</p>
                <button
                  onClick={fetchTopologyData}
                  className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && filteredGraphData.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className={`font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                  No resources found
                </p>
                <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                  Try adjusting your filters or select a different cluster
                </p>
              </div>
            </div>
          )}

          {!loading && !error && filteredGraphData.nodes.length > 0 && (
            <>
              {viewMode === '3d' ? (
                <ForceGraph3D
                  ref={graphRef}
                  graphData={filteredGraphData}
                  nodeLabel={(node) => `
                    <div style="background: rgba(0,0,0,0.9); padding: 8px; border-radius: 4px; font-size: 12px;">
                      <div style="font-weight: bold; margin-bottom: 4px;">${node.name}</div>
                      <div style="color: #9ca3af;">Namespace: ${node.namespace}</div>
                      <div style="color: #9ca3af;">Type: ${node.type}</div>
                      <div style="color: ${node.status === 'healthy' ? '#10b981' : '#f59e0b'};">
                        Status: ${node.status}
                      </div>
                    </div>
                  `}
                  nodeThreeObject={nodeThreeObject}
                  nodeThreeObjectExtend={true}
                  linkColor={(link) =>
                    link.type === 'http' ? '#ec4899' :
                    link.type === 'targets' ? '#3b82f6' : '#8b5cf6'
                  }
                  linkWidth={2}
                  linkOpacity={0.6}
                  linkDirectionalParticles={showTraffic ? 2 : 0}
                  linkDirectionalParticleWidth={2}
                  linkDirectionalParticleSpeed={0.005}
                  linkDirectionalParticleColor={(link) =>
                    link.type === 'http' ? '#ec4899' :
                    link.type === 'targets' ? '#3b82f6' : '#8b5cf6'
                  }
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  onBackgroundClick={handleBackgroundClick}
                  backgroundColor={theme === 'dark' ? '#0a0a0f' : '#f9fafb'}
                  enableNodeDrag={true}
                  enableNavigationControls={true}
                  showNavInfo={false}
                  d3VelocityDecay={0.3}
                />
              ) : (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={filteredGraphData}
                  nodeLabel={(node) => `${node.name} (${node.type})`}
                  nodeColor={(node) => resourceConfig[node.type]?.color || '#10b981'}
                  nodeRelSize={6}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.name;
                    const fontSize = 12 / globalScale;
                    const config = resourceConfig[node.type] || resourceConfig.pod;

                    // Draw node circle
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, config.size, 0, 2 * Math.PI);
                    ctx.fillStyle = config.color;
                    ctx.fill();

                    // Draw status border
                    ctx.strokeStyle = node.status === 'healthy' ? '#10b981' : '#f59e0b';
                    ctx.lineWidth = 2 / globalScale;
                    ctx.stroke();

                    // Draw icon
                    ctx.font = `${14 / globalScale}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(config.icon, node.x, node.y);

                    // Draw label
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = theme === 'dark' ? '#e5e7eb' : '#374151';
                    ctx.fillText(label, node.x, node.y + config.size + 2);
                  }}
                  linkColor={(link) =>
                    link.type === 'http' ? '#ec4899' :
                    link.type === 'targets' ? '#3b82f6' : '#8b5cf6'
                  }
                  linkWidth={2}
                  linkDirectionalParticles={showTraffic ? 2 : 0}
                  linkDirectionalParticleWidth={2}
                  linkDirectionalParticleSpeed={0.005}
                  linkDirectionalParticleColor={(link) =>
                    link.type === 'http' ? '#ec4899' :
                    link.type === 'targets' ? '#3b82f6' : '#8b5cf6'
                  }
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  onBackgroundClick={handleBackgroundClick}
                  backgroundColor={theme === 'dark' ? '#0a0a0f' : '#f9fafb'}
                  enableNodeDrag={true}
                  enableZoomInteraction={true}
                  enablePanInteraction={true}
                  d3VelocityDecay={0.3}
                  cooldownTicks={100}
                  onEngineStop={() => {
                    // Zoom to fit all nodes in view after layout stabilizes
                    if (graphRef.current) {
                      graphRef.current.zoomToFit(400, 50);
                    }
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusterVisualization;

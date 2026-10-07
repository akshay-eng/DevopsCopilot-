import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Copy, Check, Search, X, ChevronDown, ChevronRight, Rocket, Trash2, Eye, RefreshCw, ExternalLink, Server, Cpu, Clock, Activity, ArrowLeft, Terminal, Wifi, HardDrive, BarChart3, Wrench } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import mcpCatalog, { mcpCategories } from '../../data/mcpCatalog';
import { getClusters } from '../../services/api';
import { backendApi } from '../../services/api';

const MCPCatalog = () => {
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState('catalog');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedServer, setSelectedServer] = useState(null);
    const [expandedTools, setExpandedTools] = useState({});
    const [copiedId, setCopiedId] = useState(null);

    // Deploy state
    const [clusters, setClusters] = useState([]);
    const [selectedCluster, setSelectedCluster] = useState('');
    const [envVarValues, setEnvVarValues] = useState({});
    const [deploying, setDeploying] = useState(false);
    const [deployError, setDeployError] = useState(null);
    const [deploySuccess, setDeploySuccess] = useState(null);
    const [namespace, setNamespace] = useState('mcp-servers');

    // Running instances state
    const [deployments, setDeployments] = useState([]);
    const [loadingDeployments, setLoadingDeployments] = useState(false);
    const [selectedDeployment, setSelectedDeployment] = useState(null);
    const [showConfigModal, setShowConfigModal] = useState(false);

    // Instance detail state
    const [viewingInstance, setViewingInstance] = useState(null);
    const [instanceMetrics, setInstanceMetrics] = useState(null);
    const [metricsHistory, setMetricsHistory] = useState([]);
    const [instanceLogs, setInstanceLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [detailTab, setDetailTab] = useState('overview');
    const [metricsRange, setMetricsRange] = useState('1h');
    const [historyLoading, setHistoryLoading] = useState(false);
    const [liveTools, setLiveTools] = useState([]);
    const [toolsLoading, setToolsLoading] = useState(false);
    const [toolsError, setToolsError] = useState(null);
    const logsEndRef = useRef(null);

    const isDark = theme === 'dark';

    // Fetch clusters on mount
    useEffect(() => {
        const fetchClusters = async () => {
            try {
                const data = await getClusters();
                setClusters(data.clusters || []);
                if (data.clusters?.length > 0) {
                    setSelectedCluster(data.clusters[0]._id);
                }
            } catch (err) {
                console.error('Failed to fetch clusters:', err);
            }
        };
        fetchClusters();
    }, []);

    // Fetch deployments when switching to instances tab
    const fetchDeployments = useCallback(async () => {
        setLoadingDeployments(true);
        try {
            const data = await backendApi.get('/api/mcp-catalog/deployments');
            setDeployments(data.deployments || []);
        } catch (err) {
            console.error('Failed to fetch MCP deployments:', err);
        } finally {
            setLoadingDeployments(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'instances') {
            fetchDeployments();
            const interval = setInterval(fetchDeployments, 10000);
            return () => clearInterval(interval);
        }
    }, [activeTab, fetchDeployments]);

    // Fetch live metrics (for current cards)
    const fetchInstanceMetrics = useCallback(async (dep) => {
        try {
            const data = await backendApi.get(`/api/mcp-catalog/deployments/${dep._id}/metrics`);
            setInstanceMetrics(data);
        } catch (err) { console.error('Metrics fetch error:', err); }
    }, []);

    // Fetch historical metrics from DB
    const fetchMetricsHistory = useCallback(async (dep, range) => {
        setHistoryLoading(true);
        try {
            const data = await backendApi.get(`/api/mcp-catalog/deployments/${dep._id}/metrics/history?range=${range}`);
            const points = (data.points || []).map(p => {
                const d = new Date(p.timestamp);
                let time;
                if (range === '1h' || range === '6h') {
                    time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                } else if (range === '24h') {
                    time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
                } else {
                    time = `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}`;
                }
                return { time, cpu: p.cpu || 0, memory: p.memory || 0, rxMB: p.rxMB || 0, txMB: p.txMB || 0 };
            });
            setMetricsHistory(points);
        } catch (err) { console.error('History fetch error:', err); }
        setHistoryLoading(false);
    }, []);

    const fetchInstanceLogs = useCallback(async (dep) => {
        setLogsLoading(true);
        try {
            const data = await backendApi.get(`/api/mcp-catalog/deployments/${dep._id}/logs`);
            setInstanceLogs(data.lines || []);
        } catch (err) { console.error('Logs fetch error:', err); }
        setLogsLoading(false);
    }, []);

    const fetchMcpTools = useCallback(async (dep) => {
        setToolsLoading(true);
        setToolsError(null);
        try {
            const data = await backendApi.get(`/api/mcp-catalog/deployments/${dep._id}/tools`);
            setLiveTools(data.tools || []);
        } catch (err) {
            console.error('Tools fetch error:', err);
            setToolsError(err.message || 'Failed to fetch tools from MCP server');
            setLiveTools([]);
        }
        setToolsLoading(false);
    }, []);

    // Fetch tools when tools tab is selected
    useEffect(() => {
        if (detailTab === 'tools' && viewingInstance && viewingInstance.status === 'running') {
            fetchMcpTools(viewingInstance);
        }
    }, [detailTab, viewingInstance, fetchMcpTools]);

    // Fetch live metrics on interval, history on mount and range change
    useEffect(() => {
        if (!viewingInstance) return;
        fetchInstanceMetrics(viewingInstance);
        fetchInstanceLogs(viewingInstance);
        fetchMetricsHistory(viewingInstance, metricsRange);
        const metricsInterval = setInterval(() => fetchInstanceMetrics(viewingInstance), 10000);
        const logsInterval = setInterval(() => fetchInstanceLogs(viewingInstance), 10000);
        const historyInterval = setInterval(() => fetchMetricsHistory(viewingInstance, metricsRange), 60000);
        return () => { clearInterval(metricsInterval); clearInterval(logsInterval); clearInterval(historyInterval); };
    }, [viewingInstance, metricsRange, fetchInstanceMetrics, fetchInstanceLogs, fetchMetricsHistory]);

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [instanceLogs]);

    const openInstanceDetail = (dep) => {
        setViewingInstance(dep);
        setMetricsHistory([]);
        setInstanceMetrics(null);
        setInstanceLogs([]);
        setDetailTab('overview');
        setMetricsRange('1h');
    };

    const closeInstanceDetail = () => {
        setViewingInstance(null);
        setInstanceMetrics(null);
        setMetricsHistory([]);
        setInstanceLogs([]);
    };

    // Initialize env var values when selecting a server
    useEffect(() => {
        if (selectedServer) {
            const defaults = {};
            (selectedServer.configParams || []).forEach(cp => {
                defaults[cp.name] = '';
            });
            setEnvVarValues(defaults);
            setDeployError(null);
            setDeploySuccess(null);
        }
    }, [selectedServer]);

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredServers = mcpCatalog.filter(server => {
        const matchesSearch = server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            server.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            server.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCategory = selectedCategory === 'All' || server.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const handleDeploy = async () => {
        if (!selectedCluster) {
            setDeployError('Please select a cluster');
            return;
        }
        // Validate required config params
        const missing = (selectedServer.configParams || [])
            .filter(cp => cp.required && !envVarValues[cp.name])
            .map(cp => cp.label || cp.name);
        if (missing.length > 0) {
            setDeployError(`Missing required configuration: ${missing.join(', ')}`);
            return;
        }

        setDeploying(true);
        setDeployError(null);
        setDeploySuccess(null);

        try {
            const result = await backendApi.post('/api/mcp-catalog/deploy', {
                mcpServerId: selectedServer.id,
                clusterId: selectedCluster,
                name: selectedServer.name.toLowerCase().replace(/\s+/g, '-'),
                namespace,
                image: selectedServer.image,
                port: selectedServer.port,
                envVars: envVarValues,
                deployMethod: selectedServer.deployMethod || 'docker',
                transportArgs: selectedServer.transportArgs || [],
                stdioCmd: selectedServer.stdioCmd || '',
                helmChart: selectedServer.helmChart || '',
                helmRepo: selectedServer.helmRepo || '',
                helmRepoUrl: selectedServer.helmRepoUrl || '',
                helmValues: selectedServer.helmValues || {},
                requiresRBAC: selectedServer.requiresRBAC || false,
            });

            setDeploySuccess(result);
            setActiveTab('instances');
            setSelectedServer(null);
            fetchDeployments();
        } catch (err) {
            setDeployError(err.message || 'Deployment failed');
        } finally {
            setDeploying(false);
        }
    };

    const handleDelete = async (deploymentId) => {
        if (!window.confirm('Are you sure you want to stop and delete this MCP server?')) return;
        try {
            await backendApi.delete(`/api/mcp-catalog/deployments/${deploymentId}`);
            // Refresh to show terminating state, then poll until gone
            fetchDeployments();
            const pollUntilGone = setInterval(async () => {
                const data = await backendApi.get('/api/mcp-catalog/deployments');
                const deps = data.deployments || [];
                setDeployments(deps);
                const still = deps.find(d => d._id === deploymentId);
                if (!still) {
                    clearInterval(pollUntilGone);
                    if (selectedDeployment?._id === deploymentId) setSelectedDeployment(null);
                }
            }, 3000);
            // Stop polling after 90s max
            setTimeout(() => clearInterval(pollUntilGone), 90000);
        } catch (err) {
            console.error('Failed to delete deployment:', err);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'running': return 'text-green-400';
            case 'pending': return 'text-yellow-400';
            case 'failed': return 'text-red-400';
            case 'stopped': return 'text-gray-400';
            case 'terminating': return 'text-orange-400';
            default: return 'text-gray-400';
        }
    };

    const getStatusBg = (status) => {
        switch (status) {
            case 'running': return isDark ? 'bg-green-500/10 border-green-500/30' : 'bg-green-50 border-green-200';
            case 'pending': return isDark ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-yellow-50 border-yellow-200';
            case 'failed': return isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200';
            case 'terminating': return isDark ? 'bg-orange-500/10 border-orange-500/30' : 'bg-orange-50 border-orange-200';
            default: return isDark ? 'bg-gray-500/10 border-gray-500/30' : 'bg-gray-50 border-gray-200';
        }
    };

    const generateSSEConfig = (deployment) => {
        const sseUrl = deployment.sseUrl || `http://${deployment.name}.${deployment.namespace}.svc.cluster.local:${deployment.port}/sse`;
        return JSON.stringify({
            mcpServers: {
                [deployment.name]: {
                    url: sseUrl,
                    transport: 'sse',
                }
            }
        }, null, 2);
    };

    // ===================== RENDER =====================

    const cardClass = `rounded-xl border ${isDark ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'}`;
    const inputClass = `w-full px-3 py-2 rounded-lg text-sm border ${isDark ? 'bg-[#0a0a0f] border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-2 focus:ring-purple-500/50`;

    return (
        <div className={`min-h-screen ${isDark ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'} overflow-y-auto`}>
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center">
                            <Server className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">MCP Catalog</h1>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                Deploy and manage Model Context Protocol servers on your cluster
                            </p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className={`flex gap-1 p-1 rounded-lg mb-6 ${isDark ? 'bg-[#13131f]' : 'bg-gray-100'}`}>
                    {[
                        { id: 'catalog', label: 'Catalog', icon: Search },
                        { id: 'instances', label: 'Running Instances', icon: Activity },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setSelectedServer(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium rounded-md transition-all ${activeTab === tab.id
                                ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/25'
                                : isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ============ CATALOG TAB ============ */}
                {activeTab === 'catalog' && !selectedServer && (
                    <>
                        {/* Search & Filter */}
                        <div className="flex flex-col sm:flex-row gap-3 mb-6">
                            <div className="relative flex-1">
                                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                                <input
                                    type="text"
                                    placeholder="Search MCP servers..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className={`${inputClass} pl-10`}
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <X className="w-4 h-4 text-gray-400" />
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {mcpCategories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${selectedCategory === cat
                                            ? 'bg-purple-500 text-white'
                                            : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Server Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredServers.map(server => (
                                <button
                                    key={server.id}
                                    onClick={() => setSelectedServer(server)}
                                    className={`${cardClass} p-5 text-left hover:shadow-lg transition-all hover:scale-[1.02] group`}
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{server.icon}</span>
                                            <div>
                                                <h3 className="font-semibold text-base">{server.name}</h3>
                                                <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>v{server.version} · {server.author}</span>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                                            {server.category}
                                        </span>
                                    </div>
                                    <p className={`text-sm mb-3 line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                        {server.description}
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`flex items-center gap-1 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                            <Cpu className="w-3 h-3" /> {server.tools.length} tools
                                        </span>
                                        {server.tags.slice(0, 3).map(tag => (
                                            <span key={tag} className={`px-1.5 py-0.5 text-xs rounded ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {filteredServers.length === 0 && (
                            <div className={`text-center py-16 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p className="text-lg font-medium">No MCP servers found</p>
                                <p className="text-sm">Try adjusting your search or filter</p>
                            </div>
                        )}
                    </>
                )}

                {/* ============ SERVER DETAIL / DEPLOY ============ */}
                {activeTab === 'catalog' && selectedServer && (
                    <div>
                        <button
                            onClick={() => setSelectedServer(null)}
                            className={`flex items-center gap-2 text-sm mb-4 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
                        >
                            ← Back to Catalog
                        </button>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left: Details */}
                            <div className="lg:col-span-2 space-y-5">
                                {/* Header card */}
                                <div className={cardClass + ' p-6'}>
                                    <div className="flex items-center gap-4 mb-4">
                                        <span className="text-4xl">{selectedServer.icon}</span>
                                        <div>
                                            <h2 className="text-2xl font-bold">{selectedServer.name}</h2>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>v{selectedServer.version}</span>
                                                <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>by {selectedServer.author}</span>
                                                <span className={`px-2 py-0.5 text-xs rounded-full ${isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                                                    {selectedServer.category}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{selectedServer.description}</p>
                                    <div className="flex gap-2 mt-3">
                                        {selectedServer.tags.map(tag => (
                                            <span key={tag} className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    <div className={`mt-4 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                        Image: <code className={`px-1.5 py-0.5 rounded ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>{selectedServer.image}</code>
                                    </div>
                                </div>

                                {/* Tools */}
                                <div className={cardClass + ' p-6'}>
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <Cpu className="w-5 h-5 text-purple-400" /> Available Tools
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                                            {selectedServer.tools.length}
                                        </span>
                                    </h3>
                                    <div className="space-y-3">
                                        {selectedServer.tools.map((tool, idx) => (
                                            <div key={idx} className={`rounded-lg border ${isDark ? 'border-gray-700 bg-[#0a0a0f]' : 'border-gray-200 bg-gray-50'}`}>
                                                <button
                                                    onClick={() => setExpandedTools(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                                    className="w-full p-3 flex items-center justify-between text-left"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <code className={`px-2 py-0.5 rounded text-sm font-mono ${isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                                                            {tool.name}
                                                        </code>
                                                        <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{tool.description}</span>
                                                    </div>
                                                    {expandedTools[idx] ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                                </button>

                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Right: Deploy panel */}
                            <div className="space-y-5">
                                <div className={cardClass + ' p-6 sticky top-6'}>
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <Rocket className="w-5 h-5 text-purple-400" /> Deploy
                                    </h3>

                                    {/* Cluster selector */}
                                    <div className="mb-4">
                                        <label className={`text-xs font-medium mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Cluster</label>
                                        {clusters.length > 0 ? (
                                            <select
                                                value={selectedCluster}
                                                onChange={(e) => setSelectedCluster(e.target.value)}
                                                className={inputClass}
                                            >
                                                {clusters.map(c => (
                                                    <option key={c._id} value={c._id}>{c.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <p className={`text-sm ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>No clusters connected. Connect a cluster first.</p>
                                        )}
                                    </div>

                                    {/* Namespace */}
                                    <div className="mb-4">
                                        <label className={`text-xs font-medium mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Namespace</label>
                                        <input
                                            type="text"
                                            value={namespace}
                                            onChange={(e) => setNamespace(e.target.value)}
                                            className={inputClass}
                                        />
                                    </div>

                                    {/* Config Params */}
                                    {(selectedServer.configParams || []).length > 0 && (
                                        <div className="mb-4">
                                            <label className={`text-xs font-medium mb-2 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Configuration</label>
                                            <div className="space-y-3">
                                                {selectedServer.configParams.map(cp => (
                                                    <div key={cp.name}>
                                                        <div className="flex items-center gap-1 mb-1">
                                                            <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{cp.label || cp.name}</span>
                                                            {cp.required && <span className="text-red-400 text-xs">*</span>}
                                                        </div>
                                                        <input
                                                            type={cp.type === 'password' ? 'password' : 'text'}
                                                            placeholder={cp.placeholder || ''}
                                                            value={envVarValues[cp.name] || ''}
                                                            onChange={(e) => setEnvVarValues(prev => ({ ...prev, [cp.name]: e.target.value }))}
                                                            className={inputClass}
                                                        />
                                                        {cp.description && (
                                                            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{cp.description}</p>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {(selectedServer.configParams || []).length === 0 && (
                                        <div className={`p-3 rounded-lg mb-4 text-sm ${isDark ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                            No configuration needed — uses in-cluster credentials.
                                        </div>
                                    )}

                                    {deployError && (
                                        <div className={`p-3 rounded-lg mb-4 text-sm ${isDark ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                            {deployError}
                                        </div>
                                    )}

                                    {deploySuccess && (
                                        <div className={`p-3 rounded-lg mb-4 text-sm ${isDark ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                                            Deployed successfully! Check the Running Instances tab.
                                        </div>
                                    )}

                                    <button
                                        onClick={handleDeploy}
                                        disabled={deploying || clusters.length === 0}
                                        className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${deploying || clusters.length === 0
                                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-purple-500 to-violet-600 text-white hover:from-purple-600 hover:to-violet-700 shadow-lg shadow-purple-500/25'
                                            }`}
                                    >
                                        {deploying ? (
                                            <><RefreshCw className="w-4 h-4 animate-spin" /> Deploying...</>
                                        ) : (
                                            <><Rocket className="w-4 h-4" /> Deploy to Cluster</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ RUNNING INSTANCES TAB ============ */}
                {activeTab === 'instances' && !viewingInstance && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold">Running MCP Servers</h2>
                            <button
                                onClick={fetchDeployments}
                                className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                            >
                                <RefreshCw className={`w-4 h-4 ${loadingDeployments ? 'animate-spin' : ''}`} /> Refresh
                            </button>
                        </div>

                        {loadingDeployments && deployments.length === 0 ? (
                            <div className={`${cardClass} p-12 text-center`}>
                                <RefreshCw className={`w-8 h-8 mx-auto mb-3 animate-spin ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
                                <p className={isDark ? 'text-gray-500' : 'text-gray-400'}>Loading deployments...</p>
                            </div>
                        ) : deployments.length === 0 ? (
                            <div className={`${cardClass} p-12 text-center`}>
                                <Server className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-gray-700' : 'text-gray-300'}`} />
                                <p className={`text-lg font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No MCP servers running</p>
                                <p className={`text-sm ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Deploy a server from the Catalog tab to get started</p>
                                <button onClick={() => setActiveTab('catalog')} className="mt-4 px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-600 text-white text-sm font-medium rounded-lg hover:from-purple-600 hover:to-violet-700 transition-all">
                                    Browse Catalog
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {deployments.map(dep => {
                                    const catalogEntry = mcpCatalog.find(s => s.id === dep.mcpServerId);
                                    return (
                                        <button key={dep._id} onClick={() => openInstanceDetail(dep)} className={`${cardClass} p-5 w-full text-left hover:shadow-lg transition-all hover:scale-[1.005] group`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <span className="text-2xl">{catalogEntry?.icon || '🔌'}</span>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-semibold">{dep.name}</h3>
                                                            <span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusBg(dep.status)} ${getStatusColor(dep.status)}`}>● {dep.status}</span>
                                                        </div>
                                                        <div className={`flex items-center gap-3 text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                            <span className="flex items-center gap-1"><Server className="w-3 h-3" />{dep.namespace}</span>
                                                            <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{dep.image}</span>
                                                            {dep.podName && <span className="flex items-center gap-1"><Activity className="w-3 h-3" />Pod: {dep.podName}</span>}
                                                            {dep.createdAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(dep.createdAt).toLocaleDateString()} {new Date(dep.createdAt).toLocaleTimeString()}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${isDark ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}><BarChart3 className="w-3.5 h-3.5" /> View Details</span>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(dep._id); }} disabled={dep.status === 'terminating'} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${dep.status === 'terminating' ? 'opacity-50 cursor-not-allowed' : ''} ${isDark ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
                                                        <Trash2 className="w-3.5 h-3.5" /> {dep.status === 'terminating' ? 'Terminating...' : 'Delete'}
                                                    </button>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ============ INSTANCE DETAIL VIEW ============ */}
                {activeTab === 'instances' && viewingInstance && (() => {
                    const catalogEntry = mcpCatalog.find(s => s.id === viewingInstance.mcpServerId);
                    const sseUrl = viewingInstance.sseUrl || `http://${viewingInstance.name}.${viewingInstance.namespace}.svc.cluster.local:${viewingInstance.port}/sse`;
                    const chartTooltipStyle = { backgroundColor: isDark ? '#1a1a2e' : '#fff', border: `1px solid ${isDark ? '#333' : '#e5e7eb'}`, borderRadius: '8px', fontSize: '12px', color: isDark ? '#e5e7eb' : '#374151' };
                    return (
                        <div>
                            <button onClick={closeInstanceDetail} className={`flex items-center gap-2 text-sm mb-4 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'} transition-colors`}>
                                <ArrowLeft className="w-4 h-4" /> Back to Running Instances
                            </button>

                            {/* Header */}
                            <div className={`${cardClass} p-6 mb-5`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="text-4xl">{catalogEntry?.icon || '🔌'}</span>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <h2 className="text-2xl font-bold">{viewingInstance.name}</h2>
                                                <span className={`px-2.5 py-1 text-xs rounded-full border ${getStatusBg(viewingInstance.status)} ${getStatusColor(viewingInstance.status)}`}>● {viewingInstance.status}</span>
                                            </div>
                                            <div className={`flex items-center gap-3 text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                <span>Namespace: {viewingInstance.namespace}</span>
                                                <span>Pod: {instanceMetrics?.podName || viewingInstance.podName || '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => { setSelectedDeployment(viewingInstance); setShowConfigModal(true); }} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDark ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
                                        <ExternalLink className="w-4 h-4" /> SSE Config
                                    </button>
                                </div>
                                {/* Endpoint */}
                                <div className={`mt-4 p-3 rounded-lg ${isDark ? 'bg-[#0a0a0f] border border-gray-800' : 'bg-gray-50 border border-gray-200'}`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className={`text-xs font-medium ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>SSE Endpoint</span>
                                            <code className={`block text-sm mt-0.5 ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{sseUrl}</code>
                                        </div>
                                        <button onClick={() => handleCopy(sseUrl, 'detail-sse')} className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'}`}>
                                            {copiedId === 'detail-sse' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Detail Tabs */}
                            <div className={`flex gap-1 p-1 rounded-lg mb-5 ${isDark ? 'bg-[#13131f]' : 'bg-gray-100'}`}>
                                {[{ id: 'overview', label: 'Metrics', icon: Activity }, { id: 'tools', label: `Tools${liveTools.length ? ` (${liveTools.length})` : ''}`, icon: Wrench }, { id: 'logs', label: 'Logs', icon: Terminal }].map(tab => (
                                    <button key={tab.id} onClick={() => setDetailTab(tab.id)}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium rounded-md transition-all ${detailTab === tab.id
                                            ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/25'
                                            : isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}>
                                        <tab.icon className="w-4 h-4" />{tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Metrics Tab */}
                            {detailTab === 'overview' && (
                                <div className="space-y-5">
                                    {/* Metric Cards */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { label: 'CPU Usage', value: `${instanceMetrics?.cpu?.millicores?.toFixed(1) || '0'}m`, sub: `${instanceMetrics?.cpu?.percent?.toFixed(1) || '0'}%`, icon: Cpu, color: 'from-blue-500 to-cyan-500', bg: isDark ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200' },
                                            { label: 'Memory', value: `${instanceMetrics?.memory?.usageMi?.toFixed(1) || '0'} Mi`, sub: `${instanceMetrics?.memory?.percent?.toFixed(1) || '0'}%`, icon: HardDrive, color: 'from-violet-500 to-purple-500', bg: isDark ? 'bg-violet-500/10 border-violet-500/30' : 'bg-violet-50 border-violet-200' },
                                            { label: 'Network RX', value: `${instanceMetrics?.network?.rxMB?.toFixed(2) || '0'} MB`, sub: 'Received', icon: Wifi, color: 'from-emerald-500 to-green-500', bg: isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200' },
                                            { label: 'Network TX', value: `${instanceMetrics?.network?.txMB?.toFixed(2) || '0'} MB`, sub: 'Transmitted', icon: Wifi, color: 'from-orange-500 to-amber-500', bg: isDark ? 'bg-orange-500/10 border-orange-500/30' : 'bg-orange-50 border-orange-200' },
                                        ].map((m, i) => (
                                            <div key={i} className={`rounded-xl border p-4 ${m.bg}`}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${m.color} flex items-center justify-center`}><m.icon className="w-4 h-4 text-white" /></div>
                                                    <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{m.label}</span>
                                                </div>
                                                <p className="text-xl font-bold">{m.value}</p>
                                                <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{m.sub}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Time Range Selector */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1">
                                            {['1h', '6h', '24h', '7d', '30d'].map(r => (
                                                <button key={r} onClick={() => setMetricsRange(r)}
                                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${metricsRange === r
                                                        ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/25'
                                                        : isDark ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {historyLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />}
                                            <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{metricsHistory.length} data points</span>
                                        </div>
                                    </div>

                                    {/* Charts */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                        <div className={`${cardClass} p-5`}>
                                            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}><Cpu className="w-4 h-4 text-blue-400" /> CPU Usage (%)</h3>
                                            <ResponsiveContainer width="100%" height={200}>
                                                <AreaChart data={metricsHistory}>
                                                    <defs><linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#e5e7eb'} />
                                                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} interval="preserveStartEnd" />
                                                    <YAxis tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} domain={[0, 100]} />
                                                    <Tooltip contentStyle={chartTooltipStyle} />
                                                    <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fillOpacity={1} fill="url(#cpuGrad)" strokeWidth={2} dot={false} name="CPU %" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className={`${cardClass} p-5`}>
                                            <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}><HardDrive className="w-4 h-4 text-violet-400" /> Memory Usage (%)</h3>
                                            <ResponsiveContainer width="100%" height={200}>
                                                <AreaChart data={metricsHistory}>
                                                    <defs><linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#e5e7eb'} />
                                                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} interval="preserveStartEnd" />
                                                    <YAxis tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} domain={[0, 100]} />
                                                    <Tooltip contentStyle={chartTooltipStyle} />
                                                    <Area type="monotone" dataKey="memory" stroke="#8b5cf6" fillOpacity={1} fill="url(#memGrad)" strokeWidth={2} dot={false} name="Memory %" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Network Chart */}
                                    <div className={`${cardClass} p-5`}>
                                        <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}><Wifi className="w-4 h-4 text-emerald-400" /> Network I/O (MB)</h3>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <AreaChart data={metricsHistory}>
                                                <defs>
                                                    <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                                                    <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#e5e7eb'} />
                                                <XAxis dataKey="time" tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} interval="preserveStartEnd" />
                                                <YAxis tick={{ fontSize: 10, fill: isDark ? '#6b7280' : '#9ca3af' }} />
                                                <Tooltip contentStyle={chartTooltipStyle} />
                                                <Area type="monotone" dataKey="rxMB" stroke="#10b981" fillOpacity={1} fill="url(#rxGrad)" strokeWidth={2} dot={false} name="RX (MB)" />
                                                <Area type="monotone" dataKey="txMB" stroke="#f59e0b" fillOpacity={1} fill="url(#txGrad)" strokeWidth={2} dot={false} name="TX (MB)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Tools Tab */}
                            {detailTab === 'tools' && (
                                <div className="space-y-4">
                                    {toolsLoading ? (
                                        <div className={`${cardClass} p-8 text-center`}>
                                            <RefreshCw className={`w-8 h-8 mx-auto mb-3 animate-spin text-purple-400`} />
                                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Connecting to MCP server and fetching tools...</p>
                                        </div>
                                    ) : toolsError ? (
                                        <div className={`${cardClass} p-6`}>
                                            <div className={`p-4 rounded-lg mb-4 ${isDark ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-50 border border-red-200'}`}>
                                                <p className={`text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>{toolsError}</p>
                                            </div>
                                            <button onClick={() => fetchMcpTools(viewingInstance)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDark ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
                                                <RefreshCw className="w-4 h-4" /> Retry
                                            </button>
                                        </div>
                                    ) : liveTools.length > 0 ? (
                                        <div className={`${cardClass} p-5`}>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    <Wrench className="w-4 h-4 text-purple-400" /> Available Tools
                                                    <span className={`ml-1 px-1.5 py-0.5 text-[10px] rounded ${isDark ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600'}`}>LIVE</span>
                                                </h3>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 text-xs rounded-full ${isDark ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' : 'bg-purple-50 text-purple-600 border border-purple-200'}`}>
                                                        {liveTools.length} tools
                                                    </span>
                                                    <button onClick={() => fetchMcpTools(viewingInstance)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`} title="Refresh tools">
                                                        <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                {liveTools.map((tool, i) => (
                                                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${isDark ? 'bg-[#0a0a0f] border border-gray-800' : 'bg-gray-50 border border-gray-200'}`}>
                                                        <div className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-purple-500/10' : 'bg-purple-50'}`}>
                                                            <Wrench className="w-3.5 h-3.5 text-purple-400" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <code className={`text-sm font-medium ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{tool.name}</code>
                                                            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{tool.description}</p>
                                                            {tool.inputSchema?.properties && (
                                                                <div className={`mt-2 flex flex-wrap gap-1`}>
                                                                    {Object.keys(tool.inputSchema.properties).map(param => (
                                                                        <span key={param} className={`px-1.5 py-0.5 text-[10px] rounded font-mono ${isDark ? 'bg-gray-800 text-gray-400 border border-gray-700' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                                                                            {param}{tool.inputSchema.required?.includes(param) ? '*' : ''}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={`${cardClass} p-8 text-center`}>
                                            <Wrench className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-gray-700' : 'text-gray-300'}`} />
                                            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No tools found on this MCP server</p>
                                            <button onClick={() => fetchMcpTools(viewingInstance)} className={`mt-3 flex items-center gap-2 mx-auto px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDark ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
                                                <RefreshCw className="w-4 h-4" /> Retry
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Logs Tab */}
                            {detailTab === 'logs' && (
                                <div className={`${cardClass} p-0 overflow-hidden`}>
                                    <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-gray-800 bg-[#0d0d18]' : 'border-gray-200 bg-gray-50'}`}>
                                        <h3 className="text-sm font-semibold flex items-center gap-2"><Terminal className="w-4 h-4 text-green-400" /> Pod Logs</h3>
                                        <div className="flex items-center gap-2">
                                            {logsLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-500" />}
                                            <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{instanceLogs.length} lines · refreshes every 10s</span>
                                            <button onClick={() => fetchInstanceLogs(viewingInstance)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}><RefreshCw className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                    <div className={`overflow-y-auto font-mono text-xs leading-5 p-4 ${isDark ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'}`} style={{ maxHeight: '480px', minHeight: '300px' }}>
                                        {instanceLogs.length === 0 ? (
                                            <p className="text-gray-600 italic">No logs available yet...</p>
                                        ) : instanceLogs.map((line, i) => (
                                            <div key={i} className="hover:bg-white/5 px-1 rounded">
                                                <span className="text-gray-600 select-none mr-3">{String(i + 1).padStart(4)}</span>
                                                <span>{line}</span>
                                            </div>
                                        ))}
                                        <div ref={logsEndRef} />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* ============ CONFIG MODAL ============ */}
                {showConfigModal && selectedDeployment && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowConfigModal(false)}>
                        <div className={`max-w-lg w-full mx-4 rounded-2xl border shadow-2xl ${isDark ? 'bg-[#13131f] border-gray-800' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()}>
                            <div className={`flex items-center justify-between p-5 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                                <div>
                                    <h3 className="text-lg font-semibold">SSE Connection Config</h3>
                                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Use this configuration to connect your AI client to the deployed MCP server</p>
                                </div>
                                <button onClick={() => setShowConfigModal(false)}>
                                    <X className={`w-5 h-5 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`} />
                                </button>
                            </div>
                            <div className="p-5 space-y-4">
                                <div>
                                    <label className={`text-xs font-medium mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>SSE Endpoint</label>
                                    <div className="flex items-center gap-2">
                                        <code className={`flex-1 px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-[#0a0a0f] text-purple-400' : 'bg-gray-100 text-purple-700'}`}>
                                            {selectedDeployment.sseUrl || `http://${selectedDeployment.name}.${selectedDeployment.namespace}.svc.cluster.local:${selectedDeployment.port}/sse`}
                                        </code>
                                        <button
                                            onClick={() => handleCopy(selectedDeployment.sseUrl || `http://${selectedDeployment.name}.${selectedDeployment.namespace}.svc.cluster.local:${selectedDeployment.port}/sse`, 'sse-url')}
                                            className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'}`}
                                        >
                                            {copiedId === 'sse-url' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Cursor Config */}
                                <div>
                                    <label className={`text-xs font-medium mb-1 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Cursor / Claude Desktop Config</label>
                                    <div className="relative">
                                        <pre className={`p-4 rounded-lg text-sm overflow-x-auto ${isDark ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'}`}>
                                            <code>{generateSSEConfig(selectedDeployment)}</code>
                                        </pre>
                                        <button
                                            onClick={() => handleCopy(generateSSEConfig(selectedDeployment), 'config-json')}
                                            className={`absolute top-2 right-2 p-2 rounded transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                                        >
                                            {copiedId === 'config-json' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-300" />}
                                        </button>
                                    </div>
                                </div>

                                <div className={`p-3 rounded-lg border text-sm ${isDark ? 'border-blue-800 bg-blue-500/10 text-blue-400' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                                    <p className="flex items-center gap-2">
                                        <ExternalLink className="w-4 h-4" />
                                        Add this JSON to your AI client's MCP settings to connect via SSE transport.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MCPCatalog;

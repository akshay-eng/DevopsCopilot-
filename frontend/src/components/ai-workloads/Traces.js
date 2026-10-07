import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import axios from 'axios';
import {
    Play,
    Clock,
    DollarSign,
    AlertCircle,
    CheckCircle,
    ChevronRight,
    Search,
    Filter,
    X,
    Maximize2,
    Code,
    GitBranch,
    Terminal,
    FileText,
    Eye,
    ChevronDown,
    Copy,
    Download
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Traces = () => {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const [selectedTrace, setSelectedTrace] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // all, success, failed, error
    const [sortBy, setSortBy] = useState('timestamp'); // timestamp, duration, cost, project, status
    const [traces, setTraces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch traces from API
    useEffect(() => {
        fetchTraces();
    }, []);

    const fetchTraces = async () => {
        try {
            setLoading(true);
            setError(null);

            const token = localStorage.getItem('token');
            if (!token) {
                setError('Not authenticated');
                setLoading(false);
                return;
            }

            const response = await axios.get(`${API_URL}/api/agentops/traces`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                params: {
                    limit: 50
                }
            });

            // Transform API data to match component format
            const transformedTraces = response.data.traces.map(trace => ({
                id: trace.id,
                name: trace.tags?.find(tag => !tag.startsWith('user:') && !tag.startsWith('environment:')) || 'Agent Session',
                status: trace.status?.toLowerCase() || 'running',
                duration: trace.duration ? parseFloat((trace.duration / 1000).toFixed(1)) : 0,
                cost: parseFloat(trace.cost) || 0,
                spans: parseInt(trace.llmCalls) || 0,
                timestamp: formatTimestamp(trace.startTime),
                model: trace.hostEnv?.sdk || 'unknown',
                tokens: { prompt: 0, completion: 0 },
                startTime: trace.startTime,
                endTime: trace.endTime,
                llmCalls: parseInt(trace.llmCalls) || 0,
                toolCalls: parseInt(trace.toolCalls) || 0,
                errors: parseInt(trace.errors) || 0,
                tags: trace.tags
            }));

            setTraces(transformedTraces);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching traces:', err);
            setError(err.response?.data?.message || 'Failed to load traces');
            setLoading(false);
        }
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'Unknown';

        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    };

    const filteredTraces = traces
        .filter(trace => {
            const matchesSearch = trace.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesFilter = filterStatus === 'all' || trace.status === filterStatus;
            return matchesSearch && matchesFilter;
        })
        .sort((a, b) => {
            switch (sortBy) {
                case 'timestamp':
                    return new Date(b.startTime) - new Date(a.startTime);
                case 'duration':
                    return (b.duration || 0) - (a.duration || 0);
                case 'cost':
                    return (b.cost || 0) - (a.cost || 0);
                case 'project':
                    return (a.projectName || '').localeCompare(b.projectName || '');
                case 'status':
                    return (a.status || '').localeCompare(b.status || '');
                default:
                    return 0;
            }
        });

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">Traces</h1>
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        View and debug your agent execution traces
                    </p>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                    {/* Search */}
                    <div className={`flex-1 max-w-md flex items-center gap-2 px-4 py-2 rounded-lg border ${
                        theme === 'dark'
                            ? 'bg-[#13131f] border-gray-800'
                            : 'bg-white border-gray-300'
                    }`}>
                        <Search className="w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search traces..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`flex-1 bg-transparent outline-none text-sm ${
                                theme === 'dark' ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
                            }`}
                        />
                    </div>

                    {/* Sort By */}
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
                        theme === 'dark'
                            ? 'bg-[#13131f] border-gray-800'
                            : 'bg-white border-gray-300'
                    }`}>
                        <Filter className="w-4 h-4 text-gray-500" />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className={`bg-transparent outline-none text-sm cursor-pointer ${
                                theme === 'dark' ? 'text-white' : 'text-gray-900'
                            }`}
                        >
                            <option value="timestamp">Latest First</option>
                            <option value="duration">Duration</option>
                            <option value="cost">Cost</option>
                            <option value="project">Project Name</option>
                            <option value="status">Status</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex gap-2">
                        {['all', 'success', 'failed', 'error'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                                    filterStatus === status
                                        ? 'bg-purple-600 text-white'
                                        : theme === 'dark'
                                            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="text-center py-12">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                        <p className={`mt-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            Loading traces...
                        </p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className={`p-4 rounded-lg border ${
                        theme === 'dark'
                            ? 'bg-red-900/20 border-red-800 text-red-200'
                            : 'bg-red-50 border-red-200 text-red-800'
                    }`}>
                        <p className="font-medium">Error loading traces</p>
                        <p className="text-sm mt-1">{error}</p>
                        <button
                            onClick={fetchTraces}
                            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Empty State */}
                {!loading && !error && filteredTraces.length === 0 && (
                    <div className={`text-center py-12 rounded-lg border ${
                        theme === 'dark'
                            ? 'bg-[#13131f] border-gray-800'
                            : 'bg-white border-gray-200'
                    }`}>
                        <Terminal className={`w-12 h-12 mx-auto mb-4 ${
                            theme === 'dark' ? 'text-gray-600' : 'text-gray-400'
                        }`} />
                        <p className={`text-lg font-medium ${
                            theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                            No traces found
                        </p>
                        <p className={`mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                            Run your agent to see traces here
                        </p>
                    </div>
                )}

                {/* Traces List */}
                {!loading && !error && filteredTraces.length > 0 && (
                    <div className="space-y-3">
                        {filteredTraces.map((trace) => (
                            <TraceCard
                                key={trace.id}
                                trace={trace}
                                theme={theme}
                                onClick={() => navigate(`/dashboard/ai-workloads/sessions/${trace.id}`)}
                            />
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
};

// Trace Card Component
const TraceCard = ({ trace, theme, onClick }) => {
    const getStatusIcon = () => {
        switch (trace.status) {
            case 'success':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'failed':
                return <AlertCircle className="w-5 h-5 text-orange-500" />;
            case 'error':
                return <AlertCircle className="w-5 h-5 text-red-500" />;
            default:
                return null;
        }
    };

    return (
        <button
            onClick={onClick}
            className={`w-full text-left rounded-xl border p-4 transition-all ${
                theme === 'dark'
                    ? 'border-gray-800 bg-[#13131f] hover:border-purple-600'
                    : 'border-gray-200 bg-white hover:border-purple-400'
            }`}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                    {getStatusIcon()}
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold">{trace.name}</h3>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                                theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'
                            }`}>
                                {trace.model}
                            </span>
                        </div>
                        <div className={`flex items-center gap-4 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {trace.duration}s
                            </span>
                            <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                ${trace.cost.toFixed(3)}
                            </span>
                            <span className="flex items-center gap-1">
                                <Play className="w-3 h-3" />
                                {trace.spans} spans
                            </span>
                            <span>{trace.timestamp}</span>
                        </div>
                    </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
        </button>
    );
};

// Trace Detail Drawer Component
const TraceDetailDrawer = ({ trace, theme, onClose }) => {
    const [activeView, setActiveView] = useState('waterfall'); // waterfall, tree, graph, logs
    const [spans, setSpans] = useState([]);
    const [loadingSpans, setLoadingSpans] = useState(true);

    // Fetch real spans from API
    useEffect(() => {
        const fetchSpans = async () => {
            try {
                setLoadingSpans(true);
                const token = localStorage.getItem('token');
                const response = await axios.get(`${API_URL}/api/agentops/traces/${trace.id}/spans`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                // Transform API spans to component format
                const transformedSpans = response.data.spans.map((span, index) => {
                    // Generate a better name from the prompt or use generic name
                    let name = `${span.type || 'operation'} ${index + 1}`;
                    if (span.data?.prompt) {
                        // Use first part of prompt as name (max 50 chars)
                        name = span.data.prompt.substring(0, 50).trim() + (span.data.prompt.length > 50 ? '...' : '');
                    }

                    return {
                        id: span.id,
                        name: name,
                        type: span.type || 'llm',
                        duration: span.duration ? parseFloat((span.duration / 1000).toFixed(3)) : 0,
                        startTime: span.timestamp,
                        endTime: span.endTimestamp,
                        data: span.data || {},
                        model: span.data?.model || 'unknown',
                        prompt: span.data?.prompt || '',
                        completion: span.data?.completion || '',
                        cost: parseFloat(span.data?.cost) || 0
                    };
                });

                setSpans(transformedSpans);
                setLoadingSpans(false);
            } catch (error) {
                console.error('Error fetching spans:', error);
                setSpans([]);
                setLoadingSpans(false);
            }
        };

        fetchSpans();
    }, [trace.id]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`w-full max-w-[95vw] h-[90vh] rounded-xl shadow-xl flex flex-col ${
                theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-white'
            }`}>
                {/* Header */}
                <div className={`border-b p-4 flex items-center justify-between ${
                    theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
                }`}>
                    <div>
                        <h2 className="text-xl font-bold">{trace.name}</h2>
                        <div className={`flex items-center gap-3 mt-1 text-sm ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                            <span>Duration: {trace.duration}s</span>
                            <span>•</span>
                            <span>Cost: ${trace.cost.toFixed(3)}</span>
                            <span>•</span>
                            <span>Spans: {trace.spans}</span>
                            <span>•</span>
                            <span>Tokens: {trace.tokens.prompt + trace.tokens.completion}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className={`p-2 rounded-lg ${
                                theme === 'dark'
                                    ? 'hover:bg-gray-800'
                                    : 'hover:bg-gray-100'
                            }`}
                        >
                            <Download className="w-5 h-5" />
                        </button>
                        <button
                            onClick={onClose}
                            className={`p-2 rounded-lg ${
                                theme === 'dark'
                                    ? 'hover:bg-gray-800'
                                    : 'hover:bg-gray-100'
                            }`}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* View Selector */}
                <div className={`border-b px-4 py-2 flex gap-2 ${
                    theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
                }`}>
                    {[
                        { id: 'waterfall', label: 'Waterfall', icon: GitBranch },
                        { id: 'tree', label: 'Tree', icon: FileText },
                        { id: 'graph', label: 'Graph', icon: Eye },
                        { id: 'logs', label: 'Logs', icon: Terminal }
                    ].map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveView(id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                activeView === id
                                    ? 'bg-purple-600 text-white'
                                    : theme === 'dark'
                                        ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                    {activeView === 'waterfall' && (
                        <WaterfallView spans={spans} theme={theme} />
                    )}
                    {activeView === 'tree' && (
                        <TreeView spans={spans} theme={theme} />
                    )}
                    {activeView === 'graph' && (
                        <GraphView spans={spans} theme={theme} />
                    )}
                    {activeView === 'logs' && (
                        <LogsView trace={trace} theme={theme} />
                    )}
                </div>
            </div>
        </div>
    );
};

// Waterfall View (Session Replay)
const WaterfallView = ({ spans, theme }) => {
    const [selectedSpan, setSelectedSpan] = useState(null);

    return (
        <div className="h-full grid grid-cols-2 divide-x" style={{
            divideColor: theme === 'dark' ? '#1f1f2e' : '#e5e7eb'
        }}>
            {/* Left: Gantt Chart */}
            <div className="overflow-auto p-4">
                <h3 className="text-sm font-semibold mb-4">Span Timeline</h3>
                <div className="space-y-1">
                    {spans.map((span) => (
                        <button
                            key={span.id}
                            onClick={() => setSelectedSpan(span)}
                            className={`w-full text-left py-2 px-3 rounded transition-colors ${
                                selectedSpan?.id === span.id
                                    ? theme === 'dark'
                                        ? 'bg-purple-900/30 border-l-2 border-purple-600'
                                        : 'bg-purple-50 border-l-2 border-purple-600'
                                    : theme === 'dark'
                                        ? 'hover:bg-gray-800/50'
                                        : 'hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                    span.type === 'llm'
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : span.type === 'tool'
                                            ? 'bg-green-500/20 text-green-400'
                                            : 'bg-gray-500/20 text-gray-400'
                                }`}>
                                    {span.type}
                                </span>
                                <span className="text-sm font-medium">{span.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`flex-1 h-6 rounded overflow-hidden ${
                                    theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'
                                }`}>
                                    <div
                                        className={`h-full ${
                                            span.type === 'llm'
                                                ? 'bg-blue-500'
                                                : span.type === 'tool'
                                                    ? 'bg-green-500'
                                                    : 'bg-gray-500'
                                        }`}
                                        style={{
                                            width: `${(span.duration / 3) * 100}%`,
                                            marginLeft: `${(span.startTime / 10) * 100}%`
                                        }}
                                    />
                                </div>
                                <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                                    {span.duration}s
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Right: Span Details */}
            <div className="overflow-auto p-4">
                {selectedSpan ? (
                    <SpanDetails span={selectedSpan} theme={theme} />
                ) : (
                    <div className={`h-full flex items-center justify-center ${
                        theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                        <div className="text-center">
                            <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>Select a span to view details</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Span Details Component
const SpanDetails = ({ span, theme }) => (
    <div className="space-y-4">
        <div>
            <h3 className="text-lg font-bold mb-2">{span.name}</h3>
            <div className={`flex items-center gap-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                <span className={`text-xs px-2 py-0.5 rounded ${
                    span.type === 'llm'
                        ? 'bg-blue-500/20 text-blue-400'
                        : span.type === 'tool'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                }`}>
                    {span.type}
                </span>
                <span className="text-sm">Duration: {span.duration}s</span>
            </div>
        </div>

        {span.type === 'llm' && (
            <>
                <div className={`rounded-lg border p-4 ${
                    theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-gray-50'
                }`}>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">Prompt</h4>
                        <button className="p-1 hover:bg-gray-700 rounded">
                            <Copy className="w-3 h-3" />
                        </button>
                    </div>
                    <pre className={`text-xs overflow-auto ${
                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                        {span.prompt || 'No prompt data'}
                    </pre>
                </div>

                <div className={`rounded-lg border p-4 ${
                    theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-gray-50'
                }`}>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold">Completion</h4>
                        <button className="p-1 hover:bg-gray-700 rounded">
                            <Copy className="w-3 h-3" />
                        </button>
                    </div>
                    <pre className={`text-xs overflow-auto ${
                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                        {span.completion || 'No completion data'}
                    </pre>
                </div>
            </>
        )}

        {span.type === 'tool' && (
            <div className={`rounded-lg border p-4 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-gray-50'
            }`}>
                <h4 className="text-sm font-semibold mb-2">Tool Execution</h4>
                <div className="space-y-2 text-sm">
                    <div>
                        <span className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Input:</span>
                        <pre className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            {span.input || 'No input data'}
                        </pre>
                    </div>
                    <div>
                        <span className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Output:</span>
                        <pre className={`mt-1 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                            {span.output || 'No output data'}
                        </pre>
                    </div>
                </div>
            </div>
        )}
    </div>
);

// Tree View Component
const TreeView = ({ spans, theme }) => {
    const [expandedSpans, setExpandedSpans] = useState(new Set());

    const toggleSpan = (spanId) => {
        const newExpanded = new Set(expandedSpans);
        if (newExpanded.has(spanId)) {
            newExpanded.delete(spanId);
        } else {
            newExpanded.add(spanId);
        }
        setExpandedSpans(newExpanded);
    };

    return (
        <div className="p-6 overflow-auto">
            <h3 className="text-sm font-semibold mb-4">Hierarchical Span Structure</h3>
            <div className="space-y-2">
                {spans.map((span, idx) => (
                    <div key={span.id}>
                        <button
                            onClick={() => toggleSpan(span.id)}
                            className={`w-full text-left p-3 rounded border ${
                                theme === 'dark'
                                    ? 'border-gray-800 bg-[#13131f] hover:bg-gray-800'
                                    : 'border-gray-200 bg-white hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <ChevronDown className={`w-4 h-4 transition-transform ${
                                    expandedSpans.has(span.id) ? '' : '-rotate-90'
                                }`} />
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                    span.type === 'llm'
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-green-500/20 text-green-400'
                                }`}>
                                    {span.type}
                                </span>
                                <span className="font-medium flex-1">{span.name}</span>
                                <span className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                                    {span.duration}s
                                </span>
                            </div>
                        </button>

                        {expandedSpans.has(span.id) && span.type === 'llm' && (
                            <div className={`ml-6 mt-2 space-y-2 p-3 rounded border ${
                                theme === 'dark'
                                    ? 'border-gray-800 bg-[#0a0a0f]'
                                    : 'border-gray-200 bg-gray-50'
                            }`}>
                                <div>
                                    <div className="text-xs font-semibold mb-1">Prompt:</div>
                                    <pre className={`text-xs overflow-auto ${
                                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                                    }`}>{span.prompt || 'No prompt data'}</pre>
                                </div>
                                <div>
                                    <div className="text-xs font-semibold mb-1">Completion:</div>
                                    <pre className={`text-xs overflow-auto ${
                                        theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                                    }`}>{span.completion || 'No completion data'}</pre>
                                </div>
                                <div className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                                    Model: {span.model} • Cost: ${span.cost.toFixed(4)}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Graph View Component
const GraphView = ({ spans, theme }) => {
    return (
        <div className="h-full p-6 overflow-auto">
            <h3 className="text-sm font-semibold mb-4">Execution Flow Graph</h3>
            <div className="flex flex-col items-center space-y-4">
                {/* Start Node */}
                <div className={`px-4 py-2 rounded-full border-2 ${
                    theme === 'dark'
                        ? 'border-green-500 bg-green-500/10 text-green-400'
                        : 'border-green-600 bg-green-50 text-green-700'
                }`}>
                    START
                </div>

                {/* Spans as nodes */}
                {spans.map((span, index) => (
                    <div key={span.id} className="flex flex-col items-center">
                        {/* Arrow */}
                        <div className={`w-0.5 h-8 ${
                            theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
                        }`} />

                        {/* Span Node */}
                        <div className={`min-w-[300px] p-4 rounded-lg border ${
                            theme === 'dark'
                                ? 'border-gray-700 bg-[#13131f]'
                                : 'border-gray-300 bg-white'
                        }`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                    span.type === 'llm'
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-green-500/20 text-green-400'
                                }`}>
                                    {span.type}
                                </span>
                                <span className="font-medium text-sm">{span.name}</span>
                            </div>
                            <div className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                                Duration: {span.duration}s • Model: {span.model}
                            </div>
                            {span.completion && (
                                <div className={`mt-2 text-xs ${
                                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                    {span.completion.substring(0, 100)}
                                    {span.completion.length > 100 ? '...' : ''}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* End Node */}
                <div className="flex flex-col items-center">
                    <div className={`w-0.5 h-8 ${
                        theme === 'dark' ? 'bg-gray-700' : 'bg-gray-300'
                    }`} />
                    <div className={`px-4 py-2 rounded-full border-2 ${
                        theme === 'dark'
                            ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                            : 'border-purple-600 bg-purple-50 text-purple-700'
                    }`}>
                        END
                    </div>
                </div>
            </div>
        </div>
    );
};

// Logs View Component
const LogsView = ({ trace, theme }) => (
    <div className="h-full p-4 overflow-auto">
        <div className={`rounded-lg border p-4 font-mono text-xs ${
            theme === 'dark'
                ? 'border-gray-800 bg-[#0a0a0f] text-gray-300'
                : 'border-gray-200 bg-gray-50 text-gray-700'
        }`}>
            <div>[2024-01-10 10:30:15] INFO: Starting agent execution</div>
            <div>[2024-01-10 10:30:16] INFO: Initializing {trace.model}</div>
            <div>[2024-01-10 10:30:17] DEBUG: Processing {trace.spans} spans</div>
            <div>[2024-01-10 10:30:18] INFO: LLM call completed in {trace.duration}s</div>
            <div>[2024-01-10 10:30:19] INFO: Total cost: ${trace.cost}</div>
            <div className="text-green-400">[2024-01-10 10:30:20] SUCCESS: Execution completed</div>
        </div>
    </div>
);

// Helper function to generate mock spans
const generateMockSpans = (count) => {
    const types = ['llm', 'tool', 'agent'];
    return Array.from({ length: count }, (_, i) => ({
        id: `span_${i}`,
        name: `${types[i % 3]} operation ${i + 1}`,
        type: types[i % 3],
        duration: (Math.random() * 2 + 0.5).toFixed(2),
        startTime: i * 0.5,
        depth: Math.floor(i / 3),
        prompt: i % 3 === 0 ? 'Generate a customer service response for: "How do I reset my password?"' : null,
        completion: i % 3 === 0 ? 'To reset your password, please follow these steps:\n1. Go to the login page\n2. Click "Forgot Password"\n3. Enter your email address\n4. Check your inbox for reset link' : null,
        input: i % 3 === 1 ? '{"action": "search", "query": "password reset"}' : null,
        output: i % 3 === 1 ? '{"results": [...]}' : null
    }));
};

export default Traces;

import React, { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
    DollarSign,
    Zap,
    AlertTriangle,
    Activity,
    Calendar,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Loader
} from 'lucide-react';

const Overview = () => {
    const { theme } = useTheme();
    const [dateRange, setDateRange] = useState('7d'); // 7d, 30d, 90d
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [chartData, setChartData] = useState(null);

    // Simulate data loading
    useEffect(() => {
        setIsLoading(true);
        // Simulate API call
        setTimeout(() => {
            setStats({
                totalCost: 45.67,
                tokensGenerated: 1250000,
                failRate: 2.3,
                totalEvents: 8542,
                monthlySpans: { current: 6234, limit: 10000 }
            });
            setChartData({
                spanEndStates: generateMockTimeSeriesData(),
                spanDistribution: { success: 85, failed: 10, error: 5 },
                failedSpans: generateMockTimeSeriesData(),
                costDistribution: generateMockHistogram(),
                spansPerTrace: generateMockHistogram(),
                durationDistribution: generateMockHistogram()
            });
            setIsLoading(false);
        }, 800);
    }, [dateRange]);

    const handleRefresh = () => {
        setIsLoading(true);
        setTimeout(() => setIsLoading(false), 800);
    };

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Overview</h1>
                        <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            Monitor your AI agent performance and usage
                        </p>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-3">
                        <div className="flex gap-2">
                            {['7d', '30d', '90d'].map((range) => (
                                <button
                                    key={range}
                                    onClick={() => setDateRange(range)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        dateRange === range
                                            ? 'bg-purple-600 text-white'
                                            : theme === 'dark'
                                                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                                    }`}
                                >
                                    {range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'Last 90 days'}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleRefresh}
                            className={`p-2 rounded-lg transition-colors ${
                                theme === 'dark'
                                    ? 'bg-gray-800 text-white hover:bg-gray-700'
                                    : 'bg-white text-gray-900 hover:bg-gray-100 border border-gray-300'
                            }`}
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <LoadingSkeleton theme={theme} />
                ) : (
                    <>
                        {/* Stats Cards */}
                        <OverviewStats stats={stats} theme={theme} />

                        {/* Analytics Charts */}
                        <OverviewCharts chartData={chartData} theme={theme} />
                    </>
                )}
            </div>
        </div>
    );
};

// Overview Stats Component
const OverviewStats = ({ stats, theme }) => {
    const statsConfig = [
        {
            label: 'Total Cost',
            value: `$${stats.totalCost.toFixed(2)}`,
            icon: DollarSign,
            color: 'text-green-500',
            bgColor: theme === 'dark' ? 'bg-green-500/10' : 'bg-green-50',
            trend: '+12%',
            trendUp: true
        },
        {
            label: 'Tokens Generated',
            value: formatNumber(stats.tokensGenerated),
            icon: Zap,
            color: 'text-blue-500',
            bgColor: theme === 'dark' ? 'bg-blue-500/10' : 'bg-blue-50',
            trend: '+8%',
            trendUp: true
        },
        {
            label: 'Fail Rate',
            value: `${stats.failRate}%`,
            icon: AlertTriangle,
            color: 'text-orange-500',
            bgColor: theme === 'dark' ? 'bg-orange-500/10' : 'bg-orange-50',
            trend: '-3%',
            trendUp: false
        },
        {
            label: 'Total Events',
            value: formatNumber(stats.totalEvents),
            icon: Activity,
            color: 'text-purple-500',
            bgColor: theme === 'dark' ? 'bg-purple-500/10' : 'bg-purple-50',
            trend: '+15%',
            trendUp: true
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statsConfig.map((stat) => {
                const Icon = stat.icon;
                return (
                    <div
                        key={stat.label}
                        className={`rounded-xl border p-6 ${
                            theme === 'dark'
                                ? 'border-gray-800 bg-[#13131f]'
                                : 'border-gray-200 bg-white'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                                <Icon className={`w-5 h-5 ${stat.color}`} />
                            </div>
                            <div className={`flex items-center gap-1 text-sm ${
                                stat.trendUp ? 'text-green-500' : 'text-red-500'
                            }`}>
                                {stat.trendUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                <span>{stat.trend}</span>
                            </div>
                        </div>
                        <div className={`text-sm mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {stat.label}
                        </div>
                        <div className="text-2xl font-bold">{stat.value}</div>
                    </div>
                );
            })}

            {/* Monthly Spans Usage Card */}
            <div
                className={`rounded-xl border p-6 ${
                    theme === 'dark'
                        ? 'border-gray-800 bg-[#13131f]'
                        : 'border-gray-200 bg-white'
                }`}
            >
                <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-indigo-500/10' : 'bg-indigo-50'}`}>
                        <Calendar className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {Math.round((stats.monthlySpans.current / stats.monthlySpans.limit) * 100)}%
                    </div>
                </div>
                <div className={`text-sm mb-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                    Monthly Spans
                </div>
                <div className="text-2xl font-bold mb-3">
                    {formatNumber(stats.monthlySpans.current)} / {formatNumber(stats.monthlySpans.limit)}
                </div>
                <div className={`w-full h-2 rounded-full overflow-hidden ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'}`}>
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                        style={{ width: `${(stats.monthlySpans.current / stats.monthlySpans.limit) * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

// Overview Charts Component
const OverviewCharts = ({ chartData, theme }) => {
    return (
        <div>
            <h2 className="text-xl font-bold mb-4">Analytics</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Span End States Line Chart */}
                <ChartCard title="Span End States" theme={theme}>
                    <LineChart data={chartData.spanEndStates} theme={theme} />
                </ChartCard>

                {/* Span Distribution Pie Chart */}
                <ChartCard title="Span End States Distribution" theme={theme}>
                    <PieChart data={chartData.spanDistribution} theme={theme} />
                </ChartCard>

                {/* Failed Spans Line Chart */}
                <ChartCard title="Failed Spans" theme={theme}>
                    <LineChart data={chartData.failedSpans} theme={theme} color="red" />
                </ChartCard>

                {/* Cost Distribution Bar Chart */}
                <ChartCard title="Trace Cost Distribution" theme={theme}>
                    <BarChart data={chartData.costDistribution} theme={theme} label="Cost ($)" />
                </ChartCard>

                {/* Spans Per Trace Bar Chart */}
                <ChartCard title="Spans Per Trace" theme={theme}>
                    <BarChart data={chartData.spansPerTrace} theme={theme} label="Events" />
                </ChartCard>

                {/* Duration Distribution Bar Chart */}
                <ChartCard title="Trace Duration Distribution" theme={theme}>
                    <BarChart data={chartData.durationDistribution} theme={theme} label="Duration (s)" />
                </ChartCard>
            </div>
        </div>
    );
};

// Chart Card Wrapper
const ChartCard = ({ title, children, theme }) => (
    <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
        <h3 className={`text-sm font-semibold mb-4 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            {title}
        </h3>
        {children}
    </div>
);

// Simple Line Chart Component
const LineChart = ({ data, theme, color = 'purple' }) => (
    <div className="h-64 flex items-end justify-between gap-1">
        {data.map((point, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div className="relative flex-1 w-full">
                    <div
                        className={`absolute bottom-0 w-full rounded-t transition-all bg-gradient-to-t ${
                            color === 'red'
                                ? 'from-red-500 to-red-400'
                                : 'from-purple-600 to-purple-400'
                        }`}
                        style={{ height: `${point}%` }}
                    />
                </div>
            </div>
        ))}
    </div>
);

// Simple Pie Chart Component
const PieChart = ({ data, theme }) => {
    const total = data.success + data.failed + data.error;
    const successPercent = (data.success / total) * 100;
    const failedPercent = (data.failed / total) * 100;
    const errorPercent = (data.error / total) * 100;

    return (
        <div className="h-64 flex items-center justify-center">
            <div className="relative w-48 h-48">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="20"
                        strokeDasharray={`${successPercent * 2.51} ${251 - successPercent * 2.51}`}
                        strokeDashoffset="0"
                    />
                    <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="20"
                        strokeDasharray={`${failedPercent * 2.51} ${251 - failedPercent * 2.51}`}
                        strokeDashoffset={`-${successPercent * 2.51}`}
                    />
                    <circle
                        cx="50"
                        cy="50"
                        r="40"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="20"
                        strokeDasharray={`${errorPercent * 2.51} ${251 - errorPercent * 2.51}`}
                        strokeDashoffset={`-${(successPercent + failedPercent) * 2.51}`}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <div className="text-2xl font-bold">{total}</div>
                    <div className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Total</div>
                </div>
            </div>
            <div className="ml-6 space-y-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm">Success ({data.success})</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    <span className="text-sm">Failed ({data.failed})</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm">Error ({data.error})</span>
                </div>
            </div>
        </div>
    );
};

// Simple Bar Chart Component
const BarChart = ({ data, theme, label }) => (
    <div className="h-64">
        <div className="h-full flex items-end justify-between gap-2">
            {data.map((value, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                    <div className="relative flex-1 w-full">
                        <div
                            className="absolute bottom-0 w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-400 transition-all"
                            style={{ height: `${value}%` }}
                        />
                    </div>
                    <div className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                        {idx}
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// Loading Skeleton
const LoadingSkeleton = ({ theme }) => (
    <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
                <div
                    key={i}
                    className={`rounded-xl border p-6 h-32 animate-pulse ${
                        theme === 'dark' ? 'border-gray-800 bg-gray-800/50' : 'border-gray-200 bg-gray-100'
                    }`}
                />
            ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(6)].map((_, i) => (
                <div
                    key={i}
                    className={`rounded-xl border p-6 h-80 animate-pulse ${
                        theme === 'dark' ? 'border-gray-800 bg-gray-800/50' : 'border-gray-200 bg-gray-100'
                    }`}
                />
            ))}
        </div>
    </div>
);

// Utility Functions
const formatNumber = (num) => {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
};

const generateMockTimeSeriesData = () => {
    return Array.from({ length: 20 }, () => Math.random() * 100);
};

const generateMockHistogram = () => {
    return Array.from({ length: 10 }, () => Math.random() * 100);
};

export default Overview;

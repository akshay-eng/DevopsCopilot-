import React, { useState, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAgentOpsMetrics } from '../../hooks/useAgentOpsMetrics';
import { useProjects } from '../../hooks/useAgentOpsProjects';
import { ChartCard } from '../ui/chart-card';
import { FormattedTokenDisplay } from '../ui/formatted-token-display';
import { StatSkeleton, ChartSkeleton } from '../ui/skeletons';
import { Separator } from '../ui/separator';
import { Progress } from '../ui/progress';
import { NoTracesFound } from '../ui/no-traces-found';
import { formatPrice, formatPercentage, formatNumber } from '../../utils/agentopsFormatters';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { startOfMonth, endOfMonth, subDays, format } from 'date-fns';
import { RefreshCw, Calendar, ChevronDown } from 'lucide-react';

const Analytics = () => {
    const { theme } = useTheme();
    const [dateRange, setDateRange] = useState({
        from: subDays(new Date(), 30),
        to: endOfMonth(new Date()),
    });
    const [selectedProjectId, setSelectedProjectId] = useState('');

    const { projects, isLoading: projectsLoading } = useProjects();
    const { metrics, metricsLoading, isFetching, refreshMetrics } = useAgentOpsMetrics(dateRange, selectedProjectId);

    const currentMonthRange = {
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    };
    const { metrics: monthlyMetrics, metricsLoading: monthlyLoading } = useAgentOpsMetrics(currentMonthRange);

    const hasFilteredTokenMetrics = !!metrics?.token_metrics;
    const hasTraces = metrics && metrics.trace_count > 0;

    // Chart colors
    const COLORS = {
        success: '#10B981',
        fail: '#EF4444',
        indeterminate: '#F59E0B',
        primary: '#8B5CF6',
        secondary: '#06B6D4'
    };

    // Prepare Success/Fail timeline data
    const successFailData = useMemo(() => {
        if (!metrics?.success_datetime && !metrics?.fail_datetime) return [];

        const dateMap = new Map();

        metrics.success_datetime?.forEach((timestamp) => {
            const date = format(new Date(timestamp), 'MMM dd');
            const existing = dateMap.get(date) || { date, success: 0, fail: 0, indeterminate: 0 };
            dateMap.set(date, { ...existing, success: existing.success + 1 });
        });

        metrics.fail_datetime?.forEach((timestamp) => {
            const date = format(new Date(timestamp), 'MMM dd');
            const existing = dateMap.get(date) || { date, success: 0, fail: 0, indeterminate: 0 };
            dateMap.set(date, { ...existing, fail: existing.fail + 1 });
        });

        metrics.indeterminate_datetime?.forEach((timestamp) => {
            const date = format(new Date(timestamp), 'MMM dd');
            const existing = dateMap.get(date) || { date, success: 0, fail: 0, indeterminate: 0 };
            dateMap.set(date, { ...existing, indeterminate: existing.indeterminate + 1 });
        });

        return Array.from(dateMap.values()).sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
        });
    }, [metrics]);

    // Prepare Pie Chart data for trace states
    const traceStatePieData = useMemo(() => {
        const successCount = metrics?.success_datetime?.length || 0;
        const failCount = metrics?.fail_datetime?.length || 0;
        const indeterminateCount = metrics?.indeterminate_datetime?.length || 0;

        const data = [
            { name: 'Success', value: successCount, color: COLORS.success },
            { name: 'Failed', value: failCount, color: COLORS.fail },
            { name: 'Indeterminate', value: indeterminateCount, color: COLORS.indeterminate }
        ].filter(item => item.value > 0);

        console.log('[Analytics] Pie chart data:', data);
        return data;
    }, [metrics, COLORS]);

    // Prepare Cost Over Time data
    const costOverTimeData = useMemo(() => {
        if (!metrics?.trace_cost_dates) return [];

        return metrics.trace_cost_dates
            .map(item => ({
                date: format(new Date(item.date), 'MMM dd'),
                cost: parseFloat(item.cost || 0)
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [metrics]);

    // Prepare Failed Traces data
    const failedTracesData = useMemo(() => {
        if (!metrics?.failed_traces_dates) return [];

        return metrics.failed_traces_dates
            .map(item => ({
                date: format(new Date(item.date), 'MMM dd'),
                count: parseInt(item.count || 0)
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [metrics]);

    // Prepare Spans Per Trace distribution
    const spansPerTraceData = useMemo(() => {
        if (!metrics?.spans_per_trace) return [];

        return metrics.spans_per_trace
            .map(item => ({
                spanCount: `${item.span_count} spans`,
                traces: item.trace_count
            }))
            .sort((a, b) => parseInt(a.spanCount) - parseInt(b.spanCount))
            .slice(0, 10); // Top 10 distributions
    }, [metrics]);

    // Prepare Duration distribution (histogram)
    const durationDistributionData = useMemo(() => {
        if (!metrics?.trace_durations) return [];

        const durations = metrics.trace_durations.map(d => parseFloat(d));
        if (durations.length === 0) return [];

        // Create 10 buckets
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const bucketSize = (max - min) / 10;

        const buckets = Array.from({ length: 10 }, (_, i) => ({
            range: `${((min + i * bucketSize) / 1e9).toFixed(1)}s`,
            count: 0
        }));

        durations.forEach(duration => {
            const bucketIndex = Math.min(
                Math.floor((duration - min) / bucketSize),
                9
            );
            buckets[bucketIndex].count++;
        });

        return buckets.filter(b => b.count > 0);
    }, [metrics]);

    const monthlySpanUsage = monthlyMetrics?.span_count?.total || 0;
    const maxSpans = 10000; // Free tier limit
    const usagePercentage = Math.min((monthlySpanUsage / maxSpans) * 100, 100);

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || !payload.length) return null;

        return (
            <div className={`rounded-lg border p-3 shadow-lg ${theme === 'dark' ? 'border-slate-700 bg-slate-800' : 'border-gray-200 bg-white'
                }`}>
                <p className={`mb-2 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{label}</p>
                {payload.map((entry, index) => (
                    <p key={index} style={{ color: entry.color }} className="text-sm">
                        {entry.name}: {entry.value}
                    </p>
                ))}
            </div>
        );
    };

    return (
        <div className={`flex flex-col gap-4 p-6 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Analytics</h1>
                    <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                        Last 30 days • {format(dateRange.from, 'MMM dd')} - {format(dateRange.to, 'MMM dd, yyyy')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Project Filter Dropdown */}
                    <div className="relative">
                        <select
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className={`appearance-none rounded-lg border px-4 py-2 pr-10 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                                theme === 'dark'
                                    ? 'border-slate-700 bg-[#13131f] text-slate-300 hover:bg-slate-800'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <option value="">All Projects</option>
                            {projects?.map((project) => (
                                <option key={project.id} value={project.id}>
                                    {project.name}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-400'}`} />
                    </div>

                    <button
                        onClick={refreshMetrics}
                        disabled={isFetching}
                        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-violet-600 px-4 py-2 text-white transition-colors hover:from-purple-600 hover:to-violet-700 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Overview Stats */}
            <div className="mb-4">
                <h2 className={`mb-4 text-2xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Overview</h2>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-5">
                    <ChartCard
                        title="Total Cost"
                        tooltipContent="Total cost across all traces in date range"
                        cardStyles="shadow-sm h-24"
                        cardContentStyles="p-0 pl-2"
                    >
                        {metricsLoading || !hasFilteredTokenMetrics ? (
                            <StatSkeleton />
                        ) : (
                            <div className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                {formatPrice(metrics.token_metrics.total_cost)}
                            </div>
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Tokens Generated"
                        tooltipContent="Total tokens generated across all traces"
                        cardStyles="shadow-sm h-24"
                        cardContentStyles="p-0 pl-2"
                    >
                        {metricsLoading || !hasFilteredTokenMetrics ? (
                            <StatSkeleton />
                        ) : (
                            <div className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                <FormattedTokenDisplay value={metrics.token_metrics.total_tokens?.all} />
                            </div>
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Fail Rate"
                        tooltipContent="Percentage of failed traces"
                        cardStyles="shadow-sm h-24"
                        cardContentStyles="p-0 pl-2"
                    >
                        {metricsLoading || !metrics ? (
                            <StatSkeleton />
                        ) : (
                            <div className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                {formatPercentage(
                                    (metrics.fail_datetime?.length ?? 0) /
                                    ((metrics.success_datetime?.length ?? 0) + (metrics.fail_datetime?.length ?? 0))
                                )}
                            </div>
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Total Events"
                        tooltipContent="Total number of events/spans"
                        cardStyles="shadow-sm h-24"
                        cardContentStyles="p-0 pl-2"
                    >
                        {metricsLoading || !metrics?.span_count ? (
                            <StatSkeleton />
                        ) : (
                            <div className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                <FormattedTokenDisplay value={metrics.span_count.total} />
                            </div>
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Monthly Spans"
                        tooltipContent="Spans used this month (resets monthly)"
                        cardStyles="shadow-sm h-24"
                        cardContentStyles="p-0 pl-2"
                    >
                        {monthlyLoading ? (
                            <StatSkeleton />
                        ) : (
                            <div className="flex flex-col gap-1">
                                <div className={`text-xl font-semibold ${usagePercentage > 80 ? 'text-red-600' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                    {formatNumber(monthlySpanUsage)} / {formatNumber(maxSpans)}
                                </div>
                                <Progress value={usagePercentage} className="h-2" />
                                {usagePercentage > 80 && (
                                    <span className="text-xs text-red-600">⚠️ {usagePercentage.toFixed(0)}% used</span>
                                )}
                            </div>
                        )}
                    </ChartCard>
                </div>
            </div>

            <Separator />

            {/* Analytics Charts */}
            <div className="mt-4">
                <h2 className={`mb-4 text-2xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    Detailed Analytics
                </h2>

                <div className="max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
                    {metricsLoading ? (
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <ChartSkeleton key={i} />
                            ))}
                        </div>
                    ) : !hasTraces ? (
                        <NoTracesFound />
                    ) : (
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {/* Trace End States Line Chart */}
                        <div className={`col-span-full rounded-lg p-6 shadow-lg md:col-span-2 ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                            <h3 className={`mb-4 text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                Trace End States Over Time
                            </h3>
                            <ResponsiveContainer width="100%" height={350}>
                                <LineChart data={successFailData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                    <XAxis dataKey="date" stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                    <YAxis stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />
                                    <Line type="monotone" dataKey="success" stroke={COLORS.success} strokeWidth={2} name="Success" />
                                    <Line type="monotone" dataKey="fail" stroke={COLORS.fail} strokeWidth={2} name="Failed" />
                                    {metrics?.indeterminate_datetime?.length > 0 && (
                                        <Line type="monotone" dataKey="indeterminate" stroke={COLORS.indeterminate} strokeWidth={2} name="Indeterminate" />
                                    )}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Trace States Pie Chart */}
                        <div className={`rounded-lg p-6 shadow-lg ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                            <h3 className={`mb-4 text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                Trace Distribution
                            </h3>
                            {traceStatePieData.length === 0 ? (
                                <div className="flex h-[350px] items-center justify-center">
                                    <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                                        No trace data available
                                    </p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={350}>
                                    <PieChart>
                                        <Pie
                                            data={traceStatePieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                            label={(entry) => entry.name}
                                        >
                                            {traceStatePieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Cost Over Time */}
                        {costOverTimeData.length > 0 && (
                            <div className={`col-span-full rounded-lg p-6 shadow-lg md:col-span-2 ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                                <h3 className={`mb-4 text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                    Cost Over Time
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={costOverTimeData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                        <XAxis dataKey="date" stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                        <YAxis stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                        <Tooltip
                                            content={<CustomTooltip />}
                                            formatter={(value) => `$${value.toFixed(4)}`}
                                        />
                                        <Bar dataKey="cost" fill={COLORS.primary} name="Cost ($)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Failed Traces Chart */}
                        {failedTracesData.length > 0 && (
                            <div className={`rounded-lg p-6 shadow-lg ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                                <h3 className={`mb-4 text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                    Failed Traces
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={failedTracesData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                        <XAxis dataKey="date" stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                        <YAxis stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="count" stroke={COLORS.fail} strokeWidth={2} name="Failed Traces" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Spans Per Trace Distribution */}
                        {spansPerTraceData.length > 0 && (
                            <div className={`col-span-full rounded-lg p-6 shadow-lg ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                                <h3 className={`mb-4 text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                    Events Per Trace Distribution
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={spansPerTraceData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                        <XAxis dataKey="spanCount" stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                        <YAxis stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="traces" fill={COLORS.secondary} name="Number of Traces" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Duration Distribution */}
                        {durationDistributionData.length > 0 && (
                            <div className={`col-span-full rounded-lg p-6 shadow-lg ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                                <h3 className={`mb-4 text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                    Trace Duration Distribution
                                </h3>
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={durationDistributionData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#E5E7EB'} />
                                        <XAxis dataKey="range" stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                        <YAxis stroke={theme === 'dark' ? '#9CA3AF' : '#6B7280'} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="count" fill={COLORS.primary} name="Traces" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>
        </div>
    );
};

export default Analytics;

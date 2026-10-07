import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAgentOpsTraces } from '../../hooks/useAgentOpsTraces';
import { useAgentOpsMetrics } from '../../hooks/useAgentOpsMetrics';
import { useBookmarks } from '../../hooks/useBookmarks';
import { useProjects } from '../../hooks/useAgentOpsProjects';
import { ChartCard } from '../ui/chart-card';
import { FormattedTokenDisplay } from '../ui/formatted-token-display';
import { StatSkeleton, TraceSkeletonRow } from '../ui/skeletons';
import { NoTracesFound } from '../ui/no-traces-found';
import { formatPrice, formatPercentage, formatDate, formatDuration } from '../../utils/agentopsFormatters';
import { RefreshCw, Search, Bookmark, ChevronDown } from 'lucide-react';
import { startOfMonth, endOfMonth, subDays } from 'date-fns';

const Sessions = () => {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const [dateRange, setDateRange] = useState({
        from: subDays(new Date(), 7),
        to: endOfMonth(new Date()), // Use end of current month to capture all data
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize] = useState(20);
    const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState('');

    const { isBookmarked, toggleBookmark, bookmarks } = useBookmarks();
    const { projects, isLoading: projectsLoading } = useProjects();

    const {
        data: tracesData,
        isLoading,
        isFetching,
        refetchTraces,
    } = useAgentOpsTraces(dateRange, searchQuery, pageIndex, pageSize, selectedProjectId);

    const { metrics, metricsLoading, refreshMetrics } = useAgentOpsMetrics(dateRange);

    const currentMonthRange = {
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    };
    const { metrics: monthlyMetrics } = useAgentOpsMetrics(currentMonthRange);

    const handleSearch = (e) => {
        e.preventDefault();
        setSearchQuery(inputValue);
        setPageIndex(0);
    };

    const handleRefresh = () => {
        refreshMetrics();
        refetchTraces();
    };

    const filteredTraces = useMemo(() => {
        if (!showBookmarkedOnly || !tracesData?.traces) {
            return tracesData?.traces ?? [];
        }
        return tracesData.traces.filter((trace) => bookmarks.has(trace.trace_id));
    }, [tracesData?.traces, showBookmarkedOnly, bookmarks]);

    const hasFilteredTokenMetrics = !!metrics?.token_metrics;

    return (
        <div className={`flex flex-col gap-4 p-6 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Sessions</h1>
                <button
                    onClick={handleRefresh}
                    disabled={isFetching}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-500 to-violet-600 px-4 py-2 text-white transition-colors hover:from-purple-600 hover:to-violet-700 disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Metrics Cards */}
            <div className="mb-4">
                <h2 className={`mb-4 text-2xl font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Overall Metrics</h2>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
                    <ChartCard
                        title="Total Cost"
                        tooltipContent="Total cost of all traces in the selected date range"
                        cardStyles="shadow-sm h-24"
                        cardContentStyles="p-0 pl-2"
                    >
                        {metricsLoading || !hasFilteredTokenMetrics ? (
                            <StatSkeleton />
                        ) : (
                            <div className="text-xl font-semibold text-gray-900 dark:text-white">
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
                            <div className="text-xl font-semibold text-gray-900 dark:text-white">
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
                            <div className="text-xl font-semibold text-gray-900 dark:text-white">
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
                            <div className="text-xl font-semibold text-gray-900 dark:text-white">
                                <FormattedTokenDisplay value={metrics.span_count.total} />
                            </div>
                        )}
                    </ChartCard>
                </div>
            </div>

            {/* Traces Table */}
            <div className={`rounded-lg p-6 shadow-lg ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                {/* Toolbar */}
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <form onSubmit={handleSearch} className="flex flex-1 gap-2">
                        <div className="relative flex-1">
                            <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-400'}`} />
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Search traces..."
                                className={`w-full rounded-lg border py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500 ${theme === 'dark'
                                        ? 'border-slate-700 bg-[#0a0a0f] text-white placeholder-slate-500'
                                        : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'
                                    }`}
                            />
                        </div>
                        <button
                            type="submit"
                            className="rounded-lg bg-gradient-to-r from-purple-500 to-violet-600 px-4 py-2 text-white transition-colors hover:from-purple-600 hover:to-violet-700"
                        >
                            Search
                        </button>
                    </form>

                    <div className="flex items-center gap-2">
                        {/* Project Filter Dropdown */}
                        <div className="relative">
                            <select
                                value={selectedProjectId}
                                onChange={(e) => {
                                    setSelectedProjectId(e.target.value);
                                    setPageIndex(0);
                                }}
                                className={`appearance-none rounded-lg border px-4 py-2 pr-10 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                                    theme === 'dark'
                                        ? 'border-slate-700 bg-[#0a0a0f] text-slate-300 hover:bg-slate-800'
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
                            onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                            className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${showBookmarkedOnly
                                    ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white'
                                    : theme === 'dark'
                                        ? 'border border-slate-700 bg-[#0a0a0f] text-slate-300 hover:bg-slate-800'
                                        : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <Bookmark className="h-4 w-4" />
                            Bookmarked
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className={`border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
                            <tr>
                                <th className={`p-4 text-left text-sm font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                                    <Bookmark className="h-4 w-4" />
                                </th>
                                <th className="p-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Name</th>
                                <th className="p-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Timestamp</th>
                                <th className="p-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Status</th>
                                <th className="p-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Duration</th>
                                <th className="p-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Cost</th>
                                <th className="p-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">Spans</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: pageSize }).map((_, index) => <TraceSkeletonRow key={index} />)
                            ) : filteredTraces.length > 0 ? (
                                filteredTraces.map((trace) => (
                                    <tr
                                        key={trace.trace_id}
                                        onClick={() => navigate(`/dashboard/ai-workloads/sessions/${trace.trace_id}`)}
                                        className={`cursor-pointer border-b transition-colors ${theme === 'dark'
                                                ? 'border-slate-800 hover:bg-slate-800'
                                                : 'border-gray-200 hover:bg-gray-50'
                                            }`}
                                    >
                                        <td className="p-4">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleBookmark(trace.trace_id);
                                                }}
                                                className={`transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-purple-400' : 'text-gray-400 hover:text-purple-600'}`}
                                            >
                                                <Bookmark
                                                    className={`h-4 w-4 ${isBookmarked(trace.trace_id) ? 'fill-purple-600 text-purple-600' : ''}`}
                                                />
                                            </button>
                                        </td>
                                        <td className="p-4">
                                            <div className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                                {trace.root_span_name || 'Unnamed Trace'}
                                            </div>
                                            <div className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                                                <code>{trace.trace_id}</code>
                                            </div>
                                        </td>
                                        <td className={`p-4 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{formatDate(trace.start_time)}</td>
                                        <td className="p-4">
                                            <span
                                                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${trace.status === 'success'
                                                        ? theme === 'dark'
                                                            ? 'bg-green-900/30 text-green-400'
                                                            : 'bg-green-100 text-green-800'
                                                        : theme === 'dark'
                                                            ? 'bg-red-900/30 text-red-400'
                                                            : 'bg-red-100 text-red-800'
                                                    }`}
                                            >
                                                {trace.status || 'N/A'}
                                            </span>
                                        </td>
                                        <td className={`p-4 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                                            {formatDuration(trace.duration_ms)}
                                        </td>
                                        <td className="p-4 text-gray-700 dark:text-gray-300">
                                            {formatPrice(trace.cost)}
                                        </td>
                                        <td className="p-4 text-gray-700 dark:text-gray-300">{trace.span_count || 0}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-0">
                                        <NoTracesFound />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredTraces.length > 0 && (
                    <div className="mt-4 flex items-center justify-between">
                        <div className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                            Showing {pageIndex * pageSize + 1} to {Math.min((pageIndex + 1) * pageSize, tracesData?.total || 0)} of{' '}
                            {tracesData?.total || 0} traces
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                                disabled={pageIndex === 0}
                                className={`rounded-lg border px-4 py-2 transition-colors disabled:opacity-50 ${theme === 'dark'
                                        ? 'border-slate-700 bg-[#0a0a0f] text-white hover:bg-slate-800'
                                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPageIndex((prev) => prev + 1)}
                                disabled={(pageIndex + 1) * pageSize >= (tracesData?.total || 0)}
                                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sessions;

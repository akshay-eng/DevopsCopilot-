import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { backendApi } from '../services/api';
import { fetchAlertHistory } from '../api/alertsApi';
import { useAlertGrouping } from '../hooks/useAlertGrouping';
import { useTimelineAlerts } from '../hooks/useTimelineAlerts';
import { useTimelineGrouped } from '../hooks/useTimelineGrouped';
import { useTimelineChanges } from '../hooks/useTimelineChanges';
import { useTimelineNetwork } from '../hooks/useTimelineNetwork';
import TimelineChart from './TimelineChart';
import { Filter, Plus, X, ChevronDown, ChevronsUpDown, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';

const Timeline = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [selectedTab, setSelectedTab] = useState('grouped');
  const [selectedFilters, setSelectedFilters] = useState(['High', 'Medium', 'Low', 'Info', 'Resolved', 'Network']);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [eventsHeight, setEventsHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [clusters, setClusters] = useState([]);
  const [timeRange, setTimeRange] = useState(24); // Default: Last 24 hours

  // Chart data — MongoDB aggregation fetches ALL occurrences (no 50-doc limit).
  // Real-time Socket.IO alerts are merged directly into `chartGroups` in the hook.
  // On Socket.IO reconnect, a full re-fetch catches any alerts missed during disconnection.
  const {
    groups: chartGroups,
    loading: chartLoading,
    error: chartError,
    refresh: refreshChart,
  } = useTimelineGrouped({ timeRangeHours: timeRange });

  // Events table / event stream — uses Redux + Socket.IO for real-time updates
  const { loading, error, hasMore, loadOlderAlerts, refresh: refreshEvents, alertsState, totalCount, loadedCount } = useTimelineAlerts({
    timeRangeHours: timeRange
  });

  // Use timeline changes hook
  const { changesState, loading: changesLoading } = useTimelineChanges({
    timeRangeHours: timeRange
  });

  // Network error groups for timeline
  const { groups: networkGroups, loading: networkLoading } = useTimelineNetwork({
    timeRangeHours: timeRange
  });

  // Group alerts (used for events table rows and allAlerts stream)
  const alertGroups = useAlertGrouping(alertsState);

  // Combined refresh — updates both chart (MongoDB aggregation) and events table (Redux)
  const refresh = useCallback(() => {
    refreshChart();
    refreshEvents();
  }, [refreshChart, refreshEvents]);

  // Apply active filter chips to chart groups — client-side, instant (no re-fetch)
  const filteredAlertGroups = useMemo(() => {
    if (!selectedFilters.length) return chartGroups;
    const want = new Set(selectedFilters.map(f => f.toLowerCase()));

    const filtered = chartGroups.filter(group => {
      const sev = (group.severity || 'info').toLowerCase();
      if (group.status === 'resolved' && want.has('resolved')) return true;
      if ((sev === 'critical' || sev === 'high')   && want.has('high'))   return true;
      if ((sev === 'warning'  || sev === 'medium') && want.has('medium')) return true;
      if (sev === 'low'                            && want.has('low'))    return true;
      if (sev === 'info'                           && want.has('info'))   return true;
      return false;
    });

    // Merge network error groups when Network filter is active
    if (want.has('network') && networkGroups.length > 0) {
      return [...filtered, ...networkGroups];
    }

    return filtered;
  }, [chartGroups, selectedFilters, networkGroups]);

  // Debug logging
  useEffect(() => {
    console.log('[Timeline] State updated:', {
      chartGroups: chartGroups.length,
      tableGroups: alertGroups.length,
      timeRange,
      chartLoading,
      hasMore
    });
  }, [chartGroups, alertGroups, timeRange, chartLoading, hasMore]);

  // Selected group for drill-down (side panel - kept for chart click)
  const [selectedGroup, setSelectedGroup] = useState(null);
  // Detailed occurrences fetched on-demand for the side panel history
  const [detailedOccurrences, setDetailedOccurrences] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch full alert details when a group is selected (on-demand, not in bulk)
  useEffect(() => {
    if (!selectedGroup) { setDetailedOccurrences([]); return; }
    let cancelled = false;
    setDetailLoading(true);
    fetchAlertHistory({ alertname: selectedGroup.name || selectedGroup.id, hours: timeRange })
      .then(res => {
        if (!cancelled && res.success) setDetailedOccurrences(res.occurrences || []);
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedGroup, timeRange]);

  // Alert name filter for Event Stream tab
  const [filterAlertName, setFilterAlertName] = useState(null);

  // Alert detail panel state
  const [selectedStreamAlert, setSelectedStreamAlert] = useState(null);
  const [alertDetailTab, setAlertDetailTab] = useState('event');
  const [rootCauseData, setRootCauseData] = useState(null);
  const [followUpMessages, setFollowUpMessages] = useState([]);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [rootCauseLoading, setRootCauseLoading] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [crashInfoExpanded, setCrashInfoExpanded] = useState(true);
  const [dataSourcesExpanded, setDataSourcesExpanded] = useState(true);
  const [followUpInput, setFollowUpInput] = useState('');
  const [enrichSections, setEnrichSections] = useState({
    resource: true, logs: true, prevLogs: false, events: true,
    metrics: true, configChanges: false, promRules: false, analysis: true
  });
  const [selectedLogContainer, setSelectedLogContainer] = useState(0);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [fetchedEnrichment, setFetchedEnrichment] = useState(null);
  const [eventLogsFilter, setEventLogsFilter] = useState('');
  const [resolvingAlertKey, setResolvingAlertKey] = useState(null);
  const toggleEnrichSection = (s) => setEnrichSections(prev => ({ ...prev, [s]: !prev[s] }));

  // Agent-driven resolve: the agent investigates on the live cluster, fixes what
  // it safely can (asking for approval in Agent Threads before anything
  // mutating), then writes the summary, updates the runbook and closes the
  // ServiceNow incident. The backend emits 'alert-resolved' over the user's own
  // socket room, which useTimelineAlerts already listens for.
  //
  // This can take minutes and may pause on a human, so the button reports what
  // stage it is at rather than pretending to be instant.
  const [resolution, setResolution] = useState(null);
  const [resolveError, setResolveError] = useState(null);

  const resolveAlert = async (alert) => {
    const key = `${alert.clusterId}-${alert.alertname}`;
    setResolvingAlertKey(key);
    setResolveError(null);
    setResolution(null);
    try {
      const r = await backendApi.post('/api/alerts/agent-resolve', {
        alertId: alert._id,
        clusterId: alert.clusterId,
        alertname: alert.alertname,
        namespace: alert.namespace,
      }, { timeout: 960000 });

      if (r?.success) setResolution(r.resolution);
      else setResolveError(r?.error || 'The agent could not resolve this alert.');
    } catch (err) {
      setResolveError(err?.response?.data?.error || err.message || 'Resolve failed.');
      console.error('Failed to resolve alert:', err);
    } finally {
      setResolvingAlertKey(null);
    }
  };

  // Show a resolution the agent produced earlier, so reopening an alert does not
  // look like nothing ever happened.
  useEffect(() => {
    if (!selectedStreamAlert?.alertname) { setResolution(null); return; }
    let cancelled = false;
    backendApi
      .get('/api/alerts/resolution', {
        params: {
          alertname: selectedStreamAlert.alertname,
          ...(selectedStreamAlert.namespace ? { namespace: selectedStreamAlert.namespace } : {}),
        },
      })
      .then((r) => { if (!cancelled && r?.resolution) setResolution(r.resolution); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedStreamAlert?.alertname, selectedStreamAlert?.namespace]);

  // Correlated incident data for the selected alert
  const [correlatedIncident, setCorrelatedIncident] = useState(null);
  const [correlatedLoading, setCorrelatedLoading] = useState(false);

  // Fetch clusters on mount
  useEffect(() => {
    const fetchClusters = async () => {
      try {
        const data = await backendApi.get('/api/clusters');
        if (data && data.clusters) {
          setClusters(data.clusters);
        }
      } catch (error) {
        console.error('Failed to fetch clusters:', error);
      }
    };
    fetchClusters();
  }, []);

  // O(1) cluster lookup instead of an O(n) .find() per row below
  const clusterById = useMemo(() => {
    const m = new Map();
    clusters.forEach(c => {
      if (c._id) m.set(c._id, c);
      if (c.id) m.set(c.id, c);
    });
    return m;
  }, [clusters]);

  // Convert alertGroups to grouped events format for table display
  const groupedEvents = useMemo(() => {
    return alertGroups.map(group => {
      const cluster = clusterById.get(group.cluster);

      // Determine priority based on severity of alerts in group
      let priority = 'LOW';
      group.occurrences.forEach(alert => {
        const severity = alert.severity?.toLowerCase();
        if (severity === 'critical' || severity === 'high') {
          priority = 'HIGH';
        } else if (priority !== 'HIGH' && (severity === 'warning' || severity === 'medium')) {
          priority = 'MEDIUM';
        }
      });

      // Get latest occurrence
      const latestOccurrence = group.occurrences[group.occurrences.length - 1];

      const fmtTs = (ms) => {
        if (!ms) return '—';
        const d = new Date(ms);
        const yr = String(d.getFullYear()).slice(-2);
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + yr + ' ' +
               d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      };
      const relativeAgo = (ms) => {
        if (!ms) return '';
        const diff = Date.now() - ms;
        if (diff < 60000) return 'just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
      };

      return {
        groupId: group.id,
        priority: priority,
        alert: group.name,
        cluster: cluster?.name || group.cluster,
        namespace: group.namespace,
        events: group.count,
        latest: fmtTs(group.lastSeen),
        latestRelative: relativeAgo(group.lastSeen),
        firstFired: fmtTs(group.startTime),
        latestTimestamp: group.lastSeen,
        description: latestOccurrence?.message || latestOccurrence?.annotations?.summary || 'No description',
        status: group.status
      };
    });
  }, [alertGroups, clusterById]);

  // Flat sorted list of all alerts (newest first)
  const allAlerts = useMemo(() => {
    const alerts = [];
    Object.keys(alertsState.alerts || {}).forEach(cid => {
      alerts.push(...(alertsState.alerts[cid] || []));
    });
    return alerts.sort((a, b) =>
      new Date(b.receivedAt || b.startsAt) - new Date(a.receivedAt || a.startsAt)
    );
  }, [alertsState.alerts]);

  // Filtered stream list (respects filterAlertName)
  const filteredStreamAlerts = useMemo(() => {
    if (!filterAlertName) return allAlerts;
    return allAlerts.filter(a => a.alertname === filterAlertName);
  }, [allAlerts, filterAlertName]);

  // Fetch correlated incident for an alert
  const fetchCorrelatedIncident = async (alert) => {
    setCorrelatedLoading(true);
    setCorrelatedIncident(null);
    try {
      const params = new URLSearchParams();
      if (alert.alertname) params.set('alertname', alert.alertname);
      if (alert.pod) params.set('pod', alert.pod);
      // Don't filter by clusterId — correlated incidents may have empty clusterId
      const data = await backendApi.get(`/api/correlation/incidents/by-alert?${params}`);
      console.log('[Timeline] Correlated incident lookup:', alert.alertname, alert.pod, '->', data?.incidents?.length || 0, 'results');
      if (data.success && data.incidents?.length > 0) {
        setCorrelatedIncident(data.incidents[0]);
      }
    } catch (e) {
      console.error('Failed to fetch correlated incident:', e);
    } finally {
      setCorrelatedLoading(false);
    }
  };

  // Open an alert in the detail panel
  const openAlertDetail = (alert) => {
    setSelectedStreamAlert(alert);
    setAlertDetailTab('event');
    setRootCauseData(null);
    setRootCauseLoading(false);
    setFollowUpInput('');
    setFetchedEnrichment(null);
    setSelectedLogContainer(0);
    setEventLogsFilter('');
    fetchCorrelatedIncident(alert);
    // Fetch enrichment (real container logs, describe, events) up front so the
    // Event tab can show real data, not just the Root Cause tab.
    if (!alert.enrichment) {
      fetchEnrichmentData(alert);
    }
  };

  // Fetch root cause analysis from backend.
  // The endpoint returns { success, cached, analysis } — unwrap so the renderer
  // always sees the analysis itself.
  const fetchRootCause = async (alert, { refresh = false } = {}) => {
    setRootCauseLoading(true);
    setFollowUpMessages([]);
    try {
      const data = await backendApi.post('/api/alerts/root-cause', { alert, refresh });
      const analysis = data?.analysis || data;
      setRootCauseData(data?.success === false ? { error: data.error } : { ...analysis, cached: data?.cached });
    } catch (e) {
      setRootCauseData({ error: e.message || 'Analysis failed' });
    } finally {
      setRootCauseLoading(false);
    }
  };

  /**
   * Ask a follow-up about this alert. The backend grounds the answer in the
   * same evidence the analysis used, so the reply is about THIS alert rather
   * than generic advice. Previously this input only cleared itself.
   */
  const sendFollowUp = async () => {
    const q = followUpInput.trim();
    if (!q || followUpBusy || !selectedStreamAlert) return;
    setFollowUpInput('');
    setFollowUpBusy(true);
    const history = followUpMessages.map((m) => ({ role: m.role, content: m.content }));
    setFollowUpMessages((prev) => [...prev, { role: 'user', content: q }]);
    try {
      const r = await backendApi.post('/api/alerts/root-cause/follow-up', {
        alert: selectedStreamAlert, question: q, history,
      });
      setFollowUpMessages((prev) => [...prev, {
        role: 'assistant',
        content: r?.success === false ? (r.error || 'No answer returned.') : (r.answer || 'No answer returned.'),
        model: r?.model,
        error: r?.success === false,
      }]);
    } catch (e) {
      setFollowUpMessages((prev) => [...prev, { role: 'assistant', content: e.message || 'Request failed.', error: true }]);
    } finally {
      setFollowUpBusy(false);
    }
  };

  // Fetch enrichment data via REST fallback
  const fetchEnrichmentData = async (alert) => {
    if (!alert?.alertname) return;
    setEnrichmentLoading(true);
    try {
      const data = await backendApi.get(`/api/alerts/enrichment/${encodeURIComponent(alert.alertname)}`, {
        params: { clusterId: alert.clusterId }
      });
      if (data?.enrichment) setFetchedEnrichment(data.enrichment);
    } catch (e) {
      console.error('Failed to fetch enrichment:', e);
    } finally {
      setEnrichmentLoading(false);
    }
  };

  // Runbook suggestions by alert type
  const getSuggestedActions = (alertname = '') => {
    const n = alertname.toLowerCase();
    if (n.includes('crashloop')) return [
      'Check container logs: kubectl logs <pod> --previous -n <namespace>',
      'Describe the pod for events: kubectl describe pod <pod> -n <namespace>',
      'Verify environment variables and secrets are correctly mounted',
      'Check resource limits — OOM may cause restarts without CrashLoopBackOff reason',
      'Review recent deployments or config changes that may have broken the container',
    ];
    if (n.includes('oom') || n.includes('memory')) return [
      'Check current memory usage: kubectl top pod <pod> -n <namespace>',
      'Review resource limits in the deployment spec',
      'Analyze heap dumps or memory profiles if available',
      'Consider increasing memory limits or optimizing application memory usage',
    ];
    if (n.includes('pending') || n.includes('notready')) return [
      'Check node capacity: kubectl describe nodes',
      'Review pod scheduling constraints (affinity, taints, tolerations)',
      'Verify PersistentVolumeClaims are bound',
      'Check for resource quotas that may be blocking scheduling',
    ];
    if (n.includes('cpu') || n.includes('throttl')) return [
      'Review CPU requests and limits in the deployment',
      'Check horizontal pod autoscaler (HPA) configuration',
      'Profile application for CPU-intensive operations',
      'Consider adding more replicas to distribute load',
    ];
    return [
      'Review alert description and labels for context',
      'Check recent events: kubectl get events -n <namespace> --sort-by=.lastTimestamp',
      'Inspect pod/deployment status with kubectl describe',
      'Review Prometheus alert rule configuration',
      'Check related metrics in Grafana dashboards',
    ];
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return theme === 'dark' ? 'bg-red-500' : 'bg-red-600';
      case 'medium': return theme === 'dark' ? 'bg-orange-500' : 'bg-orange-600';
      case 'low': return theme === 'dark' ? 'bg-yellow-500' : 'bg-yellow-600';
      case 'info': return theme === 'dark' ? 'bg-slate-500' : 'bg-slate-600';
      default: return theme === 'dark' ? 'bg-slate-500' : 'bg-slate-600';
    }
  };


  const handleMouseDown = (e) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight >= 200 && newHeight <= 600) {
        setEventsHeight(newHeight);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b`}>
        {/* Top toolbar row */}
        <div className="flex items-center px-4 py-2.5 gap-1.5">
          {/* Left: title + action buttons */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <button className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
              </svg>
            </button>
            <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Timeline</span>
            <div className={`w-px h-5 mx-1 ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
            <button className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors`}>
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"/>
              </svg>
              Presets
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
            <button className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Cluster
            </button>
            <button className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              Namespace
            </button>
            <button className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 ${theme === 'dark' ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-white'} transition-colors`}>
              Save
              <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
          </div>

          {/* Right: time range + controls */}
          <div className="flex items-center gap-1.5">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-gray-50 border-gray-300 text-gray-700'}`}>
              <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(Number(e.target.value))}
                className="bg-transparent focus:outline-none cursor-pointer"
              >
                <option value={0}>All Alerts</option>
                <option value={6}>Last 6 hrs</option>
                <option value={24}>Last 1 Day</option>
                <option value={48}>Last 48 hrs</option>
                <option value={168}>Last 7 Days</option>
                <option value={720}>Last 30 Days</option>
              </select>
            </div>
            <button
              onClick={refresh}
              className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-400 hover:text-slate-200' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'} transition-colors`}
              title="Refresh"
            >
              <svg className={`w-3.5 h-3.5 ${(chartLoading || loading) ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${theme === 'dark' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700' : 'bg-blue-100 text-blue-700 border border-green-300'}`}>AUTO</span>
            <button className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-500' : 'hover:bg-gray-100 text-gray-400'} transition-colors`} title="Settings">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </button>
            <button className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-500' : 'hover:bg-gray-100 text-gray-400'} transition-colors`} title="Info">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
            <button className={`p-1.5 rounded ${theme === 'dark' ? 'hover:bg-slate-700 text-slate-500' : 'hover:bg-gray-100 text-gray-400'} transition-colors`} title="Share">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
            </button>
          </div>
        </div>

        {/* Filter bar — Robusta-style chip filters */}
        <div className={`flex items-center px-4 py-2 gap-1.5 border-t flex-wrap ${theme === 'dark' ? 'border-slate-800/60' : 'border-gray-100'}`}>
          <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium mr-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
            <Filter size={14} strokeWidth={2} /> Filters
          </span>

          {/* App (ghost) */}
          <button className={`inline-flex items-center gap-1 text-[13px] px-2 py-1 rounded-lg transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
            <Plus size={13} strokeWidth={2.2} /> App
          </button>

          {/* Priority dropdown chip */}
          <div className="relative">
            <button
              onClick={() => setPriorityMenuOpen(o => !o)}
              className={`inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-lg border transition-colors ${theme === 'dark' ? 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600' : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              <SlidersHorizontal size={12} className="opacity-60" />
              Priority
              <span className={`mx-0.5 w-px h-3.5 ${theme === 'dark' ? 'bg-slate-600' : 'bg-gray-300'}`} />
              <span className={`font-medium ${theme === 'dark' ? 'text-slate-100' : 'text-gray-800'}`}>
                {selectedFilters.length === 0 ? 'None' : selectedFilters.slice(0, 2).join(', ')}
              </span>
              {selectedFilters.length > 2 && (
                <span className="px-1.5 py-px rounded-full text-[10px] font-semibold bg-blue-500 text-white">+{selectedFilters.length - 2}</span>
              )}
              <ChevronDown size={13} className="opacity-60" />
            </button>
            {priorityMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setPriorityMenuOpen(false)} />
                <div className={`absolute z-40 mt-1 w-48 rounded-xl border shadow-xl py-1.5 ${theme === 'dark' ? 'bg-[#161616] border-slate-700' : 'bg-white border-gray-200'}`}>
                  {['High', 'Medium', 'Low', 'Info', 'Resolved', 'Network', 'Changes'].map(k => {
                    const on = selectedFilters.includes(k);
                    return (
                      <button
                        key={k}
                        onClick={() => setSelectedFilters(p => p.includes(k) ? p.filter(f => f !== k) : [...p, k])}
                        className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] ${theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-50'}`}
                      >
                        <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${on ? 'bg-blue-500 border-blue-500' : (theme === 'dark' ? 'border-slate-600' : 'border-gray-300')}`}>
                          {on && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </span>
                        {k}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Source / More filters (ghost) */}
          <button className={`inline-flex items-center gap-1 text-[13px] px-2 py-1 rounded-lg transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
            <Plus size={13} strokeWidth={2.2} /> Source
          </button>
          <button className={`inline-flex items-center gap-1 text-[13px] px-2 py-1 rounded-lg transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}>
            <Plus size={13} strokeWidth={2.2} /> More filters
          </button>

          {/* Clear All */}
          <button
            onClick={() => { setSelectedFilters(['High', 'Medium', 'Low', 'Info', 'Resolved', 'Network']); setSearchQuery(''); }}
            className="text-[13px] font-medium text-blue-600 hover:text-blue-700 ml-1"
          >
            Clear All
          </button>

          {/* Search */}
          <div className="relative flex-shrink-0 ml-auto">
            <SearchIcon size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type / to search"
              className={`w-56 pl-8 pr-3 py-1.5 text-[13px] rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 ${theme === 'dark' ? 'bg-slate-800/60 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`}
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className={`${theme === 'dark' ? 'bg-[#0f0f1a] border-slate-800' : 'bg-gray-50 border-gray-200'} border-b px-4 py-2`}>
        <div className="flex items-center gap-x-5 text-xs">
          {/* Severity circles */}
          {[
            { label: 'High',     color: '#ef4444' },
            { label: 'Medium',   color: '#a855f7' },
            { label: 'Low',      color: '#eab308' },
            { label: 'Info',     color: '#3b82f6' },
            { label: 'Resolved', color: '#3b82f6' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 10 10">
                <circle cx="5" cy="5" r="4.5" fill={color}/>
              </svg>
              <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>{label}</span>
            </div>
          ))}

          {/* Changes — gear-in-border-circle */}
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${theme === 'dark' ? 'border-slate-500' : 'border-gray-400'}`}>
              <svg className={`w-2.5 h-2.5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/>
              </svg>
            </span>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>Changes</span>
          </div>

          {/* Network errors — triangle */}
          <div className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <polygon points="5,0.5 9.5,9.5 0.5,9.5" fill="#f97316"/>
            </svg>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>Network Errors</span>
          </div>

          {/* K8s Events — diamond */}
          <div className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="5" y="0.5" width="6.4" height="6.4" rx="0.5" fill={theme === 'dark' ? '#67e8f9' : '#0891b2'} transform="rotate(45 5 5)"/>
            </svg>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>K8s Events</span>
          </div>

          {(error || chartError) && <span className="text-xs text-red-500 ml-2">{chartError || error}</span>}

          {/* Right side */}
          <div className="ml-auto flex items-center gap-4">
            <span className={`text-xs ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`}>Alt+Drag to pan</span>
            <button className={`text-xs flex items-center gap-1 ${theme === 'dark' ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'} transition-colors`}>
              Group by
              <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>| Alert</span>
              <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Timeline Chart - min-h-0 lets flex-1 actually shrink correctly */}
      <div
        className={`flex-1 min-h-0 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}
      >
        <TimelineChart
          alertGroups={filteredAlertGroups}
          onGroupClick={(group) => setSelectedGroup(group)}
          onDotClick={(occ, group) => {
            // Only open enrichment detail sidebar — don't open alert history
            const alertObj = {
              ...occ,
              alertname: group.name || group.id,
              severity: occ.severity || group.severity,
              namespace: occ.namespace || group.namespace,
              pod: occ.pod || group.pod,
              clusterId: occ.clusterId || group.clusterId,
              clusterName: occ.clusterName || group.clusterName,
              message: occ.message || group.message,
              summary: occ.summary || group.summary,
              description: occ.description || group.description,
            };
            openAlertDetail(alertObj);
            setAlertDetailTab('metrics');
            // Fetch enrichment for this dot from the history endpoint
            fetchAlertHistory({ alertname: group.name || group.id, hours: timeRange, limit: 5 })
              .then(res => {
                if (res.success && res.occurrences?.length) {
                  // Find closest occurrence by time
                  const dotTime = new Date(occ.receivedAt || occ.startsAt).getTime();
                  const sorted = res.occurrences
                    .filter(o => o.enrichment?.metrics || o.enrichment?.logs)
                    .sort((a, b) => Math.abs(new Date(a.receivedAt).getTime() - dotTime) - Math.abs(new Date(b.receivedAt).getTime() - dotTime));
                  const best = sorted[0];
                  if (best) {
                    setSelectedStreamAlert(prev => prev?.receivedAt === alertObj.receivedAt
                      ? { ...prev, enrichment: best.enrichment }
                      : prev
                    );
                  }
                }
              });
          }}
          theme={theme}
          timeRangeHours={timeRange}
          loading={chartLoading}
        />
      </div>

      {/* Resizable Border */}
      <div
        className={`h-1 flex-none ${isDragging ? 'bg-violet-500' : theme === 'dark' ? 'bg-slate-700 hover:bg-violet-500' : 'bg-gray-300 hover:bg-blue-500'} cursor-ns-resize transition-colors`}
        onMouseDown={handleMouseDown}
      ></div>

      {/* Events Section */}
      <div
        className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-t overflow-hidden flex flex-col flex-none`}
        style={{ height: `${eventsHeight}px` }}
      >
        <div className="flex items-center space-x-4 px-6 py-3 flex-none border-b border-slate-800">
          <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Events</h2>
          <button
            onClick={() => setSelectedTab('grouped')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectedTab === 'grouped'
                ? theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-900'
                : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Grouped Events <span className={`ml-2 px-2 py-0.5 ${theme === 'dark' ? 'bg-red-600' : 'bg-red-500'} text-white rounded text-xs`}>{groupedEvents.length}</span>
          </button>
          <button
            onClick={() => setSelectedTab('stream')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectedTab === 'stream'
                ? theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-900'
                : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Event Stream <span className={`ml-2 px-2 py-0.5 ${theme === 'dark' ? 'bg-red-600' : 'bg-red-500'} text-white rounded text-xs`}>{groupedEvents.reduce((sum, e) => sum + e.events, 0)}</span>
          </button>
          {/* Filter chip — shown when Event Stream is filtered by an alert name */}
          {filterAlertName && (
            <div className={`flex items-center space-x-1 px-3 py-1.5 ${theme === 'dark' ? 'bg-violet-900/50 border border-violet-700 text-violet-300' : 'bg-blue-50 border border-blue-300 text-blue-700'} rounded-full text-xs font-medium`}>
              <span>Filtering on: {filterAlertName}</span>
              <button
                onClick={() => setFilterAlertName(null)}
                className={`ml-1 ${theme === 'dark' ? 'hover:text-white' : 'hover:text-blue-900'} transition-colors`}
                aria-label="Clear filter"
              >
                ×
              </button>
            </div>
          )}
          <div className="ml-auto">
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <span>Export</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Events Content */}
        <div className={`flex-1 overflow-auto`} style={{ margin: 0, padding: 0, backgroundColor: theme === 'dark' ? '#1a1a2e' : 'white' }}>
          {selectedTab === 'grouped' ? (
            <table className="w-full" style={{ margin: 0, borderSpacing: 0, borderCollapse: 'collapse', minHeight: '100%' }}>
                <thead className={`${theme === 'dark' ? 'bg-[#141414] border-slate-800' : 'bg-white border-gray-200'} border-b sticky top-0 z-10`}>
                  <tr>
                    {[
                      { label: 'Priority', sort: true },
                      { label: 'Alert', sort: true },
                      { label: 'Cluster', sort: false },
                      { label: 'Events', sort: true },
                      { label: 'Latest', sort: true },
                      { label: 'Latest event', sort: false },
                    ].map(({ label, sort }) => (
                      <th key={label} className={`px-6 py-2.5 text-left text-[11px] font-medium ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                        <span className="inline-flex items-center gap-1 cursor-pointer select-none hover:opacity-80">
                          {label}
                          {sort && <ChevronsUpDown size={12} className="opacity-40" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`${theme === 'dark' ? 'divide-slate-800' : 'divide-gray-200'} divide-y`}>
                {groupedEvents.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center">
                      {loading ? (
                        <div className="flex items-center justify-center gap-3">
                          <svg className={`animate-spin h-5 w-5 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>Loading alerts…</span>
                        </div>
                      ) : (
                        <div className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>
                          No alerts found for this time range
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  groupedEvents.map((event, idx) => (
                    <tr
                      key={idx}
                      className={`${theme === 'dark' ? 'hover:bg-slate-800/30' : 'hover:bg-gray-50'} transition-colors`}
                    >
                      {/* Priority pill (hardcoded severity colours; unaffected by the purple->green remap) */}
                      <td className="px-6 py-3.5">
                        {(() => {
                          const SEV = { high: '#ef4444', medium: '#a855f7', low: '#eab308', info: '#3b82f6', resolved: '#3b82f6' };
                          const c = SEV[(event.priority || '').toLowerCase()] || '#6b7280';
                          return (
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
                              style={{ background: `${c}22`, color: c }}>
                              {event.priority}
                            </span>
                          );
                        })()}
                      </td>
                      {/* Alert — green link with a subtle firing/resolved status dot */}
                      <td className="px-6 py-3.5">
                        <button
                          className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-600 hover:text-blue-700 hover:underline text-left"
                          onClick={() => { setFilterAlertName(event.alert); setSelectedTab('stream'); }}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${event.status === 'firing' ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} title={event.status === 'firing' ? 'Firing' : 'Resolved'} />
                          {event.alert}
                        </button>
                      </td>
                      <td className={`px-6 py-3.5 text-[13px] ${theme === 'dark' ? 'text-slate-300' : 'text-gray-600'}`}>{event.cluster}</td>
                      <td className="px-6 py-3.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilterAlertName(event.alert);
                            setSelectedTab('stream');
                          }}
                          className={`inline-flex px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${theme === 'dark' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'}`}
                        >
                          View {event.events} event{event.events > 1 ? 's' : ''}
                        </button>
                      </td>
                      <td className={`px-6 py-3.5 text-[13px] whitespace-nowrap ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                        <div>{event.latest}</div>
                        <div className={`text-[11px] mt-0.5 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>{event.latestRelative}</div>
                      </td>
                      <td className={`px-6 py-3.5 text-[13px] max-w-md truncate ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>{event.description}</td>
                    </tr>
                  ))
                )}
                </tbody>
                <tfoot>
                  {/* Load More Button */}
                  {hasMore && groupedEvents.length > 0 && (
                    <tr>
                      <td colSpan="6" className="px-6 py-4 text-center border-t border-slate-800">
                        <div className="flex flex-col items-center space-y-2">
                          {timeRange === 0 && totalCount > 0 && (
                            <div className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                              Loaded {loadedCount} of {totalCount} alerts ({Math.round((loadedCount / totalCount) * 100)}%)
                            </div>
                          )}
                          <button
                            onClick={loadOlderAlerts}
                            disabled={loading}
                            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                              loading
                                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                : theme === 'dark'
                                ? 'bg-slate-800 text-violet-400 hover:bg-slate-700'
                                : 'bg-gray-100 text-blue-600 hover:bg-gray-200'
                            }`}
                          >
                            {loading ? 'Loading...' : `Load More (${timeRange === 0 ? '50' : '100'} at a time)`}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Spacer to fill remaining height */}
                  <tr style={{ height: '100%' }}>
                    <td colSpan="6" style={{ height: '100%', padding: 0, border: 'none' }}></td>
                  </tr>
                </tfoot>
            </table>
          ) : (
            <div>
              {filteredStreamAlerts.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  {loading ? (
                    <div className="flex items-center justify-center gap-3">
                      <svg className={`animate-spin h-5 w-5 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>Loading alerts…</span>
                    </div>
                  ) : (
                    <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                      {filterAlertName ? `No events found for "${filterAlertName}".` : 'No events found. Waiting for alerts from Kafka...'}
                    </div>
                  )}
                </div>
              ) : (
                <div className={`divide-y ${theme === 'dark' ? 'divide-slate-800/60' : 'divide-gray-100'}`}>
                  {(() => {
                    const getDateLabel = (ts) => {
                      const d = new Date(ts);
                      const now = new Date();
                      if (d.toDateString() === now.toDateString()) return 'Today';
                      const yest = new Date(now - 86400000);
                      if (d.toDateString() === yest.toDateString()) return 'Yesterday';
                      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
                    };
                    let lastDateLabel = null;
                    return filteredStreamAlerts.map((alert, idx) => {
                      const ts = new Date(alert.receivedAt || alert.startsAt);
                      const dateLabel = getDateLabel(ts);
                      const showSep = dateLabel !== lastDateLabel;
                      lastDateLabel = dateLabel;
                      const cluster = clusters.find(c => c._id === alert.clusterId || c.id === alert.clusterId);
                      const isFiring = alert.status === 'firing';
                      const dotColor = alert.severity === 'critical' || alert.severity === 'high'
                        ? 'bg-red-500'
                        : alert.severity === 'warning' || alert.severity === 'medium'
                        ? 'bg-purple-500'
                        : alert.status === 'resolved'
                        ? 'bg-green-500'
                        : 'bg-blue-400';
                      const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                      const dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' });
                      const diffMs = Date.now() - ts.getTime();
                      const relStr = diffMs < 60000 ? 'just now' :
                        diffMs < 3600000 ? `${Math.floor(diffMs / 60000)}m ago` :
                        diffMs < 86400000 ? `${Math.floor(diffMs / 3600000)}h ago` :
                        `${Math.floor(diffMs / 86400000)}d ago`;
                      const desc = alert.annotations?.description || alert.message || alert.annotations?.summary || '';
                      const contextParts = [];
                      if (alert.pod && alert.pod !== 'N/A') contextParts.push(alert.pod);
                      else if (alert.namespace) contextParts.push(alert.namespace);
                      if (cluster?.name || alert.clusterId) contextParts.push(cluster?.name || alert.clusterId);
                      const isSelected = selectedStreamAlert === alert;
                      return (
                        <React.Fragment key={idx}>
                          {showSep && (
                            <div className={`px-4 py-1.5 text-xs font-semibold sticky top-0 z-10 ${theme === 'dark' ? 'bg-slate-900/90 text-slate-500 border-slate-800' : 'bg-gray-100/90 text-gray-500 border-gray-200'} border-b backdrop-blur-sm`}>
                              {dateLabel}
                            </div>
                          )}
                          <div
                            onClick={() => openAlertDetail(alert)}
                            className={`px-4 py-2.5 cursor-pointer transition-colors flex items-center space-x-3 ${
                              isSelected
                                ? theme === 'dark' ? 'bg-violet-900/30 border-l-2 border-violet-500' : 'bg-blue-50 border-l-2 border-blue-500'
                                : theme === 'dark' ? 'hover:bg-slate-800/40' : 'hover:bg-gray-50'
                            }`}
                          >
                            <span className={`flex-shrink-0 w-2 h-2 rounded-full ${dotColor}`}></span>
                            <span className={`flex-shrink-0 text-xs font-mono ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} w-44`}>
                              <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>{dateStr} {timeStr}</span>
                              <span className={`ml-1 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`}>({relStr})</span>
                            </span>
                            {!filterAlertName && (
                              <span className={`flex-shrink-0 text-xs font-semibold ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'} w-48 truncate`}>
                                {alert.alertname}
                              </span>
                            )}
                            <span className={`flex-1 text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} truncate`}>
                              {desc || (contextParts.length > 0 ? contextParts.join(' · ') : alert.alertname)}
                            </span>
                            {contextParts.length > 0 && (
                              <span className={`flex-shrink-0 text-xs ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'} truncate max-w-xs hidden sm:block`}>
                                {contextParts.join(' · ')}
                              </span>
                            )}
                            <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs rounded ${isFiring ? (theme === 'dark' ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-600') : (theme === 'dark' ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600')}`}>
                              {isFiring ? 'firing' : 'resolved'}
                            </span>
                          </div>
                        </React.Fragment>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Alert Detail Panel */}
      {selectedStreamAlert && (() => {
        const a = selectedStreamAlert;
        const dk = theme === 'dark';
        const cluster = clusters.find(c => c._id === a.clusterId || c.id === a.clusterId);
        const currentIdx = filteredStreamAlerts.indexOf(a);
        const labels = (typeof a.labels === 'object' && a.labels !== null) ? a.labels : {};
        const annotations = (typeof a.annotations === 'object' && a.annotations !== null) ? a.annotations : {};
        const container = labels.container || labels.exported_container;
        const deployment = labels.deployment || labels.replicaset;
        const kind = labels.kind || (deployment ? 'Deployment' : container ? 'Pod' : 'K8s Resource');
        const workloadName = deployment || labels.pod || a.pod;
        const runbookUrl = annotations.runbook_url || annotations.runbookUrl;
        const isCrashRelated = a.alertname?.toLowerCase().includes('crash') || a.alertname?.toLowerCase().includes('oom') || !!container;

        // Shared enrichment data (kubectl describe, logs, events, metrics) — used by
        // both the Event tab (real logs / crash info) and the Root Cause tab.
        const liveA = allAlerts.find(la => la.id === a.id) || a;
        const isFiring = liveA.status === 'firing';
        const enrichment = liveA.enrichment || a.enrichment || fetchedEnrichment;
        const ed = enrichment?.data;
        const crashContainerStatus = ed?.describe?.status?.containerStatuses?.find(cs => cs.name === (labels.container || container))
          || ed?.describe?.status?.containerStatuses?.[0];

        const dataSources = ['fetch_configuration_changes', 'kubectl_describe', 'kubectl_get_by_name'];
        if (a.pod || container) {
          dataSources.push('kubectl_previous_logs_all_containers');
          dataSources.push('kubectl_logs_all_containers');
        }
        dataSources.push('list_prometheus_rules');
        if (a.namespace) dataSources.push('kubectl_get_events');

        return (
          <div className={`fixed inset-y-0 right-0 w-[680px] ${dk ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} shadow-2xl border-l overflow-hidden flex flex-col z-50`}>

            {/* ── Top navigation bar ── */}
            <div className={`flex items-center px-4 py-3 border-b ${dk ? 'border-slate-800' : 'border-gray-200'} flex-none gap-2`}>
              <button
                onClick={() => currentIdx > 0 && openAlertDetail(filteredStreamAlerts[currentIdx - 1])}
                disabled={currentIdx <= 0}
                className={`p-1 rounded text-lg leading-none ${currentIdx <= 0 ? 'opacity-25 cursor-not-allowed' : dk ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
              >«</button>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className={`text-sm font-semibold truncate max-w-[180px] ${dk ? 'text-white' : 'text-gray-900'}`}>{a.alertname}</span>
                <span className={`text-xs font-mono ${dk ? 'text-slate-500' : 'text-gray-400'}`}>
                  {(() => {
                    const d = new Date(a.receivedAt || a.startsAt);
                    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' +
                           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                  })()}
                </span>
              </div>
              <button
                onClick={() => currentIdx < filteredStreamAlerts.length - 1 && openAlertDetail(filteredStreamAlerts[currentIdx + 1])}
                disabled={currentIdx >= filteredStreamAlerts.length - 1}
                className={`p-1 rounded text-lg leading-none ${currentIdx >= filteredStreamAlerts.length - 1 ? 'opacity-25 cursor-not-allowed' : dk ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-gray-100 text-gray-600'}`}
              >»</button>
              <div className="w-px h-5 bg-slate-700 mx-1"></div>
              {isFiring && (
                <button
                  onClick={() => resolveAlert(a)}
                  disabled={resolvingAlertKey === `${a.clusterId}-${a.alertname}`}
                  className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${dk ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span>✓</span>
                  <span>
                    {resolvingAlertKey === `${a.clusterId}-${a.alertname}`
                      ? 'Agent working — approve in Agent Threads…'
                      : 'Resolve with agent'}
                  </span>
                </button>
              )}
              <button className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${dk ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                <span>🔕</span><span>Silence</span>
              </button>
              <button className={`px-3 py-1 text-xs rounded ${dk ? 'bg-violet-700 hover:bg-violet-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
                View App Details
              </button>
              <button
                onClick={() => setSelectedStreamAlert(null)}
                className={`p-1.5 rounded ${dk ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* ── Tab bar ── */}
            <div className={`flex border-b ${dk ? 'border-slate-800' : 'border-gray-200'} flex-none`}>
              {[
                { id: 'event', label: 'Event' },
                { id: 'metrics', label: 'Metrics' },
                { id: 'rootcause', label: 'Root Cause', dot: true },
                { id: 'runbooks', label: 'Runbooks' },
                { id: 'datasources', label: 'Data sources' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setAlertDetailTab(tab.id);
                    if (tab.id === 'rootcause' && !rootCauseData && !rootCauseLoading) {
                      fetchRootCause(a);
                    }
                    if (tab.id === 'rootcause') {
                      const liveA = allAlerts.find(la => la.id === a.id);
                      if (!liveA?.enrichment && !a.enrichment && !fetchedEnrichment && !enrichmentLoading) {
                        fetchEnrichmentData(a);
                      }
                    }
                  }}
                  className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                    alertDetailTab === tab.id
                      ? dk ? 'border-violet-500 text-violet-400' : 'border-blue-600 text-blue-600'
                      : `border-transparent ${dk ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`
                  }`}
                >
                  {tab.label}
                  {tab.dot && (
                    <span className={`ml-1.5 w-1.5 h-1.5 rounded-full inline-block align-middle ${rootCauseLoading ? 'bg-orange-400 animate-pulse' : rootCauseData ? 'bg-purple-500' : 'bg-orange-400'}`}></span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <div className="flex-1 overflow-y-auto">

              {/* EVENT TAB */}
              {alertDetailTab === 'event' && (
                <div className="p-5 space-y-5">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-lg ${dk ? 'text-violet-400' : 'text-purple-600'}`}>◆</span>
                      <h3 className={`text-lg font-bold ${dk ? 'text-white' : 'text-gray-900'}`}>{a.alertname}</h3>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${dk ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                      Source <span className="font-medium">{cluster?.name || a.clusterName || 'Unknown'}</span>
                    </span>
                  </div>

                  {/* Time */}
                  <div className={`text-sm ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                    <span className={`font-medium mr-1 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Time:</span>
                    {new Date(a.receivedAt || a.startsAt).toLocaleString()}
                  </div>

                  {/* Metadata chips */}
                  <div className="flex flex-wrap gap-2">
                    {cluster && (
                      <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${dk ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                        <span className={dk ? 'text-slate-500' : 'text-gray-400'}>Cluster</span>
                        <span className="font-medium">{cluster.name}</span>
                        <svg className="w-3 h-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </span>
                    )}
                    {a.namespace && (
                      <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${dk ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                        <span className={dk ? 'text-slate-500' : 'text-gray-400'}>Namespace</span>
                        <span className="font-medium">{a.namespace}</span>
                      </span>
                    )}
                    <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${dk ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                      <span className={dk ? 'text-slate-500' : 'text-gray-400'}>Kind</span>
                      <span className="font-medium">{kind}</span>
                    </span>
                    {workloadName && (
                      <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded ${dk ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                        <span className={dk ? 'text-slate-500' : 'text-gray-400'}>Name</span>
                        <span className="font-medium truncate max-w-[160px]">{workloadName}</span>
                      </span>
                    )}
                    <span className={`px-2 py-1 text-xs rounded font-medium ${a.status === 'firing' ? (dk ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-600') : (dk ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600')}`}>
                      {a.status?.toUpperCase()}
                    </span>
                  </div>

                  {/* Subject (pod) */}
                  {(a.pod || labels.pod) && (
                    <div className={`text-sm ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                      <span className={`font-medium mr-2 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Subject</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${dk ? 'bg-slate-700 text-violet-400' : 'bg-gray-100 text-blue-600'}`}>
                        <span className="truncate max-w-[340px]">{a.pod || labels.pod}</span>
                        <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  {(annotations.description || a.message || annotations.summary) && (
                    <div>
                      <div className={`font-medium text-sm mb-1.5 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Description:</div>
                      <div className={`text-sm leading-relaxed ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                        {annotations.description || a.message || annotations.summary}
                      </div>
                    </div>
                  )}

                  {/* Logs section */}
                  <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                    <button
                      onClick={() => setLogsExpanded(!logsExpanded)}
                      className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${dk ? 'hover:bg-slate-800/50 text-white' : 'hover:bg-gray-50 text-gray-900'}`}
                    >
                      <svg className={`w-4 h-4 transition-transform ${logsExpanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      Logs
                      {enrichmentLoading && !ed && <span className={`text-xs font-normal ${dk ? 'text-slate-500' : 'text-gray-400'}`}>(loading...)</span>}
                    </button>
                    {logsExpanded && (() => {
                      const logContainers = ed?.currentLogs?.containers || [];
                      const activeContainer = logContainers[selectedLogContainer] || logContainers[0];
                      const realLines = activeContainer ? (activeContainer.logs || '').split('\n').filter(l => l.trim()) : [];
                      const filteredLines = eventLogsFilter
                        ? realLines.filter(l => l.toLowerCase().includes(eventLogsFilter.toLowerCase()))
                        : realLines;
                      return (
                        <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                          <div className={`flex items-center gap-2 px-4 py-2 ${dk ? 'bg-slate-800/50' : 'bg-gray-50'} border-b ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                            <input
                              type="text"
                              value={eventLogsFilter}
                              onChange={(e) => setEventLogsFilter(e.target.value)}
                              placeholder="Type / to search"
                              className={`text-xs px-2 py-1 rounded border w-48 ${dk ? 'bg-slate-700 border-slate-600 text-slate-300 placeholder-slate-500' : 'bg-white border-gray-300 text-gray-700 placeholder-gray-400'} focus:outline-none`}
                            />
                            {logContainers.length > 1 && (
                              <div className="flex gap-1">
                                {logContainers.map((c, i) => (
                                  <button key={i} onClick={() => setSelectedLogContainer(i)}
                                    className={`px-2 py-1 text-xs font-mono rounded ${selectedLogContainer === i
                                      ? dk ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-900'
                                      : dk ? 'text-slate-500 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                  >{c.name}</button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className={`p-3 font-mono text-xs ${dk ? 'bg-[#0d0d1a] text-slate-300' : 'bg-gray-900 text-green-400'} min-h-[80px] max-h-64 overflow-auto`}>
                            {realLines.length > 0 ? (
                              filteredLines.length > 0 ? (
                                <div className="space-y-0.5">
                                  {filteredLines.map((line, i) => {
                                    const isError = /\b(error|exception|fatal|panic|failed|failure)\b/i.test(line);
                                    const isWarning = /\b(warn|warning)\b/i.test(line);
                                    return (
                                      <div key={i} className={`flex gap-3 ${isError ? 'text-red-400' : isWarning ? 'text-yellow-400' : ''}`}>
                                        <span className={`select-none ${dk ? 'text-slate-600' : 'text-gray-600'}`}>{i + 1}</span>
                                        <span>{line}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className={dk ? 'text-slate-600' : 'text-gray-500'}>No log lines match "{eventLogsFilter}".</span>
                              )
                            ) : (annotations.description || annotations.summary) ? (
                              <div className="space-y-1">
                                {[annotations.description, annotations.summary].filter(Boolean).map((line, i) => (
                                  <div key={i} className="flex gap-3">
                                    <span className={`select-none ${dk ? 'text-slate-600' : 'text-gray-600'}`}>{i + 1}</span>
                                    <span>{line}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className={dk ? 'text-slate-600' : 'text-gray-500'}>No log data available for this alert.</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Container Crash Information */}
                  {isCrashRelated && (
                    <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                      <button
                        onClick={() => setCrashInfoExpanded(!crashInfoExpanded)}
                        className={`w-full flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${dk ? 'hover:bg-slate-800/50 text-white' : 'hover:bg-gray-50 text-gray-900'}`}
                      >
                        <svg className={`w-4 h-4 transition-transform ${crashInfoExpanded ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        Container Crash Information
                      </button>
                      {crashInfoExpanded && (
                        <div className={`border-t ${dk ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-700'} p-4 space-y-5`}>
                          <div>
                            <div className={`text-sm font-semibold mb-3 ${dk ? 'text-white' : 'text-gray-900'}`}>Crash Info</div>
                            <div className="grid grid-cols-2 gap-y-3 text-sm">
                              {[
                                ['Container', labels.container || container || 'N/A'],
                                ['Restarts', crashContainerStatus?.restartCount ?? labels.restarts ?? labels.restart_count ?? 'N/A'],
                                ['Status', crashContainerStatus?.state ? Object.keys(crashContainerStatus.state)[0]?.toUpperCase() : (a.status === 'firing' ? 'WAITING' : 'RUNNING')],
                                ['Reason', crashContainerStatus?.state?.waiting?.reason || crashContainerStatus?.state?.terminated?.reason || a.alertname],
                              ].map(([k, v]) => (
                                <div key={k}>
                                  <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'} mb-0.5`}>{k}</div>
                                  <div className="font-medium text-sm">{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className={`pt-4 border-t ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                            <div className={`text-sm font-semibold mb-3 ${dk ? 'text-white' : 'text-gray-900'}`}>Previous Container</div>
                            <div className="grid grid-cols-2 gap-y-3 text-sm">
                              {(crashContainerStatus?.lastState?.terminated ? [
                                ['Status', 'TERMINATED'],
                                ['Reason', crashContainerStatus.lastState.terminated.reason || 'Unknown'],
                                ['Exit code', crashContainerStatus.lastState.terminated.exitCode ?? 'N/A'],
                                ['Started at', crashContainerStatus.lastState.terminated.startedAt || 'N/A'],
                                ['Finished at', crashContainerStatus.lastState.terminated.finishedAt || 'N/A'],
                              ] : [
                                ['Status', 'No previous termination recorded'],
                                ['Started at', a.startsAt ? new Date(a.startsAt).toISOString() : 'N/A'],
                                ['Finished at', a.endsAt ? new Date(a.endsAt).toISOString() : 'N/A'],
                              ]).map(([k, v]) => (
                                <div key={k}>
                                  <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'} mb-0.5`}>{k}</div>
                                  <div className={`font-medium text-xs break-all`}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Alert Occurrence Summary */}
                  {(() => {
                    // Find matching group from alertGroups to get occurrence count & first seen
                    const matchingGroup = alertGroups.find(g => g.name === a.alertname || g.id === a.alertname);
                    const occCount = matchingGroup?.count || 1;
                    const firstSeen = matchingGroup?.startTime ? new Date(matchingGroup.startTime).toLocaleString() : (a.startsAt ? new Date(a.startsAt).toLocaleString() : 'N/A');
                    return (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <div className={`px-4 py-3 text-sm font-medium ${dk ? 'text-white' : 'text-gray-900'} flex items-center gap-2`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Alert History
                        </div>
                        <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'} px-4 py-3`}>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'} mb-0.5`}>First Occurrence</div>
                              <div className={`text-sm font-medium ${dk ? 'text-slate-200' : 'text-gray-800'}`}>{firstSeen}</div>
                            </div>
                            <div>
                              <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'} mb-0.5`}>Total Occurrences</div>
                              <div className={`text-sm font-bold ${occCount > 5 ? 'text-red-400' : occCount > 1 ? 'text-amber-400' : dk ? 'text-slate-200' : 'text-gray-800'}`}>{occCount}</div>
                            </div>
                            <div>
                              <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'} mb-0.5`}>Pod</div>
                              <div className={`text-sm font-mono font-medium ${dk ? 'text-violet-400' : 'text-blue-600'} truncate`}>{a.pod || labels.pod || 'N/A'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Correlated Incident */}
                  {correlatedLoading && (
                    <div className={`text-center py-4 text-xs ${dk ? 'text-slate-500' : 'text-gray-400'}`}>
                      <span className="animate-pulse">Loading correlation data...</span>
                    </div>
                  )}
                  {correlatedIncident && (
                    <div className={`border rounded-lg overflow-hidden ${dk ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-cyan-200 bg-cyan-50'}`}>
                      <div className={`px-4 py-3 text-sm font-medium ${dk ? 'text-cyan-400' : 'text-cyan-700'} flex items-center justify-between`}>
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                          Correlated Incident
                        </div>
                        {correlatedIncident.snowIncident?.number && (
                          <a href={correlatedIncident.snowIncident.url} target="_blank" rel="noopener noreferrer"
                            className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${dk ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/25' : 'bg-cyan-100 text-cyan-700 border border-cyan-300 hover:bg-cyan-200'} transition-colors`}>
                            {correlatedIncident.snowIncident.number}
                            <svg className="w-3 h-3 inline ml-1 -mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        )}
                      </div>
                      <div className={`border-t ${dk ? 'border-cyan-500/20' : 'border-cyan-200'} px-4 py-3 space-y-3`}>
                        {/* Root Cause */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'} mb-0.5`}>Root Cause</div>
                            <div className={`text-sm font-mono font-bold ${dk ? 'text-red-400' : 'text-red-600'}`}>{correlatedIncident.rootCause?.pod || 'Unknown'}</div>
                            <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'}`}>ns/{correlatedIncident.rootCause?.namespace || 'unknown'} · score: {correlatedIncident.rootCause?.score?.toFixed(3) || 'N/A'}</div>
                          </div>
                          <div>
                            <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'} mb-0.5`}>Status</div>
                            <div className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                              correlatedIncident.status === 'active' ? 'bg-red-500/20 text-red-400' :
                              correlatedIncident.status === 'acknowledged' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>{correlatedIncident.status}</div>
                            <div className={`text-xs mt-0.5 ${dk ? 'text-slate-500' : 'text-gray-500'}`}>
                              x{correlatedIncident.occurrences} occurrences · {correlatedIncident.alertCount} alerts
                            </div>
                          </div>
                        </div>

                        {/* ServiceNow Details */}
                        {correlatedIncident.snowIncident?.number && (
                          <div className={`p-2.5 rounded ${dk ? 'bg-slate-800/60' : 'bg-white'} flex items-center gap-3`}>
                            <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${dk ? 'bg-cyan-500/15' : 'bg-cyan-100'}`}>
                              <svg className={`w-4 h-4 ${dk ? 'text-cyan-400' : 'text-cyan-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <a href={correlatedIncident.snowIncident.url} target="_blank" rel="noopener noreferrer"
                                className={`text-sm font-mono font-bold ${dk ? 'text-cyan-300 hover:text-cyan-200' : 'text-cyan-700 hover:text-cyan-600'} hover:underline`}>
                                {correlatedIncident.snowIncident.number}
                              </a>
                              <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'}`}>
                                ServiceNow · {correlatedIncident.snowIncident.state} · Created {correlatedIncident.snowIncident.createdAt ? new Date(correlatedIncident.snowIncident.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                              </div>
                            </div>
                            <a href={correlatedIncident.snowIncident.url} target="_blank" rel="noopener noreferrer"
                              className={`px-2.5 py-1 rounded text-xs font-medium ${dk ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20' : 'bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100'} transition-colors`}>
                              Open in ServiceNow
                            </a>
                          </div>
                        )}

                        {/* Causal Chain */}
                        {correlatedIncident.causalChain?.length > 0 && (
                          <div>
                            <div className={`text-xs font-semibold ${dk ? 'text-slate-400' : 'text-gray-500'} uppercase mb-1.5`}>Causal Chain</div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {correlatedIncident.causalChain.map((c, j) => (
                                <React.Fragment key={j}>
                                  <span className={`px-2 py-1 rounded text-xs font-mono ${j === 0 ? (dk ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-600 border border-red-200') : (dk ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700')}`}>
                                    {c.pod} <span className={dk ? 'text-slate-500' : 'text-gray-400'}>({c.score?.toFixed(2)})</span>
                                  </span>
                                  {j < correlatedIncident.causalChain.length - 1 && <span className={dk ? 'text-slate-600' : 'text-gray-400'}>→</span>}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Evidence */}
                        {correlatedIncident.evidence?.length > 0 && (
                          <div>
                            <div className={`text-xs font-semibold ${dk ? 'text-slate-400' : 'text-gray-500'} uppercase mb-1.5`}>Evidence</div>
                            <div className={`p-2.5 rounded ${dk ? 'bg-slate-800/60' : 'bg-white'} space-y-1`}>
                              {correlatedIncident.evidence.slice(0, 5).map((e, j) => (
                                <div key={j} className={`text-xs ${dk ? 'text-slate-300' : 'text-gray-600'} flex gap-2`}>
                                  <span className="text-purple-400 flex-shrink-0">&#x2022;</span><span>{e}</span>
                                </div>
                              ))}
                              {correlatedIncident.evidence.length > 5 && (
                                <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-400'} italic`}>+{correlatedIncident.evidence.length - 5} more</div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Affected Pods */}
                        {correlatedIncident.pods?.length > 0 && (
                          <div>
                            <div className={`text-xs font-semibold ${dk ? 'text-slate-400' : 'text-gray-500'} uppercase mb-1.5`}>Affected Pods ({correlatedIncident.pods.length})</div>
                            <div className="flex flex-wrap gap-1">
                              {correlatedIncident.pods.slice(0, 8).map((p, j) => (
                                <span key={j} className={`px-2 py-0.5 rounded text-xs font-mono ${dk ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>{p}</span>
                              ))}
                              {correlatedIncident.pods.length > 8 && (
                                <span className={`px-2 py-0.5 rounded text-xs ${dk ? 'text-slate-500' : 'text-gray-400'}`}>+{correlatedIncident.pods.length - 8} more</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {!correlatedLoading && !correlatedIncident && (
                    <div className={`text-center py-3 text-xs ${dk ? 'text-slate-600' : 'text-gray-400'} italic`}>
                      No correlated incident found for this alert. Run a correlation analysis to generate one.
                    </div>
                  )}
                </div>
              )}

              {/* METRICS TAB */}
              {alertDetailTab === 'metrics' && (() => {
                // Use the shared hoisted enrichment (liveA.enrichment || a.enrichment || fetchedEnrichment)
                // so this tab benefits from the REST-fallback fetch and live Redux updates just like the
                // Event/Root Cause tabs — falling back to detailedOccurrences matching as a last resort.
                let enrichmentData = enrichment;
                if (!enrichmentData?.metrics && !enrichmentData?.logs && !enrichmentData?.data && detailedOccurrences.length) {
                  const aTime = a.receivedAt || a.startsAt;
                  const match = detailedOccurrences.find(o => {
                    const oTime = o.receivedAt || o.startsAt;
                    return oTime === aTime && (o.enrichment?.metrics || o.enrichment?.logs || o.enrichment?.data);
                  }) || detailedOccurrences.find(o => o.enrichment?.metrics || o.enrichment?.logs || o.enrichment?.data);
                  if (match) enrichmentData = match.enrichment;
                }

                // Pipeline #2 (authService) already has the {t, v} shape MiniChart expects.
                // Pipeline #1 (alert-webhook-service) writes enrichment.data.{cpu,memory,network,disk}Metrics
                // with {timestamp (seconds), value} points — normalize that into the same {cpu,memory,network,disk} shape.
                const toTV = (arr) => (arr || []).map(p => ({ t: Math.round((p.timestamp || 0) * 1000), v: p.value || 0 }));
                const edData = enrichmentData?.data;
                let em = enrichmentData?.metrics;
                if (!em && edData && (edData.cpuMetrics || edData.memoryMetrics || edData.networkMetrics || edData.diskMetrics)) {
                  em = {
                    alertTime: a.receivedAt || a.startsAt,
                    cpu: edData.cpuMetrics ? { timeline: toTV(edData.cpuMetrics.timeline), spikeDetected: edData.cpuMetrics.spikeDetected } : undefined,
                    memory: edData.memoryMetrics ? { timeline: toTV(edData.memoryMetrics.timeline) } : undefined,
                    network: edData.networkMetrics ? { rxTimeline: toTV(edData.networkMetrics.rxTimeline), txTimeline: toTV(edData.networkMetrics.txTimeline) } : undefined,
                    disk: edData.diskMetrics ? { readTimeline: toTV(edData.diskMetrics.readTimeline), writeTimeline: toTV(edData.diskMetrics.writeTimeline) } : undefined,
                  };
                }
                // Pipeline #2's `logs` is already a flat array of lines. Pipeline #1's
                // edData.currentLogs is { containers: [{ logs: "<full text>", ... }] } — flatten
                // the first container's text into the same flat-array-of-lines shape.
                const edLogContainer = edData?.currentLogs?.containers?.[0];
                const logs = enrichmentData?.logs || (edLogContainer ? (edLogContainer.logs || '').split('\n').filter(l => l.trim()) : null);
                const noData = !em && (!logs || !logs.length);
                const noMsg = enrichmentData?.metricsMessage || `No metrics captured for ${a.pod || a.namespace || 'this resource'} — pod may have failed before metrics were scraped.`;

                if (noData) {
                  return (
                    <div className={`p-6 text-center ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      <p className="text-sm font-medium mb-1">No Metrics Available</p>
                      <p className="text-xs opacity-70">{noMsg}</p>
                      {!enrichmentData && (
                        <p className={`text-xs mt-3 ${dk ? 'text-amber-400' : 'text-amber-600'}`}>Enrichment pending — metrics will be captured on next alert firing.</p>
                      )}
                    </div>
                  );
                }

                const MiniChart = ({ data, label, unit, color = '#8b5cf6', height = 80 }) => {
                  if (!data?.length) return null;
                  const vals = data.map(p => p.v);
                  const max = Math.max(...vals, 0.001);
                  const w = 100;
                  const points = data.map((p, i) => `${(i / (data.length - 1)) * w},${height - (p.v / max) * (height - 10)}`).join(' ');
                  const firstTime = new Date(data[0].t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const lastTime = new Date(data[data.length - 1].t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const latest = vals[vals.length - 1];
                  const formatVal = (v) => {
                    if (unit === 'bytes') return v > 1e9 ? (v / 1e9).toFixed(1) + ' GB' : v > 1e6 ? (v / 1e6).toFixed(1) + ' MB' : (v / 1e3).toFixed(0) + ' KB';
                    if (unit === 'bytes/s') return v > 1e6 ? (v / 1e6).toFixed(1) + ' MB/s' : v > 1e3 ? (v / 1e3).toFixed(1) + ' KB/s' : v.toFixed(0) + ' B/s';
                    if (unit === 'cores') return v < 0.01 ? (v * 1000).toFixed(0) + 'm' : v.toFixed(3);
                    return v.toFixed(2);
                  };
                  return (
                    <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                      <div className={`flex items-center justify-between px-3 py-2 ${dk ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
                        <span className={`text-xs font-medium ${dk ? 'text-slate-300' : 'text-gray-700'}`}>{label}</span>
                        <span className={`text-xs font-mono ${dk ? 'text-slate-400' : 'text-gray-500'}`}>{formatVal(latest)}</span>
                      </div>
                      <div className="px-3 py-2">
                        <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
                          <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
                          <polyline points={`0,${height} ${points} ${w},${height}`} fill={color} opacity="0.1" strokeWidth="0" />
                        </svg>
                        <div className="flex justify-between mt-1">
                          <span className={`text-[10px] ${dk ? 'text-slate-600' : 'text-gray-400'}`}>{firstTime}</span>
                          <span className={`text-[10px] ${dk ? 'text-slate-500' : 'text-gray-400'}`}>10 min before alert</span>
                          <span className={`text-[10px] ${dk ? 'text-slate-600' : 'text-gray-400'}`}>{lastTime}</span>
                        </div>
                      </div>
                      <div className={`flex gap-4 px-3 py-1.5 text-[10px] border-t ${dk ? 'border-slate-700 text-slate-500' : 'border-gray-100 text-gray-400'}`}>
                        <span>Max: {formatVal(Math.max(...vals))}</span>
                        <span>Avg: {formatVal(vals.reduce((a, b) => a + b, 0) / vals.length)}</span>
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="p-4 space-y-3">
                    {em?.alertTime && (
                      <div className={`flex items-center gap-2 mb-2 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                        <span className="text-xs">Metrics captured 10 min before alert at {new Date(em.alertTime).toLocaleTimeString()}</span>
                      </div>
                    )}

                    {em?.cpu?.spikeDetected && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded text-xs ${dk ? 'bg-red-900/20 border border-red-800/50 text-red-400' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                        <span>⚠</span> CPU spike detected ({'>'}80% usage)
                      </div>
                    )}

                    {em && <MiniChart data={em.cpu?.timeline} label="CPU Usage" unit="cores" color="#8b5cf6" />}
                    {em && <MiniChart data={em.memory?.timeline} label="Memory (Working Set)" unit="bytes" color="#3b82f6" />}
                    {em && <MiniChart data={em.network?.rxTimeline} label="Network Receive" unit="bytes/s" color="#22c55e" />}
                    {em && <MiniChart data={em.network?.txTimeline} label="Network Transmit" unit="bytes/s" color="#f59e0b" />}
                    {em && <MiniChart data={em.disk?.readTimeline} label="Disk Read" unit="bytes/s" color="#06b6d4" />}
                    {em && <MiniChart data={em.disk?.writeTimeline} label="Disk Write" unit="bytes/s" color="#ec4899" />}

                    {/* Pod Logs */}
                    {logs && logs.length > 0 && (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <div className={`flex items-center justify-between px-3 py-2 ${dk ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
                          <span className={`text-xs font-medium ${dk ? 'text-slate-300' : 'text-gray-700'}`}>Pod Logs (last {logs.length} lines)</span>
                          <button
                            onClick={() => navigator.clipboard?.writeText(logs.join('\n'))}
                            className={`text-[10px] px-2 py-0.5 rounded ${dk ? 'bg-slate-700 hover:bg-slate-600 text-slate-400' : 'bg-gray-200 hover:bg-gray-300 text-gray-500'}`}
                          >Copy</button>
                        </div>
                        <div className={`px-3 py-2 max-h-[300px] overflow-auto font-mono text-[11px] leading-relaxed ${dk ? 'bg-[#0d1117] text-slate-300' : 'bg-gray-900 text-gray-200'}`}>
                          {logs.map((line, i) => {
                            const isErr = /error|fatal|panic|exception|traceback|failed/i.test(line);
                            const isWarn = /warn|warning/i.test(line);
                            return (
                              <div key={i} className={`whitespace-pre-wrap break-all ${isErr ? 'text-red-400' : isWarn ? 'text-yellow-400' : ''}`}>
                                {line}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {!em && logs && logs.length > 0 && (
                      <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-400'} text-center`}>
                        No metrics available — pod may have crashed before Prometheus scraped it.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ROOT CAUSE TAB */}
              {alertDetailTab === 'rootcause' && (() => {
                const Sparkline = ({ data, color = '#8b5cf6', w = 140, h = 28 }) => {
                  if (!data?.length) return <span className={`text-xs ${dk ? 'text-slate-600' : 'text-gray-400'}`}>No data</span>;
                  const vals = data.map(d => typeof d === 'number' ? d : (d.value ?? 0));
                  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
                  const pts = vals.map((v, i) => `${(i / Math.max(vals.length - 1, 1)) * w},${h - ((v - mn) / rng) * (h - 4) - 2}`).join(' ');
                  return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
                };

                const fmtBytes = (b) => {
                  if (!b && b !== 0) return 'N/A';
                  if (b < 1024) return `${b} B`;
                  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
                  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
                  return `${(b / 1073741824).toFixed(2)} GB`;
                };

                const SectionHead = ({ section, title, badge, badgeColor }) => (
                  <button
                    onClick={() => toggleEnrichSection(section)}
                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${dk ? 'hover:bg-slate-800/50 text-white' : 'hover:bg-gray-50 text-gray-900'}`}
                  >
                    <svg className={`w-3.5 h-3.5 transition-transform ${enrichSections[section] ? '' : '-rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    {title}
                    {badge !== undefined && (
                      <span className={`ml-auto text-xs px-1.5 py-0.5 rounded ${badgeColor || (dk ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-600')}`}>{badge}</span>
                    )}
                  </button>
                );

                return (
                  <div className="p-5 space-y-4">
                    {/* Enrichment Status Banner */}
                    {enrichment ? (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${dk ? 'bg-emerald-900/30 border border-emerald-800 text-emerald-400' : 'bg-green-50 border border-green-200 text-green-700'}`}>
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        Enriched {enrichment.enrichmentDurationMs ? `in ${(enrichment.enrichmentDurationMs / 1000).toFixed(1)}s` : ''}
                        {enrichment.enrichedAt && <span className="ml-1 opacity-60">at {new Date(enrichment.enrichedAt).toLocaleTimeString()}</span>}
                      </div>
                    ) : enrichmentLoading ? (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${dk ? 'bg-slate-800 border border-slate-700 text-slate-400' : 'bg-gray-100 border border-gray-200 text-gray-600'}`}>
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        Fetching enrichment data...
                      </div>
                    ) : (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${dk ? 'bg-amber-900/20 border border-amber-800/50 text-amber-400' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        Enrichment pending
                        <button onClick={() => fetchEnrichmentData(a)} className={`ml-auto underline ${dk ? 'text-amber-300' : 'text-yellow-800'}`}>Retry</button>
                      </div>
                    )}

                    {/* Resource Status */}
                    {ed?.describe && (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <SectionHead section="resource" title="Resource Status" badge={ed.describe.containerStatuses?.length || 0} />
                        {enrichSections.resource && (
                          <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'} p-4 space-y-3`}>
                            {ed.describe.containerStatuses?.length > 0 && (
                              <div>
                                <div className={`text-xs font-medium mb-2 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>CONTAINERS</div>
                                <div className={`rounded border ${dk ? 'border-slate-700' : 'border-gray-200'} overflow-hidden`}>
                                  <table className="w-full text-xs">
                                    <thead className={dk ? 'bg-slate-800/60' : 'bg-gray-50'}>
                                      <tr>
                                        {['Name', 'State', 'Restarts', 'Last State'].map(h => (
                                          <th key={h} className={`px-3 py-1.5 text-left font-medium ${dk ? 'text-slate-400' : 'text-gray-500'}`}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {ed.describe.containerStatuses.map((cs, i) => (
                                        <tr key={i} className={`border-t ${dk ? 'border-slate-700/50' : 'border-gray-100'}`}>
                                          <td className={`px-3 py-1.5 font-mono ${dk ? 'text-slate-300' : 'text-gray-700'}`}>{cs.name}</td>
                                          <td className="px-3 py-1.5">
                                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                                              cs.state === 'running' ? 'bg-blue-500/20 text-blue-400' :
                                              cs.state === 'waiting' ? 'bg-yellow-500/20 text-yellow-400' :
                                              'bg-red-500/20 text-red-400'
                                            }`}>{cs.state || 'unknown'}</span>
                                          </td>
                                          <td className={`px-3 py-1.5 ${cs.restartCount > 0 ? 'text-red-400 font-bold' : dk ? 'text-slate-400' : 'text-gray-500'}`}>{cs.restartCount ?? 0}</td>
                                          <td className={`px-3 py-1.5 ${dk ? 'text-slate-500' : 'text-gray-500'}`}>{cs.lastState || '\u2014'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            {ed.describe.conditions?.length > 0 && (
                              <div>
                                <div className={`text-xs font-medium mb-2 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>CONDITIONS</div>
                                <div className="flex flex-wrap gap-2">
                                  {ed.describe.conditions.map((c, i) => (
                                    <span key={i} className={`text-xs px-2 py-1 rounded ${
                                      c.status === 'True' ? dk ? 'bg-green-900/30 text-green-400' : 'bg-blue-100 text-blue-700' :
                                      dk ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
                                    }`}>
                                      {c.type}: {c.status}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Container Logs */}
                    {ed?.currentLogs?.containers?.length > 0 && (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <SectionHead
                          section="logs"
                          title="Container Logs"
                          badge={ed.currentLogs.containers.reduce((s, c) => s + (c.errorCount || 0), 0) > 0
                            ? `${ed.currentLogs.containers.reduce((s, c) => s + (c.errorCount || 0), 0)} errors`
                            : `${ed.currentLogs.containers.reduce((s, c) => s + (c.lineCount || 0), 0)} lines`}
                          badgeColor={ed.currentLogs.containers.reduce((s, c) => s + (c.errorCount || 0), 0) > 0 ? 'bg-red-500/20 text-red-400' : undefined}
                        />
                        {enrichSections.logs && (
                          <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                            {ed.currentLogs.containers.length > 1 && (
                              <div className={`flex border-b ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                                {ed.currentLogs.containers.map((c, i) => (
                                  <button key={i} onClick={() => setSelectedLogContainer(i)}
                                    className={`px-3 py-1.5 text-xs font-mono ${selectedLogContainer === i
                                      ? dk ? 'bg-slate-800 text-white border-b-2 border-violet-500' : 'bg-gray-100 text-gray-900 border-b-2 border-blue-500'
                                      : dk ? 'text-slate-500 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                  >
                                    {c.name}
                                    {c.errorCount > 0 && <span className="ml-1 text-red-400">({c.errorCount})</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                            {(() => {
                              const logContainer = ed.currentLogs.containers[selectedLogContainer] || ed.currentLogs.containers[0];
                              if (!logContainer) return null;
                              const logLines = (logContainer.logs || '').split('\n').filter(l => l.trim());
                              return (
                                <div className="max-h-64 overflow-auto">
                                  <pre className={`p-3 text-xs font-mono leading-relaxed ${dk ? 'bg-[#0d0d1a] text-slate-400' : 'bg-gray-900 text-gray-300'}`}>
                                    {logLines.length === 0 ? (
                                      <span className="text-slate-600">No logs available</span>
                                    ) : (
                                      logLines.map((line, i) => {
                                        const isError = /\b(error|exception|fatal|panic|failed|failure)\b/i.test(line);
                                        const isWarning = /\b(warn|warning)\b/i.test(line);
                                        return (
                                          <div key={i} className={`${isError ? 'text-red-400 bg-red-900/10' : isWarning ? 'text-yellow-400 bg-yellow-900/10' : ''}`}>
                                            <span className="select-none text-slate-600 mr-3 inline-block w-8 text-right">{i + 1}</span>
                                            {line}
                                          </div>
                                        );
                                      })
                                    )}
                                  </pre>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Previous Container Logs (Crash) */}
                    {ed?.previousLogs?.containers?.length > 0 && (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <SectionHead section="prevLogs" title="Previous Container Logs (Crash)" badge={ed.previousLogs.containers.length} badgeColor="bg-red-500/20 text-red-400" />
                        {enrichSections.prevLogs && (
                          <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                            {ed.previousLogs.containers.map((c, ci) => (
                              <div key={ci}>
                                {ed.previousLogs.containers.length > 1 && (
                                  <div className={`px-3 py-1 text-xs font-mono border-b ${dk ? 'border-slate-700 text-slate-500 bg-slate-800/30' : 'border-gray-200 text-gray-500 bg-gray-50'}`}>{c.name}</div>
                                )}
                                <div className="max-h-48 overflow-auto">
                                  <pre className={`p-3 text-xs font-mono leading-relaxed ${dk ? 'bg-[#0d0d1a] text-slate-400' : 'bg-gray-900 text-gray-300'}`}>
                                    {(c.logs || 'No previous logs').split('\n').filter(l => l.trim()).map((line, i) => {
                                      const isError = /\b(error|exception|fatal|panic|failed|failure)\b/i.test(line);
                                      return (
                                        <div key={i} className={isError ? 'text-red-400 bg-red-900/10' : ''}>
                                          <span className="select-none text-slate-600 mr-3 inline-block w-8 text-right">{i + 1}</span>{line}
                                        </div>
                                      );
                                    })}
                                  </pre>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Kubernetes Events */}
                    {ed?.events?.events?.length > 0 && (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <SectionHead
                          section="events"
                          title="Kubernetes Events"
                          badge={ed.events.events.length}
                          badgeColor={ed.events.events.some(e => e.type === 'Warning') ? 'bg-yellow-500/20 text-yellow-400' : undefined}
                        />
                        {enrichSections.events && (
                          <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'} overflow-auto`}>
                            <table className="w-full text-xs">
                              <thead className={dk ? 'bg-slate-800/60' : 'bg-gray-50'}>
                                <tr>
                                  {['Type', 'Reason', 'Message', 'Count', 'Last Seen'].map(h => (
                                    <th key={h} className={`px-3 py-1.5 text-left font-medium whitespace-nowrap ${dk ? 'text-slate-400' : 'text-gray-500'}`}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {ed.events.events.map((ev, i) => (
                                  <tr key={i} className={`border-t ${dk ? 'border-slate-700/50' : 'border-gray-100'} ${ev.type === 'Warning' ? dk ? 'bg-yellow-900/10' : 'bg-yellow-50' : ''}`}>
                                    <td className={`px-3 py-1.5 ${ev.type === 'Warning' ? 'text-yellow-400' : ev.type === 'Normal' ? 'text-green-400' : dk ? 'text-slate-400' : 'text-gray-500'}`}>{ev.type}</td>
                                    <td className={`px-3 py-1.5 font-mono ${dk ? 'text-slate-300' : 'text-gray-700'}`}>{ev.reason}</td>
                                    <td className={`px-3 py-1.5 max-w-[200px] truncate ${dk ? 'text-slate-400' : 'text-gray-600'}`} title={ev.message}>{ev.message}</td>
                                    <td className={`px-3 py-1.5 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>{ev.count || 1}</td>
                                    <td className={`px-3 py-1.5 whitespace-nowrap ${dk ? 'text-slate-500' : 'text-gray-500'}`}>{ev.lastTimestamp ? new Date(ev.lastTimestamp).toLocaleTimeString() : '\u2014'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Metrics (10 min before alert) */}
                    {(ed?.cpuMetrics || ed?.memoryMetrics || ed?.networkMetrics || ed?.diskMetrics) && (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <SectionHead section="metrics" title="Metrics (10 min before alert)" />
                        {enrichSections.metrics && (
                          <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'} p-4 space-y-4`}>
                            {ed.cpuMetrics && (
                              <div className="flex items-center gap-4">
                                <div className={`w-16 text-xs font-medium ${dk ? 'text-slate-400' : 'text-gray-500'}`}>CPU</div>
                                <Sparkline data={ed.cpuMetrics.timeline} color="#8b5cf6" />
                                <div className="flex gap-3 text-xs">
                                  <span className={dk ? 'text-slate-300' : 'text-gray-700'}>Cur: {typeof ed.cpuMetrics.current === 'number' ? ed.cpuMetrics.current.toFixed(3) : 'N/A'}</span>
                                  <span className={dk ? 'text-slate-500' : 'text-gray-500'}>Max: {typeof ed.cpuMetrics.max === 'number' ? ed.cpuMetrics.max.toFixed(3) : 'N/A'}</span>
                                  {ed.cpuMetrics.spikeDetected && <span className="text-red-400 font-bold">SPIKE</span>}
                                </div>
                              </div>
                            )}
                            {ed.memoryMetrics && (
                              <div className="flex items-center gap-4">
                                <div className={`w-16 text-xs font-medium ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Memory</div>
                                <Sparkline data={ed.memoryMetrics.timeline} color="#06b6d4" />
                                <div className="flex gap-3 text-xs">
                                  <span className={dk ? 'text-slate-300' : 'text-gray-700'}>Cur: {fmtBytes(ed.memoryMetrics.currentBytes)}</span>
                                  <span className={dk ? 'text-slate-500' : 'text-gray-500'}>Max: {fmtBytes(ed.memoryMetrics.maxBytes)}</span>
                                  {ed.memoryMetrics.limitBytes != null && (
                                    <span className={dk ? 'text-slate-500' : 'text-gray-500'}>Limit: {fmtBytes(ed.memoryMetrics.limitBytes)}</span>
                                  )}
                                  {ed.memoryMetrics.oomRisk && <span className="text-red-400 font-bold">OOM RISK</span>}
                                </div>
                              </div>
                            )}
                            {ed.networkMetrics && (
                              <>
                                <div className="flex items-center gap-4">
                                  <div className={`w-16 text-xs font-medium ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Net RX</div>
                                  <Sparkline data={ed.networkMetrics.rxTimeline} color="#22c55e" />
                                  <div className="flex gap-3 text-xs">
                                    <span className={dk ? 'text-slate-300' : 'text-gray-700'}>RX: {fmtBytes(ed.networkMetrics.receiveBytesSec)}/s</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className={`w-16 text-xs font-medium ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Net TX</div>
                                  <Sparkline data={ed.networkMetrics.txTimeline} color="#f59e0b" />
                                  <div className="flex gap-3 text-xs">
                                    <span className={dk ? 'text-slate-300' : 'text-gray-700'}>TX: {fmtBytes(ed.networkMetrics.transmitBytesSec)}/s</span>
                                  </div>
                                </div>
                              </>
                            )}
                            {ed.diskMetrics && (
                              <>
                                <div className="flex items-center gap-4">
                                  <div className={`w-16 text-xs font-medium ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Disk R</div>
                                  <Sparkline data={ed.diskMetrics.readTimeline} color="#a855f7" />
                                  <div className="flex gap-3 text-xs">
                                    <span className={dk ? 'text-slate-300' : 'text-gray-700'}>Read: {fmtBytes(ed.diskMetrics.readBytesSec)}/s</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className={`w-16 text-xs font-medium ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Disk W</div>
                                  <Sparkline data={ed.diskMetrics.writeTimeline} color="#f43f5e" />
                                  <div className="flex gap-3 text-xs">
                                    <span className={dk ? 'text-slate-300' : 'text-gray-700'}>Write: {fmtBytes(ed.diskMetrics.writeBytesSec)}/s</span>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Configuration Changes */}
                    {ed?.configChanges && (ed.configChanges.configMaps?.length > 0 || ed.configChanges.recentDeployments?.length > 0) && (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <SectionHead section="configChanges" title="Configuration Changes" badge={(ed.configChanges.configMaps?.length || 0) + (ed.configChanges.recentDeployments?.length || 0)} />
                        {enrichSections.configChanges && (
                          <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'} p-4 space-y-3`}>
                            {ed.configChanges.configMaps?.length > 0 && (
                              <div>
                                <div className={`text-xs font-medium mb-1.5 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>CONFIGMAPS MODIFIED</div>
                                {ed.configChanges.configMaps.map((cm, i) => (
                                  <div key={i} className={`text-xs font-mono py-0.5 ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                    {cm.name} <span className={dk ? 'text-slate-600' : 'text-gray-400'}>{cm.lastModified ? new Date(cm.lastModified).toLocaleString() : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {ed.configChanges.recentDeployments?.length > 0 && (
                              <div>
                                <div className={`text-xs font-medium mb-1.5 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>RECENT DEPLOYMENTS</div>
                                {ed.configChanges.recentDeployments.map((rd, i) => (
                                  <div key={i} className={`text-xs font-mono py-0.5 ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                    {rd.name} <span className={dk ? 'text-slate-600' : 'text-gray-400'}>{rd.createdAt ? new Date(rd.createdAt).toLocaleString() : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prometheus Firing Rules */}
                    {ed?.prometheusRules?.groups?.length > 0 && (
                      <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <SectionHead section="promRules" title="Prometheus Firing Rules" badge={ed.prometheusRules.groups.reduce((s, g) => s + (g.rules?.length || 0), 0)} badgeColor="bg-red-500/20 text-red-400" />
                        {enrichSections.promRules && (
                          <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'} p-4`}>
                            {ed.prometheusRules.groups.map((g, gi) => (
                              <div key={gi} className="mb-2 last:mb-0">
                                <div className={`text-xs font-medium mb-1 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>{g.name}</div>
                                {(g.rules || []).map((r, ri) => (
                                  <div key={ri} className={`text-xs py-1 flex items-center gap-2 ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${r.state === 'firing' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                                    <span className="font-mono">{r.name}</span>
                                    <span className={dk ? 'text-slate-600' : 'text-gray-400'}>{r.state}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* What the agent did about it — above the analysis, because
                        "it is fixed" is the first thing anyone needs to know. */}
                    {(resolution || resolveError) && (
                      <div className={`border rounded-lg overflow-hidden mb-3 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                        <div className={`px-4 py-2.5 flex items-center justify-between ${dk ? 'bg-slate-800/60' : 'bg-gray-50'}`}>
                          <span className={`text-sm font-semibold ${dk ? 'text-slate-200' : 'text-gray-800'}`}>Agent resolution</span>
                          {resolution?.outcome && (
                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wide ${
                              resolution.outcome === 'remediated' ? 'bg-green-500/20 text-green-400'
                              : resolution.outcome === 'awaiting-human' ? 'bg-amber-500/20 text-amber-400'
                              : resolution.outcome === 'failed' ? 'bg-red-500/20 text-red-400'
                              : 'bg-slate-500/20 text-slate-400'}`}>
                              {resolution.outcome.replace(/-/g, ' ')}
                            </span>
                          )}
                        </div>
                        <div className={`border-t p-4 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                          {resolveError && (
                            <div className="text-xs text-red-400 mb-2">{resolveError}</div>
                          )}
                          {resolution?.summary && (
                            <div className={`text-sm whitespace-pre-wrap leading-relaxed ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                              {resolution.summary}
                            </div>
                          )}
                          {resolution?.actions?.filter(x => x.status === 'applied').length > 0 && (
                            <div className="mt-3">
                              <div className={`text-xs mb-1 ${dk ? 'text-slate-500' : 'text-gray-500'}`}>Applied to the cluster</div>
                              {resolution.actions.filter(x => x.status === 'applied').map((x, i) => (
                                <div key={i} className={`text-xs font-mono ${dk ? 'text-green-400' : 'text-green-700'}`}>
                                  {x.action}{x.detail ? ` — ${x.detail}` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                          {resolution?.actions?.filter(x => x.status === 'refused').length > 0 && (
                            <div className="mt-3">
                              <div className={`text-xs mb-1 ${dk ? 'text-slate-500' : 'text-gray-500'}`}>Not approved</div>
                              {resolution.actions.filter(x => x.status === 'refused').map((x, i) => (
                                <div key={i} className={`text-xs font-mono ${dk ? 'text-amber-400' : 'text-amber-700'}`}>
                                  {x.action}{x.detail ? ` — ${x.detail}` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                          {resolution?.followUps?.length > 0 && (
                            <div className={`mt-3 pt-2 border-t text-xs ${dk ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-600'}`}>
                              {resolution.followUps.map((f, i) => <div key={i}>• {f}</div>)}
                            </div>
                          )}
                          {resolution?.sopPath && (
                            <div className={`mt-2 text-xs ${dk ? 'text-slate-500' : 'text-gray-500'}`}>
                              Runbook: <span className="font-mono">{resolution.sopPath}</span> (SOPs &amp; Reports)
                            </div>
                          )}
                          {resolution?.threadId && (
                            <button
                              onClick={() => navigate('/dashboard/agent-threads')}
                              className={`mt-3 text-xs underline ${dk ? 'text-violet-400' : 'text-blue-600'}`}
                            >
                              See the full run in Agent Threads
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Analysis — the full investigation, not just two fields */}
                    <div className={`border rounded-lg overflow-hidden ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                      <SectionHead
                        section="analysis"
                        title="Analysis"
                        badge={rootCauseLoading ? 'analyzing…' : rootCauseData?.source === 'ai' ? (rootCauseData.model || 'AI') : rootCauseData ? 'evidence only' : 'pending'}
                        badgeColor={rootCauseData?.source === 'ai' ? 'bg-violet-500/20 text-violet-400' : undefined}
                      />
                      {enrichSections.analysis && (
                        <div className={`border-t ${dk ? 'border-slate-700' : 'border-gray-200'} p-4`}>
                          {rootCauseLoading && (
                            <div className="space-y-3">
                              {[100, 80, 60, 90, 70].map((w, i) => (
                                <div key={i} className={`h-4 rounded animate-pulse ${dk ? 'bg-slate-700' : 'bg-gray-200'}`} style={{ width: `${w}%` }}></div>
                              ))}
                              <div className={`text-xs text-center pt-2 ${dk ? 'text-slate-500' : 'text-gray-500'}`}>Investigating with {rootCauseData?.model || 'the analysis model'}…</div>
                            </div>
                          )}

                          {!rootCauseLoading && rootCauseData?.error && (
                            <div className={`text-sm p-3 rounded border ${dk ? 'border-red-800 bg-red-900/20 text-red-400' : 'border-red-200 bg-red-50 text-red-600'}`}>
                              {rootCauseData.error}
                            </div>
                          )}

                          {!rootCauseLoading && rootCauseData && !rootCauseData.error && (
                            <div className="space-y-5">
                              {/* when the model could not answer, say so rather than passing heuristics off as analysis */}
                              {rootCauseData.modelNote && (
                                <div className={`text-xs p-2.5 rounded border ${dk ? 'border-amber-800/50 bg-amber-900/15 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                  {rootCauseData.modelNote}
                                </div>
                              )}

                              {(rootCauseData.keyFindings || []).length > 0 && (
                                <div className={`rounded-lg border p-3.5 ${dk ? 'border-violet-800/40 bg-violet-900/10' : 'border-violet-200 bg-violet-50/50'}`}>
                                  <div className={`text-[13px] font-semibold mb-2 ${dk ? 'text-white' : 'text-gray-900'}`}>Key Findings</div>
                                  <ul className="space-y-1.5">
                                    {rootCauseData.keyFindings.map((f, i) => (
                                      <li key={i} className={`flex items-start gap-2 text-[13px] leading-relaxed ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                        <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${dk ? 'bg-violet-500' : 'bg-violet-500'}`}></span>
                                        <span>{f}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {(rootCauseData.rootCause || (rootCauseData.possibleCauses || []).length > 0) && (
                                <div className={`rounded-lg border p-3.5 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                                  <div className={`text-[13px] font-semibold mb-2 ${dk ? 'text-white' : 'text-gray-900'}`}>Conclusions and Possible Root Causes</div>
                                  {rootCauseData.rootCause && (
                                    <p className={`text-[13px] leading-relaxed whitespace-pre-line ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                      {rootCauseData.rootCause}
                                    </p>
                                  )}
                                  {(rootCauseData.possibleCauses || []).length > 0 && (
                                    <ol className="mt-3 space-y-2">
                                      {rootCauseData.possibleCauses.map((c, i) => (
                                        <li key={i} className={`text-[13px] leading-relaxed ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                          <span className="font-medium">{i + 1}. {c.title || c.name}:</span> {c.detail || c.description}
                                        </li>
                                      ))}
                                    </ol>
                                  )}
                                </div>
                              )}

                              {rootCauseData.appOrInfra?.verdict && (
                                <div className={`rounded-lg border p-3.5 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-[13px] font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>App or Infra?</span>
                                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                                      style={{
                                        background: rootCauseData.appOrInfra.verdict === 'application' ? '#6366f122' : '#d9770622',
                                        color: rootCauseData.appOrInfra.verdict === 'application' ? '#818cf8' : '#f59e0b',
                                      }}>
                                      {rootCauseData.appOrInfra.verdict}
                                    </span>
                                    {/* the deterministic verdict is shown when it disagrees with the model */}
                                    {rootCauseData.appOrInfra.heuristic
                                      && rootCauseData.appOrInfra.heuristic !== rootCauseData.appOrInfra.verdict && (
                                      <span className={`text-[10.5px] ${dk ? 'text-slate-500' : 'text-gray-500'}`}>
                                        evidence-only verdict: {rootCauseData.appOrInfra.heuristic}
                                      </span>
                                    )}
                                  </div>
                                  <p className={`text-[13px] leading-relaxed ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                    {rootCauseData.appOrInfra.reasoning}
                                  </p>
                                </div>
                              )}

                              {(rootCauseData.resolutionSteps || []).length > 0 && (
                                <div className={`rounded-lg border p-3.5 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                                  <div className={`text-[13px] font-semibold mb-2 ${dk ? 'text-white' : 'text-gray-900'}`}>Suggested resolution</div>
                                  <ol className="space-y-2.5">
                                    {rootCauseData.resolutionSteps.map((st, i) => (
                                      <li key={i}>
                                        <div className="flex items-start gap-2">
                                          <span className={`text-[11px] mt-0.5 w-4 shrink-0 ${dk ? 'text-slate-500' : 'text-gray-400'}`}>{i + 1}.</span>
                                          <div className="min-w-0">
                                            <div className={`text-[13px] ${dk ? 'text-slate-200' : 'text-gray-800'}`}>
                                              {st.step}
                                              {st.risk && (
                                                <span className="ml-2 text-[10px] uppercase tracking-wide"
                                                  style={{ color: st.risk === 'high' ? '#dc2626' : st.risk === 'medium' ? '#d97706' : '#16a34a' }}>
                                                  {st.risk} risk
                                                </span>
                                              )}
                                            </div>
                                            {st.detail && <div className={`text-[12px] mt-0.5 ${dk ? 'text-slate-400' : 'text-gray-600'}`}>{st.detail}</div>}
                                            {st.command && (
                                              <code className={`block text-[11.5px] font-mono mt-1 px-2 py-1 rounded overflow-x-auto ${dk ? 'bg-slate-900 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                                                {st.command}
                                              </code>
                                            )}
                                          </div>
                                        </div>
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              )}

                              {(rootCauseData.relatedLogs || []).length > 0 && (
                                <div className={`rounded-lg border p-3.5 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                                  <div className={`text-[13px] font-semibold mb-2 ${dk ? 'text-white' : 'text-gray-900'}`}>Related Logs</div>
                                  <pre className={`text-[11.5px] font-mono leading-relaxed overflow-x-auto p-2.5 rounded ${dk ? 'bg-slate-900 text-slate-300' : 'bg-gray-900 text-gray-100'}`}>
{rootCauseData.relatedLogs.join('\n')}
                                  </pre>
                                </div>
                              )}

                              {(rootCauseData.preventive || []).length > 0 && (
                                <div className={`rounded-lg border p-3.5 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                                  <div className={`text-[13px] font-semibold mb-2 ${dk ? 'text-white' : 'text-gray-900'}`}>Preventing recurrence</div>
                                  <ul className="space-y-1.5">
                                    {rootCauseData.preventive.map((v, i) => (
                                      <li key={i} className={`flex items-start gap-2 text-[13px] ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                        <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 bg-emerald-500"></span>
                                        <span>{v}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              <button
                                onClick={() => fetchRootCause(selectedStreamAlert, { refresh: true })}
                                className={`text-[11.5px] underline ${dk ? 'text-slate-500 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}>
                                Re-investigate{rootCauseData.cached ? ' (showing a cached result)' : ''}
                              </button>
                            </div>
                          )}

                          {!rootCauseLoading && !rootCauseData && (
                            <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'} text-center py-3`}>
                              Analysis will load automatically
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Follow-up conversation */}
                    {followUpMessages.length > 0 && (
                      <div className="space-y-3">
                        {followUpMessages.map((m, i) => (
                          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                            <div className={`max-w-[92%] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line ${
                              m.role === 'user'
                                ? (dk ? 'bg-violet-600/25 text-slate-100' : 'bg-blue-50 text-gray-800')
                                : m.error
                                  ? (dk ? 'bg-red-900/20 text-red-300' : 'bg-red-50 text-red-700')
                                  : (dk ? 'bg-slate-800 text-slate-200' : 'bg-gray-100 text-gray-800')
                            }`}>
                              {m.content}
                            </div>
                          </div>
                        ))}
                        {followUpBusy && (
                          <div className={`text-[12px] ${dk ? 'text-slate-500' : 'text-gray-500'}`}>Thinking…</div>
                        )}
                      </div>
                    )}

                    {/* Follow-up input — now actually sends */}
                    <div className={`sticky bottom-0 pt-3 border-t ${dk ? 'border-slate-800 bg-[#0b0b12]' : 'border-gray-200 bg-white'}`}>
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${dk ? 'border-slate-700 bg-slate-800' : 'border-gray-300 bg-white'}`}>
                        <input
                          type="text"
                          value={followUpInput}
                          onChange={(e) => setFollowUpInput(e.target.value)}
                          placeholder={followUpBusy ? 'Waiting for an answer…' : 'Ask a follow-up'}
                          disabled={followUpBusy}
                          className={`flex-1 text-sm bg-transparent focus:outline-none disabled:opacity-60 ${dk ? 'text-slate-300 placeholder-slate-600' : 'text-gray-700 placeholder-gray-400'}`}
                          onKeyDown={(e) => { if (e.key === 'Enter') sendFollowUp(); }}
                        />
                        <button
                          onClick={sendFollowUp}
                          disabled={followUpBusy || !followUpInput.trim()}
                          aria-label="Send"
                          className={`p-1 rounded disabled:opacity-40 ${dk ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                        </button>
                      </div>
                      <p className={`text-[10.5px] mt-1.5 ${dk ? 'text-slate-600' : 'text-gray-400'}`}>
                        Answers are grounded in this alert&rsquo;s collected evidence.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* RUNBOOKS TAB */}
              {alertDetailTab === 'runbooks' && (
                <div className="p-5 space-y-4">
                  <div className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Runbooks</div>
                  {runbookUrl && (
                    <div className={`border rounded-lg p-4 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                      <div className={`text-xs font-medium mb-2 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>OFFICIAL RUNBOOK</div>
                      <a
                        href={runbookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-sm underline break-all ${dk ? 'text-violet-400 hover:text-violet-300' : 'text-blue-600 hover:text-blue-700'}`}
                      >
                        {runbookUrl}
                      </a>
                    </div>
                  )}
                  <div className={`border rounded-lg p-4 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                    <div className={`text-xs font-medium mb-3 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>SUGGESTED ACTIONS FOR {a.alertname?.toUpperCase()}</div>
                    <ol className={`space-y-2.5 text-sm ${dk ? 'text-slate-300' : 'text-gray-700'} list-decimal pl-4`}>
                      {getSuggestedActions(a.alertname).map((action, i) => (
                        <li key={i} className="leading-relaxed">{action}</li>
                      ))}
                    </ol>
                  </div>
                  {!runbookUrl && (
                    <div className={`text-xs ${dk ? 'text-slate-600' : 'text-gray-400'}`}>
                      No official runbook URL found in alert annotations. Add a <code className="font-mono">runbook_url</code> annotation to your Prometheus alert rule to link it here.
                    </div>
                  )}
                </div>
              )}

              {/* DATA SOURCES TAB */}
              {alertDetailTab === 'datasources' && (
                <div className="p-5 space-y-4">
                  <div className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Data Sources</div>

                  {Object.keys(labels).length > 0 && (
                    <div className={`border rounded-lg p-4 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                      <div className={`text-xs font-medium mb-3 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>ALERT LABELS</div>
                      <div className="space-y-1.5">
                        {Object.entries(labels).map(([k, v]) => (
                          <div key={k} className="flex gap-3 text-xs font-mono">
                            <span className={`flex-shrink-0 w-44 truncate ${dk ? 'text-slate-500' : 'text-gray-500'}`}>{k}</span>
                            <span className={dk ? 'text-slate-300' : 'text-gray-700'}>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Object.keys(annotations).length > 0 && (
                    <div className={`border rounded-lg p-4 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                      <div className={`text-xs font-medium mb-3 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>ALERT ANNOTATIONS</div>
                      <div className="space-y-3">
                        {Object.entries(annotations).map(([k, v]) => (
                          <div key={k} className="text-xs">
                            <div className={`font-medium font-mono mb-0.5 ${dk ? 'text-slate-400' : 'text-gray-600'}`}>{k}</div>
                            <div className={`break-all leading-relaxed ${dk ? 'text-slate-300' : 'text-gray-700'}`}>{String(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={`border rounded-lg p-4 ${dk ? 'border-slate-700' : 'border-gray-200'}`}>
                    <div className={`text-xs font-medium mb-3 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>CLUSTER CONNECTION</div>
                    <div className={`space-y-1.5 text-sm ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                      {[
                        ['Cluster', cluster?.name || a.clusterId],
                        ['Namespace', a.namespace || 'N/A'],
                        ['Node', a.node || 'N/A'],
                        ['Status', a.status],
                        ['Severity', a.severity],
                        ['Received At', new Date(a.receivedAt || a.startsAt).toISOString()],
                        ['Alert Start', new Date(a.startsAt).toISOString()],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-3">
                          <span className={`w-24 flex-shrink-0 text-xs ${dk ? 'text-slate-500' : 'text-gray-500'}`}>{k}</span>
                          <span className={`text-xs font-mono ${v === 'firing' ? 'text-red-500' : v === 'resolved' ? 'text-blue-500' : ''}`}>{v || 'N/A'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

      {/* Group Drill-Down Side Panel */}
      {selectedGroup && (
        <div className={`fixed inset-y-0 right-0 w-[600px] ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} shadow-2xl border-l overflow-y-auto z-50`}>
          <div className={`sticky top-0 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b p-4 flex items-center justify-between z-10`}>
            <div>
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {selectedGroup.name}
              </h2>
              <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                {selectedGroup.count} occurrence{selectedGroup.count > 1 ? 's' : ''} • {selectedGroup.namespace} namespace
              </p>
            </div>
            <button
              onClick={() => setSelectedGroup(null)}
              className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}
            >
              <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Group Status */}
          <div className={`p-4 ${theme === 'dark' ? 'bg-slate-800/30' : 'bg-gray-50'} border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Status</span>
              <span className={`px-3 py-1 ${selectedGroup.status === 'firing' ? 'bg-red-500' : 'bg-green-500'} text-white text-xs font-medium rounded`}>
                {selectedGroup.status.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>First Seen</div>
                <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {new Date(selectedGroup.startTime).toLocaleString()}
                </div>
              </div>
              <div>
                <div className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Last Seen</div>
                <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {new Date(selectedGroup.lastSeen).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Occurrences List */}
          <div className="p-4">
            <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>
              Alert History ({detailLoading ? '…' : (() => {
                const seen = new Set();
                return detailedOccurrences.filter(occ => {
                  const t = occ.receivedAt || occ.startsAt;
                  const key = t ? new Date(t).toISOString().slice(0, 16) : String(occ._id || Math.random());
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                }).length;
              })()})
            </h3>
            <div className="space-y-3">
              {detailLoading ? (
                <div className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} text-center py-4`}>Loading history…</div>
              ) : null}
              {/* Deduplicate by receivedAt-to-minute */}
              {(() => {
                const seen = new Set();
                return detailedOccurrences.filter(occ => {
                  const t = occ.receivedAt || occ.startsAt;
                  const key = t ? new Date(t).toISOString().slice(0, 16) : String(Math.random());
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
              })().map((occurrence, idx) => {
                const cluster = clusters.find(c => c._id === occurrence.clusterId || c.id === occurrence.clusterId);
                const severityColor = occurrence.severity === 'critical' || occurrence.severity === 'high'
                  ? 'text-red-500'
                  : occurrence.severity === 'warning' || occurrence.severity === 'medium'
                  ? 'text-yellow-500'
                  : 'text-blue-500';

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      // Build an alert object compatible with the detail sidebar
                      const alertObj = {
                        ...occurrence,
                        alertname: selectedGroup.name,
                        severity: occurrence.severity || selectedGroup.severity,
                        namespace: occurrence.namespace || selectedGroup.namespace,
                        pod: occurrence.pod || selectedGroup.pod,
                        clusterId: occurrence.clusterId || selectedGroup.clusterId,
                        clusterName: occurrence.clusterName || selectedGroup.clusterName,
                        message: occurrence.message || selectedGroup.message,
                        summary: occurrence.summary || selectedGroup.summary,
                        description: occurrence.description || selectedGroup.description,
                      };
                      openAlertDetail(alertObj);
                    }}
                    className={`p-3 ${theme === 'dark' ? 'bg-slate-800/50 hover:bg-slate-800' : 'bg-gray-50 hover:bg-gray-100'} rounded transition-colors cursor-pointer`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${occurrence.status === 'firing' ? 'bg-red-500' : 'bg-gray-500'}`}></span>
                        <span className={`text-sm font-medium ${severityColor}`}>
                          {occurrence.severity?.toUpperCase()}
                        </span>
                      </div>
                      <span className={`text-xs ${theme === 'dark' ? 'text-slate-400 hover:text-blue-400' : 'text-gray-600 hover:text-blue-600'} underline decoration-dotted`}>
                        {new Date(occurrence.receivedAt || occurrence.startsAt).toLocaleString()}
                      </span>
                    </div>

                    <div className={`text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'} mb-2`}>
                      {occurrence.message || occurrence.annotations?.summary || 'No description'}
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-1 ${theme === 'dark' ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-700'} rounded`}>
                        Cluster: {cluster?.name || occurrence.clusterId}
                      </span>
                      <span className={`px-2 py-1 ${theme === 'dark' ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-700'} rounded`}>
                        Namespace: {occurrence.namespace}
                      </span>
                      {occurrence.pod && occurrence.pod !== 'N/A' && (
                        <span className={`px-2 py-1 ${theme === 'dark' ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-700'} rounded`}>
                          Pod: {occurrence.pod}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timeline;

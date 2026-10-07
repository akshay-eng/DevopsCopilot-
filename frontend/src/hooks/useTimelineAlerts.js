import { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addAlert, clearAllAlerts, pruneResolvedAlerts, updateAlertEnrichment, resolveAlertByName } from '../redux/slices/alertsSlice';
import { backendApi } from '../services/api';

/**
 * Custom hook for Timeline page - Production-ready with memory optimization
 *
 * Strategy:
 * 1. Initial load: Fetch alerts (50 at a time) from MongoDB
 * 2. Real-time: Socket.IO pushes new alerts as they arrive
 * 3. Infinite scroll: Load more on scroll/button click (50 per page)
 * 4. Auto-cleanup: Prune old alerts every 5 minutes to prevent memory leaks
 * 5. Caching: Backend caches "all alerts" queries for fast subsequent loads
 */
export const useTimelineAlerts = ({ clusterId = null, timeRangeHours = 48 } = {}) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [oldestTimestamp, setOldestTimestamp] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const isMounted = useRef(true);
  // Guards against out-of-order responses (e.g. StrictMode double-invoking this
  // effect in dev fires two concurrent requests — whichever resolves last must
  // not be allowed to clobber fresher data already in the store).
  const requestIdRef = useRef(0);

  const alertsState = useSelector(state => state.alerts);
  const socket = useSelector(state => state.socket?.socket);

  // Determine if we're loading ALL alerts (timeRangeHours === 0)
  const loadAllAlerts = timeRangeHours === 0;

  /**
   * Initial load - Fetch alerts from MongoDB API
   * Uses /all endpoint for timeRangeHours=0, /recent for time-filtered queries
   */
  const loadInitialAlerts = useCallback(async () => {
    // Note: no isMounted check here — dispatch is always safe, and StrictMode
    // double-invocation would abort the call if we checked isMounted at the start.
    if (isMounted.current) {
      setLoading(true);
      setError(null);
    }

    const myRequestId = ++requestIdRef.current;

    try {
      let response;

      if (loadAllAlerts) {
        // Use /all endpoint with caching for "All Alerts" option
        response = await backendApi.get('/api/alerts/all', {
          params: {
            clusterId: clusterId || undefined,
            limit: 50, // Load 50 at a time
            skip: 0
          }
        });
      } else {
        // Use /recent endpoint for time-filtered queries
        response = await backendApi.get('/api/alerts/recent', {
          params: {
            clusterId: clusterId || undefined,
            hours: timeRangeHours,
            limit: 100,
            skip: 0
          }
        });
      }

      const { alerts, pagination } = response;

      console.log(`[useTimelineAlerts] Loaded ${alerts?.length || 0} alerts. Pagination:`, pagination);
      console.log(`[useTimelineAlerts] Time range: ${timeRangeHours} hours (${loadAllAlerts ? 'ALL ALERTS' : 'filtered'})`);

      // A newer request was started while this one was in flight — its response
      // will populate the store, so applying this stale one would either clobber
      // newer data or duplicate it. Bail out silently.
      if (myRequestId !== requestIdRef.current) {
        return;
      }

      // Clear existing alerts before loading new ones
      dispatch(clearAllAlerts());

      // Dispatch alerts to Redux store
      alerts.forEach(alert => {
        dispatch(addAlert({
          clusterId: alert.clusterId,
          alertname: alert.alertname,
          severity: alert.severity || 'info',
          namespace: alert.namespace || 'default',
          pod: alert.pod || 'N/A',
          message: alert.message || alert.summary || '',
          labels: alert.labels || {},
          annotations: alert.annotations || {},
          startsAt: alert.startsAt || alert.createdAt,
          endsAt: alert.endsAt || null,
          status: alert.status || 'firing',
          receivedAt: alert.receivedAt || alert.createdAt
        }));
      });

      // Track oldest timestamp for pagination
      if (alerts.length > 0) {
        const timestamps = alerts.map(a => new Date(a.receivedAt || a.createdAt || a.startsAt).getTime());
        setOldestTimestamp(Math.min(...timestamps));
      }

      setHasMore(pagination?.hasMore || false);
      setTotalCount(pagination?.total || 0);
      setLoadedCount(alerts.length);

    } catch (err) {
      console.error('Failed to load initial alerts:', err);
      setError('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [dispatch, clusterId, timeRangeHours, loadAllAlerts]);

  /**
   * Load older alerts (for "Load More" button)
   * Implements infinite scroll with sequential loading
   */
  const loadOlderAlerts = useCallback(async () => {
    if (!hasMore || loading) return;

    setLoading(true);
    try {
      let response;

      if (loadAllAlerts) {
        // Use /all endpoint with pagination (skip = current loaded count)
        response = await backendApi.get('/api/alerts/all', {
          params: {
            clusterId: clusterId || undefined,
            limit: 50, // Load 50 at a time
            skip: loadedCount
          }
        });
      } else {
        // Use /historical endpoint for time-filtered queries
        response = await backendApi.get('/api/alerts/historical', {
          params: {
            clusterId: clusterId || undefined,
            before: oldestTimestamp,
            limit: 100
          }
        });
      }

      const { alerts, pagination, hasMore: moreAvailable } = response;

      // Add to existing alerts
      alerts.forEach(alert => {
        dispatch(addAlert({
          clusterId: alert.clusterId,
          alertname: alert.alertname,
          severity: alert.severity || 'info',
          namespace: alert.namespace || 'default',
          pod: alert.pod || 'N/A',
          message: alert.message || alert.summary || '',
          labels: alert.labels || {},
          annotations: alert.annotations || {},
          startsAt: alert.startsAt || alert.createdAt,
          endsAt: alert.endsAt || null,
          status: alert.status || 'firing',
          receivedAt: alert.receivedAt || alert.createdAt
        }));
      });

      if (alerts.length > 0) {
        const timestamps = alerts.map(a => new Date(a.receivedAt || a.createdAt || a.startsAt).getTime());
        setOldestTimestamp(Math.min(...timestamps));
      }

      setHasMore(pagination?.hasMore ?? moreAvailable);
      setLoadedCount(prev => prev + alerts.length);

    } catch (err) {
      console.error('Failed to load more alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [dispatch, clusterId, oldestTimestamp, hasMore, loading, loadAllAlerts, loadedCount]);

  /**
   * Setup Socket.IO listener for real-time alerts
   * CRITICAL: Proper cleanup to prevent memory leaks
   */
  useEffect(() => {
    if (!socket || !isMounted.current) return;

    const handleNewAlert = (alert) => {
      if (!isMounted.current) return;

      dispatch(addAlert({
        clusterId: alert.clusterId,
        alertname: alert.alertname,
        severity: alert.severity || 'info',
        namespace: alert.namespace || 'default',
        pod: alert.pod || 'N/A',
        message: alert.message || '',
        labels: alert.labels || {},
        annotations: alert.annotations || {},
        startsAt: alert.startsAt || new Date().toISOString(),
        endsAt: alert.endsAt || null,
        status: alert.status || 'firing',
        receivedAt: alert.receivedAt || new Date().toISOString()
      }));
    };

    // When Alertmanager resolves, update existing firing alerts in Redux
    const handleAlertResolved = (data) => {
      if (!isMounted.current) return;
      dispatch(resolveAlertByName({
        clusterId: data.clusterId,
        alertname: data.alertname,
        endsAt: data.endsAt
      }));
    };

    socket.on('alert', handleNewAlert);
    socket.on('alert-resolved', handleAlertResolved);

    // Listen for alert enrichment data (kubectl, metrics, logs, events)
    const handleEnrichment = (data) => {
      if (!isMounted.current) return;
      dispatch(updateAlertEnrichment({
        alertname: data.alertname,
        clusterId: data.clusterId,
        enrichment: data.enrichment
      }));
    };

    socket.on('alert-enrichment', handleEnrichment);

    return () => {
      socket.off('alert', handleNewAlert);
      socket.off('alert-resolved', handleAlertResolved);
      socket.off('alert-enrichment', handleEnrichment);
    };
  }, [socket, dispatch]);

  /**
   * Auto-cleanup old alerts every 5 minutes
   * Prevents Redux store from growing indefinitely
   */
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      if (!isMounted.current) return;

      // Prune resolved alerts older than 7 days
      dispatch(pruneResolvedAlerts({ hoursAgo: 168 }));

      console.log('[CLEANUP] Pruned old resolved alerts from Redux');
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [dispatch]);

  /**
   * Load initial alerts on mount
   */
  useEffect(() => {
    loadInitialAlerts();
  }, [loadInitialAlerts]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    loading,
    error,
    hasMore,
    loadOlderAlerts,
    refresh: loadInitialAlerts,
    alertsState,
    totalCount,
    loadedCount
  };
};

export default useTimelineAlerts;

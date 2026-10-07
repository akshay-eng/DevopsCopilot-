import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { backendApi } from '../services/api';

const STATUS_SEVERITY = (status) => {
  if (status >= 500) return 'high';
  if (status >= 400) return 'medium';
  return 'info';
};

/**
 * Normalize a backend network error group into the chart group format
 * expected by TimelineChart (same shape as alert groups).
 */
const normalizeNetGroup = (g) => {
  const name = `${g.method || '?'} ${g.path || '/'} → ${g.status}`;
  const id = `net-${g.method}-${g.path}-${g.status}`;
  const severity = STATUS_SEVERITY(g.status);
  const firstMs = new Date(g.firstSeen).getTime();
  const lastMs = new Date(g.lastSeen).getTime();

  // Synthesize occurrences spread between firstSeen and lastSeen
  const count = g.count || 1;
  const span = lastMs - firstMs;
  const occurrences = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? firstMs : firstMs + (span * i) / (count - 1);
    occurrences.push({
      receivedAt: new Date(t).toISOString(),
      status: 'firing',
      severity,
      httpStatus: g.status,
      method: g.method,
      path: g.path,
      srcPod: g.srcPod,
      dstPod: g.dstPod,
      dstSvc: g.dstSvc,
      dstNs: g.dstNs,
      avgLatency: g.avgLatency,
    });
  }

  return {
    id,
    _id: id,
    name,
    alertname: name,
    type: 'network', // distinguishes from alerts
    severity,
    status: 'firing',
    count,
    firstSeen: g.firstSeen,
    lastSeen: lastMs,
    startTime: firstMs,
    resolvedAt: null,
    clusterId: g.clusterId,
    namespace: g.dstNs || g.srcNs,
    dstSvc: g.dstSvc,
    occurrences,
    // Extra network-specific fields for tooltip
    httpStatus: g.status,
    method: g.method,
    path: g.path,
    avgLatency: g.avgLatency,
  };
};

/**
 * Hook to fetch network error groups for the Timeline chart.
 * Also listens for real-time network-traffic events and adds error events.
 */
export const useTimelineNetwork = ({ timeRangeHours = 24, clusterId = null } = {}) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const socket = useSelector(state => state.socket?.socket);
  const clusterIds = useRef([]);

  // Fetch cluster IDs if not provided
  useEffect(() => {
    if (clusterId) {
      clusterIds.current = [clusterId];
    } else {
      backendApi.get('/api/clusters').then(res => {
        if (res?.clusters) {
          clusterIds.current = res.clusters.map(c => c._id);
        }
      }).catch(() => {});
    }
  }, [clusterId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = clusterId ? [clusterId] : clusterIds.current;
      if (!ids.length) {
        setGroups([]);
        setLoading(false);
        return;
      }

      const allGroups = [];
      for (const cid of ids) {
        try {
          const res = await backendApi.get(`/api/clusters/${cid}/network/timeline-errors`, {
            params: { hours: timeRangeHours }
          });
          if (res?.success && Array.isArray(res.groups)) {
            allGroups.push(...res.groups.map(g => ({ ...g, clusterId: cid })));
          }
        } catch {
          // Skip clusters that fail
        }
      }

      setGroups(allGroups.map(normalizeNetGroup));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [timeRangeHours, clusterId]);

  useEffect(() => { load(); }, [load]);

  // Real-time Socket.IO: listen for network-traffic events with error codes
  useEffect(() => {
    if (!socket) return;

    const handleNetworkTraffic = (data) => {
      const status = data.http?.status;
      if (!status || status < 400) return; // Only errors

      const method = data.http?.method || '?';
      const path = data.http?.path || '/';
      const groupId = `net-${method}-${path}-${status}`;
      const severity = STATUS_SEVERITY(status);

      setGroups(prev => {
        const idx = prev.findIndex(g => g.id === groupId);
        const receivedAt = data.timestamp || new Date().toISOString();
        const receivedMs = new Date(receivedAt).getTime();

        const occ = {
          receivedAt,
          status: 'firing',
          severity,
          httpStatus: status,
          method,
          path,
          srcPod: data.src?.pod,
          dstPod: data.dst?.pod,
          dstSvc: data.dst?.svc,
          dstNs: data.dst?.ns,
        };

        if (idx === -1) {
          // New group
          const newGroup = {
            id: groupId,
            _id: groupId,
            name: `${method} ${path} → ${status}`,
            alertname: `${method} ${path} → ${status}`,
            type: 'network',
            severity,
            status: 'firing',
            count: 1,
            firstSeen: receivedAt,
            lastSeen: receivedMs,
            startTime: receivedMs,
            resolvedAt: null,
            clusterId: data.clusterId,
            namespace: data.dst?.ns || data.src?.ns,
            dstSvc: data.dst?.svc,
            occurrences: [occ],
            httpStatus: status,
            method,
            path,
          };
          return [newGroup, ...prev];
        }

        // Update existing group
        const updated = [...prev];
        const g = { ...updated[idx] };
        g.occurrences = [...g.occurrences, occ].sort((a, b) =>
          new Date(a.receivedAt) - new Date(b.receivedAt)
        );
        g.count = g.occurrences.length;
        if (receivedMs > (g.lastSeen || 0)) g.lastSeen = receivedMs;
        updated[idx] = g;
        return updated;
      });
    };

    socket.on('network-traffic', handleNetworkTraffic);
    return () => socket.off('network-traffic', handleNetworkTraffic);
  }, [socket]);

  return { groups, loading, error, refresh: load };
};

export default useTimelineNetwork;

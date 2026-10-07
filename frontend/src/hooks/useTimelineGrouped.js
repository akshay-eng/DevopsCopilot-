import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { fetchTimelineGrouped } from '../api/alertsApi';

const SEV_RANK = { critical: 5, high: 4, warning: 3, medium: 3, low: 2, info: 1 };

/**
 * Synthesize occurrence dots from group metadata.
 * The backend only returns {firstSeen, lastSeen, count, resolvedCount}
 * to avoid the 30s+ NodePort transfer cost of $push.
 * We distribute `count` dots evenly between firstSeen and lastSeen.
 */
const synthesizeOccurrences = (g) => {
  const first = new Date(g.firstSeen).getTime();
  const last  = new Date(g.lastSeen).getTime();
  const count = g.count || 0;
  const resolvedCount = g.resolvedCount || 0;
  const firingCount = count - resolvedCount;

  if (!count || isNaN(first) || isNaN(last)) return [];

  const occs = [];
  const span = last - first;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? first : first + (span * i) / (count - 1);
    // Distribute resolved occurrences at the end
    const isResolved = i >= firingCount;
    occs.push({
      receivedAt: new Date(t).toISOString(),
      status: isResolved ? 'resolved' : (g.status === 'resolved' ? 'resolved' : 'firing'),
      severity: g.severity,
    });
  }
  return occs;
};

const normalizeGroup = (g) => {
  // Use real occurrences if present (from Socket.IO merges), otherwise synthesize
  let occurrences;
  if (g.occurrences && g.occurrences.length > 0) {
    occurrences = g.occurrences
      .map(o => ({ ...o, receivedAt: o.receivedAt || o.startsAt }))
      .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
  } else {
    occurrences = synthesizeOccurrences(g);
  }

  let resolvedAt = g.resolvedAt ? new Date(g.resolvedAt).getTime() : null;
  if (!resolvedAt) {
    const resolvedTimes = occurrences
      .filter(o => o.status === 'resolved')
      .map(o => new Date(o.receivedAt).getTime());
    resolvedAt = resolvedTimes.length ? Math.max(...resolvedTimes) : null;
  }

  return {
    ...g,
    id:         g._id || g.name || g.alertname,
    name:       g.name || g.alertname || g._id,
    startTime:  g.firstSeen ? new Date(g.firstSeen).getTime() : null,
    lastSeen:   g.lastSeen  ? new Date(g.lastSeen).getTime()  : null,
    resolvedAt,
    occurrences,
  };
};

const sortGroups = (arr) =>
  [...arr].sort((a, b) => {
    if (a.status === 'firing' && b.status !== 'firing') return -1;
    if (b.status === 'firing' && a.status !== 'firing') return 1;
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  });

/**
 * Hook to fetch pre-aggregated timeline data from MongoDB.
 *
 * Backend returns metadata-only groups (~20ms). Occurrence dots are
 * synthesized client-side from firstSeen/lastSeen/count.
 * Real-time Socket.IO events add precise dots on top.
 */
export const useTimelineGrouped = ({ timeRangeHours = 48, clusterId = null } = {}) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastFetchRef = useRef(null);
  const socket = useSelector(state => state.socket?.socket);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTimelineGrouped({ hours: timeRangeHours, clusterId });
      if (res.success && Array.isArray(res.groups)) {
        setGroups(res.groups.map(normalizeGroup));
        lastFetchRef.current = Date.now();
      } else {
        setGroups([]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [timeRangeHours, clusterId]);

  useEffect(() => { load(); }, [load]);

  // Real-time Socket.IO integration
  useEffect(() => {
    if (!socket) return;

    const handleNewAlert = (alert) => {
      const groupKey = alert.alertname;
      if (!groupKey) return;

      const receivedAt = alert.receivedAt || new Date().toISOString();
      const receivedMs = new Date(receivedAt).getTime();

      setGroups(prev => {
        const idx = prev.findIndex(g => g.name === groupKey || g.id === groupKey);

        if (idx === -1) {
          const newGroup = normalizeGroup({
            _id: groupKey, name: groupKey, alertname: groupKey,
            severity: alert.severity || 'info', clusterId: alert.clusterId,
            namespace: alert.namespace, count: 1,
            firstSeen: receivedAt, lastSeen: receivedAt,
            status: alert.status || 'firing',
            occurrences: [{ ...alert, receivedAt }],
          });
          return sortGroups([newGroup, ...prev]);
        }

        const updated = [...prev];
        const g = { ...updated[idx] };

        const isDuplicate = g.occurrences.some(
          o => o.receivedAt === receivedAt && o.status === alert.status
        );
        if (isDuplicate) return prev;

        g.occurrences = [...g.occurrences, { ...alert, receivedAt }]
          .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
        g.count = g.occurrences.length;

        if (g.lastSeen === null || receivedMs > g.lastSeen) g.lastSeen = receivedMs;
        if (alert.status === 'firing') g.status = 'firing';

        if ((SEV_RANK[alert.severity?.toLowerCase()] || 0) > (SEV_RANK[g.severity] || 0)) {
          g.severity = alert.severity.toLowerCase();
        }

        updated[idx] = g;
        return sortGroups(updated);
      });
    };

    const handleReconnect = () => {
      console.log('[useTimelineGrouped] Socket reconnected — refreshing from MongoDB');
      load();
    };

    socket.on('alert', handleNewAlert);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('alert', handleNewAlert);
      socket.off('connect', handleReconnect);
    };
  }, [socket, load]);

  return { groups, loading, error, refresh: load };
};

export default useTimelineGrouped;

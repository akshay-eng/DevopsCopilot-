import { useMemo } from 'react';

/**
 * Custom hook to group alerts by alertname + namespace + pod
 * This gives each unique pod alert its own timeline row.
 */
export const useAlertGrouping = (alertsState) => {
  return useMemo(() => {
    if (!alertsState || !alertsState.alerts) return [];

    const groupMap = new Map();

    Object.keys(alertsState.alerts).forEach(clusterId => {
      const clusterAlerts = alertsState.alerts[clusterId] || [];

      clusterAlerts.forEach((alert) => {
        const alertName = alert.alertname || alert.name || 'Unknown';
        const namespace  = alert.namespace || 'default';
        const pod        = alert.pod || alert.labels?.pod || '';

        // Group by alertname only — one row per alert TYPE across ALL clusters (Robusta style)
        // Cluster info remains visible in the tooltip per occurrence
        const groupKey = alertName;

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            id: groupKey,
            name: alertName,
            pod,
            namespace,
            cluster: clusterId,   // cluster of first occurrence; tooltip shows per-occurrence cluster
            status: 'resolved',
            severity: 'info',
            startTime: null,
            lastSeen: null,
            resolvedAt: null,
            count: 0,
            occurrences: [],
          });
        }

        const group = groupMap.get(groupKey);
        group.occurrences.push(alert);
        group.count++;

        // startTime = earliest known time from Prometheus (startsAt) — drives the timeline x-axis range
        const alertOriginalTime = new Date(alert.startsAt || alert.receivedAt || Date.now()).getTime();
        // lastSeen = most recent notification time (receivedAt) — for sorting and "last activity"
        const alertReceivedTime = new Date(alert.receivedAt || alert.startsAt || Date.now()).getTime();

        if (group.startTime === null || alertOriginalTime < group.startTime) group.startTime = alertOriginalTime;
        if (group.lastSeen === null || alertReceivedTime > group.lastSeen) group.lastSeen = alertReceivedTime;

        // Track latest resolved time
        if (alert.status === 'resolved') {
          const resolvedTime = new Date(alert.endsAt || alert.startsAt || Date.now()).getTime();
          if (group.resolvedAt === null || resolvedTime > group.resolvedAt) group.resolvedAt = resolvedTime;
        }

        // Group is firing if ANY occurrence is firing
        if (alert.status === 'firing') group.status = 'firing';

        // Keep highest severity
        const rank = { critical: 5, high: 4, warning: 3, medium: 3, low: 2, info: 1 };
        if ((rank[alert.severity?.toLowerCase()] || 0) > (rank[group.severity] || 0)) {
          group.severity = alert.severity.toLowerCase();
        }
      });
    });

    const groups = Array.from(groupMap.values());

    // Sort occurrences within each group by time (oldest first)
    groups.forEach(group => {
      group.occurrences.sort((a, b) =>
        new Date(a.receivedAt || a.startsAt || a.timestamp).getTime() -
        new Date(b.receivedAt || b.startsAt || b.timestamp).getTime()
      );
    });

    // Sort groups: firing first, then by most recent activity
    groups.sort((a, b) => {
      if (a.status === 'firing' && b.status !== 'firing') return -1;
      if (b.status === 'firing' && a.status !== 'firing') return 1;
      return b.lastSeen - a.lastSeen;
    });

    return groups;
  }, [alertsState]);
};

export default useAlertGrouping;

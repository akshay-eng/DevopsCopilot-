import { createSlice } from '@reduxjs/toolkit';

/**
 * Alerts Slice - Manages real-time alerts
 *
 * Stores alerts received via Socket.IO from Prometheus/Alertmanager
 */

const initialState = {
  // All alerts by cluster
  alerts: {},
  // Active alerts count
  activeCount: {},
  // Alert history (limited)
  history: {},
  // Max alerts to keep in history per cluster
  maxHistoryPerCluster: 100,
  // Safety ceiling for state.alerts[clusterId] — without this, a long-running
  // session (continuous socket pushes + "Load More" pagination) grows this
  // array unbounded, which is what made the Timeline UI slow/stuck over time.
  maxAlertsPerCluster: 1000,
  // Unread alerts count
  unreadCount: 0
};

const alertsSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    // Add new alert
    addAlert: (state, action) => {
      const { clusterId, alertname, severity, namespace, pod, message, labels, annotations, startsAt, endsAt, status, receivedAt } = action.payload;

      // Initialize alerts array for cluster if doesn't exist
      if (!state.alerts[clusterId]) {
        state.alerts[clusterId] = [];
      }

      const alert = {
        id: `${clusterId}-${alertname}-${receivedAt || startsAt || Date.now()}`,
        clusterId,
        alertname,
        severity: severity || 'warning',
        namespace: namespace || 'default',
        pod: pod || 'N/A',
        message: message || '',
        labels: labels || {},
        annotations: annotations || {},
        startsAt: startsAt || new Date().toISOString(),
        endsAt: endsAt || null,
        receivedAt: receivedAt || new Date().toISOString(),
        status: status || 'firing',
        read: false
      };

      // Add to active alerts
      state.alerts[clusterId].unshift(alert);

      // Keep this bounded — see maxAlertsPerCluster comment above.
      if (state.alerts[clusterId].length > state.maxAlertsPerCluster) {
        state.alerts[clusterId].length = state.maxAlertsPerCluster;
      }

      // Update active count
      if (!state.activeCount[clusterId]) {
        state.activeCount[clusterId] = 0;
      }
      state.activeCount[clusterId]++;

      // Add to history
      if (!state.history[clusterId]) {
        state.history[clusterId] = [];
      }
      state.history[clusterId].unshift(alert);

      // Keep only last N alerts in history
      if (state.history[clusterId].length > state.maxHistoryPerCluster) {
        state.history[clusterId] = state.history[clusterId].slice(0, state.maxHistoryPerCluster);
      }

      // Increment unread count
      state.unreadCount++;
    },

    // Resolve alert by ID
    resolveAlert: (state, action) => {
      const { clusterId, alertId } = action.payload;

      if (state.alerts[clusterId]) {
        const alert = state.alerts[clusterId].find(a => a.id === alertId);
        if (alert && alert.status === 'firing') {
          alert.status = 'resolved';
          alert.endsAt = new Date().toISOString();
          state.activeCount[clusterId] = Math.max(0, (state.activeCount[clusterId] || 1) - 1);
        }
      }
    },

    // Resolve all firing occurrences of an alert by name (for Alertmanager resolved webhook)
    resolveAlertByName: (state, action) => {
      const { clusterId, alertname, endsAt } = action.payload;

      if (state.alerts[clusterId]) {
        state.alerts[clusterId].forEach(alert => {
          if (alert.alertname === alertname && alert.status === 'firing') {
            alert.status = 'resolved';
            alert.endsAt = endsAt || new Date().toISOString();
          }
        });
        // Recalculate active count
        state.activeCount[clusterId] = state.alerts[clusterId].filter(a => a.status === 'firing').length;
      }
    },

    // Mark alert as read
    markAlertAsRead: (state, action) => {
      const { clusterId, alertId } = action.payload;

      if (state.alerts[clusterId]) {
        const alert = state.alerts[clusterId].find(a => a.id === alertId);
        if (alert && !alert.read) {
          alert.read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      }
    },

    // Mark all alerts as read for a cluster
    markAllAsRead: (state, action) => {
      const { clusterId } = action.payload;

      if (state.alerts[clusterId]) {
        state.alerts[clusterId].forEach(alert => {
          if (!alert.read) {
            alert.read = true;
            state.unreadCount = Math.max(0, state.unreadCount - 1);
          }
        });
      }
    },

    // Clear alerts for a cluster
    clearClusterAlerts: (state, action) => {
      const { clusterId } = action.payload;

      // Count unread alerts before clearing
      if (state.alerts[clusterId]) {
        const unreadInCluster = state.alerts[clusterId].filter(a => !a.read).length;
        state.unreadCount = Math.max(0, state.unreadCount - unreadInCluster);
      }

      delete state.alerts[clusterId];
      delete state.activeCount[clusterId];
      delete state.history[clusterId];
    },

    // Clear all alerts
    clearAllAlerts: (state) => {
      state.alerts = {};
      state.activeCount = {};
      state.history = {};
      state.unreadCount = 0;
    },

    // Remove resolved alerts older than X hours
    pruneResolvedAlerts: (state, action) => {
      const { hoursAgo = 24 } = action.payload || {};
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

      Object.keys(state.alerts).forEach(clusterId => {
        state.alerts[clusterId] = state.alerts[clusterId].filter(alert => {
          if (alert.status === 'resolved' && new Date(alert.endsAt) < cutoffTime) {
            if (!alert.read) {
              state.unreadCount = Math.max(0, state.unreadCount - 1);
            }
            return false;
          }
          return true;
        });
      });
    },

    // Set max history per cluster
    setMaxHistory: (state, action) => {
      state.maxHistoryPerCluster = action.payload;
    },

    // Update alert with enrichment data (kubectl, logs, metrics, events)
    updateAlertEnrichment: (state, action) => {
      const { alertname, clusterId, enrichment } = action.payload;

      // Update in alerts
      if (state.alerts[clusterId]) {
        const alert = state.alerts[clusterId].find(a => a.alertname === alertname);
        if (alert) {
          alert.enrichment = enrichment;
        }
      }

      // Update in history
      if (state.history[clusterId]) {
        const histAlert = state.history[clusterId].find(a => a.alertname === alertname);
        if (histAlert) {
          histAlert.enrichment = enrichment;
        }
      }
    }
  }
});

export const {
  addAlert,
  resolveAlert,
  resolveAlertByName,
  markAlertAsRead,
  markAllAsRead,
  clearClusterAlerts,
  clearAllAlerts,
  pruneResolvedAlerts,
  setMaxHistory,
  updateAlertEnrichment
} = alertsSlice.actions;

// Selectors
export const selectAlerts = (state, clusterId) => {
  return state.alerts.alerts[clusterId] || [];
};

export const selectActiveAlerts = (state, clusterId) => {
  const alerts = state.alerts.alerts[clusterId] || [];
  return alerts.filter(a => a.status === 'firing');
};

export const selectAlertsBySeverity = (state, clusterId, severity) => {
  const alerts = state.alerts.alerts[clusterId] || [];
  return alerts.filter(a => a.severity === severity);
};

export const selectAlertsByNamespace = (state, clusterId, namespace) => {
  const alerts = state.alerts.alerts[clusterId] || [];
  return alerts.filter(a => a.namespace === namespace);
};

export const selectActiveCount = (state, clusterId) => {
  return state.alerts.activeCount[clusterId] || 0;
};

export const selectUnreadCount = (state) => {
  return state.alerts.unreadCount;
};

export const selectAlertHistory = (state, clusterId) => {
  return state.alerts.history[clusterId] || [];
};

export default alertsSlice.reducer;

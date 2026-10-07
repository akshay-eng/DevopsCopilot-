import { createSlice } from '@reduxjs/toolkit';

/**
 * Events Slice - Manages Kubernetes events
 *
 * Stores K8s events received via Socket.IO
 */

const initialState = {
  // Events by cluster
  events: {},
  // Max events to keep per cluster
  maxEventsPerCluster: 200,
  // Last update timestamp
  lastUpdate: {}
};

const eventsSlice = createSlice({
  name: 'events',
  initialState,
  reducers: {
    // Add new event
    addEvent: (state, action) => {
      const {
        clusterId,
        namespace,
        reason,
        message,
        type,
        involvedObject,
        count,
        firstTimestamp,
        lastTimestamp
      } = action.payload;

      // Initialize events array for cluster if doesn't exist
      if (!state.events[clusterId]) {
        state.events[clusterId] = [];
      }

      const event = {
        id: `${clusterId}-${namespace}-${reason}-${Date.now()}`,
        clusterId,
        namespace: namespace || 'default',
        reason,
        message,
        type: type || 'Normal',
        involvedObject: involvedObject || {},
        count: count || 1,
        firstTimestamp: firstTimestamp || new Date().toISOString(),
        lastTimestamp: lastTimestamp || new Date().toISOString(),
        receivedAt: new Date().toISOString()
      };

      // Add to events (newest first)
      state.events[clusterId].unshift(event);

      // Keep only last N events
      if (state.events[clusterId].length > state.maxEventsPerCluster) {
        state.events[clusterId] = state.events[clusterId].slice(0, state.maxEventsPerCluster);
      }

      state.lastUpdate[clusterId] = new Date().toISOString();
    },

    // Bulk add events
    bulkAddEvents: (state, action) => {
      const { clusterId, events } = action.payload;

      if (!state.events[clusterId]) {
        state.events[clusterId] = [];
      }

      events.forEach(eventData => {
        const event = {
          id: `${clusterId}-${eventData.namespace}-${eventData.reason}-${Date.now()}-${Math.random()}`,
          clusterId,
          ...eventData,
          receivedAt: new Date().toISOString()
        };

        state.events[clusterId].unshift(event);
      });

      // Keep only last N events
      if (state.events[clusterId].length > state.maxEventsPerCluster) {
        state.events[clusterId] = state.events[clusterId].slice(0, state.maxEventsPerCluster);
      }

      state.lastUpdate[clusterId] = new Date().toISOString();
    },

    // Clear events for a cluster
    clearClusterEvents: (state, action) => {
      const { clusterId } = action.payload;
      delete state.events[clusterId];
      delete state.lastUpdate[clusterId];
    },

    // Clear events older than X hours
    pruneOldEvents: (state, action) => {
      const { hoursAgo = 1 } = action.payload || {};
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

      Object.keys(state.events).forEach(clusterId => {
        state.events[clusterId] = state.events[clusterId].filter(event => {
          return new Date(event.receivedAt) > cutoffTime;
        });
      });
    },

    // Clear all events
    clearAllEvents: (state) => {
      state.events = {};
      state.lastUpdate = {};
    },

    // Set max events per cluster
    setMaxEvents: (state, action) => {
      state.maxEventsPerCluster = action.payload;
    }
  }
});

export const {
  addEvent,
  bulkAddEvents,
  clearClusterEvents,
  pruneOldEvents,
  clearAllEvents,
  setMaxEvents
} = eventsSlice.actions;

// Selectors
export const selectEvents = (state, clusterId) => {
  return state.events.events[clusterId] || [];
};

export const selectEventsByType = (state, clusterId, type) => {
  const events = state.events.events[clusterId] || [];
  return events.filter(e => e.type === type);
};

export const selectWarningEvents = (state, clusterId) => {
  return selectEventsByType(state, clusterId, 'Warning');
};

export const selectNormalEvents = (state, clusterId) => {
  return selectEventsByType(state, clusterId, 'Normal');
};

export const selectEventsByNamespace = (state, clusterId, namespace) => {
  const events = state.events.events[clusterId] || [];
  return events.filter(e => e.namespace === namespace);
};

export const selectEventsByResource = (state, clusterId, resourceKind, resourceName) => {
  const events = state.events.events[clusterId] || [];
  return events.filter(e =>
    e.involvedObject?.kind === resourceKind &&
    e.involvedObject?.name === resourceName
  );
};

export const selectRecentEvents = (state, clusterId, minutesAgo = 5) => {
  const events = state.events.events[clusterId] || [];
  const cutoffTime = new Date(Date.now() - minutesAgo * 60 * 1000);

  return events.filter(e => new Date(e.receivedAt) > cutoffTime);
};

export default eventsSlice.reducer;

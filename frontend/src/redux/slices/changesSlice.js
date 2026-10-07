import { createSlice } from '@reduxjs/toolkit';

/**
 * Changes Slice
 *
 * Manages K8s resource changes (deployments, configmaps, etc.) state
 */

const initialState = {
  changes: {},           // { [clusterId]: change[] }
  recentChanges: [],     // Flat list, newest first (all clusters)
  maxPerCluster: 200
};

const changesSlice = createSlice({
  name: 'changes',
  initialState,
  reducers: {
    /**
     * Add a single change event
     */
    addChange: (state, action) => {
      const { clusterId, ...changeData } = action.payload;

      if (!clusterId) {
        console.error('[changesSlice] addChange: missing clusterId', action.payload);
        return;
      }

      // Build change entry with unique ID
      const entry = {
        id: `${clusterId}-${changeData.resourceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        clusterId,
        ...changeData
      };

      // Add to cluster-specific changes
      if (!state.changes[clusterId]) {
        state.changes[clusterId] = [];
      }
      state.changes[clusterId].unshift(entry);

      // Add to flat recentChanges list
      state.recentChanges.unshift(entry);

      // Cap per cluster
      if (state.changes[clusterId].length > state.maxPerCluster) {
        state.changes[clusterId].pop();
      }

      // Cap recentChanges
      if (state.recentChanges.length > 500) {
        state.recentChanges.pop();
      }
    },

    /**
     * Clear all changes
     */
    clearChanges: (state) => {
      state.changes = {};
      state.recentChanges = [];
    },

    /**
     * Bulk load changes (e.g., from API)
     */
    setChanges: (state, action) => {
      const changes = action.payload;

      if (!Array.isArray(changes)) {
        console.error('[changesSlice] setChanges: payload is not an array', action.payload);
        return;
      }

      // Reset state
      state.changes = {};
      state.recentChanges = [];

      // Group by cluster and populate recentChanges
      changes.forEach(change => {
        const { clusterId } = change;

        if (!clusterId) return;

        // Add ID if missing
        const entry = change.id ? change : {
          ...change,
          id: `${clusterId}-${change.resourceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };

        // Add to cluster-specific changes
        if (!state.changes[clusterId]) {
          state.changes[clusterId] = [];
        }
        state.changes[clusterId].push(entry);

        // Add to recentChanges
        state.recentChanges.push(entry);
      });

      // Sort recentChanges by timestamp (newest first)
      state.recentChanges.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeB - timeA;
      });
    },

    /**
     * Update correlation for a change
     */
    updateChangeCorrelation: (state, action) => {
      const { changeId, correlatedAlertIds } = action.payload;

      // Update in recentChanges
      const recentIdx = state.recentChanges.findIndex(c => c.id === changeId || c._id === changeId);
      if (recentIdx !== -1) {
        state.recentChanges[recentIdx].correlatedAlertIds = correlatedAlertIds;
      }

      // Update in cluster-specific changes
      Object.keys(state.changes).forEach(clusterId => {
        const clusterIdx = state.changes[clusterId].findIndex(c => c.id === changeId || c._id === changeId);
        if (clusterIdx !== -1) {
          state.changes[clusterId][clusterIdx].correlatedAlertIds = correlatedAlertIds;
        }
      });
    }
  }
});

export const {
  addChange,
  clearChanges,
  setChanges,
  updateChangeCorrelation
} = changesSlice.actions;

export default changesSlice.reducer;

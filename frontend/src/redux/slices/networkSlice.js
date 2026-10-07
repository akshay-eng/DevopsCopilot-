import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { getNetworkTraffic, getServiceMap, toggleNetworkCapture, getNetworkFlows, getWorkloadReport } from '../../services/api';

const MAX_EVENTS_PER_CLUSTER = 500;
const CACHE_TTL_MS = 5000; // 5 seconds

// ========================================
// Async Thunks
// ========================================

export const fetchNetworkTraffic = createAsyncThunk(
  'network/fetchNetworkTraffic',
  async ({ clusterId, options = {} }, { rejectWithValue }) => {
    try {
      const response = await getNetworkTraffic(clusterId, { limit: 200, ...options });
      return {
        clusterId,
        events: response.events || [],
        captureEnabled: response.captureEnabled
      };
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to fetch network traffic');
    }
  },
  {
    condition: ({ clusterId }, { getState }) => {
      const state = getState();
      const key = `${clusterId}/traffic`;
      if (state.network.loading[key]) return false;
      const lastFetch = state.network.lastFetched[clusterId]?.traffic;
      if (lastFetch && Date.now() - lastFetch < CACHE_TTL_MS) return false;
      return true;
    }
  }
);

export const fetchServiceMap = createAsyncThunk(
  'network/fetchServiceMap',
  async ({ clusterId }, { rejectWithValue }) => {
    try {
      const response = await getServiceMap(clusterId);
      return {
        clusterId,
        nodes: response.nodes || [],
        links: response.links || []
      };
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to fetch service map');
    }
  },
  {
    condition: ({ clusterId }, { getState }) => {
      const state = getState();
      const key = `${clusterId}/serviceMap`;
      if (state.network.loading[key]) return false;
      const lastFetch = state.network.lastFetched[clusterId]?.serviceMap;
      if (lastFetch && Date.now() - lastFetch < CACHE_TTL_MS) return false;
      return true;
    }
  }
);

export const toggleCapture = createAsyncThunk(
  'network/toggleCapture',
  async ({ clusterId, enabled }, { rejectWithValue }) => {
    try {
      const response = await toggleNetworkCapture(clusterId, enabled);
      return {
        clusterId,
        captureEnabled: response.captureEnabled
      };
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to toggle capture');
    }
  }
);

export const fetchNetworkFlows = createAsyncThunk(
  'network/fetchNetworkFlows',
  async ({ clusterId, options = {} }, { rejectWithValue }) => {
    try {
      const response = await getNetworkFlows(clusterId, options);
      return { clusterId, flows: response.flows || [] };
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to fetch flows');
    }
  },
  {
    condition: ({ clusterId }, { getState }) => {
      const state = getState();
      if (state.network.loading[`${clusterId}/flows`]) return false;
      const lastFetch = state.network.lastFetched[clusterId]?.flows;
      if (lastFetch && Date.now() - lastFetch < CACHE_TTL_MS) return false;
      return true;
    }
  }
);

export const fetchWorkloadReport = createAsyncThunk(
  'network/fetchWorkloadReport',
  async ({ clusterId, options = {} }, { rejectWithValue }) => {
    try {
      const response = await getWorkloadReport(clusterId, options);
      return { clusterId, report: response };
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to fetch workload report');
    }
  },
  {
    condition: ({ clusterId }, { getState }) => {
      const state = getState();
      if (state.network.loading[`${clusterId}/report`]) return false;
      const lastFetch = state.network.lastFetched[clusterId]?.report;
      if (lastFetch && Date.now() - lastFetch < CACHE_TTL_MS) return false;
      return true;
    }
  }
);

// ========================================
// Slice
// ========================================

const initialState = {
  trafficEvents: {},   // { [clusterId]: event[] }
  serviceMap: {},      // { [clusterId]: { nodes: [], links: [] } }
  captureEnabled: {},  // { [clusterId]: boolean }
  flows: {},           // { [clusterId]: flow[] }
  workloadReport: {},  // { [clusterId]: { summary, workloads, serviceMap } }
  lastFetched: {},     // { [clusterId]: { traffic, serviceMap, flows, report } }
  loading: {},         // { "clusterId/traffic": bool, ... }
  errors: {}           // { "clusterId/traffic": { message, timestamp } }
};

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    // Socket.IO real-time: single event pushed from backend
    addTrafficEvent: (state, action) => {
      const { clusterId, ...event } = action.payload;
      console.log('🔵 addTrafficEvent called:', { clusterId, eventId: event.id, payload: action.payload });
      if (!clusterId) {
        console.warn('⚠️ No clusterId in payload!', action.payload);
        return;
      }
      if (!state.trafficEvents[clusterId]) {
        state.trafficEvents[clusterId] = [];
        console.log('📝 Created new array for clusterId:', clusterId);
      }
      state.trafficEvents[clusterId].unshift(event);
      console.log(`✅ Added event. Total events for ${clusterId}:`, state.trafficEvents[clusterId].length);
      if (state.trafficEvents[clusterId].length > MAX_EVENTS_PER_CLUSTER) {
        state.trafficEvents[clusterId].pop();
      }
    },
    // Socket.IO real-time: service map update pushed from backend
    updateServiceMap: (state, action) => {
      const { clusterId, nodes, links } = action.payload;
      if (!clusterId) return;
      state.serviceMap[clusterId] = { nodes: nodes || [], links: links || [] };
    },
    setCaptureEnabled: (state, action) => {
      const { clusterId, enabled } = action.payload;
      state.captureEnabled[clusterId] = enabled;
    },
    clearClusterTraffic: (state, action) => {
      const clusterId = action.payload;
      delete state.trafficEvents[clusterId];
      delete state.serviceMap[clusterId];
      delete state.lastFetched[clusterId];
    }
  },
  extraReducers: (builder) => {
    builder
      // fetchNetworkTraffic
      .addCase(fetchNetworkTraffic.pending, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/traffic`] = true;
        delete state.errors[`${clusterId}/traffic`];
      })
      .addCase(fetchNetworkTraffic.fulfilled, (state, action) => {
        const { clusterId, events, captureEnabled } = action.payload;
        state.trafficEvents[clusterId] = events.slice(0, MAX_EVENTS_PER_CLUSTER);
        state.loading[`${clusterId}/traffic`] = false;
        if (!state.lastFetched[clusterId]) state.lastFetched[clusterId] = {};
        state.lastFetched[clusterId].traffic = Date.now();
        if (captureEnabled !== undefined) {
          state.captureEnabled[clusterId] = captureEnabled;
        }
      })
      .addCase(fetchNetworkTraffic.rejected, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/traffic`] = false;
        state.errors[`${clusterId}/traffic`] = {
          message: action.payload || 'Failed to fetch traffic',
          timestamp: Date.now()
        };
      })
      // fetchServiceMap
      .addCase(fetchServiceMap.pending, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/serviceMap`] = true;
        delete state.errors[`${clusterId}/serviceMap`];
      })
      .addCase(fetchServiceMap.fulfilled, (state, action) => {
        const { clusterId, nodes, links } = action.payload;
        state.serviceMap[clusterId] = { nodes, links };
        state.loading[`${clusterId}/serviceMap`] = false;
        if (!state.lastFetched[clusterId]) state.lastFetched[clusterId] = {};
        state.lastFetched[clusterId].serviceMap = Date.now();
      })
      .addCase(fetchServiceMap.rejected, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/serviceMap`] = false;
        state.errors[`${clusterId}/serviceMap`] = {
          message: action.payload || 'Failed to fetch service map',
          timestamp: Date.now()
        };
      })
      // toggleCapture
      .addCase(toggleCapture.pending, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/capture`] = true;
        delete state.errors[`${clusterId}/capture`];
      })
      .addCase(toggleCapture.fulfilled, (state, action) => {
        const { clusterId, captureEnabled } = action.payload;
        state.captureEnabled[clusterId] = captureEnabled;
        state.loading[`${clusterId}/capture`] = false;
      })
      .addCase(toggleCapture.rejected, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/capture`] = false;
        state.errors[`${clusterId}/capture`] = {
          message: action.payload || 'Failed to toggle capture',
          timestamp: Date.now()
        };
      })
      // fetchNetworkFlows
      .addCase(fetchNetworkFlows.pending, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/flows`] = true;
        delete state.errors[`${clusterId}/flows`];
      })
      .addCase(fetchNetworkFlows.fulfilled, (state, action) => {
        const { clusterId, flows } = action.payload;
        state.flows[clusterId] = flows;
        state.loading[`${clusterId}/flows`] = false;
        if (!state.lastFetched[clusterId]) state.lastFetched[clusterId] = {};
        state.lastFetched[clusterId].flows = Date.now();
      })
      .addCase(fetchNetworkFlows.rejected, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/flows`] = false;
        state.errors[`${clusterId}/flows`] = {
          message: action.payload || 'Failed to fetch flows',
          timestamp: Date.now()
        };
      })
      // fetchWorkloadReport
      .addCase(fetchWorkloadReport.pending, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/report`] = true;
        delete state.errors[`${clusterId}/report`];
      })
      .addCase(fetchWorkloadReport.fulfilled, (state, action) => {
        const { clusterId, report } = action.payload;
        state.workloadReport[clusterId] = report;
        state.loading[`${clusterId}/report`] = false;
        if (!state.lastFetched[clusterId]) state.lastFetched[clusterId] = {};
        state.lastFetched[clusterId].report = Date.now();
      })
      .addCase(fetchWorkloadReport.rejected, (state, action) => {
        const { clusterId } = action.meta.arg;
        state.loading[`${clusterId}/report`] = false;
        state.errors[`${clusterId}/report`] = {
          message: action.payload || 'Failed to fetch workload report',
          timestamp: Date.now()
        };
      });
  }
});

export const {
  addTrafficEvent,
  updateServiceMap,
  setCaptureEnabled,
  clearClusterTraffic
} = networkSlice.actions;

// ========================================
// Selectors
// ========================================

// Data selectors
export const selectTrafficEvents = (state, clusterId) => {
  console.log('🔍 selectTrafficEvents called with clusterId:', clusterId, 'type:', typeof clusterId);
  console.log('🔍 state.network exists:', !!state.network);
  const allKeys = Object.keys(state.network?.trafficEvents || {});
  console.log('🔍 state.network.trafficEvents keys:', allKeys);
  console.log('🔍 Full trafficEvents object:', state.network?.trafficEvents);

  // Check each key to see if there's a type mismatch
  allKeys.forEach(key => {
    console.log(`🔍 Key "${key}" (type: ${typeof key}), equals clusterId? ${key === clusterId}, length: ${state.network.trafficEvents[key]?.length || 0}`);
  });

  const events = state.network?.trafficEvents?.[clusterId] || [];
  console.log('🔍 Returning events:', events.length, 'Array?', Array.isArray(events));
  return events;
};

export const selectServiceMap = (state, clusterId) =>
  state.network?.serviceMap?.[clusterId] || { nodes: [], links: [] };

export const selectCaptureEnabled = (state, clusterId) =>
  state.network?.captureEnabled?.[clusterId] !== false;

// Loading selectors
export const selectIsLoadingTraffic = (state, clusterId) =>
  !!state.network?.loading?.[`${clusterId}/traffic`];

export const selectIsLoadingServiceMap = (state, clusterId) =>
  !!state.network?.loading?.[`${clusterId}/serviceMap`];

export const selectIsTogglingCapture = (state, clusterId) =>
  !!state.network?.loading?.[`${clusterId}/capture`];

// Error selectors
export const selectTrafficError = (state, clusterId) =>
  state.network?.errors?.[`${clusterId}/traffic`] || null;

export const selectServiceMapError = (state, clusterId) =>
  state.network?.errors?.[`${clusterId}/serviceMap`] || null;

// Cache selectors
export const selectHasCachedTraffic = (state, clusterId) => {
  const events = state.network?.trafficEvents?.[clusterId];
  return events && events.length > 0;
};

export const selectTrafficCacheAge = (state, clusterId) => {
  const ts = state.network?.lastFetched?.[clusterId]?.traffic;
  return ts ? (Date.now() - ts) / 1000 : Infinity;
};

// Memoized filtered selector — avoids re-filtering on every render
const selectTrafficEventsRaw = (state, clusterId) =>
  state.network?.trafficEvents?.[clusterId] || [];

export const makeSelectFilteredTrafficEvents = () =>
  createSelector(
    [selectTrafficEventsRaw, (_s, _c, methodFilter) => methodFilter, (_s, _c, _m, statusFilter) => statusFilter],
    (events, methodFilter, statusFilter) => {
      if (!methodFilter && !statusFilter) return events;
      return events.filter(e => {
        if (methodFilter && e.http?.method !== methodFilter) return false;
        if (statusFilter) {
          const code = e.http?.status;
          if (statusFilter === '2xx' && (code < 200 || code >= 300)) return false;
          if (statusFilter === '4xx' && (code < 400 || code >= 500)) return false;
          if (statusFilter === '5xx' && (code < 500 || code >= 600)) return false;
        }
        return true;
      });
    }
  );

// Flow selectors
export const selectNetworkFlows = (state, clusterId) =>
  state.network?.flows?.[clusterId] || [];

export const selectIsLoadingFlows = (state, clusterId) =>
  !!state.network?.loading?.[`${clusterId}/flows`];

export const selectFlowsError = (state, clusterId) =>
  state.network?.errors?.[`${clusterId}/flows`] || null;

// Workload report selectors
export const selectWorkloadReport = (state, clusterId) =>
  state.network?.workloadReport?.[clusterId] || null;

export const selectIsLoadingReport = (state, clusterId) =>
  !!state.network?.loading?.[`${clusterId}/report`];

export const selectReportError = (state, clusterId) =>
  state.network?.errors?.[`${clusterId}/report`] || null;

export default networkSlice.reducer;

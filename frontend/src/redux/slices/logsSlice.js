import { createSlice } from '@reduxjs/toolkit';

/**
 * Logs Slice - Manages real-time pod logs
 *
 * Stores log lines received via Socket.IO for active log streams
 */

const initialState = {
  // Active log streams by pod key (namespace/pod/container)
  streams: {},
  // Log lines buffer (latest N lines per stream)
  logs: {},
  // Streaming status
  streaming: {},
  // Errors
  errors: {},
  // Max lines to keep in memory per stream
  maxLines: 1000
};

const logsSlice = createSlice({
  name: 'logs',
  initialState,
  reducers: {
    // Add log line to stream
    addLogLine: (state, action) => {
      const { clusterId, namespace, pod, container, logLine, timestamp } = action.payload;
      const key = `${clusterId}/${namespace}/${pod}/${container || 'default'}`;

      // Initialize logs array if doesn't exist
      if (!state.logs[key]) {
        state.logs[key] = [];
      }

      // Add log line
      state.logs[key].push({
        line: logLine,
        timestamp: timestamp || new Date().toISOString()
      });

      // Keep only last N lines to prevent memory issues
      if (state.logs[key].length > state.maxLines) {
        state.logs[key] = state.logs[key].slice(-state.maxLines);
      }
    },

    // Start streaming logs
    startStream: (state, action) => {
      const { clusterId, namespace, pod, container } = action.payload;
      const key = `${clusterId}/${namespace}/${pod}/${container || 'default'}`;

      state.streaming[key] = true;
      state.streams[key] = {
        clusterId,
        namespace,
        pod,
        container: container || 'default',
        startedAt: new Date().toISOString()
      };

      // Initialize logs if doesn't exist
      if (!state.logs[key]) {
        state.logs[key] = [];
      }
    },

    // Stop streaming logs
    stopStream: (state, action) => {
      const { clusterId, namespace, pod, container } = action.payload;
      const key = `${clusterId}/${namespace}/${pod}/${container || 'default'}`;

      state.streaming[key] = false;
      if (state.streams[key]) {
        state.streams[key].stoppedAt = new Date().toISOString();
      }
    },

    // Clear logs for a specific stream
    clearStream: (state, action) => {
      const { clusterId, namespace, pod, container } = action.payload;
      const key = `${clusterId}/${namespace}/${pod}/${container || 'default'}`;

      delete state.logs[key];
      delete state.streams[key];
      delete state.streaming[key];
      delete state.errors[key];
    },

    // Clear all logs
    clearAllLogs: (state) => {
      state.logs = {};
      state.streams = {};
      state.streaming = {};
      state.errors = {};
    },

    // Set error for stream
    setStreamError: (state, action) => {
      const { clusterId, namespace, pod, container, error } = action.payload;
      const key = `${clusterId}/${namespace}/${pod}/${container || 'default'}`;

      state.errors[key] = {
        message: error,
        timestamp: new Date().toISOString()
      };
      state.streaming[key] = false;
    },

    // Set max lines to keep
    setMaxLines: (state, action) => {
      state.maxLines = action.payload;
    }
  }
});

export const {
  addLogLine,
  startStream,
  stopStream,
  clearStream,
  clearAllLogs,
  setStreamError,
  setMaxLines
} = logsSlice.actions;

// Selectors
export const selectLogs = (state, clusterId, namespace, pod, container = 'default') => {
  const key = `${clusterId}/${namespace}/${pod}/${container}`;
  return state.logs.logs[key] || [];
};

export const selectIsStreaming = (state, clusterId, namespace, pod, container = 'default') => {
  const key = `${clusterId}/${namespace}/${pod}/${container}`;
  return state.logs.streaming[key] || false;
};

export const selectStreamError = (state, clusterId, namespace, pod, container = 'default') => {
  const key = `${clusterId}/${namespace}/${pod}/${container}`;
  return state.logs.errors[key] || null;
};

export default logsSlice.reducer;

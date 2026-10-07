import { createSlice } from '@reduxjs/toolkit';

/**
 * Metrics Slice - Manages real-time metrics data
 *
 * Stores metrics received via Socket.IO from Prometheus
 */

const initialState = {
  // Metrics by cluster
  clusterMetrics: {},
  // Metrics by resource (namespace/pod/deployment/etc)
  resourceMetrics: {},
  // Time series data for charts
  timeSeries: {},
  // Last update timestamp
  lastUpdate: null,
  // Max data points to keep per metric
  maxDataPoints: 100
};

const metricsSlice = createSlice({
  name: 'metrics',
  initialState,
  reducers: {
    // Update cluster-wide metrics
    updateClusterMetrics: (state, action) => {
      const { clusterId, metrics, timestamp } = action.payload;

      state.clusterMetrics[clusterId] = {
        ...metrics,
        timestamp: timestamp || new Date().toISOString()
      };
      state.lastUpdate = new Date().toISOString();
    },

    // Update resource-specific metrics
    updateResourceMetrics: (state, action) => {
      const { clusterId, resourceType, namespace, name, metricName, metricData, timestamp } = action.payload;
      const key = `${clusterId}/${resourceType}/${namespace}/${name}`;

      if (!state.resourceMetrics[key]) {
        state.resourceMetrics[key] = {};
      }

      state.resourceMetrics[key][metricName] = {
        data: metricData,
        timestamp: timestamp || new Date().toISOString()
      };

      // Update time series data for charts
      if (!state.timeSeries[key]) {
        state.timeSeries[key] = {};
      }

      if (!state.timeSeries[key][metricName]) {
        state.timeSeries[key][metricName] = [];
      }

      // Add data point
      state.timeSeries[key][metricName].push({
        value: metricData,
        timestamp: timestamp || new Date().toISOString()
      });

      // Keep only last N data points
      if (state.timeSeries[key][metricName].length > state.maxDataPoints) {
        state.timeSeries[key][metricName] = state.timeSeries[key][metricName].slice(-state.maxDataPoints);
      }

      state.lastUpdate = new Date().toISOString();
    },

    // Bulk update metrics (from Kafka metrics event)
    bulkUpdateMetrics: (state, action) => {
      const { clusterId, resourceType, metricName, metricData, timestamp } = action.payload;

      console.log('🔄 REDUX bulkUpdateMetrics called with:', {
        clusterId,
        resourceType,
        metricName,
        metricDataLength: metricData?.length,
        timestamp
      });

      // metricData is an array of { namespace, name, value }
      if (Array.isArray(metricData)) {
        console.log(`Processing ${metricData.length} metric data points`);

        metricData.forEach((item, index) => {
          const key = `${clusterId}/${resourceType}/${item.namespace}/${item.name}`;

          console.log(`[${index}] Creating key:`, key, 'Value:', item.value);

          if (!state.resourceMetrics[key]) {
            state.resourceMetrics[key] = {};
          }

          state.resourceMetrics[key][metricName] = {
            data: item.value,
            timestamp: timestamp || new Date().toISOString()
          };

          // Also update time series data for charts
          if (!state.timeSeries[key]) {
            state.timeSeries[key] = {};
          }

          if (!state.timeSeries[key][metricName]) {
            state.timeSeries[key][metricName] = [];
          }

          // Add data point to time series
          state.timeSeries[key][metricName].push({
            value: item.value,
            timestamp: timestamp || new Date().toISOString()
          });

          // Keep only last N data points
          if (state.timeSeries[key][metricName].length > state.maxDataPoints) {
            state.timeSeries[key][metricName] = state.timeSeries[key][metricName].slice(-state.maxDataPoints);
          }
        });

        console.log('✅ Metrics stored. Total keys in resourceMetrics:', Object.keys(state.resourceMetrics).length);
        console.log('✅ Keys in timeSeries:', Object.keys(state.timeSeries).length);
      } else {
        console.error('❌ metricData is not an array:', metricData);
      }

      state.lastUpdate = new Date().toISOString();
    },

    // Clear metrics for a cluster
    clearClusterMetrics: (state, action) => {
      const { clusterId } = action.payload;

      delete state.clusterMetrics[clusterId];

      // Clear all resource metrics for this cluster
      Object.keys(state.resourceMetrics).forEach(key => {
        if (key.startsWith(`${clusterId}/`)) {
          delete state.resourceMetrics[key];
          delete state.timeSeries[key];
        }
      });
    },

    // Clear metrics for a specific resource
    clearResourceMetrics: (state, action) => {
      const { clusterId, resourceType, namespace, name } = action.payload;
      const key = `${clusterId}/${resourceType}/${namespace}/${name}`;

      delete state.resourceMetrics[key];
      delete state.timeSeries[key];
    },

    // Clear all metrics
    clearAllMetrics: (state) => {
      state.clusterMetrics = {};
      state.resourceMetrics = {};
      state.timeSeries = {};
      state.lastUpdate = null;
    },

    // Set max data points
    setMaxDataPoints: (state, action) => {
      state.maxDataPoints = action.payload;
    }
  }
});

export const {
  updateClusterMetrics,
  updateResourceMetrics,
  bulkUpdateMetrics,
  clearClusterMetrics,
  clearResourceMetrics,
  clearAllMetrics,
  setMaxDataPoints
} = metricsSlice.actions;

// Selectors
export const selectClusterMetrics = (state, clusterId) => {
  return state.metrics.clusterMetrics[clusterId] || null;
};

export const selectResourceMetrics = (state, clusterId, resourceType, namespace, name) => {
  const key = `${clusterId}/${resourceType}/${namespace}/${name}`;
  return state.metrics.resourceMetrics[key] || {};
};

export const selectMetricTimeSeries = (state, clusterId, resourceType, namespace, name, metricName) => {
  const key = `${clusterId}/${resourceType}/${namespace}/${name}`;
  return state.metrics.timeSeries[key]?.[metricName] || [];
};

export const selectAllResourceMetricsForCluster = (state, clusterId) => {
  const metrics = {};
  Object.entries(state.metrics.resourceMetrics).forEach(([key, value]) => {
    if (key.startsWith(`${clusterId}/`)) {
      metrics[key] = value;
    }
  });
  return metrics;
};

export default metricsSlice.reducer;

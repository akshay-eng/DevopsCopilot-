import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = 'http://localhost:5001/api/clusters';

const initialState = {
  clusters: [],
  currentCluster: null,
  helmCommand: null,
  helmValues: null,
  instructions: null,
  isLoading: false,
  error: null,
  connectionStatus: null
};

// Async thunks
export const registerCluster = createAsyncThunk(
  'cluster/register',
  async (clusterData, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/register`, clusterData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Cluster registration failed'
      );
    }
  }
);

export const getClusters = createAsyncThunk(
  'cluster/getClusters',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(API_URL, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to fetch clusters'
      );
    }
  }
);

export const getCluster = createAsyncThunk(
  'cluster/getCluster',
  async (clusterId, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/${clusterId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to fetch cluster'
      );
    }
  }
);

export const checkConnectionStatus = createAsyncThunk(
  'cluster/checkConnectionStatus',
  async (clusterId, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/${clusterId}/connection-status`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to check connection status'
      );
    }
  }
);

export const deleteCluster = createAsyncThunk(
  'cluster/deleteCluster',
  async (clusterId, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(`${API_URL}/${clusterId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return { ...response.data, clusterId };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to delete cluster'
      );
    }
  }
);

// Slice
const clusterSlice = createSlice({
  name: 'cluster',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    clearClusterData: (state) => {
      state.currentCluster = null;
      state.helmCommand = null;
      state.helmValues = null;
      state.instructions = null;
      state.connectionStatus = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Register Cluster
      .addCase(registerCluster.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerCluster.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentCluster = action.payload.cluster;
        state.helmCommand = action.payload.helmCommand;
        state.helmValues = action.payload.helmValues;
        state.instructions = action.payload.instructions;
        state.error = null;
      })
      .addCase(registerCluster.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Get Clusters
      .addCase(getClusters.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getClusters.fulfilled, (state, action) => {
        state.isLoading = false;
        state.clusters = action.payload.clusters;
        state.error = null;
      })
      .addCase(getClusters.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Get Cluster
      .addCase(getCluster.fulfilled, (state, action) => {
        state.currentCluster = action.payload.cluster;
      })
      // Check Connection Status
      .addCase(checkConnectionStatus.fulfilled, (state, action) => {
        state.connectionStatus = action.payload;
      })
      // Delete Cluster
      .addCase(deleteCluster.fulfilled, (state, action) => {
        state.clusters = state.clusters.filter(
          (cluster) => cluster._id !== action.payload.clusterId
        );
      });
  }
});

export const { clearError, clearClusterData } = clusterSlice.actions;
export default clusterSlice.reducer;

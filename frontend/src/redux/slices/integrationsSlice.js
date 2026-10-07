import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { backendApi } from '../../services/api';

// Async thunks
export const fetchIntegrations = createAsyncThunk(
  'integrations/fetchIntegrations',
  async (_, { rejectWithValue }) => {
    try {
      return await backendApi.get('/api/integrations');
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to fetch integrations');
    }
  }
);

export const saveIntegration = createAsyncThunk(
  'integrations/saveIntegration',
  async ({ type, config }, { rejectWithValue }) => {
    try {
      return await backendApi.post(`/api/integrations/${type}`, { config });
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to save integration');
    }
  }
);

export const deleteIntegration = createAsyncThunk(
  'integrations/deleteIntegration',
  async (type, { rejectWithValue }) => {
    try {
      await backendApi.delete(`/api/integrations/${type}`);
      return type;
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to delete integration');
    }
  }
);

export const testIntegration = createAsyncThunk(
  'integrations/testIntegration',
  async ({ type, config }, { rejectWithValue }) => {
    try {
      return await backendApi.post(`/api/integrations/${type}/test`, { config });
    } catch (error) {
      return rejectWithValue(error.message || 'Failed to test integration');
    }
  }
);

const integrationsSlice = createSlice({
  name: 'integrations',
  initialState: {
    integrations: {},
    loading: false,
    error: null
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIntegrations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchIntegrations.fulfilled, (state, action) => {
        state.loading = false;
        state.integrations = action.payload || {};
      })
      .addCase(fetchIntegrations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(saveIntegration.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(saveIntegration.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload?.type) {
          state.integrations[action.payload.type] = { enabled: action.payload.enabled };
        }
      })
      .addCase(saveIntegration.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(deleteIntegration.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteIntegration.fulfilled, (state, action) => {
        state.loading = false;
        delete state.integrations[action.payload];
      })
      .addCase(deleteIntegration.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(testIntegration.pending, (state) => {
        state.loading = true;
      })
      .addCase(testIntegration.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(testIntegration.rejected, (state) => {
        state.loading = false;
      });
  }
});

export const { clearError } = integrationsSlice.actions;
export default integrationsSlice.reducer;

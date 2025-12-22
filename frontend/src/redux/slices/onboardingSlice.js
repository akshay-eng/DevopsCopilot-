import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = 'http://localhost:5001/api/onboarding';

const initialState = {
  currentStep: 0,
  data: {
    clusterName: '',
    clusterType: '',
    hasPrometheus: false,
    hasGrafana: false,
    helmChartInstalled: false,
    connectionStatus: 'pending',
    foundUsThrough: '',
    otherSource: '',
    feedback: ''
  },
  helmChart: null, // Will store helm chart info
  connectivity: {
    connected: false,
    connectionStatus: 'pending',
    message: ''
  },
  isCompleted: false,
  isLoading: false,
  error: null
};

// Async thunks
export const completeOnboarding = createAsyncThunk(
  'onboarding/complete',
  async (onboardingData, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/complete`, onboardingData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to complete onboarding'
      );
    }
  }
);

export const skipOnboarding = createAsyncThunk(
  'onboarding/skip',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/skip`, {}, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to skip onboarding'
      );
    }
  }
);

export const getOnboardingStatus = createAsyncThunk(
  'onboarding/getStatus',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/status`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to get onboarding status'
      );
    }
  }
);

export const saveOnboardingProgress = createAsyncThunk(
  'onboarding/saveProgress',
  async (progressData, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/save-progress`, progressData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to save onboarding progress'
      );
    }
  }
);

export const getHelmChart = createAsyncThunk(
  'onboarding/getHelmChart',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/helm-chart`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to get Helm chart information'
      );
    }
  }
);

export const checkConnectivity = createAsyncThunk(
  'onboarding/checkConnectivity',
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/check-connectivity`, {}, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.error || 'Failed to check connectivity'
      );
    }
  }
);

// Slice
const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {
    setCurrentStep: (state, action) => {
      state.currentStep = action.payload;
    },
    nextStep: (state) => {
      state.currentStep += 1;
    },
    previousStep: (state) => {
      state.currentStep = Math.max(0, state.currentStep - 1);
    },
    updateOnboardingData: (state, action) => {
      state.data = { ...state.data, ...action.payload };
    },
    resetOnboarding: (state) => {
      state.currentStep = 0;
      state.data = initialState.data;
      state.isCompleted = false;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Complete Onboarding
      .addCase(completeOnboarding.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(completeOnboarding.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isCompleted = true;
        state.error = null;
      })
      .addCase(completeOnboarding.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Skip Onboarding
      .addCase(skipOnboarding.fulfilled, (state) => {
        state.isCompleted = true;
      })
      // Get Onboarding Status
      .addCase(getOnboardingStatus.fulfilled, (state, action) => {
        state.isCompleted = action.payload.onboardingCompleted;
        if (action.payload.onboardingData) {
          state.data = { ...state.data, ...action.payload.onboardingData };
        }
      })
      // Save Onboarding Progress
      .addCase(saveOnboardingProgress.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(saveOnboardingProgress.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload.onboardingData) {
          state.data = { ...state.data, ...action.payload.onboardingData };
        }
        state.error = null;
      })
      .addCase(saveOnboardingProgress.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Get Helm Chart
      .addCase(getHelmChart.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getHelmChart.fulfilled, (state, action) => {
        state.isLoading = false;
        state.helmChart = action.payload;
        state.error = null;
      })
      .addCase(getHelmChart.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })
      // Check Connectivity
      .addCase(checkConnectivity.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(checkConnectivity.fulfilled, (state, action) => {
        state.isLoading = false;
        state.connectivity = {
          connected: action.payload.connected,
          connectionStatus: action.payload.connectionStatus || 'pending',
          message: action.payload.message
        };
        state.error = null;
      })
      .addCase(checkConnectivity.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      });
  }
});

export const {
  setCurrentStep,
  nextStep,
  previousStep,
  updateOnboardingData,
  resetOnboarding,
  clearError
} = onboardingSlice.actions;

export default onboardingSlice.reducer;

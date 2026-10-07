import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { getResources as fetchResourcesAPI } from '../../services/api';

/**
 * Resources Slice - Manages Kubernetes resources
 *
 * Stores resource data received via Socket.IO from cluster agents
 */

// Async thunk to fetch resources from API
export const fetchResources = createAsyncThunk(
  'resources/fetchResources',
  async ({ clusterId, resourceType, namespace = 'all' }, { rejectWithValue }) => {
    try {
      const response = await fetchResourcesAPI(clusterId, resourceType, namespace);
      return {
        clusterId,
        resourceType,
        namespace,
        items: response.items || []
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  },
  {
    // Prevent duplicate requests for the same resource type
    condition: ({ clusterId, resourceType }, { getState }) => {
      const state = getState();
      const key = `${clusterId}/${resourceType}`;
      // Don't fetch if already loading
      return !state.resources.loading[key];
    }
  }
);

const initialState = {
  // Resources by cluster and type
  // Structure: { clusterId: { resourceType: { namespace: { name: resourceData } } } }
  resources: {},
  // Resource counts
  counts: {},
  // Last update timestamp
  lastUpdate: {},
  // Loading states
  loading: {},
  // Errors
  errors: {}
};

const resourcesSlice = createSlice({
  name: 'resources',
  initialState,
  reducers: {
    // Update or add a resource
    updateResource: (state, action) => {
      const { clusterId, resourceType, action: updateAction, namespace, name, data } = action.payload;

      // Initialize nested structure if doesn't exist
      if (!state.resources[clusterId]) {
        state.resources[clusterId] = {};
      }
      if (!state.resources[clusterId][resourceType]) {
        state.resources[clusterId][resourceType] = {};
      }
      if (!state.resources[clusterId][resourceType][namespace]) {
        state.resources[clusterId][resourceType][namespace] = {};
      }

      // Update resource based on action
      if (updateAction === 'DELETED') {
        delete state.resources[clusterId][resourceType][namespace][name];
      } else {
        state.resources[clusterId][resourceType][namespace][name] = {
          ...data,
          namespace,
          name,
          resourceType,
          clusterId,
          lastUpdated: new Date().toISOString()
        };
      }

      // Update last update timestamp
      state.lastUpdate[clusterId] = new Date().toISOString();

      // Update counts
      updateResourceCounts(state, clusterId);
    },

    // Bulk update resources (initial load)
    bulkUpdateResources: (state, action) => {
      const { clusterId, resourceType, namespace, resources } = action.payload;

      if (!state.resources[clusterId]) {
        state.resources[clusterId] = {};
      }
      if (!state.resources[clusterId][resourceType]) {
        state.resources[clusterId][resourceType] = {};
      }
      if (!state.resources[clusterId][resourceType][namespace]) {
        state.resources[clusterId][resourceType][namespace] = {};
      }

      // Add all resources
      resources.forEach(resource => {
        state.resources[clusterId][resourceType][namespace][resource.name] = {
          ...resource,
          namespace,
          resourceType,
          clusterId,
          lastUpdated: new Date().toISOString()
        };
      });

      state.lastUpdate[clusterId] = new Date().toISOString();
      updateResourceCounts(state, clusterId);
    },

    // Set loading state
    setLoading: (state, action) => {
      const { clusterId, resourceType, loading } = action.payload;
      const key = `${clusterId}/${resourceType}`;
      state.loading[key] = loading;
    },

    // Set error
    setError: (state, action) => {
      const { clusterId, resourceType, error } = action.payload;
      const key = `${clusterId}/${resourceType}`;
      state.errors[key] = {
        message: error,
        timestamp: new Date().toISOString()
      };
    },

    // Clear error
    clearError: (state, action) => {
      const { clusterId, resourceType } = action.payload;
      const key = `${clusterId}/${resourceType}`;
      delete state.errors[key];
    },

    // Clear resources for a cluster
    clearClusterResources: (state, action) => {
      const { clusterId } = action.payload;

      delete state.resources[clusterId];
      delete state.counts[clusterId];
      delete state.lastUpdate[clusterId];

      // Clear loading and errors for this cluster
      Object.keys(state.loading).forEach(key => {
        if (key.startsWith(`${clusterId}/`)) {
          delete state.loading[key];
        }
      });
      Object.keys(state.errors).forEach(key => {
        if (key.startsWith(`${clusterId}/`)) {
          delete state.errors[key];
        }
      });
    },

    // Clear all resources
    clearAllResources: (state) => {
      state.resources = {};
      state.counts = {};
      state.lastUpdate = {};
      state.loading = {};
      state.errors = {};
    }
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchResources pending
      .addCase(fetchResources.pending, (state, action) => {
        const { clusterId, resourceType } = action.meta.arg;
        const key = `${clusterId}/${resourceType}`;
        state.loading[key] = true;
        delete state.errors[key];
      })
      // Handle fetchResources fulfilled
      .addCase(fetchResources.fulfilled, (state, action) => {
        const { clusterId, resourceType, namespace, items } = action.payload;
        const key = `${clusterId}/${resourceType}`;

        // Initialize nested structure
        if (!state.resources[clusterId]) {
          state.resources[clusterId] = {};
        }
        if (!state.resources[clusterId][resourceType]) {
          state.resources[clusterId][resourceType] = {};
        }

        // If fetching all namespaces, organize by namespace
        if (namespace === 'all') {
          // Clear existing data for this resource type
          state.resources[clusterId][resourceType] = {};

          // Group items by namespace
          items.forEach(item => {
            const ns = item.namespace || 'default';
            if (!state.resources[clusterId][resourceType][ns]) {
              state.resources[clusterId][resourceType][ns] = {};
            }
            state.resources[clusterId][resourceType][ns][item.name] = {
              ...item,
              clusterId,
              resourceType,
              lastUpdated: new Date().toISOString()
            };
          });
        } else {
          // Specific namespace
          if (!state.resources[clusterId][resourceType][namespace]) {
            state.resources[clusterId][resourceType][namespace] = {};
          }

          // Clear namespace data
          state.resources[clusterId][resourceType][namespace] = {};

          // Add items
          items.forEach(item => {
            state.resources[clusterId][resourceType][namespace][item.name] = {
              ...item,
              namespace,
              clusterId,
              resourceType,
              lastUpdated: new Date().toISOString()
            };
          });
        }

        state.loading[key] = false;
        state.lastUpdate[clusterId] = new Date().toISOString();
        updateResourceCounts(state, clusterId);
      })
      // Handle fetchResources rejected
      .addCase(fetchResources.rejected, (state, action) => {
        const { clusterId, resourceType } = action.meta.arg;
        const key = `${clusterId}/${resourceType}`;
        state.loading[key] = false;
        state.errors[key] = {
          message: action.payload || 'Failed to fetch resources',
          timestamp: new Date().toISOString()
        };
      });
  }
});

// Helper function to update resource counts
function updateResourceCounts(state, clusterId) {
  if (!state.resources[clusterId]) {
    state.counts[clusterId] = {};
    return;
  }

  const counts = {};

  Object.entries(state.resources[clusterId]).forEach(([resourceType, namespaces]) => {
    counts[resourceType] = 0;
    Object.values(namespaces).forEach(resources => {
      counts[resourceType] += Object.keys(resources).length;
    });
  });

  state.counts[clusterId] = counts;
}

export const {
  updateResource,
  bulkUpdateResources,
  setLoading,
  setError,
  clearError,
  clearClusterResources,
  clearAllResources
} = resourcesSlice.actions;

// Selectors
export const selectAllResources = (state, clusterId) => {
  return state.resources.resources[clusterId] || {};
};

export const selectResourcesByType = (state, clusterId, resourceType) => {
  return state.resources.resources[clusterId]?.[resourceType] || {};
};

export const selectResourcesByNamespace = (state, clusterId, resourceType, namespace) => {
  return state.resources.resources[clusterId]?.[resourceType]?.[namespace] || {};
};

export const selectResource = (state, clusterId, resourceType, namespace, name) => {
  return state.resources.resources[clusterId]?.[resourceType]?.[namespace]?.[name] || null;
};

export const selectResourceCounts = (state, clusterId) => {
  return state.resources.counts[clusterId] || {};
};

export const selectResourceTypeCount = (state, clusterId, resourceType) => {
  return state.resources.counts[clusterId]?.[resourceType] || 0;
};

export const selectIsLoading = (state, clusterId, resourceType) => {
  const key = `${clusterId}/${resourceType}`;
  return state.resources.loading[key] || false;
};

export const selectError = (state, clusterId, resourceType) => {
  const key = `${clusterId}/${resourceType}`;
  return state.resources.errors[key] || null;
};

// Get all pods across all namespaces
export const selectAllPods = (state, clusterId) => {
  const pods = [];
  const podsData = state.resources.resources[clusterId]?.pods || {};

  Object.values(podsData).forEach(namespace => {
    Object.values(namespace).forEach(pod => {
      pods.push(pod);
    });
  });

  return pods;
};

// Get pods by status
export const selectPodsByStatus = (state, clusterId, status) => {
  const allPods = selectAllPods(state, clusterId);
  return allPods.filter(pod => pod.status?.phase === status);
};

// Memoized selector for Apps page resources
export const selectAllResourcesForApps = createSelector(
  [
    (state, clusterId) => state.resources.resources[clusterId],
    (state, clusterId, selectedNamespace) => selectedNamespace,
    (state, clusterId, selectedNamespace, selectedResourceType) => selectedResourceType
  ],
  (clusterData = {}, selectedNamespace = 'all', selectedResourceType = 'all') => {
    const allResources = [];

    // Determine which resource types to include
    const resourceTypes = selectedResourceType === 'all'
      ? ['pods', 'deployments', 'services', 'statefulsets']
      : [selectedResourceType.toLowerCase() + 's'];

    resourceTypes.forEach(resourceType => {
      const typeData = clusterData[resourceType] || {};

      Object.entries(typeData).forEach(([namespace, resources]) => {
        // Filter by namespace if not 'all'
        if (selectedNamespace === 'all' || namespace === selectedNamespace) {
          Object.values(resources).forEach(resource => {
            allResources.push(resource);
          });
        }
      });
    });

    return allResources;
  }
);

// Check if resources are already cached
export const selectHasCachedResources = (state, clusterId, resourceType) => {
  const clusterData = state.resources.resources[clusterId];
  if (!clusterData || !clusterData[resourceType]) return false;

  // Check if there's any data
  const typeData = clusterData[resourceType];
  return Object.keys(typeData).length > 0;
};

// Check cache age (in seconds)
export const selectCacheAge = (state, clusterId) => {
  const lastUpdate = state.resources.lastUpdate[clusterId];
  if (!lastUpdate) return Infinity;

  const now = new Date();
  const lastUpdateTime = new Date(lastUpdate);
  return (now - lastUpdateTime) / 1000; // seconds
};

export default resourcesSlice.reducer;

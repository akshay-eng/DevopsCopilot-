/**
 * API Service - Centralized HTTP client for all API calls
 */

// Auth Service URL (for login, register, OAuth, etc.)
const AUTH_SERVICE_URL = process.env.REACT_APP_AUTH_SERVICE_URL || 'http://localhost:5001';

// Backend Service URL (for clusters, resources, etc.)
const BACKEND_SERVICE_URL = process.env.REACT_APP_BACKEND_SERVICE_URL || 'http://localhost:5003';

/**
 * Make an API request with automatic token handling
 * @param {string} baseUrl - The base URL to use (AUTH_SERVICE_URL or BACKEND_SERVICE_URL)
 * @param {string} endpoint - The API endpoint
 * @param {object} options - Fetch options
 */
const apiRequest = async (baseUrl, endpoint, options = {}) => {
  const url = `${baseUrl}${endpoint}`;

  // Get token from localStorage
  const token = localStorage.getItem('access_token');

  // Default headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add Authorization header if token exists
  if (token && !options.skipAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);

    // Handle token expiration
    if (response.status === 401 && token) {
      // Try to refresh token
      const refreshed = await refreshAccessToken();

      if (refreshed) {
        // Retry the original request with new token
        const newToken = localStorage.getItem('access_token');
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(url, { ...config, headers });

        if (!retryResponse.ok) {
          throw new Error(`HTTP error! status: ${retryResponse.status}`);
        }

        return await retryResponse.json();
      } else {
        // Refresh failed, logout user
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        throw new Error('Session expired');
      }
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Request failed:', error);
    throw error;
  }
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');

  if (!refreshToken) {
    return false;
  }

  try {
    const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${refreshToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    localStorage.setItem('access_token', data.access_token);
    return true;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
};

// Export API methods for Backend Service (clusters, resources)
export const backendApi = {
  get: (endpoint, options = {}) =>
    apiRequest(BACKEND_SERVICE_URL, endpoint, { ...options, method: 'GET' }),

  post: (endpoint, data, options = {}) =>
    apiRequest(BACKEND_SERVICE_URL, endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    }),

  put: (endpoint, data, options = {}) =>
    apiRequest(BACKEND_SERVICE_URL, endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  delete: (endpoint, options = {}) =>
    apiRequest(BACKEND_SERVICE_URL, endpoint, { ...options, method: 'DELETE' }),
};

// Export API methods for Auth Service (login, register, etc.)
export const authApi = {
  get: (endpoint, options = {}) =>
    apiRequest(AUTH_SERVICE_URL, endpoint, { ...options, method: 'GET' }),

  post: (endpoint, data, options = {}) =>
    apiRequest(AUTH_SERVICE_URL, endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    }),

  put: (endpoint, data, options = {}) =>
    apiRequest(AUTH_SERVICE_URL, endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  delete: (endpoint, options = {}) =>
    apiRequest(AUTH_SERVICE_URL, endpoint, { ...options, method: 'DELETE' }),
};

// Legacy export for backward compatibility (uses backend service by default)
export const api = backendApi;

// Export URLs
export { AUTH_SERVICE_URL, BACKEND_SERVICE_URL };

// ========================================
// K8s Cluster & Resource Management APIs
// ========================================

/**
 * Get all clusters for the authenticated user
 */
export const getClusters = async () => {
  return backendApi.get('/api/clusters');
};

/**
 * Get namespaces for a specific cluster
 */
export const getNamespaces = async (clusterId) => {
  return backendApi.get(`/api/clusters/${clusterId}/namespaces`);
};

/**
 * Get resources by type from a cluster
 * @param {string} clusterId - Cluster ID
 * @param {string} resourceType - Type of resource (pods, deployments, services, statefulsets)
 * @param {string} namespace - Namespace (default: 'default')
 */
export const getResources = async (clusterId, resourceType, namespace = 'default') => {
  const params = new URLSearchParams({ namespace });
  return api.get(`/api/clusters/${clusterId}/resources/${resourceType}?${params}`);
};

/**
 * Get detailed information about a specific resource
 */
export const getResourceDetails = async (clusterId, resourceType, namespace, name) => {
  return api.get(`/api/clusters/${clusterId}/resources/${resourceType}/${namespace}/${name}`);
};

/**
 * Get pod metrics from Prometheus
 * @param {string} clusterId - Cluster ID
 * @param {string} namespace - Namespace
 * @param {string} name - Pod name
 * @param {string} range - Time range (e.g., '1h', '24h')
 */
export const getPodMetrics = async (clusterId, namespace, name, range = '1h') => {
  const params = new URLSearchParams({ range });
  return api.get(`/api/clusters/${clusterId}/pods/${namespace}/${name}/metrics?${params}`);
};

/**
 * Restart a pod
 */
export const restartPod = async (clusterId, namespace, name) => {
  return api.post(`/api/clusters/${clusterId}/pods/${namespace}/${name}/restart`);
};

/**
 * Get resource YAML
 */
export const getResourceYAML = async (clusterId, resourceType, namespace, name) => {
  return api.get(`/api/clusters/${clusterId}/resources/${resourceType}/${namespace}/${name}/yaml`);
};

/**
 * Delete a resource
 */
export const deleteResource = async (clusterId, resourceType, namespace, name) => {
  return api.delete(`/api/clusters/${clusterId}/resources/${resourceType}/${namespace}/${name}`);
};

/**
 * Get all nodes in a cluster
 * @param {string} clusterId - Cluster ID
 */
export const getNodes = async (clusterId) => {
  return api.get(`/api/clusters/${clusterId}/nodes`);
};

/**
 * Get metrics for a specific node
 * @param {string} clusterId - Cluster ID
 * @param {string} nodeName - Node name
 * @param {string} range - Time range (e.g., '1h', '24h')
 */
export const getNodeMetrics = async (clusterId, nodeName, range = '1h') => {
  const params = new URLSearchParams({ range });
  return api.get(`/api/clusters/${clusterId}/nodes/${nodeName}/metrics?${params}`);
};

/**
 * Get pod logs (REST API)
 * @param {string} clusterId - Cluster ID
 * @param {string} namespace - Namespace
 * @param {string} name - Pod name
 * @param {number} tailLines - Number of lines to fetch (default: 200)
 */
export const getPodLogs = async (clusterId, namespace, name, tailLines = 200) => {
  const params = new URLSearchParams({ tailLines: tailLines.toString() });
  return api.get(`/api/clusters/${clusterId}/pods/${namespace}/${name}/logs?${params}`);
};

/**
 * Stream pod logs using Server-Sent Events (SSE)
 * @param {string} clusterId - Cluster ID
 * @param {string} namespace - Namespace
 * @param {string} name - Pod name
 * @param {object} options - Options { follow: true, tailLines: 100 }
 * @returns {EventSource} EventSource instance for log streaming
 */
export const streamPodLogs = (clusterId, namespace, name, options = {}) => {
  const { follow = true, tailLines = 100 } = options;
  const params = new URLSearchParams({ follow, tailLines });

  const url = `${BACKEND_SERVICE_URL}/api/clusters/${clusterId}/pods/${namespace}/${name}/logs/stream?${params}`;

  // EventSource doesn't support custom headers, so we need to pass token as query param
  // or use a different approach for authenticated SSE
  const eventSource = new EventSource(url);

  return eventSource;
};

/**
 * Connect to WebSocket for real-time updates
 * @param {function} onMessage - Callback for incoming messages
 * @param {function} onError - Callback for errors
 * @returns {WebSocket} WebSocket instance
 */
export const connectWebSocket = (onMessage, onError) => {
  const wsUrl = BACKEND_SERVICE_URL.replace('http', 'ws');
  const token = localStorage.getItem('access_token');

  const ws = new WebSocket(`${wsUrl}/ws?token=${token}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    if (onError) onError(error);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
  };

  return ws;
};

// ========================================
// Helper Functions
// ========================================

/**
 * Calculate age from timestamp
 */
export const calculateAge = (timestamp) => {
  if (!timestamp) return 'Unknown';

  const now = new Date();
  const created = new Date(timestamp);
  const diffMs = now - created;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

/**
 * Determine health status based on pod/deployment status
 */
export const getHealthStatus = (resource, resourceType) => {
  if (resourceType === 'pods') {
    const phase = resource.status;
    const restarts = resource.restarts || 0;

    if (phase === 'Running' && restarts === 0) {
      return { status: 'Healthy', color: 'green' };
    } else if (phase === 'Running' && restarts > 0) {
      return { status: 'Warning', color: 'yellow' };
    } else if (phase === 'Pending' || phase === 'ContainerCreating') {
      return { status: 'Warning', color: 'yellow' };
    } else if (phase === 'Failed' || phase === 'CrashLoopBackOff' || phase === 'Error') {
      return { status: 'Critical', color: 'red' };
    }
    return { status: 'Unknown', color: 'gray' };
  } else if (resourceType === 'deployments') {
    const replicas = resource.replicas || '0/0';
    const [ready, desired] = replicas.split('/').map(Number);

    if (ready === desired && desired > 0) {
      return { status: 'Healthy', color: 'green' };
    } else if (ready > 0 && ready < desired) {
      return { status: 'Warning', color: 'yellow' };
    } else if (ready === 0) {
      return { status: 'Critical', color: 'red' };
    }
    return { status: 'Unknown', color: 'gray' };
  }

  return { status: 'Unknown', color: 'gray' };
};

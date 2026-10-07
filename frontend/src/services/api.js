/**
 * API Service - Centralized HTTP client for all API calls
 */

// Auth Service URL (for login, register, OAuth, etc.)
const AUTH_SERVICE_URL = process.env.REACT_APP_AUTH_SERVICE_URL || 'http://localhost:5001';

// Backend Service URL (for clusters, resources, etc.)
const BACKEND_SERVICE_URL = process.env.REACT_APP_BACKEND_SERVICE_URL || 'http://localhost:5001';

/**
 * Make an API request with automatic token handling
 * @param {string} baseUrl - The base URL to use (AUTH_SERVICE_URL or BACKEND_SERVICE_URL)
 * @param {string} endpoint - The API endpoint
 * @param {object} options - Fetch options
 */
const apiRequest = async (baseUrl, endpoint, options = {}) => {
  const url = `${baseUrl}${endpoint}`;

  // Get token from localStorage
  const token = localStorage.getItem('token');

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
        const newToken = localStorage.getItem('token');
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(url, { ...config, headers });

        if (!retryResponse.ok) {
          throw new Error(`HTTP error! status: ${retryResponse.status}`);
        }

        return await retryResponse.json();
      } else {
        // Refresh failed, logout user
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
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
  const refreshToken = localStorage.getItem('refreshToken');

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
    localStorage.setItem('token', data.token);
    return true;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
};

// Export API methods for Backend Service (clusters, resources)
export const backendApi = {
  get: (endpoint, options = {}) => {
    // Build query string from params if provided
    let url = endpoint;
    if (options.params) {
      const params = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value);
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}${queryString}`;
      }
    }
    return apiRequest(BACKEND_SERVICE_URL, url, { ...options, method: 'GET' });
  },

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

  patch: (endpoint, data, options = {}) =>
    apiRequest(BACKEND_SERVICE_URL, endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data)
    }),
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

// ========================================
// Vulnerability Scanning (Trivy Operator)
// ========================================

/** Whether the Trivy Operator CRDs are installed and readable. */
export const getVulnStatus = async () => backendApi.get('/api/vulnerabilities/status');

/** Cluster-wide vulnerability report (severity totals, by-namespace, top images). */
export const getVulnSummary = async () => backendApi.get('/api/vulnerabilities/summary');

/** Vulnerabilities for a single resource (the Vulnerabilities tab). */
export const getResourceVulnerabilities = async (namespace, kind, name) =>
  backendApi.get('/api/vulnerabilities/resource', { params: { namespace, kind, name } });

/** Kick off agentic remediation (change request + optional patch). */
export const remediateVulnerability = async (payload) =>
  backendApi.post('/api/vulnerabilities/remediate', payload);

/** AI explanation of a CVE: cause, impact, fix, verification. */
export const explainVulnerability = async (vulnerability, resource, image) =>
  backendApi.post('/api/vulnerabilities/explain', { vulnerability, resource, image });

/** Prioritised AI remediation guidance for a workload. */
export const getVulnRecommendations = async (payload) =>
  backendApi.post('/api/vulnerabilities/recommendations', payload);

// ========================================
// Custom AI/NLP dashboards (Trends)
// ========================================

/**
 * Turn a natural-language prompt into a widget spec.
 * `available` is a map of dataSource -> row count so the AI refuses to build
 * a widget that would render empty.
 */
export const generateNlpWidget = async (prompt, available) =>
  backendApi.post('/api/dashboards/nlp', { prompt, available });

/** The user's saved custom widgets. */
export const getCustomWidgets = async () => backendApi.get('/api/dashboards');

/** Persist a generated widget to the user's dashboard. */
export const saveCustomWidget = async (widget) => backendApi.post('/api/dashboards/widgets', { widget });

/** Remove a saved widget. */
export const deleteCustomWidget = async (id) => backendApi.delete(`/api/dashboards/widgets/${id}`);

// ========================================
// Documents (Finder-style SOPs & Reports)
// ========================================

/** Folder/file tree of the allow-listed document roots. */
export const getDocumentTree = async () => backendApi.get('/api/documents/tree');

/** Text contents of a document. */
export const getDocumentFile = async (p) =>
  backendApi.get('/api/documents/file', { params: { path: p } });

/**
 * Object URL for a binary document (PDF/image) fetched with auth, so it can be
 * used directly as an <iframe>/<img> src. Caller should URL.revokeObjectURL it.
 */
export const getDocumentBlobUrl = async (p) => {
  const token = localStorage.getItem('token');
  const res = await fetch(
    `${BACKEND_SERVICE_URL}/api/documents/file?raw=1&path=${encodeURIComponent(p)}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) throw new Error('Failed to load file');
  return URL.createObjectURL(await res.blob());
};

/**
 * Get all nodes in a cluster
 * @param {string} clusterId - Cluster ID
 */
export const getNodes = async (clusterId) => {
  return api.get(`/api/clusters/${clusterId}/nodes`);
};

/**
 * Historical cluster metrics from Prometheus (CPU/memory utilisation, pods,
 * phases, restarts). Response carries `retentionHours`/`truncated` so callers
 * can state what the window cannot cover rather than drawing an empty chart.
 * @param {string} clusterId
 * @param {number} hours - requested look-back; clamped server-side to retention
 */
export const getClusterHistory = async (clusterId, hours = 24) => {
  return api.get(`/api/clusters/${clusterId}/history`, { params: { hours } });
};

/**
 * Kubernetes cost from OpenCost. The response carries `pricingSource` and
 * `retentionHours` so the UI can state where the numbers came from and how far
 * back they actually reach.
 * @param {string} window one of 1h | 24h | 2d | 7d | 30d
 */
export const getCostSummary = async (window = '24h') =>
  backendApi.get('/api/cost/summary', { params: { window } });

export const getCostAllocation = async (window = '24h', aggregate = 'namespace') =>
  backendApi.get('/api/cost/allocation', { params: { window, aggregate } });

/** Per-cluster cost, plus registered clusters that report none. */
export const getClusterCosts = async (window = '24h') =>
  backendApi.get('/api/cost/clusters', { params: { window } });

/* ── Cluster compliance ─────────────────────────────────────────────── */

/** Rule catalog that drives the policy editor. */
export const getComplianceCatalog = async () => backendApi.get('/api/compliance/catalog');

/** The baseline in force (cluster-specific, account default, or built-in). */
export const getCompliancePolicy = async (clusterId) =>
  backendApi.get('/api/compliance/policy', { params: clusterId ? { clusterId } : {} });

export const saveCompliancePolicy = async (payload) =>
  backendApi.put('/api/compliance/policy', payload);

/** Run the checks now. Slow — it reads live cluster state. */
export const evaluateCompliance = async (clusterId) =>
  backendApi.post(`/api/compliance/evaluate/${clusterId}`, {});

/** Last stored evaluation — cheap, for list views. */
export const getLastCompliance = async (clusterId) =>
  backendApi.get(`/api/compliance/${clusterId}`);

export const remediateCompliance = async (clusterId, ruleIds) =>
  backendApi.post(`/api/compliance/remediate/${clusterId}`, ruleIds ? { ruleIds } : {});

/** How this cluster is reachable, and whether that is confirmed. */
export const getClusterAccess = async (clusterId) =>
  backendApi.get(`/api/compliance/access/${clusterId}`);

export const bindClusterToLocal = async (clusterId) =>
  backendApi.post(`/api/compliance/access/${clusterId}/bind-local`, {});

/** What installing the Helm chart reserves — used during onboarding. */
export const getChartFootprint = async (nodeCount = 3, components) =>
  backendApi.get('/api/compliance/chart-footprint', {
    params: { nodeCount, ...(components ? { components: components.join(',') } : {}) },
  });

/** Live footprint of the components we installed on a cluster. */
export const getPlatformFootprint = async (clusterId) =>
  backendApi.get('/api/compliance/footprint', { params: clusterId ? { clusterId } : {} });

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
  const token = localStorage.getItem('token');

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
// Network Traffic Monitoring APIs
// ========================================

/**
 * Get real-time network traffic events
 */
export const getNetworkTraffic = async (clusterId, options = {}) => {
  const { page = 1, limit = 50, method, status, source, ns } = options;
  const params = new URLSearchParams({ page, limit });
  if (method) params.append('method', method);
  if (status) params.append('status', status);
  if (source) params.append('source', source);
  if (ns) params.append('ns', ns);
  return backendApi.get(`/api/clusters/${clusterId}/network/traffic?${params}`);
};

/**
 * Get service dependency map
 */
export const getServiceMap = async (clusterId, options = {}) => {
  const { ns } = options;
  const params = new URLSearchParams();
  if (ns) params.append('ns', ns);
  const query = params.toString();
  return backendApi.get(`/api/clusters/${clusterId}/network/service-map${query ? '?' + query : ''}`);
};

/**
 * Toggle network traffic capture on/off
 */
export const toggleNetworkCapture = async (clusterId, enabled) => {
  return backendApi.post(`/api/clusters/${clusterId}/network/capture`, { enabled });
};

/**
 * Get historical traffic from MongoDB
 */
export const getNetworkTrafficHistory = async (clusterId, options = {}) => {
  const { limit = 100, skip = 0, since, method, ns } = options;
  const params = new URLSearchParams({ limit, skip });
  if (since) params.append('since', since);
  if (method) params.append('method', method);
  if (ns) params.append('ns', ns);
  return backendApi.get(`/api/clusters/${clusterId}/network/traffic/history?${params}`);
};

/**
 * Get L4 flow summaries (aggregated by connection pair)
 */
export const getNetworkFlows = async (clusterId, options = {}) => {
  const { ns, limit = 100, source = 'realtime', since } = options;
  const params = new URLSearchParams({ limit, source });
  if (ns) params.append('ns', ns);
  if (since) params.append('since', since);
  return backendApi.get(`/api/clusters/${clusterId}/network/flows?${params}`);
};

/**
 * Get workload traffic report
 */
export const getWorkloadReport = async (clusterId, options = {}) => {
  const { ns } = options;
  const params = new URLSearchParams();
  if (ns) params.append('ns', ns);
  const query = params.toString();
  return backendApi.get(`/api/clusters/${clusterId}/network/report${query ? '?' + query : ''}`);
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
const POD_CRITICAL = [
  'Failed', 'CrashLoopBackOff', 'Error', 'Evicted', 'OOMKilled',
  'ImagePullBackOff', 'ErrImagePull', 'CreateContainerConfigError', 'InvalidImageName',
];
const POD_TRANSIENT = ['Pending', 'ContainerCreating', 'PodInitializing', 'Terminating', 'Init'];

export const getHealthStatus = (resource, resourceType) => {
  const type = String(resourceType || '').toLowerCase();

  // ── Pods ────────────────────────────────────────────────────────────────
  if (type.startsWith('pod')) {
    const phase = resource.status;
    const restarts = Number(resource.restarts) || 0;
    const [readyC, totalC] = String(resource.ready || '').split('/').map(Number);

    if (POD_CRITICAL.includes(phase)) return { status: 'Critical', color: 'red' };
    if (phase === 'Succeeded') return { status: 'Healthy', color: 'green' };
    if (POD_TRANSIENT.includes(phase)) return { status: 'Warning', color: 'yellow' };
    if (phase === 'Running') {
      // Running but not all containers ready => not actually serving.
      if (Number.isFinite(readyC) && Number.isFinite(totalC) && totalC > 0 && readyC < totalC) {
        return { status: 'Critical', color: 'red' };
      }
      if (restarts > 5) return { status: 'Critical', color: 'red' };
      if (restarts > 0) return { status: 'Warning', color: 'yellow' };
      return { status: 'Healthy', color: 'green' };
    }
    return { status: 'Unknown', color: 'gray' };
  }

  // ── Resources with no health concept ────────────────────────────────────
  if (/^(service|configmap|secret|ingress|namespace|pvc|persistentvolume)/.test(type)) {
    return { status: 'Healthy', color: 'green' };
  }

  // ── Jobs / CronJobs ─────────────────────────────────────────────────────
  if (type.startsWith('job') || type.startsWith('cronjob')) {
    const s = resource.status;
    if (s === 'Failed') return { status: 'Critical', color: 'red' };
    if (s === 'Complete' || s === 'Succeeded') return { status: 'Healthy', color: 'green' };
    if (s === 'Active' || s === 'Running') return { status: 'Warning', color: 'yellow' };
    return { status: 'Unknown', color: 'gray' };
  }

  // ── Workload controllers: deployment / statefulset / daemonset / replicaset
  let ready;
  let desired;
  if (typeof resource.replicas === 'string' && resource.replicas.includes('/')) {
    [ready, desired] = resource.replicas.split('/').map(Number);
  } else {
    ready = Number(resource.ready);
    desired = Number(resource.desired != null ? resource.desired : resource.replicas);
  }

  if (Number.isFinite(ready) && Number.isFinite(desired)) {
    if (desired === 0) return { status: 'Healthy', color: 'green' }; // intentionally scaled to zero
    if (ready >= desired) return { status: 'Healthy', color: 'green' };
    if (ready > 0) return { status: 'Warning', color: 'yellow' };
    return { status: 'Critical', color: 'red' };
  }

  return { status: 'Unknown', color: 'gray' };
};

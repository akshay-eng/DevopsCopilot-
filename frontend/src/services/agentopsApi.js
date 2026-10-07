import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/**
 * AgentOps API Client
 * All requests go through authService proxy which handles authentication
 */
class AgentOpsAPI {
  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}/api/agentops`,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('[AgentOps API Error]:', error.response?.data || error.message);
        throw error;
      }
    );
  }

  /**
   * Get AgentOps session token
   */
  async getToken() {
    const response = await this.client.get('/token');
    return response.data;
  }

  /**
   * Get user's AgentOps project
   */
  async getProject() {
    const response = await this.client.get('/project');
    return response.data;
  }

  /**
   * Get traces list
   * @param {Object} params - { limit, offset, start_date, end_date }
   */
  async getTraces(params = {}) {
    const response = await this.client.get('/traces', { params });
    return response.data;
  }

  /**
   * Get specific trace details
   * @param {string} traceId - Trace ID
   */
  async getTrace(traceId) {
    const response = await this.client.get(`/traces/${traceId}`);
    return response.data;
  }

  /**
   * Get project metrics
   * @param {string} projectId - Project ID
   * @param {Object} params - { start_date, end_date }
   */
  async getMetrics(projectId, params = {}) {
    const response = await this.client.get(`/api/v4/meterics/project/${projectId}`, { params });
    return response.data;
  }

  /**
   * Sync user to AgentOps (manual trigger)
   */
  async syncUser() {
    const response = await this.client.post('/sync-user');
    return response.data;
  }

  /**
   * Check AgentOps service health
   */
  async checkHealth() {
    const response = await this.client.get('/health');
    return response.data;
  }

  /**
   * Generic proxy request to AgentOps API
   * @param {string} method - HTTP method
   * @param {string} path - API path (e.g., '/v4/traces/list/123')
   * @param {Object} data - Request body
   * @param {Object} params - Query parameters
   */
  async proxy(method, path, data = null, params = null) {
    const config = {
      method,
      url: `/api${path}`,
      data,
      params,
    };
    const response = await this.client.request(config);
    return response.data;
  }
}

export default new AgentOpsAPI();

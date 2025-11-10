/**
 * API Service - Centralized HTTP client for all API calls
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

/**
 * Make an API request with automatic token handling
 */
const apiRequest = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`;

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
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
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

// Export API methods
export const api = {
  get: (endpoint, options = {}) =>
    apiRequest(endpoint, { ...options, method: 'GET' }),

  post: (endpoint, data, options = {}) =>
    apiRequest(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    }),

  put: (endpoint, data, options = {}) =>
    apiRequest(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  delete: (endpoint, options = {}) =>
    apiRequest(endpoint, { ...options, method: 'DELETE' }),
};

export { API_URL };

/**
 * Authentication Service - All auth-related API calls
 */

import { api, API_URL } from './api';

const authService = {
  /**
   * Register a new user with email and password
   */
  register: async (email, username, password) => {
    try {
      const data = await api.post('/api/auth/register', {
        email,
        username,
        password,
      }, { skipAuth: true });

      // Store tokens and user data
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Login with email and password
   */
  login: async (email, password) => {
    try {
      const data = await api.post('/api/auth/login', {
        email,
        password,
      }, { skipAuth: true });

      // Store tokens and user data
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Logout user
   */
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  /**
   * Get current user info
   */
  getCurrentUser: async () => {
    try {
      const data = await api.get('/api/auth/me');
      localStorage.setItem('user', JSON.stringify(data.user));
      return { success: true, data: data.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: () => {
    return !!localStorage.getItem('access_token');
  },

  /**
   * Get stored user data
   */
  getUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  /**
   * Validate current token
   */
  validateToken: async () => {
    try {
      const data = await api.get('/api/auth/validate');
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Initiate Google OAuth login
   */
  loginWithGoogle: () => {
    window.location.href = `${API_URL}/api/oauth/google`;
  },

  /**
   * Initiate GitHub OAuth login
   */
  loginWithGitHub: () => {
    window.location.href = `${API_URL}/api/oauth/github`;
  },

  /**
   * Handle OAuth callback (extract tokens from URL)
   */
  handleOAuthCallback: () => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const error = params.get('error');

    if (error) {
      return { success: false, error: getOAuthErrorMessage(error) };
    }

    if (accessToken && refreshToken) {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);

      // Fetch user data
      authService.getCurrentUser();

      return { success: true };
    }

    return { success: false, error: 'No tokens received' };
  },
};

/**
 * Get user-friendly OAuth error messages
 */
const getOAuthErrorMessage = (error) => {
  const errorMessages = {
    'oauth_failed': 'OAuth authentication failed. Please try again.',
    'missing_info': 'Unable to retrieve your information. Please try again.',
    'email_exists': 'An account with this email already exists. Please login with your email and password.',
    'no_email': 'Unable to retrieve your email. Please try again or use email/password registration.',
    'oauth_error': 'An error occurred during authentication. Please try again.',
  };

  return errorMessages[error] || 'Authentication failed. Please try again.';
};

export default authService;

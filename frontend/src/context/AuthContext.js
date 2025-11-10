/**
 * Authentication Context - Manages user authentication state globally
 */

import React, { createContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Initialize auth state on mount
   */
  useEffect(() => {
    const initAuth = async () => {
      if (authService.isAuthenticated()) {
        const storedUser = authService.getUser();

        if (storedUser) {
          setUser(storedUser);
          setIsAuthenticated(true);

          // Validate token in background
          const result = await authService.validateToken();
          if (!result.success) {
            // Token invalid, logout
            logout();
          }
        }
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  /**
   * Login with email and password
   */
  const login = useCallback(async (email, password) => {
    const result = await authService.login(email, password);

    if (result.success) {
      setUser(result.data.user);
      setIsAuthenticated(true);
    }

    return result;
  }, []);

  /**
   * Register new user
   */
  const register = useCallback(async (email, username, password) => {
    const result = await authService.register(email, username, password);

    if (result.success) {
      setUser(result.data.user);
      setIsAuthenticated(true);
    }

    return result;
  }, []);

  /**
   * Logout user
   */
  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  /**
   * Login with Google OAuth
   */
  const loginWithGoogle = useCallback(() => {
    authService.loginWithGoogle();
  }, []);

  /**
   * Login with GitHub OAuth
   */
  const loginWithGitHub = useCallback(() => {
    authService.loginWithGitHub();
  }, []);

  /**
   * Handle OAuth callback
   */
  const handleOAuthCallback = useCallback(async () => {
    const result = authService.handleOAuthCallback();

    if (result.success) {
      // Fetch user data
      const userResult = await authService.getCurrentUser();
      if (userResult.success) {
        setUser(userResult.data);
        setIsAuthenticated(true);
      }
    }

    return result;
  }, []);

  /**
   * Refresh user data
   */
  const refreshUser = useCallback(async () => {
    const result = await authService.getCurrentUser();

    if (result.success) {
      setUser(result.data);
    }

    return result;
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    loginWithGoogle,
    loginWithGitHub,
    handleOAuthCallback,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

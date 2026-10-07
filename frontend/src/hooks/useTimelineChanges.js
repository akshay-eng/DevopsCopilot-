import { useEffect, useState, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { addChange, setChanges, clearChanges } from '../redux/slices/changesSlice';
import { backendApi } from '../services/api';

/**
 * useTimelineChanges Hook
 *
 * Loads and manages K8s changes from API and Socket.IO
 *
 * @param {Object} options - { clusterId, timeRangeHours, namespace, resourceType }
 * @returns {Object} { loading, changesState, refresh }
 */
export const useTimelineChanges = ({ clusterId = null, timeRangeHours = 48, namespace = null, resourceType = null } = {}) => {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const changesState = useSelector(state => state.changes);
  const socket = useSelector(state => state.socket?.socket);
  const isMounted = useRef(true);

  /**
   * Load changes from API
   */
  const loadChanges = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        hours: timeRangeHours,
        limit: 200
      };

      if (clusterId) params.clusterId = clusterId;
      if (namespace) params.namespace = namespace;
      if (resourceType) params.resourceType = resourceType;

      const response = await backendApi.get('/api/timeline/changes', { params });

      if (response?.success && isMounted.current) {
        // Clear and set changes
        dispatch(clearChanges());
        dispatch(setChanges(response.changes || []));
      } else if (!response?.success) {
        setError(response?.error || 'Failed to load changes');
      }

    } catch (err) {
      console.error('Failed to load changes:', err);
      if (isMounted.current) {
        setError(err.message || 'Failed to load changes');
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [dispatch, clusterId, timeRangeHours, namespace, resourceType]);

  /**
   * Socket.IO listener for real-time changes
   */
  useEffect(() => {
    if (!socket) return;

    const handleK8sChange = (change) => {
      if (isMounted.current) {
        // Only add if it matches current filters
        if (clusterId && change.clusterId !== clusterId) return;
        if (namespace && change.namespace !== namespace) return;
        if (resourceType && change.resourceType !== resourceType) return;

        dispatch(addChange(change));
      }
    };

    socket.on('k8s-change', handleK8sChange);

    return () => {
      socket.off('k8s-change', handleK8sChange);
    };
  }, [socket, dispatch, clusterId, namespace, resourceType]);

  /**
   * Load changes on mount and when filters change
   */
  useEffect(() => {
    loadChanges();
  }, [loadChanges]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  return {
    loading,
    error,
    changesState,
    refresh: loadChanges,
    recentChanges: changesState.recentChanges,
    changesByCluster: changesState.changes
  };
};

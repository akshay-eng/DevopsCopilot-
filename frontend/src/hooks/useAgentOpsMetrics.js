import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export const useAgentOpsMetrics = (dateRange, projectId = '') => {
    const [metrics, setMetrics] = useState(null);
    const [metricsLoading, setMetricsLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState(null);

    const fetchMetrics = useCallback(async () => {
        try {
            setIsFetching(true);
            setError(null);

            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            const params = new URLSearchParams();

            if (dateRange?.from) {
                params.append('startDate', dateRange.from.toISOString());
            }

            if (dateRange?.to) {
                params.append('endDate', dateRange.to.toISOString());
            }

            if (projectId) {
                params.append('projectId', projectId);
            }

            const response = await axios.get(`${API_BASE_URL}/api/agentops/metrics?${params}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            setMetrics(response.data);
        } catch (err) {
            console.error('Error fetching metrics:', err);
            setError(err);
            setMetrics(null);
        } finally {
            setMetricsLoading(false);
            setIsFetching(false);
        }
    }, [dateRange, projectId]);

    useEffect(() => {
        fetchMetrics();
    }, [fetchMetrics]);

    return {
        metrics,
        metricsLoading,
        isFetching,
        error,
        refreshMetrics: fetchMetrics,
    };
};

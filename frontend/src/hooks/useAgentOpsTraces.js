import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export const useAgentOpsTraces = (dateRange, searchQuery = '', pageIndex = 0, pageSize = 20, projectId = '') => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [error, setError] = useState(null);

    const fetchTraces = useCallback(async () => {
        try {
            setIsFetching(true);
            setError(null);

            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            const params = new URLSearchParams({
                page: pageIndex.toString(),
                limit: pageSize.toString(),
            });

            if (searchQuery) {
                params.append('search', searchQuery);
            }

            if (dateRange?.from) {
                params.append('startDate', dateRange.from.toISOString());
            }

            if (dateRange?.to) {
                params.append('endDate', dateRange.to.toISOString());
            }

            if (projectId) {
                params.append('projectId', projectId);
            }

            const url = `${API_BASE_URL}/api/agentops/traces?${params}`;
            console.log('[useAgentOpsTraces] Fetching traces from:', url);
            console.log('[useAgentOpsTraces] Date range:', dateRange);

            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            console.log('[useAgentOpsTraces] Response:', response.data);
            console.log('[useAgentOpsTraces] Traces count:', response.data?.traces?.length || 0);

            setData(response.data);
        } catch (err) {
            console.error('[useAgentOpsTraces] Error fetching traces:', err);
            console.error('[useAgentOpsTraces] Error response:', err.response?.data);
            setError(err);
            setData({ traces: [], total: 0 });
        } finally {
            setIsLoading(false);
            setIsFetching(false);
        }
    }, [dateRange, searchQuery, pageIndex, pageSize, projectId]);

    useEffect(() => {
        fetchTraces();
    }, [fetchTraces]);

    return {
        data,
        isLoading,
        isFetching,
        error,
        refetchTraces: fetchTraces,
    };
};

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * AgentOps Context for managing AI workload projects and data
 */
const AgentOpsContext = createContext(null);

/**
 * Hook to access AgentOps context
 */
export const useAgentOps = () => {
    const context = useContext(AgentOpsContext);
    if (!context) {
        throw new Error('useAgentOps must be used within AgentOpsProvider');
    }
    return context;
};

/**
 * AgentOps Provider component
 */
export const AgentOpsProvider = ({ children }) => {
    const queryClient = useQueryClient();
    const [selectedProject, setSelectedProject] = useState(null);
    const [selectedOrganization, setSelectedOrganization] = useState(null);

    // ===== PROJECTS =====

    /**
     * Fetch all projects for the current user
     */
    const useProjects = () => {
        return useQuery({
            queryKey: ['agentops', 'projects'],
            queryFn: async () => {
                const response = await fetch('/api/agentops/projects', {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!response.ok) throw new Error('Failed to fetch projects');
                const data = await response.json();
                return data.projects || [];
            }
        });
    };

    /**
     * Create a new project
     */
    const useCreateProject = () => {
        return useMutation({
            mutationFn: async (projectData) => {
                const response = await fetch('/api/agentops/projects', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify(projectData)
                });
                if (!response.ok) throw new Error('Failed to create project');
                const data = await response.json();
                return data.project;
            },
            onSuccess: (data) => {
                // Invalidate projects cache to refetch
                queryClient.invalidateQueries({ queryKey: ['agentops', 'projects'] });
                setSelectedProject(data._id);
            }
        });
    };

    /**
     * Update a project
     */
    const useUpdateProject = () => {
        return useMutation({
            mutationFn: async ({ projectId, data }) => {
                const response = await fetch(`/api/agentops/projects/${projectId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify(data)
                });
                if (!response.ok) throw new Error('Failed to update project');
                const result = await response.json();
                return result.project;
            },
            onSuccess: (data, variables) => {
                // Update cache
                queryClient.invalidateQueries({ queryKey: ['agentops', 'projects'] });
                queryClient.invalidateQueries({ queryKey: ['agentops', 'project', variables.projectId] });
            }
        });
    };

    /**
     * Delete a project
     */
    const useDeleteProject = () => {
        return useMutation({
            mutationFn: async (projectId) => {
                const response = await fetch(`/api/agentops/projects/${projectId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!response.ok) throw new Error('Failed to delete project');
                return response.json();
            },
            onSuccess: (data, projectId) => {
                queryClient.invalidateQueries({ queryKey: ['agentops', 'projects'] });
                if (selectedProject === projectId) {
                    setSelectedProject(null);
                }
            }
        });
    };

    // ===== TRACES =====

    /**
     * Fetch traces for a project
     */
    const useTraces = (projectId, filters = {}) => {
        return useQuery({
            queryKey: ['agentops', 'traces', projectId, filters],
            queryFn: async () => {
                const params = new URLSearchParams({
                    limit: filters.limit || 50,
                    offset: filters.offset || 0,
                    ...(filters.start_date && { start_date: filters.start_date }),
                    ...(filters.end_date && { end_date: filters.end_date })
                });
                const response = await fetch(`/api/agentops/traces?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!response.ok) throw new Error('Failed to fetch traces');
                return response.json();
            },
            enabled: !!projectId || true
        });
    };

    /**
     * Fetch a single trace with details
     */
    const useTrace = (traceId) => {
        return useQuery({
            queryKey: ['agentops', 'trace', traceId],
            queryFn: async () => {
                const response = await fetch(`/api/agentops/traces/${traceId}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!response.ok) throw new Error('Failed to fetch trace');
                return response.json();
            },
            enabled: !!traceId
        });
    };

    // ===== ANALYTICS =====

    /**
     * Fetch analytics/metrics for a project
     */
    const useAnalytics = (projectId, dateRange = '7d') => {
        return useQuery({
            queryKey: ['agentops', 'analytics', projectId, dateRange],
            queryFn: async () => {
                const response = await fetch(`/api/agentops/metrics?range=${dateRange}`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!response.ok) throw new Error('Failed to fetch analytics');
                return response.json();
            },
            enabled: !!projectId || true
        });
    };

    // ===== ORGANIZATIONS =====

    /**
     * Fetch user's organizations (mock for now - can be projects grouped by organization)
     */
    const useOrganizations = () => {
        return useQuery({
            queryKey: ['agentops', 'organizations'],
            queryFn: async () => {
                // For now, return mock organizations based on user
                // This can be replaced with actual API call when backend supports it
                return [
                    { id: 'personal', name: 'Personal Projects', tier: 'Free' },
                    { id: 'org', name: 'Organization', tier: 'Pro' }
                ];
            }
        });
    };

    // ===== API KEY MANAGEMENT =====

    /**
     * Rotate API key for a project (creates a new API key)
     */
    const useRotateApiKey = () => {
        return useMutation({
            mutationFn: async (projectId) => {
                const response = await fetch(`/api/agentops/projects/${projectId}/api-keys`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ name: 'Rotated API Key' })
                });
                if (!response.ok) throw new Error('Failed to rotate API key');
                return response.json();
            },
            onSuccess: (data, projectId) => {
                queryClient.invalidateQueries({ queryKey: ['agentops', 'project', projectId] });
                queryClient.invalidateQueries({ queryKey: ['agentops', 'projects'] });
            }
        });
    };

    // Context value
    const value = {
        // State
        selectedProject,
        setSelectedProject,
        selectedOrganization,
        setSelectedOrganization,

        // Hooks (expose these for components to use)
        useProjects,
        useCreateProject,
        useUpdateProject,
        useDeleteProject,
        useTraces,
        useTrace,
        useAnalytics,
        useOrganizations,
        useRotateApiKey
    };

    return (
        <AgentOpsContext.Provider value={value}>
            {children}
        </AgentOpsContext.Provider>
    );
};

export default AgentOpsProvider;

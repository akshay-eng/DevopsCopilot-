import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

export const useProjects = () => {
    const [projects, setProjects] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchProjects = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const token = localStorage.getItem('token');

            const response = await axios.get(`${API_BASE_URL}/api/agentops/projects`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setProjects(response.data.projects || []);
        } catch (err) {
            console.error('Error fetching projects:', err);
            setError(err.response?.data?.error || 'Failed to fetch projects');
            setProjects([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const createProject = async (projectData) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(
                `${API_BASE_URL}/api/agentops/projects`,
                projectData,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await fetchProjects(); // Refresh list
            return { success: true, project: response.data.project, apiKey: response.data.api_key };
        } catch (err) {
            console.error('Error creating project:', err);
            return { success: false, error: err.response?.data?.error || 'Failed to create project' };
        }
    };

    const updateProject = async (projectId, updates) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.put(
                `${API_BASE_URL}/api/agentops/projects/${projectId}`,
                updates,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await fetchProjects(); // Refresh list
            return { success: true, project: response.data.project };
        } catch (err) {
            console.error('Error updating project:', err);
            return { success: false, error: err.response?.data?.error || 'Failed to update project' };
        }
    };

    const deleteProject = async (projectId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_BASE_URL}/api/agentops/projects/${projectId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            await fetchProjects(); // Refresh list
            return { success: true };
        } catch (err) {
            console.error('Error deleting project:', err);
            return { success: false, error: err.response?.data?.error || 'Failed to delete project' };
        }
    };

    return {
        projects,
        isLoading,
        error,
        fetchProjects,
        createProject,
        updateProject,
        deleteProject,
    };
};

export const useAPIKeys = (projectId) => {
    const [apiKeys, setApiKeys] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchAPIKeys = useCallback(async () => {
        if (!projectId) return;

        try {
            setIsLoading(true);
            setError(null);
            const token = localStorage.getItem('token');

            const response = await axios.get(
                `${API_BASE_URL}/api/agentops/projects/${projectId}/api-keys`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setApiKeys(response.data.api_keys || []);
        } catch (err) {
            console.error('Error fetching API keys:', err);
            setError(err.response?.data?.error || 'Failed to fetch API keys');
            setApiKeys([]);
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        fetchAPIKeys();
    }, [fetchAPIKeys]);

    const generateAPIKey = async (name = 'API Key') => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(
                `${API_BASE_URL}/api/agentops/projects/${projectId}/api-keys`,
                { name },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await fetchAPIKeys(); // Refresh list
            return {
                success: true,
                apiKey: response.data.api_key,
                keyPreview: response.data.key_preview,
                keyId: response.data.key_id
            };
        } catch (err) {
            console.error('Error generating API key:', err);
            return { success: false, error: err.response?.data?.error || 'Failed to generate API key' };
        }
    };

    const revokeAPIKey = async (keyId) => {
        try {
            const token = localStorage.getItem('token');
            await axios.delete(
                `${API_BASE_URL}/api/agentops/projects/${projectId}/api-keys/${keyId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            await fetchAPIKeys(); // Refresh list
            return { success: true };
        } catch (err) {
            console.error('Error revoking API key:', err);
            return { success: false, error: err.response?.data?.error || 'Failed to revoke API key' };
        }
    };

    return {
        apiKeys,
        isLoading,
        error,
        fetchAPIKeys,
        generateAPIKey,
        revokeAPIKey,
    };
};

export const useVerifyInstallation = () => {
    const [isVerifying, setIsVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState(null);

    const verifyInstallation = async (apiKey) => {
        try {
            setIsVerifying(true);
            setVerificationResult(null);
            const token = localStorage.getItem('token');

            const response = await axios.post(
                `${API_BASE_URL}/api/agentops/verify-installation`,
                { api_key: apiKey },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            setVerificationResult({ success: true, ...response.data });
            return { success: true, ...response.data };
        } catch (err) {
            console.error('Error verifying installation:', err);
            const result = {
                success: false,
                error: err.response?.data?.error || 'Verification failed'
            };
            setVerificationResult(result);
            return result;
        } finally {
            setIsVerifying(false);
        }
    };

    return {
        isVerifying,
        verificationResult,
        verifyInstallation,
    };
};

// Legacy export for backward compatibility
export const useAgentOpsProjects = () => {
    const { projects, isLoading, error } = useProjects();
    return { data: projects, isLoading, error };
};

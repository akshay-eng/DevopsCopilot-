import React, { useState } from 'react';
import {
    FolderOpen,
    Plus,
    Key,
    Copy,
    RefreshCw,
    Trash2,
    Edit2,
    Check,
    X,
    ChevronDown,
    Lock,
    Crown,
    AlertTriangle
} from 'lucide-react';

const ProjectsSettings = ({ theme }) => {
    const [selectedOrg, setSelectedOrg] = useState('personal');
    const [showCreateProject, setShowCreateProject] = useState(false);
    const [showRotateModal, setShowRotateModal] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(null);
    const [editingProject, setEditingProject] = useState(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [copiedKey, setCopiedKey] = useState(null);

    // Mock data
    const organizations = [
        { id: 'personal', name: 'Personal Projects', tier: 'Free' },
        { id: 'acme', name: 'Acme Corp', tier: 'Pro' }
    ];

    const [projects, setProjects] = useState({
        personal: [
            {
                id: 1,
                name: 'Production Agent',
                apiKey: 'sk_live_abc123...xyz789',
                createdAt: '2024-01-15',
                lastUsed: '2 hours ago'
            }
        ],
        acme: [
            {
                id: 2,
                name: 'Customer Support Bot',
                apiKey: 'sk_live_def456...uvw123',
                createdAt: '2024-01-20',
                lastUsed: '1 day ago'
            },
            {
                id: 3,
                name: 'Data Analysis Agent',
                apiKey: 'sk_live_ghi789...rst456',
                createdAt: '2024-01-22',
                lastUsed: '3 hours ago'
            }
        ]
    });

    const currentOrg = organizations.find(org => org.id === selectedOrg);
    const currentProjects = projects[selectedOrg] || [];
    const canCreateProject = currentOrg.tier === 'Pro' || currentProjects.length === 0;

    const handleCopyKey = (apiKey) => {
        navigator.clipboard.writeText(apiKey);
        setCopiedKey(apiKey);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const handleCreateProject = () => {
        if (!newProjectName.trim()) return;

        const newProject = {
            id: Date.now(),
            name: newProjectName,
            apiKey: `sk_live_${Math.random().toString(36).substring(2, 15)}...${Math.random().toString(36).substring(2, 8)}`,
            createdAt: new Date().toISOString().split('T')[0],
            lastUsed: 'Never'
        };

        setProjects({
            ...projects,
            [selectedOrg]: [...currentProjects, newProject]
        });
        setNewProjectName('');
        setShowCreateProject(false);
    };

    const handleRenameProject = (projectId, newName) => {
        setProjects({
            ...projects,
            [selectedOrg]: currentProjects.map(p =>
                p.id === projectId ? { ...p, name: newName } : p
            )
        });
        setEditingProject(null);
    };

    const handleRotateKey = (projectId) => {
        const newKey = `sk_live_${Math.random().toString(36).substring(2, 15)}...${Math.random().toString(36).substring(2, 8)}`;
        setProjects({
            ...projects,
            [selectedOrg]: currentProjects.map(p =>
                p.id === projectId ? { ...p, apiKey: newKey } : p
            )
        });
        setShowRotateModal(null);
    };

    const handleDeleteProject = (projectId) => {
        setProjects({
            ...projects,
            [selectedOrg]: currentProjects.filter(p => p.id !== projectId)
        });
        setShowDeleteModal(null);
    };

    return (
        <div className="space-y-6">
            {/* Organization Selector */}
            <div className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
            }`}>
                <label className={`block text-sm font-medium mb-2 ${
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                }`}>
                    Select Organization
                </label>
                <div className="relative">
                    <select
                        value={selectedOrg}
                        onChange={(e) => setSelectedOrg(e.target.value)}
                        className={`w-full px-4 py-2 rounded-lg border outline-none appearance-none ${
                            theme === 'dark'
                                ? 'bg-gray-800 border-gray-700 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                        }`}
                    >
                        {organizations.map((org) => (
                            <option key={org.id} value={org.id}>
                                {org.name} ({org.tier})
                            </option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none" />
                </div>
            </div>

            {/* Free Tier Limit Banner */}
            {currentOrg.tier === 'Free' && currentProjects.length >= 1 && (
                <div className={`rounded-xl border p-4 ${
                    theme === 'dark'
                        ? 'bg-purple-500/10 border-purple-800'
                        : 'bg-purple-50 border-purple-200'
                }`}>
                    <div className="flex items-start gap-3">
                        <Lock className={`w-5 h-5 mt-0.5 ${
                            theme === 'dark' ? 'text-purple-400' : 'text-purple-600'
                        }`} />
                        <div className="flex-1">
                            <h4 className={`font-semibold mb-1 ${
                                theme === 'dark' ? 'text-purple-400' : 'text-purple-700'
                            }`}>
                                Free Tier Limit Reached
                            </h4>
                            <p className={`text-sm mb-3 ${
                                theme === 'dark' ? 'text-purple-300' : 'text-purple-600'
                            }`}>
                                You've reached the maximum of 1 project on the Free tier. Upgrade to Pro for unlimited projects.
                            </p>
                            <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 flex items-center gap-2 text-sm">
                                <Crown className="w-4 h-4" />
                                Upgrade to Pro
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Projects List */}
            <div className={`rounded-xl border p-6 ${
                theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
            }`}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-lg ${
                            theme === 'dark' ? 'bg-blue-500/10' : 'bg-blue-50'
                        }`}>
                            <FolderOpen className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Projects</h3>
                            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                {currentProjects.length} {currentProjects.length === 1 ? 'project' : 'projects'}
                            </p>
                        </div>
                    </div>

                    {showCreateProject ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleCreateProject()}
                                placeholder="Project name"
                                className={`px-3 py-2 rounded-lg border outline-none ${
                                    theme === 'dark'
                                        ? 'bg-gray-800 border-gray-700 text-white'
                                        : 'bg-white border-gray-300 text-gray-900'
                                }`}
                                autoFocus
                            />
                            <button
                                onClick={handleCreateProject}
                                disabled={!newProjectName.trim()}
                                className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateProject(false);
                                    setNewProjectName('');
                                }}
                                className={`p-2 rounded-lg ${
                                    theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-200 hover:bg-gray-300'
                                }`}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowCreateProject(true)}
                            disabled={!canCreateProject}
                            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                                canCreateProject
                                    ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white hover:from-purple-700 hover:to-violet-700'
                                    : theme === 'dark'
                                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            }`}
                        >
                            {canCreateProject ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            Create Project
                        </button>
                    )}
                </div>

                {/* Projects Table */}
                <div className="space-y-3">
                    {currentProjects.map((project) => (
                        <div
                            key={project.id}
                            className={`rounded-lg border p-4 ${
                                theme === 'dark' ? 'border-gray-800 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                            }`}
                        >
                            {/* Project Name */}
                            <div className="flex items-center justify-between mb-4">
                                {editingProject === project.id ? (
                                    <div className="flex items-center gap-2 flex-1">
                                        <input
                                            type="text"
                                            defaultValue={project.name}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleRenameProject(project.id, e.target.value);
                                                }
                                            }}
                                            className={`px-3 py-1 rounded-lg border outline-none ${
                                                theme === 'dark'
                                                    ? 'bg-gray-700 border-gray-600 text-white'
                                                    : 'bg-white border-gray-300 text-gray-900'
                                            }`}
                                            autoFocus
                                        />
                                        <button
                                            onClick={(e) => {
                                                const input = e.target.closest('div').querySelector('input');
                                                handleRenameProject(project.id, input.value);
                                            }}
                                            className="p-1 bg-green-600 text-white rounded hover:bg-green-700"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => setEditingProject(null)}
                                            className={`p-1 rounded ${
                                                theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                                            }`}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <h4 className="font-semibold text-lg">{project.name}</h4>
                                            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                                Created {project.createdAt} • Last used {project.lastUsed}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setEditingProject(project.id)}
                                                className={`p-2 rounded-lg transition-colors ${
                                                    theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
                                                }`}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setShowDeleteModal(project.id)}
                                                className={`p-2 rounded-lg transition-colors ${
                                                    theme === 'dark' ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-200 text-red-600'
                                                }`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* API Key */}
                            <div>
                                <label className={`block text-sm font-medium mb-2 ${
                                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                                }`}>
                                    API Key
                                </label>
                                <div className="flex items-center gap-2">
                                    <div className={`flex-1 px-4 py-3 rounded-lg border font-mono text-sm ${
                                        theme === 'dark'
                                            ? 'bg-gray-900 border-gray-700 text-gray-400'
                                            : 'bg-gray-100 border-gray-200 text-gray-600'
                                    }`}>
                                        {project.apiKey}
                                    </div>
                                    <button
                                        onClick={() => handleCopyKey(project.apiKey)}
                                        className={`p-3 rounded-lg transition-colors ${
                                            theme === 'dark'
                                                ? 'bg-gray-800 hover:bg-gray-700'
                                                : 'bg-gray-200 hover:bg-gray-300'
                                        }`}
                                        title="Copy API Key"
                                    >
                                        {copiedKey === project.apiKey ? (
                                            <Check className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setShowRotateModal(project.id)}
                                        className={`p-3 rounded-lg transition-colors ${
                                            theme === 'dark'
                                                ? 'bg-gray-800 hover:bg-gray-700'
                                                : 'bg-gray-200 hover:bg-gray-300'
                                        }`}
                                        title="Rotate API Key"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {currentProjects.length === 0 && (
                        <div className={`text-center py-12 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No projects yet. Create your first project to get started.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Rotate Key Modal */}
            {showRotateModal && (
                <ConfirmationModal
                    theme={theme}
                    title="Rotate API Key"
                    message="Are you sure you want to rotate this API key? The old key will immediately stop working."
                    icon={AlertTriangle}
                    iconColor="text-orange-500"
                    confirmText="Rotate Key"
                    onConfirm={() => handleRotateKey(showRotateModal)}
                    onCancel={() => setShowRotateModal(null)}
                />
            )}

            {/* Delete Project Modal */}
            {showDeleteModal && (
                <ConfirmationModal
                    theme={theme}
                    title="Delete Project"
                    message="Are you sure you want to delete this project? This action cannot be undone and all associated data will be permanently deleted."
                    icon={AlertTriangle}
                    iconColor="text-red-500"
                    confirmText="Delete Project"
                    confirmColor="bg-red-600 hover:bg-red-700"
                    onConfirm={() => handleDeleteProject(showDeleteModal)}
                    onCancel={() => setShowDeleteModal(null)}
                />
            )}
        </div>
    );
};

// Confirmation Modal Component
const ConfirmationModal = ({
    theme,
    title,
    message,
    icon: Icon,
    iconColor,
    confirmText,
    confirmColor = 'bg-orange-600 hover:bg-orange-700',
    onConfirm,
    onCancel
}) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`w-full max-w-md rounded-xl shadow-xl p-6 ${
                theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'
            }`}>
                <div className="flex items-start gap-4 mb-4">
                    <div className={`p-3 rounded-lg ${
                        theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                    }`}>
                        <Icon className={`w-6 h-6 ${iconColor}`} />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold mb-2">{title}</h3>
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {message}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 pt-4">
                    <button
                        onClick={onCancel}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                            theme === 'dark'
                                ? 'bg-gray-800 hover:bg-gray-700'
                                : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2 text-white rounded-lg font-medium ${confirmColor}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectsSettings;

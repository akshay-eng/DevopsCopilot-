import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Rocket, Play, AlertCircle, ExternalLink, Github, Settings } from 'lucide-react';

const Deploy = () => {
    const { theme } = useTheme();
    const [showAlphaModal, setShowAlphaModal] = useState(true);
    const [showGithubModal, setShowGithubModal] = useState(false);

    // Mock deployment data
    const deployments = [
        {
            id: 1,
            name: 'Customer Service Agent',
            organization: 'Personal Projects',
            status: 'running',
            framework: 'CrewAI',
            lastDeploy: '2 hours ago'
        },
        {
            id: 2,
            name: 'Job Posting Generator',
            organization: 'Personal Projects',
            status: 'not_deployed',
            framework: 'OpenAI Agents SDK',
            lastDeploy: null
        }
    ];

    const handleConnectGithub = () => {
        setShowGithubModal(true);
    };

    const handleDeploy = (deploymentId) => {
        console.log('Deploying project:', deploymentId);
    };

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-6xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Deploy</h1>
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        Host and manage your AI agents in the cloud
                    </p>
                </div>

                {/* Alpha Warning Banner */}
                {showAlphaModal && (
                    <div className={`mb-6 p-4 rounded-lg border ${
                        theme === 'dark'
                            ? 'bg-orange-500/10 border-orange-800'
                            : 'bg-orange-50 border-orange-200'
                    }`}>
                        <div className="flex items-start gap-3">
                            <AlertCircle className={`w-5 h-5 mt-0.5 ${
                                theme === 'dark' ? 'text-orange-400' : 'text-orange-600'
                            }`} />
                            <div className="flex-1">
                                <h3 className={`font-semibold mb-1 ${
                                    theme === 'dark' ? 'text-orange-400' : 'text-orange-700'
                                }`}>
                                    Alpha Program
                                </h3>
                                <p className={`text-sm ${
                                    theme === 'dark' ? 'text-orange-300' : 'text-orange-600'
                                }`}>
                                    Agent hosting is currently in alpha. Features may change and deployments may be unstable.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAlphaModal(false)}
                                className={`text-sm px-3 py-1 rounded ${
                                    theme === 'dark'
                                        ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400'
                                        : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                                }`}
                            >
                                Got it
                            </button>
                        </div>
                    </div>
                )}

                {/* Quick Links */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <a
                        href="https://docs.agentops.ai/deploy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-4 rounded-xl border transition-all ${
                            theme === 'dark'
                                ? 'border-gray-800 bg-[#13131f] hover:border-purple-600'
                                : 'border-gray-200 bg-white hover:border-purple-400'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <ExternalLink className="w-4 h-4 text-blue-500" />
                            <span className="font-semibold text-sm">Documentation</span>
                        </div>
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                            Learn how to deploy agents
                        </p>
                    </a>

                    <button
                        onClick={handleConnectGithub}
                        className={`p-4 rounded-xl border transition-all text-left ${
                            theme === 'dark'
                                ? 'border-gray-800 bg-[#13131f] hover:border-purple-600'
                                : 'border-gray-200 bg-white hover:border-purple-400'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Github className="w-4 h-4" />
                            <span className="font-semibold text-sm">Connect GitHub</span>
                        </div>
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                            Deploy from your repositories
                        </p>
                    </button>

                    <a
                        href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-4 rounded-xl border transition-all ${
                            theme === 'dark'
                                ? 'border-gray-800 bg-[#13131f] hover:border-purple-600'
                                : 'border-gray-200 bg-white hover:border-purple-400'
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Play className="w-4 h-4 text-red-500" />
                            <span className="font-semibold text-sm">Tutorial</span>
                        </div>
                        <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                            Watch deployment guide
                        </p>
                    </a>
                </div>

                {/* Deployments List */}
                <div>
                    <h2 className="text-xl font-bold mb-4">Your Projects</h2>

                    <div className="space-y-6">
                        {/* Group by Organization */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <h3 className={`font-semibold ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Personal Projects
                                </h3>
                                <span className={`px-2 py-0.5 text-xs rounded ${
                                    theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600'
                                }`}>
                                    Free
                                </span>
                            </div>

                            <div className="space-y-3">
                                {deployments.map((deployment) => (
                                    <DeploymentCard
                                        key={deployment.id}
                                        deployment={deployment}
                                        theme={theme}
                                        onDeploy={handleDeploy}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* GitHub Connect Modal */}
                {showGithubModal && (
                    <GithubConnectModal
                        theme={theme}
                        onClose={() => setShowGithubModal(false)}
                    />
                )}
            </div>
        </div>
    );
};

// Deployment Card Component
const DeploymentCard = ({ deployment, theme, onDeploy }) => {
    const isRunning = deployment.status === 'running';

    return (
        <div className={`rounded-xl border p-6 transition-all ${
            theme === 'dark'
                ? 'border-gray-800 bg-[#13131f]'
                : 'border-gray-200 bg-white'
        }`}>
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-lg font-semibold">{deployment.name}</h4>
                        {isRunning ? (
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    <div className="absolute inset-0 w-2 h-2 bg-green-500 rounded-full animate-ping" />
                                </div>
                                <span className="text-sm text-green-500">Running</span>
                            </div>
                        ) : (
                            <span className={`text-sm ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                                Not deployed
                            </span>
                        )}
                    </div>
                    <div className={`flex items-center gap-4 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        <span>{deployment.framework}</span>
                        {deployment.lastDeploy && (
                            <>
                                <span>•</span>
                                <span>Last deployed {deployment.lastDeploy}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isRunning ? (
                        <>
                            <button
                                className={`p-2 rounded-lg transition-colors ${
                                    theme === 'dark'
                                        ? 'hover:bg-gray-800'
                                        : 'hover:bg-gray-100'
                                }`}
                                title="Settings"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                            <button
                                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 flex items-center gap-2"
                            >
                                <ExternalLink className="w-4 h-4" />
                                View
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => onDeploy(deployment.id)}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 flex items-center gap-2"
                        >
                            <Rocket className="w-4 h-4" />
                            Deploy
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// GitHub Connect Modal
const GithubConnectModal = ({ theme, onClose }) => {
    const handleConnect = () => {
        // In a real app, this would redirect to GitHub OAuth
        window.open('https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID', '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`w-full max-w-md rounded-xl shadow-xl p-6 ${
                theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'
            }`}>
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-lg bg-gray-800">
                        <Github className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold">Connect GitHub</h3>
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            Deploy agents from your repositories
                        </p>
                    </div>
                </div>

                <div className={`mb-6 p-4 rounded-lg ${
                    theme === 'dark' ? 'bg-gray-800/50' : 'bg-gray-50'
                }`}>
                    <h4 className="font-semibold mb-2 text-sm">What you'll get:</h4>
                    <ul className={`text-sm space-y-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        <li>• Automatic deployments from GitHub</li>
                        <li>• CI/CD integration</li>
                        <li>• Repository access for agent code</li>
                    </ul>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                            theme === 'dark'
                                ? 'bg-gray-800 hover:bg-gray-700'
                                : 'bg-gray-200 hover:bg-gray-300'
                        }`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConnect}
                        className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 flex items-center justify-center gap-2"
                    >
                        <Github className="w-4 h-4" />
                        Connect GitHub
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Deploy;

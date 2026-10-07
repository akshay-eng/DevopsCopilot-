import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Code, Sparkles, ChevronRight, Copy, Check, Eye, EyeOff, Loader, CheckCircle } from 'lucide-react';

const GetStarted = () => {
    const { theme } = useTheme();
    const [currentStep, setCurrentStep] = useState(0);
    const [integrationType, setIntegrationType] = useState(null);
    const [selectedFramework, setSelectedFramework] = useState(null);
    const [apiKey] = useState('ao_' + Math.random().toString(36).substring(2, 15));
    const [showApiKey, setShowApiKey] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    const frameworks = [
        { id: 'crewai', name: 'CrewAI', icon: '🔴', command: 'pip install agentops crewai' },
        { id: 'agno', name: 'Agno', icon: '🟧', command: 'pip install agentops agno' },
        { id: 'openai', name: 'OpenAI Agents SDK', icon: '⚫', command: 'pip install agentops openai' },
        { id: 'google-adk', name: 'Google ADK', icon: 'G', command: 'pip install agentops google-adk' },
        { id: 'ag2', name: 'AG2', icon: '🤖', command: 'pip install agentops ag2' },
        { id: 'autogen', name: 'AutoGen', icon: '⊞', command: 'pip install agentops pyautogen' },
        { id: 'langgraph', name: 'LangGraph', icon: '👁', command: 'pip install agentops langgraph' },
        { id: 'langchain', name: 'LangChain', icon: '🦜', command: 'pip install agentops langchain' }
    ];

    const templates = [
        { id: 'crewai-template', framework: 'CrewAI', name: 'Job Posting Generator', icon: '🔴' },
        { id: 'openai-template', framework: 'OpenAI', name: 'Customer Service Agent', icon: '⚫' },
        { id: 'google-template', framework: 'Google ADK', name: 'Approval Workflow', icon: 'G' },
        { id: 'ag2-template', framework: 'AG2', name: 'Multi-Agent Chat', icon: '🤖' }
    ];

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleVerify = () => {
        setVerificationStatus('checking');
        setTimeout(() => {
            setVerificationStatus('success');
        }, 2000);
    };

    const steps = [
        { num: 0, label: 'Get Started' },
        { num: 1, label: 'Install' },
        { num: 2, label: 'Verify' }
    ];

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-5xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Get Started with AgentOps</h1>
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        Set up AgentOps in minutes and start monitoring your agents
                    </p>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center gap-2 mb-8">
                    {steps.map((step, idx) => (
                        <React.Fragment key={step.num}>
                            <div className="flex items-center gap-2">
                                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                                    currentStep === step.num
                                        ? 'bg-orange-500 text-white'
                                        : currentStep > step.num
                                            ? theme === 'dark' ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                                            : theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600'
                                }`}>
                                    {currentStep > step.num && <CheckCircle className="w-4 h-4" />}
                                    <span className="text-sm font-medium">{step.label}</span>
                                </div>
                            </div>
                            {idx < steps.length - 1 && (
                                <ChevronRight className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* Step 0: Choose Integration Type */}
                {currentStep === 0 && (
                    <div className="space-y-6">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold mb-2">How would you like to get started?</h2>
                            <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                Choose the option that best fits your needs
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
                            <button
                                onClick={() => {
                                    setIntegrationType('existing');
                                    setCurrentStep(1);
                                }}
                                className={`p-8 rounded-xl border-2 transition-all text-left ${
                                    theme === 'dark'
                                        ? 'border-gray-700 bg-[#13131f] hover:border-purple-600'
                                        : 'border-gray-200 bg-white hover:border-purple-400'
                                } hover:shadow-lg`}
                            >
                                <Code className="w-12 h-12 mb-4 text-blue-500" />
                                <h3 className="text-xl font-semibold mb-2">Existing Codebase</h3>
                                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Add AgentOps to your current project with just a few lines of code
                                </p>
                                <div className="mt-4 flex items-center text-sm text-blue-500">
                                    Quick integration <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    setIntegrationType('fresh');
                                    setCurrentStep(1);
                                }}
                                className={`p-8 rounded-xl border-2 transition-all text-left ${
                                    theme === 'dark'
                                        ? 'border-gray-700 bg-[#13131f] hover:border-purple-600'
                                        : 'border-gray-200 bg-white hover:border-purple-400'
                                } hover:shadow-lg`}
                            >
                                <Sparkles className="w-12 h-12 mb-4 text-purple-500" />
                                <h3 className="text-xl font-semibold mb-2">Starting Fresh</h3>
                                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Start with a pre-built template and get running in seconds
                                </p>
                                <div className="mt-4 flex items-center text-sm text-purple-500">
                                    Perfect for new projects <ChevronRight className="w-4 h-4 ml-1" />
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 1: Installation */}
                {currentStep === 1 && integrationType === 'existing' && (
                    <div className="space-y-6">
                        <button
                            onClick={() => setCurrentStep(0)}
                            className={`text-sm ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            ← Back
                        </button>

                        <div className="text-center mb-6">
                            <h2 className="text-2xl font-bold mb-2">Choose Your Framework</h2>
                            <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                Select the framework you're using for your agent
                            </p>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-8">
                            {frameworks.map((framework) => (
                                <button
                                    key={framework.id}
                                    onClick={() => setSelectedFramework(framework)}
                                    className={`p-6 rounded-xl border-2 transition-all ${
                                        selectedFramework?.id === framework.id
                                            ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30'
                                            : theme === 'dark'
                                                ? 'border-gray-700 bg-[#13131f] hover:border-gray-600'
                                                : 'border-gray-200 bg-white hover:border-gray-300'
                                    }`}
                                >
                                    <div className="text-3xl mb-2">{framework.icon}</div>
                                    <div className="font-semibold text-sm">{framework.name}</div>
                                </button>
                            ))}
                        </div>

                        {selectedFramework && (
                            <div className="space-y-4">
                                <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                    <h3 className="font-semibold mb-4">1. Install AgentOps</h3>
                                    <div className="relative">
                                        <pre className={`p-4 rounded-lg overflow-x-auto ${theme === 'dark' ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'}`}>
                                            <code>{selectedFramework.command}</code>
                                        </pre>
                                        <button
                                            onClick={() => handleCopy(selectedFramework.command, 'install')}
                                            className={`absolute top-2 right-2 p-2 rounded ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
                                        >
                                            {copiedId === 'install' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                    <h3 className="font-semibold mb-4">2. Initialize in Your Code</h3>
                                    <div className="relative">
                                        <pre className={`p-4 rounded-lg overflow-x-auto text-sm ${theme === 'dark' ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'}`}>
                                            <code>{`import agentops

agentops.init(api_key="${apiKey}")

# Your agent code here...`}</code>
                                        </pre>
                                        <button
                                            onClick={() => handleCopy(`import agentops\n\nagentops.init(api_key="${apiKey}")\n\n# Your agent code here...`, 'init')}
                                            className={`absolute top-2 right-2 p-2 rounded ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
                                        >
                                            {copiedId === 'init' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setCurrentStep(2)}
                                    className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 flex items-center justify-center gap-2"
                                >
                                    Next: Verify Installation
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 1: Templates (Starting Fresh) */}
                {currentStep === 1 && integrationType === 'fresh' && (
                    <div className="space-y-6">
                        <button
                            onClick={() => setCurrentStep(0)}
                            className={`text-sm ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            ← Back
                        </button>

                        <div className="text-center mb-6">
                            <h2 className="text-2xl font-bold mb-2">Choose a Template</h2>
                            <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                Start with a pre-built example and customize it
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {templates.map((template) => (
                                <div
                                    key={template.id}
                                    className={`p-6 rounded-xl border cursor-pointer transition-all ${
                                        theme === 'dark'
                                            ? 'border-gray-700 bg-[#13131f] hover:border-purple-600'
                                            : 'border-gray-200 bg-white hover:border-purple-400'
                                    }`}
                                >
                                    <div className="text-4xl mb-3">{template.icon}</div>
                                    <div className={`text-xs mb-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                                        {template.framework}
                                    </div>
                                    <h3 className="font-semibold mb-2">{template.name}</h3>
                                    <button
                                        onClick={() => setCurrentStep(2)}
                                        className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                                    >
                                        Use Template
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: Verify Installation */}
                {currentStep === 2 && (
                    <div className="space-y-6 max-w-2xl mx-auto">
                        <button
                            onClick={() => setCurrentStep(1)}
                            className={`text-sm ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            ← Back
                        </button>

                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold mb-2">Verify Installation</h2>
                            <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                Run your agent and check that events are being recorded
                            </p>
                        </div>

                        {/* API Key */}
                        <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                            <h3 className="font-semibold mb-4">Your API Key</h3>
                            <div className="flex gap-2">
                                <div className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-[#0a0a0f]' : 'border-gray-300 bg-gray-50'}`}>
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={apiKey}
                                        readOnly
                                        className={`flex-1 bg-transparent outline-none font-mono text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
                                    />
                                    <button
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                                    >
                                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <button
                                    onClick={() => handleCopy(apiKey, 'apikey')}
                                    className={`px-4 py-3 rounded-lg ${theme === 'dark' ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50 border border-gray-300'}`}
                                >
                                    {copiedId === 'apikey' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Verification */}
                        <div>
                            <button
                                onClick={handleVerify}
                                disabled={verificationStatus === 'checking'}
                                className={`w-full py-3 rounded-lg font-medium transition-colors border ${
                                    verificationStatus === 'success'
                                        ? 'bg-green-600 text-white border-green-600'
                                        : theme === 'dark'
                                            ? 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
                                            : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                {verificationStatus === 'checking' ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader className="w-4 h-4 animate-spin" />
                                        Checking for events...
                                    </div>
                                ) : verificationStatus === 'success' ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        Installation Verified!
                                    </div>
                                ) : (
                                    'Verify Installation'
                                )}
                            </button>
                        </div>

                        {verificationStatus === 'success' && (
                            <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-green-500/20 border border-green-800' : 'bg-green-50 border border-green-200'}`}>
                                <p className={`text-sm ${theme === 'dark' ? 'text-green-400' : 'text-green-700'}`}>
                                    Great! AgentOps is now recording your agent's activity. Check out the Overview and Traces pages to see your data.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GetStarted;

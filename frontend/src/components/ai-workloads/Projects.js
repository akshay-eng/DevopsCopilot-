import React, { useState } from 'react';
import { useProjects } from '../../hooks/useAgentOpsProjects';
import { useTheme } from '../../context/ThemeContext';
import { PlusCircle, Loader, ArrowLeft, ArrowRight, Check, Copy, Eye, EyeOff, Code, Sparkles, ChevronRight } from 'lucide-react';

const Projects = () => {
    const { theme } = useTheme();
    const { projects, isLoading, error, createProject, deleteProject } = useProjects();
    const [showCreateWizard, setShowCreateWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(1); // 1: choice, 2: frameworks/llm, 3: install, 4: verify
    const [selectedIntegrationType, setSelectedIntegrationType] = useState(null);
    const [selectedFramework, setSelectedFramework] = useState(null);
    const [selectedModel, setSelectedModel] = useState(null);
    const [newProjectName, setNewProjectName] = useState('');
    const [createdApiKey, setCreatedApiKey] = useState(null);
    const [showApiKey, setShowApiKey] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState(null);
    const [activeTab, setActiveTab] = useState('frameworks'); // 'frameworks' or 'llm'
    const [installTab, setInstallTab] = useState('ai'); // 'ai' or 'manual'
    const [selectedTemplate, setSelectedTemplate] = useState(null);

    const frameworks = [
        { id: 'crewai', name: 'CrewAI', icon: '🔴', description: 'Create AI agent crews that work together' },
        { id: 'agno', name: 'Agno', icon: '🟧', description: 'Flexible agent orchestration platform' },
        { id: 'typescript', name: 'Typescript', icon: 'TS', description: 'JavaScript/Typescript SDK for OpenAI Agents' },
        { id: 'openai', name: 'OpenAI Agents SDK', icon: '⚫', description: 'Build with OpenAI\'s latest agent framework' },
        { id: 'google-adk', name: 'Google ADK', icon: 'G', description: 'Google\'s modular framework for developing and deploying AI agents' },
        { id: 'ag2', name: 'AG2', icon: '🤖', description: 'Next-gen multi-agent framework' },
        { id: 'autogen', name: 'AutoGen', icon: '⊞', description: 'Microsoft\'s multi-agent conversation framework' },
        { id: 'langgraph', name: 'LangGraph', icon: '👁', description: 'Build stateful, multi-actor applications with LLMs' },
        { id: 'smolagents', name: 'smolagents', icon: '🐶', description: 'HuggingFace\'s lightweight agent framework' },
        { id: 'llamaindex', name: 'LlamaIndex', icon: '🦙', description: 'Data framework for LLM applications' },
        { id: 'camelai', name: 'CamelAI', icon: '🐫', description: 'Communicative agents for large-scale collaboration' },
        { id: 'llamastack', name: 'LlamaStack', icon: '📚', description: 'Meta\'s standardized LLM development stack' },
        { id: 'mem0', name: 'Mem0', icon: '⚙', description: 'Memory layer for AI applications' },
        { id: 'taskweaver', name: 'TaskWeaver', icon: '⊞', description: 'Code-first agent framework for complex tasks' },
        { id: 'custom', name: 'Custom Integration', icon: '{...}', description: 'Use AgentOps with any Python project' }
    ];

    const llmProviders = [
        { id: 'openai', name: 'OpenAI', icon: '⚫', description: 'GPT-4, GPT-3.5, and other OpenAI models' },
        { id: 'anthropic', name: 'Anthropic', icon: 'A', description: 'Claude 3 Opus, Sonnet, and Haiku models' },
        { id: 'google', name: 'Google', icon: 'G', description: 'Gemini Pro and other Google AI models' },
        { id: 'mistral', name: 'Mistral', icon: 'M', description: 'Mistral 7B, Mixtral, and other models' },
        { id: 'groq', name: 'Groq', icon: 'G', description: 'Ultra-fast LLM inference' },
        { id: 'ollama', name: 'Ollama', icon: 'O', description: 'Run LLMs locally on your machine' },
        { id: 'cohere', name: 'Cohere', icon: 'C', description: 'Command and other Cohere models' },
        { id: 'replicate', name: 'Replicate', icon: 'R', description: 'Run open-source models in the cloud' }
    ];

    const frameworkTemplates = [
        {
            id: 'crewai-job-posting',
            framework: 'CrewAI',
            frameworkId: 'crewai',
            icon: '🔴',
            name: 'Job Posting Generator',
            description: 'Automated system for creating job postings using AI agents',
            features: ['Multi-agent collaboration', 'Content generation', 'Template customization']
        },
        {
            id: 'openai-customer-service',
            framework: 'OpenAI Agents SDK',
            frameworkId: 'openai',
            icon: '⚫',
            name: 'Customer Service System',
            description: 'AI-powered customer support with intelligent routing',
            features: ['Intent recognition', 'Context management', 'Response generation']
        },
        {
            id: 'google-approval-workflow',
            framework: 'Google ADK',
            frameworkId: 'google-adk',
            icon: 'G',
            name: 'Human Approval Workflow',
            description: 'Agent workflow with human-in-the-loop approval',
            features: ['Approval gates', 'Workflow orchestration', 'Audit trails']
        },
        {
            id: 'agno-research-team',
            framework: 'Agno',
            frameworkId: 'agno',
            icon: '🟧',
            name: 'Research Team Collaboration',
            description: 'Multi-agent research system with specialized roles',
            features: ['Task delegation', 'Knowledge sharing', 'Report generation']
        },
        {
            id: 'ag2-async-feedback',
            framework: 'AG2',
            frameworkId: 'ag2',
            icon: '🤖',
            name: 'Agent Chat with Async Human Feedback',
            description: 'Interactive agent chat with asynchronous human input',
            features: ['Real-time chat', 'Human feedback loop', 'Context preservation']
        },
        {
            id: 'autogen-multi-agent',
            framework: 'AutoGen',
            frameworkId: 'autogen',
            icon: '⊞',
            name: 'Multi-Agent Chat',
            description: 'Complex multi-agent conversations and collaboration',
            features: ['Agent communication', 'Role-based interactions', 'Conversation history']
        }
    ];

    const handleStartWizard = () => {
        setShowCreateWizard(true);
        setWizardStep(1);
        setSelectedIntegrationType(null);
        setSelectedFramework(null);
        setSelectedModel(null);
        setNewProjectName('');
        setCreatedApiKey(null);
        setVerificationStatus(null);
        setActiveTab('frameworks');
        setSelectedTemplate(null);
    };

    const handleSelectIntegrationType = async (type) => {
        setSelectedIntegrationType(type);
        if (type === 'fresh') {
            // Auto-select first template and create project to get API key
            const firstTemplate = frameworkTemplates[0];
            setSelectedTemplate(firstTemplate);

            // Create project immediately to get API key
            const projectName = newProjectName || `${firstTemplate.name}`;
            const result = await createProject({
                name: projectName,
                description: firstTemplate.description,
                framework: firstTemplate.frameworkId,
                integration_type: 'fresh'
            });

            if (result.success) {
                setCreatedApiKey(result.apiKey);
            }

            setWizardStep(5); // Go to Starting Fresh templates screen
        } else {
            setWizardStep(2); // Go to framework selection
        }
    };

    const handleSelectFramework = (framework) => {
        setSelectedFramework(framework);
    };

    const handleSelectModel = (model) => {
        setSelectedModel(model);
    };

    const handleProceedToInstall = async () => {
        if (!selectedFramework && !selectedModel) return;

        // Create the project
        const projectName = newProjectName || `${(selectedFramework || selectedModel).name} Project`;
        const result = await createProject({
            name: projectName,
            description: `${(selectedFramework || selectedModel).name} integration`,
            framework: selectedFramework?.id,
            integration_type: selectedIntegrationType,
            llm_provider: selectedModel?.id
        });

        if (result.success) {
            setCreatedApiKey(result.apiKey);
            setWizardStep(3); // Go to install screen
        }
    };

    const handleProceedFromTemplate = async () => {
        if (!selectedTemplate) return;

        // Create the project from template
        const projectName = newProjectName || `${selectedTemplate.name}`;
        const result = await createProject({
            name: projectName,
            description: selectedTemplate.description,
            framework: selectedTemplate.frameworkId,
            integration_type: 'fresh'
        });

        if (result.success) {
            setCreatedApiKey(result.apiKey);
            setWizardStep(4); // Go to verify screen
        }
    };

    const handleCopyApiKey = () => {
        if (createdApiKey) {
            navigator.clipboard.writeText(createdApiKey);
            alert('API Key copied to clipboard!');
        }
    };

    const handleVerifyInstallation = () => {
        // Simulate verification
        setVerificationStatus('checking');
        setTimeout(() => {
            setVerificationStatus('success');
        }, 2000);
    };

    const handleCloseWizard = () => {
        setShowCreateWizard(false);
        setWizardStep(1);
        setSelectedIntegrationType(null);
        setSelectedFramework(null);
        setSelectedModel(null);
        setNewProjectName('');
        setCreatedApiKey(null);
        setVerificationStatus(null);
    };

    if (isLoading) {
        return (
            <div className={`flex items-center justify-center min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
                <Loader className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className={`p-6 ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
                <div className="max-w-6xl mx-auto">
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <h3 className="text-red-800 dark:text-red-200 font-medium">Error loading projects</h3>
                        <p className="text-red-600 dark:text-red-300 text-sm mt-1">
                            {typeof error === 'string' ? error : error?.message || 'Failed to load projects'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-6xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Projects</h1>
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        Manage your AgentOps projects and API keys
                    </p>
                </div>

                {/* Projects Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {projects.map((project) => (
                        <ProjectCard
                            key={project._id}
                            project={project}
                            theme={theme}
                            onDelete={() => deleteProject(project._id)}
                        />
                    ))}

                    {/* Create New Project Card */}
                    <button
                        onClick={handleStartWizard}
                        className={`
              relative flex flex-col items-center justify-center
              rounded-xl border-2 border-dashed p-8
              transition-all duration-200
              ${theme === 'dark'
                                ? 'border-gray-700 bg-gray-900/50 hover:border-purple-600 hover:bg-purple-950/30'
                                : 'border-gray-300 bg-gray-50/50 hover:border-purple-400 hover:bg-purple-50/30'
                            }
              hover:shadow-lg cursor-pointer
            `}
                    >
                        <PlusCircle className={`w-12 h-12 mb-2 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            New Project
                        </span>
                    </button>
                </div>

                {/* Getting Started Video */}
                <div className={`
          mt-8 rounded-xl border p-6 max-w-3xl
          ${theme === 'dark'
                        ? 'border-gray-700 bg-gradient-to-br from-blue-950/20 to-purple-950/20'
                        : 'border-gray-200 bg-gradient-to-br from-blue-50/50 to-purple-50/50'
                    }
        `}>
                    <h3 className="text-lg font-semibold mb-2">Getting Started with AgentOps</h3>
                    <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        Watch this quick tutorial to learn how to integrate AgentOps into your project
                    </p>
                    <div className="aspect-video w-full overflow-hidden rounded-lg shadow-md">
                        <iframe
                            className="w-full h-full"
                            src="https://www.youtube.com/embed/EU_A3_ux09s"
                            title="AgentOps Tutorial"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                </div>

                {/* Create Project Wizard */}
                {showCreateWizard && (
                    <CreateProjectWizard
                        theme={theme}
                        step={wizardStep}
                        selectedIntegrationType={selectedIntegrationType}
                        selectedFramework={selectedFramework}
                        selectedModel={selectedModel}
                        frameworks={frameworks}
                        llmProviders={llmProviders}
                        frameworkTemplates={frameworkTemplates}
                        selectedTemplate={selectedTemplate}
                        setSelectedTemplate={setSelectedTemplate}
                        projectName={newProjectName}
                        setProjectName={setNewProjectName}
                        createdApiKey={createdApiKey}
                        showApiKey={showApiKey}
                        setShowApiKey={setShowApiKey}
                        verificationStatus={verificationStatus}
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                        installTab={installTab}
                        setInstallTab={setInstallTab}
                        onSelectIntegrationType={handleSelectIntegrationType}
                        onSelectFramework={handleSelectFramework}
                        onSelectModel={handleSelectModel}
                        onProceedToInstall={handleProceedToInstall}
                        onProceedFromTemplate={handleProceedFromTemplate}
                        onCopyApiKey={handleCopyApiKey}
                        onVerifyInstallation={handleVerifyInstallation}
                        onClose={handleCloseWizard}
                        onBack={() => setWizardStep(Math.max(1, wizardStep - 1))}
                        onGoToVerify={() => setWizardStep(4)}
                    />
                )}
            </div>
        </div>
    );
};

// Project Card Component
const ProjectCard = ({ project, theme, onDelete }) => {
    const [showMenu, setShowMenu] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);

    const handleCopyApiKey = () => {
        if (project.api_key) {
            navigator.clipboard.writeText(project.api_key);
            // Show a brief confirmation (you could also use a toast notification)
            const btn = document.activeElement;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>';
            setTimeout(() => {
                btn.innerHTML = originalText;
            }, 1000);
        }
    };

    return (
        <div className={`
      relative rounded-xl border p-6 transition-all duration-200
      ${theme === 'dark'
                ? 'border-gray-700 bg-[#13131f] hover:border-purple-600'
                : 'border-gray-200 bg-white hover:border-purple-400'
            }
      hover:shadow-lg
    `}>
            <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold">{project.name}</h3>
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800`}
                >
                    ⋮
                </button>
            </div>

            <div className={`space-y-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                <div className="flex justify-between">
                    <span>Organization:</span>
                    <span className="font-medium">{project.organization || 'Default'}</span>
                </div>
                <div className="flex justify-between">
                    <span>Traces:</span>
                    <span className="font-medium">{project.trace_count || 0}</span>
                </div>
                <div className="flex justify-between">
                    <span>Framework:</span>
                    <span className="font-medium capitalize">{project.settings?.framework || 'Custom'}</span>
                </div>
            </div>

            {/* API Key Section */}
            <div className={`mt-4 rounded-lg border p-3 ${theme === 'dark' ? 'border-gray-700 bg-[#0a0a0f]' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>API Key</span>
                    <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}
                        title={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                        {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <code className={`flex-1 text-xs font-mono truncate ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        {showApiKey ? project.api_key : '••••••••••••••••••••'}
                    </code>
                    <button
                        onClick={handleCopyApiKey}
                        className={`p-1 rounded transition-colors ${theme === 'dark' ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-600'}`}
                        title="Copy API key"
                    >
                        <Copy className="w-3 h-3" />
                    </button>
                </div>
            </div>

            <button className={`
        mt-4 w-full py-2 px-4 rounded-lg font-medium transition-all
        bg-gradient-to-r from-purple-600 to-violet-600 text-white
        hover:from-purple-700 hover:to-violet-700
      `}>
                <div className="flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Start
                </div>
            </button>

            {showMenu && (
                <div className={`
          absolute right-2 top-12 rounded-lg border shadow-lg p-2 z-10
          ${theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}
        `}>
                    <button
                        onClick={() => {
                            if (window.confirm('Delete this project?')) {
                                onDelete();
                            }
                            setShowMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                        Delete Project
                    </button>
                </div>
            )}
        </div>
    );
};

// Create Project Wizard Component
const CreateProjectWizard = ({
    theme,
    step,
    selectedIntegrationType,
    selectedFramework,
    selectedModel,
    frameworks,
    llmProviders,
    frameworkTemplates,
    selectedTemplate,
    setSelectedTemplate,
    projectName,
    setProjectName,
    createdApiKey,
    showApiKey,
    setShowApiKey,
    verificationStatus,
    activeTab,
    setActiveTab,
    installTab,
    setInstallTab,
    onSelectIntegrationType,
    onSelectFramework,
    onSelectModel,
    onProceedToInstall,
    onProceedFromTemplate,
    onCopyApiKey,
    onVerifyInstallation,
    onClose,
    onBack,
    onGoToVerify
}) => {
    // Conditional steps based on integration type
    const steps = selectedIntegrationType === 'fresh'
        ? [
            { num: 1, label: 'Get Started', active: step === 1 },
            { num: 5, label: 'Choose Template', active: step === 5 },
            { num: 4, label: 'Verify', active: step === 4 }
          ]
        : [
            { num: 1, label: 'Get Started', active: step === 1 },
            { num: 2, label: 'Select', active: step === 2 },
            { num: 3, label: 'Install', active: step === 3 },
            { num: 4, label: 'Verify', active: step === 4 }
          ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`
        w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl shadow-xl
        ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-white'}
      `}>
                {/* Header with Steps */}
                <div className={`border-b p-6 ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold">Start using AgentOps</h2>
                        <button
                            onClick={onClose}
                            className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800`}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center gap-2">
                        {steps.map((s, idx) => (
                            <React.Fragment key={s.num}>
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm ${s.active ? 'text-orange-500 font-semibold' : theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {s.label}
                                    </span>
                                    <ChevronRight className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-300'}`} />
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="p-8">
                    {/* Step 1: Choose Integration Type */}
                    {step === 1 && (
                        <div className="space-y-6">
                            <div className="text-center mb-8">
                                <h3 className="text-3xl font-bold mb-2">Let's get you started with AgentOps</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
                                <button
                                    onClick={() => onSelectIntegrationType('existing')}
                                    className={`
                    p-8 rounded-xl border-2 transition-all text-left
                    ${theme === 'dark'
                                            ? 'border-gray-700 bg-[#13131f] hover:border-purple-600'
                                            : 'border-gray-200 bg-gray-50 hover:border-purple-400'
                                        }
                    hover:shadow-lg
                  `}
                                >
                                    <Code className="w-12 h-12 mb-4 text-blue-500" />
                                    <h4 className="text-xl font-semibold mb-2">Existing Codebase</h4>
                                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                        Add AgentOps to your current project in minutes
                                    </p>
                                    <div className="mt-4 flex items-center text-sm text-blue-500">
                                        Quick integration <ChevronRight className="w-4 h-4 ml-1" />
                                    </div>
                                </button>

                                <button
                                    onClick={() => onSelectIntegrationType('fresh')}
                                    className={`
                    p-8 rounded-xl border-2 transition-all text-left
                    ${theme === 'dark'
                                            ? 'border-gray-700 bg-[#13131f] hover:border-purple-600'
                                            : 'border-gray-200 bg-gray-50 hover:border-purple-400'
                                        }
                    hover:shadow-lg
                  `}
                                >
                                    <Sparkles className="w-12 h-12 mb-4 text-purple-500" />
                                    <h4 className="text-xl font-semibold mb-2">Starting Fresh</h4>
                                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                        Build a new agent with our pre-built templates
                                    </p>
                                    <div className="mt-4 flex items-center text-sm text-purple-500">
                                        Perfect for new projects <ChevronRight className="w-4 h-4 ml-1" />
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Select Framework & Model */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <button
                                onClick={onBack}
                                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>

                            <div className="text-center mb-6">
                                <h3 className="text-2xl font-bold mb-2">Start using AgentOps</h3>
                            </div>

                            {/* Framework/LLM Tabs */}
                            <div className="flex gap-2 mb-6 justify-center">
                                <button
                                    onClick={() => setActiveTab('frameworks')}
                                    className={`px-6 py-2 rounded-lg font-medium ${
                                        activeTab === 'frameworks'
                                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                                            : theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-700'
                                    }`}
                                >
                                    Frameworks
                                </button>
                                <button
                                    onClick={() => setActiveTab('llm')}
                                    className={`px-6 py-2 rounded-lg font-medium ${
                                        activeTab === 'llm'
                                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                                            : theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-700'
                                    }`}
                                >
                                    LLM Providers
                                </button>
                            </div>

                            {/* Frameworks Grid */}
                            {activeTab === 'frameworks' && (
                                <div className="grid grid-cols-4 gap-4">
                                    {frameworks.map((framework) => (
                                        <button
                                            key={framework.id}
                                            onClick={() => onSelectFramework(framework)}
                                            className={`
                          p-6 rounded-xl border-2 transition-all
                          ${selectedFramework?.id === framework.id
                                                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30'
                                                    : theme === 'dark'
                                                        ? 'border-gray-700 bg-[#13131f] hover:border-gray-600'
                                                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                                                }
                        `}
                                        >
                                            <div className="text-3xl mb-2">{framework.icon}</div>
                                            <h4 className="font-semibold text-sm mb-1">{framework.name}</h4>
                                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                                                {framework.description}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* LLM Providers Grid */}
                            {activeTab === 'llm' && (
                                <div className="grid grid-cols-4 gap-4">
                                    {llmProviders.map((provider) => (
                                        <button
                                            key={provider.id}
                                            onClick={() => onSelectModel(provider)}
                                            className={`
                          p-6 rounded-xl border-2 transition-all
                          ${selectedModel?.id === provider.id
                                                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/30'
                                                    : theme === 'dark'
                                                        ? 'border-gray-700 bg-[#13131f] hover:border-gray-600'
                                                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                                                }
                        `}
                                        >
                                            <div className="text-3xl mb-2">{provider.icon}</div>
                                            <h4 className="font-semibold text-sm mb-1">{provider.name}</h4>
                                            <p className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                                                {provider.description}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {(selectedFramework || selectedModel) && (
                                <div className="flex justify-end mt-6">
                                    <button
                                        onClick={onProceedToInstall}
                                        className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700"
                                    >
                                        Continue
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Install with AI / Manual */}
                    {step === 3 && (
                        <div className="space-y-6 max-w-3xl mx-auto">
                            <button
                                onClick={onBack}
                                className={`flex items-center gap-2 text-sm ${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>

                            <div>
                                <h3 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                    Integrate AgentOps with {selectedFramework?.name || selectedModel?.name}
                                </h3>
                            </div>

                            {/* Install Tabs */}
                            <div className="flex items-center gap-2 mb-6">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setInstallTab('ai')}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            installTab === 'ai'
                                                ? theme === 'dark'
                                                    ? 'bg-gray-800 text-white'
                                                    : 'bg-white text-gray-900 shadow-sm'
                                                : theme === 'dark'
                                                    ? 'text-gray-400 hover:text-gray-300'
                                                    : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        Install with AI
                                    </button>
                                    <button
                                        onClick={() => setInstallTab('manual')}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            installTab === 'manual'
                                                ? theme === 'dark'
                                                    ? 'bg-gray-800 text-white'
                                                    : 'bg-white text-gray-900 shadow-sm'
                                                : theme === 'dark'
                                                    ? 'text-gray-400 hover:text-gray-300'
                                                    : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        Install manually
                                    </button>
                                </div>
                                <div className="ml-auto">
                                    <button
                                        onClick={onGoToVerify}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                            theme === 'dark'
                                                ? 'bg-gray-800 text-white hover:bg-gray-700'
                                                : 'bg-white text-gray-900 hover:bg-gray-50 shadow-sm'
                                        }`}
                                    >
                                        Verify installation
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* API Key Section */}
                            <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                <h4 className={`font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Your AgentOps API Key</h4>
                                <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    You'll need this key to configure AgentOps in your project
                                </p>

                                <div className="flex gap-2">
                                    <div className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-[#0a0a0f] text-white' : 'border-gray-300 bg-gray-50 text-gray-900'}`}>
                                        <input
                                            type={showApiKey ? 'text' : 'password'}
                                            value={createdApiKey || ''}
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
                                        onClick={onCopyApiKey}
                                        className={`px-4 py-3 rounded-lg transition-colors ${
                                            theme === 'dark'
                                                ? 'bg-gray-800 hover:bg-gray-700 text-white'
                                                : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-300'
                                        }`}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Install with AI Tab Content */}
                            {installTab === 'ai' && (
                                <div className={`rounded-xl border p-8 text-center ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                    <p className={`mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                        AI-assisted installation coming soon! For now, please use manual installation.
                                    </p>
                                    <button
                                        onClick={() => setInstallTab('manual')}
                                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700"
                                    >
                                        Switch to Manual Installation
                                    </button>
                                </div>
                            )}

                            {/* Install Manually Tab Content */}
                            {installTab === 'manual' && (
                                <div className="space-y-6">
                                    {/* 1. Install */}
                                    <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                        <h4 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>1. Install</h4>
                                        <div className="flex items-center gap-2 mb-2">
                                            <button className={`px-3 py-1 text-xs rounded ${theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>pip</button>
                                            <button className={`px-3 py-1 text-xs rounded ${theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>uv</button>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(`uv pip install agentops ${selectedFramework?.id || selectedModel?.id || ''}`)}
                                                className={`ml-auto p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <pre className={`p-4 rounded-lg overflow-x-auto ${theme === 'dark' ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'}`}>
                                            <code>uv pip install agentops {selectedFramework?.id || selectedModel?.id || ''}</code>
                                        </pre>
                                    </div>

                                    {/* 2. Initialize */}
                                    <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                        <h4 className={`font-semibold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>2. Initialize</h4>
                                        <div className="flex items-center gap-2 mb-2">
                                            <button className={`px-3 py-1 text-xs rounded ${theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>python</button>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(`import os\nimport agentops\nfrom dotenv import load_dotenv\n\nload_dotenv()\n\n# Set OpenAI API key if not already in environment\nif "OPENAI_API_KEY" not in os.environ:\n    os.environ["OPENAI_API_KEY"] = "<your_openai_api_key>"\n\nAGENTOPS_API_KEY = os.getenv("AGENTOPS_API_KEY") or '${createdApiKey}'\nagentops.init(\n    api_key=AGENTOPS_API_KEY,\n)`)}
                                                className={`ml-auto p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                                            >
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <pre className={`p-4 rounded-lg overflow-x-auto text-sm ${theme === 'dark' ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'}`}>
                                            <code>{`import os
import agentops
from dotenv import load_dotenv

load_dotenv()

# Set OpenAI API key if not already in environment
if "OPENAI_API_KEY" not in os.environ:
    os.environ["OPENAI_API_KEY"] = "<your_openai_api_key>"

AGENTOPS_API_KEY = os.getenv("AGENTOPS_API_KEY") or '${createdApiKey?.slice(-12) || 'your-api-key'}'
agentops.init(
    api_key=AGENTOPS_API_KEY,
)`}</code>
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 4: Verify Installation */}
                    {step === 4 && (
                        <div className="space-y-6 max-w-2xl mx-auto">
                            <button
                                onClick={onBack}
                                className={`flex items-center gap-2 text-sm ${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>

                            <div className="text-center mb-8">
                                <h3 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Verify installation</h3>
                            </div>

                            {/* Verify API Key */}
                            <div>
                                <h4 className={`font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>1. Verify API Key</h4>
                                <div className={`flex gap-2 p-4 rounded-lg border ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={createdApiKey || ''}
                                        readOnly
                                        className={`flex-1 bg-transparent outline-none font-mono text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}
                                    />
                                    <button
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                                    >
                                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    <button
                                        onClick={onCopyApiKey}
                                        className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Make sure you've set your AgentOps API key correctly.
                                </p>
                            </div>

                            {/* Check Installation */}
                            <div>
                                <h4 className={`font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>2. Check Installation</h4>
                                <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Run your agent and verify the installation was successful:
                                </p>
                                <button
                                    onClick={onVerifyInstallation}
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
                                            Checking...
                                        </div>
                                    ) : verificationStatus === 'success' ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Check className="w-4 h-4" />
                                            Installation Verified!
                                        </div>
                                    ) : (
                                        'Check installation'
                                    )}
                                </button>
                            </div>

                            {/* Help Section */}
                            <div className={`mt-8 pt-8 border-t ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}`}>
                                <h4 className={`font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Need help?</h4>
                                <div className="space-y-2">
                                    <button className={`w-full py-3 px-4 rounded-lg text-left transition-colors border ${
                                        theme === 'dark'
                                            ? 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
                                            : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50'
                                    }`}>
                                        Read the docs
                                    </button>
                                    <button className={`w-full py-3 px-4 rounded-lg text-left transition-colors border ${
                                        theme === 'dark'
                                            ? 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
                                            : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-50'
                                    }`}>
                                        Raise an issue
                                    </button>
                                </div>
                            </div>

                            {verificationStatus === 'success' && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={onClose}
                                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700"
                                    >
                                        Done
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 5: Starting Fresh - Choose Template */}
                    {step === 5 && (
                        <div className="space-y-6">
                            <button
                                onClick={onBack}
                                className={`flex items-center gap-2 text-sm ${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back
                            </button>

                            <div className="text-center mb-6">
                                <h3 className="text-2xl font-bold mb-2">Choose a template to get started</h3>
                                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Start with pre-built examples and customize them to your needs
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-6">
                                {/* Left Sidebar - Template List */}
                                <div className="col-span-1 space-y-2">
                                    {frameworkTemplates.map((template) => (
                                        <button
                                            key={template.id}
                                            onClick={() => setSelectedTemplate(template)}
                                            className={`w-full text-left p-4 rounded-lg border transition-all ${
                                                selectedTemplate?.id === template.id
                                                    ? theme === 'dark'
                                                        ? 'border-purple-600 bg-purple-950/30'
                                                        : 'border-purple-400 bg-purple-50'
                                                    : theme === 'dark'
                                                        ? 'border-gray-700 bg-[#13131f] hover:border-gray-600'
                                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="text-2xl">{template.icon}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-xs font-medium mb-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                                                        {template.framework}
                                                    </div>
                                                    <div className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                                        {template.name}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Right Panel - Template Details */}
                                <div className="col-span-2">
                                    {selectedTemplate ? (
                                        <div className={`rounded-xl border p-6 h-full ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                            <div className="flex items-start gap-4 mb-6">
                                                <div className="text-4xl">{selectedTemplate.icon}</div>
                                                <div className="flex-1">
                                                    <div className={`text-xs font-medium mb-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                                                        {selectedTemplate.framework}
                                                    </div>
                                                    <h4 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                                        {selectedTemplate.name}
                                                    </h4>
                                                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                                        {selectedTemplate.description}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mb-6">
                                                <h5 className={`text-sm font-semibold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                                    Features included:
                                                </h5>
                                                <ul className="space-y-2">
                                                    {selectedTemplate.features.map((feature, idx) => (
                                                        <li key={idx} className="flex items-center gap-2">
                                                            <Check className={`w-4 h-4 ${theme === 'dark' ? 'text-green-400' : 'text-green-600'}`} />
                                                            <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                {feature}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>

                                            {/* API Key Section */}
                                            {createdApiKey && (
                                                <div className={`rounded-lg border p-4 mb-6 ${theme === 'dark' ? 'border-gray-700 bg-[#0a0a0f]' : 'border-gray-200 bg-gray-50'}`}>
                                                    <h5 className={`text-sm font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                                                        Your API Key:
                                                    </h5>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type={showApiKey ? 'text' : 'password'}
                                                            value={createdApiKey}
                                                            readOnly
                                                            className={`flex-1 px-3 py-2 rounded border text-sm font-mono ${
                                                                theme === 'dark'
                                                                    ? 'bg-[#13131f] border-gray-700 text-white'
                                                                    : 'bg-white border-gray-300 text-gray-900'
                                                            }`}
                                                        />
                                                        <button
                                                            onClick={() => setShowApiKey(!showApiKey)}
                                                            className={`p-2 rounded ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                                                        >
                                                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                        </button>
                                                        <button
                                                            onClick={onCopyApiKey}
                                                            className={`p-2 rounded ${theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            <div className="flex gap-3">
                                                <button
                                                    className={`flex-1 py-3 rounded-lg font-medium transition-colors border ${
                                                        theme === 'dark'
                                                            ? 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
                                                            : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    Open in Google Colab
                                                </button>
                                                <button
                                                    className={`flex-1 py-3 rounded-lg font-medium transition-colors border ${
                                                        theme === 'dark'
                                                            ? 'bg-gray-800 text-white border-gray-700 hover:bg-gray-700'
                                                            : 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    Access examples
                                                </button>
                                            </div>

                                            <button
                                                onClick={onProceedFromTemplate}
                                                className="w-full mt-4 py-3 px-6 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 flex items-center justify-center gap-2"
                                            >
                                                Next: Verify Installation
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={`rounded-xl border p-12 h-full flex items-center justify-center ${theme === 'dark' ? 'border-gray-700 bg-[#13131f]' : 'border-gray-200 bg-white'}`}>
                                            <div className="text-center">
                                                <Sparkles className={`w-12 h-12 mx-auto mb-4 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
                                                <p className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                                                    Select a template to view details
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default Projects;

import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { BookOpen, Code, Zap, CheckCircle } from 'lucide-react';

const AgentDocs = () => {
    const { theme } = useTheme();

    return (
        <div className={`flex flex-col gap-4 p-6 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
            <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Getting Started</h1>

            <div className={`rounded-lg p-6 shadow-lg ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                <div className="space-y-8">
                    {/* Introduction */}
                    <div>
                        <div className="mb-4 flex items-center gap-2">
                            <BookOpen className="h-6 w-6 text-purple-600" />
                            <h2 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Welcome to AgentOps</h2>
                        </div>
                        <p className={theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}>
                            AgentOps provides comprehensive observability for your AI agents. Monitor costs, track performance, and
                            debug issues in real-time.
                        </p>
                    </div>

                    {/* Quick Start */}
                    <div>
                        <div className="mb-4 flex items-center gap-2">
                            <Zap className="h-6 w-6 text-purple-600" />
                            <h2 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Quick Start</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30">
                                    1
                                </div>
                                <div>
                                    <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Install the SDK</h3>
                                    <pre className={`mt-2 rounded-lg p-4 text-sm ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-900 text-white'}`}>
                                        <code>pip install agentops</code>
                                    </pre>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30">
                                    2
                                </div>
                                <div>
                                    <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Initialize in your code</h3>
                                    <pre className={`mt-2 rounded-lg p-4 text-sm ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-900 text-white'}`}>
                                        <code>{`import agentops

agentops.init(api_key="your-api-key")

# Your agent code here
`}</code>
                                    </pre>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30">
                                    3
                                </div>
                                <div>
                                    <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>View your traces</h3>
                                    <p className={`mt-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                                        Navigate to the Sessions page to see your agent traces in real-time
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Features */}
                    <div>
                        <div className="mb-4 flex items-center gap-2">
                            <CheckCircle className="h-6 w-6 text-purple-600" />
                            <h2 className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Key Features</h2>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className={`rounded-lg border p-4 ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'}`}>
                                <h3 className={`mb-2 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Session Replay</h3>
                                <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                                    View detailed traces of your agent executions with waterfall charts
                                </p>
                            </div>
                            <div className={`rounded-lg border p-4 ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'}`}>
                                <h3 className={`mb-2 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Cost Tracking</h3>
                                <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                                    Monitor LLM costs and token usage across all your agents
                                </p>
                            </div>
                            <div className={`rounded-lg border p-4 ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'}`}>
                                <h3 className={`mb-2 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Performance Analytics</h3>
                                <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                                    Track success rates, latency, and other key metrics
                                </p>
                            </div>
                            <div className={`rounded-lg border p-4 ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'}`}>
                                <h3 className={`mb-2 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Multi-Framework Support</h3>
                                <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                                    Works with LangChain, CrewAI, AutoGen, and more
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Documentation Link */}
                    <div className={`rounded-lg p-6 ${theme === 'dark' ? 'bg-purple-900/20' : 'bg-purple-50'}`}>
                        <div className="flex items-center gap-2">
                            <Code className="h-5 w-5 text-purple-600" />
                            <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Full Documentation</h3>
                        </div>
                        <p className={`mt-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                            For detailed guides, API references, and examples, visit our documentation
                        </p>
                        <a
                            href="https://docs.agentops.ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-purple-500 to-violet-600 px-6 py-2 text-white transition-colors hover:from-purple-600 hover:to-violet-700"
                        >
                            View Documentation
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentDocs;

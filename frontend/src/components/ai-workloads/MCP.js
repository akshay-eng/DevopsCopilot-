import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Copy, Check, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

const MCP = () => {
    const { theme } = useTheme();
    const [copiedId, setCopiedId] = useState(null);
    const [expandedSections, setExpandedSections] = useState({ cursor: true });

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const cursorConfig = `{
  "mcpServers": {
    "agentops": {
      "command": "npx",
      "args": ["-y", "@agentops/mcp-server"]
    }
  }
}`;

    const claudeConfig = `{
  "mcpServers": {
    "agentops": {
      "command": "npx",
      "args": ["-y", "@agentops/mcp-server"]
    }
  }
}`;

    const tools = [
        {
            name: 'auth',
            description: 'Authenticate with AgentOps API key',
            params: ['api_key: string']
        },
        {
            name: 'get_project',
            description: 'Get project details by project ID',
            params: ['project_id: string']
        },
        {
            name: 'get_trace',
            description: 'Get trace information by trace ID',
            params: ['trace_id: string']
        },
        {
            name: 'get_span',
            description: 'Get span information by span ID',
            params: ['span_id: string', 'trace_id: string']
        },
        {
            name: 'get_complete_trace',
            description: 'Get complete trace with all spans',
            params: ['trace_id: string']
        }
    ];

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-4xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-2">
                        <h1 className="text-3xl font-bold">AgentOps MCP Server</h1>
                        <span className={`px-2 py-1 text-xs rounded ${
                            theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                        }`}>
                            Beta
                        </span>
                    </div>
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        Connect AgentOps to your favorite AI coding assistants via Model Context Protocol
                    </p>
                </div>

                {/* Tutorial Video */}
                <div className={`rounded-xl border p-6 mb-8 ${
                    theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
                }`}>
                    <h2 className="text-xl font-bold mb-4">Setup Tutorial</h2>
                    <div className="aspect-video w-full rounded-lg overflow-hidden bg-gray-900">
                        <iframe
                            className="w-full h-full"
                            src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                            title="AgentOps MCP Setup Tutorial"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                    </div>
                </div>

                {/* Installation Instructions */}
                <div className="space-y-4 mb-8">
                    <h2 className="text-xl font-bold">Installation</h2>

                    {/* Cursor */}
                    <div className={`rounded-xl border ${
                        theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
                    }`}>
                        <button
                            onClick={() => toggleSection('cursor')}
                            className={`w-full p-4 flex items-center justify-between ${
                                theme === 'dark' ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                {expandedSections.cursor ? (
                                    <ChevronDown className="w-5 h-5" />
                                ) : (
                                    <ChevronRight className="w-5 h-5" />
                                )}
                                <h3 className="text-lg font-semibold">Cursor</h3>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    window.open('https://cursor.com', '_blank');
                                }}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                    theme === 'dark'
                                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                                        : 'bg-purple-600 text-white hover:bg-purple-700'
                                }`}
                            >
                                Install with Cursor
                            </button>
                        </button>
                        {expandedSections.cursor && (
                            <div className="p-4 pt-0">
                                <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Add this configuration to your Cursor MCP settings:
                                </p>
                                <div className="relative">
                                    <pre className={`p-4 rounded-lg overflow-x-auto text-sm ${
                                        theme === 'dark' ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'
                                    }`}>
                                        <code>{cursorConfig}</code>
                                    </pre>
                                    <button
                                        onClick={() => handleCopy(cursorConfig, 'cursor')}
                                        className={`absolute top-2 right-2 p-2 rounded transition-colors ${
                                            theme === 'dark'
                                                ? 'bg-gray-800 hover:bg-gray-700'
                                                : 'bg-gray-100 hover:bg-gray-200'
                                        }`}
                                    >
                                        {copiedId === 'cursor' ? (
                                            <Check className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Claude Desktop */}
                    <div className={`rounded-xl border ${
                        theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
                    }`}>
                        <button
                            onClick={() => toggleSection('claude')}
                            className={`w-full p-4 flex items-center justify-between ${
                                theme === 'dark' ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                {expandedSections.claude ? (
                                    <ChevronDown className="w-5 h-5" />
                                ) : (
                                    <ChevronRight className="w-5 h-5" />
                                )}
                                <h3 className="text-lg font-semibold">Claude Desktop</h3>
                            </div>
                        </button>
                        {expandedSections.claude && (
                            <div className="p-4 pt-0">
                                <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Add this to your Claude Desktop config file:
                                </p>
                                <div className="relative">
                                    <pre className={`p-4 rounded-lg overflow-x-auto text-sm ${
                                        theme === 'dark' ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'
                                    }`}>
                                        <code>{claudeConfig}</code>
                                    </pre>
                                    <button
                                        onClick={() => handleCopy(claudeConfig, 'claude')}
                                        className={`absolute top-2 right-2 p-2 rounded transition-colors ${
                                            theme === 'dark'
                                                ? 'bg-gray-800 hover:bg-gray-700'
                                                : 'bg-gray-100 hover:bg-gray-200'
                                        }`}
                                    >
                                        {copiedId === 'claude' ? (
                                            <Check className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Smithery */}
                    <div className={`rounded-xl border ${
                        theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
                    }`}>
                        <button
                            onClick={() => toggleSection('smithery')}
                            className={`w-full p-4 flex items-center justify-between ${
                                theme === 'dark' ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                {expandedSections.smithery ? (
                                    <ChevronDown className="w-5 h-5" />
                                ) : (
                                    <ChevronRight className="w-5 h-5" />
                                )}
                                <h3 className="text-lg font-semibold">Smithery</h3>
                            </div>
                        </button>
                        {expandedSections.smithery && (
                            <div className="p-4 pt-0">
                                <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    Install via Smithery package manager:
                                </p>
                                <div className="relative">
                                    <pre className={`p-4 rounded-lg overflow-x-auto text-sm ${
                                        theme === 'dark' ? 'bg-[#0a0a0f] text-gray-300' : 'bg-gray-900 text-gray-100'
                                    }`}>
                                        <code>npx -y @smithery/cli install @agentops/mcp-server --client claude</code>
                                    </pre>
                                    <button
                                        onClick={() => handleCopy('npx -y @smithery/cli install @agentops/mcp-server --client claude', 'smithery')}
                                        className={`absolute top-2 right-2 p-2 rounded transition-colors ${
                                            theme === 'dark'
                                                ? 'bg-gray-800 hover:bg-gray-700'
                                                : 'bg-gray-100 hover:bg-gray-200'
                                        }`}
                                    >
                                        {copiedId === 'smithery' ? (
                                            <Check className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Available Tools */}
                <div className={`rounded-xl border p-6 ${
                    theme === 'dark' ? 'border-gray-800 bg-[#13131f]' : 'border-gray-200 bg-white'
                }`}>
                    <h2 className="text-xl font-bold mb-4">Available Tools</h2>
                    <div className="space-y-4">
                        {tools.map((tool, idx) => (
                            <div
                                key={idx}
                                className={`p-4 rounded-lg border ${
                                    theme === 'dark' ? 'border-gray-700 bg-[#0a0a0f]' : 'border-gray-200 bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <code className={`px-2 py-1 rounded text-sm font-mono ${
                                        theme === 'dark' ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'
                                    }`}>
                                        {tool.name}
                                    </code>
                                </div>
                                <p className={`text-sm mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {tool.description}
                                </p>
                                <div className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                                    Parameters: {tool.params.join(', ')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className={`mt-8 p-4 rounded-lg border ${
                    theme === 'dark' ? 'border-blue-800 bg-blue-500/10' : 'border-blue-200 bg-blue-50'
                }`}>
                    <p className={`text-sm ${theme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>
                        Have feedback or questions about the MCP server?{' '}
                        <a
                            href="https://github.com/AgentOps-AI/agentops/issues"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 underline hover:no-underline"
                        >
                            Let us know on GitHub
                            <ExternalLink className="w-3 h-3" />
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default MCP;

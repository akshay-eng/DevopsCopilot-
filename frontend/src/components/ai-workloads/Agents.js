import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import axios from 'axios';
import { Activity, Search } from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const Agents = () => {
    const { theme } = useTheme();
    const [agents, setAgents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    React.useEffect(() => {
        const fetchAgents = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`${API_BASE_URL}/api/agentops/agents`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                setAgents(response.data.agents || []);
            } catch (error) {
                console.error('Error fetching agents:', error);
                setAgents([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAgents();
    }, []);

    const filteredAgents = agents.filter((agent) =>
        agent.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className={`flex flex-col gap-4 p-6 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
            <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Agents</h1>

            <div className="relative">
                <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-400'}`} />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search agents..."
                    className={`w-full rounded-lg border py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-purple-500 ${theme === 'dark'
                            ? 'border-slate-700 bg-[#0a0a0f] text-white placeholder-slate-500'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'
                        }`}
                />
            </div>

            <div className={`rounded-lg p-6 shadow-lg ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                {isLoading ? (
                    <div className="flex h-64 items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
                    </div>
                ) : filteredAgents.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {filteredAgents.map((agent) => (
                            <div
                                key={agent.id}
                                className={`rounded-lg border p-4 transition-shadow hover:shadow-md ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'
                                    }`}
                            >
                                <div className="mb-2 flex items-center gap-2">
                                    <Activity className="h-5 w-5 text-purple-600" />
                                    <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{agent.name}</h3>
                                </div>
                                <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>{agent.description || 'No description'}</p>
                                <div className={`mt-2 text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                                    <code>{agent.id}</code>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Activity className={`mb-4 h-12 w-12 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`} />
                        <h3 className={`mb-2 text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>No agents found</h3>
                        <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>
                            {searchQuery ? 'Try a different search term' : 'Create your first agent to get started'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Agents;

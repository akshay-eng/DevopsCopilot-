import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import { Settings, Key, Bell, Shield } from 'lucide-react';

const AgentSettings = () => {
    const { theme } = useTheme();

    return (
        <div className={`flex flex-col gap-4 p-6 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
            <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Settings</h1>

            <div className={`rounded-lg p-6 shadow-lg ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'}`}>
                <div className="space-y-6">
                    {/* API Keys Section */}
                    <div>
                        <div className="mb-4 flex items-center gap-2">
                            <Key className="h-5 w-5 text-purple-600" />
                            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>API Keys</h2>
                        </div>
                        <div className={`rounded-lg border p-4 ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'}`}>
                            <p className={`mb-2 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                                Your AgentOps API key for SDK integration
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value="sk-agentops-••••••••••••••••"
                                    readOnly
                                    className={`flex-1 rounded-lg border px-4 py-2 ${theme === 'dark'
                                            ? 'border-slate-700 bg-[#0a0a0f] text-white'
                                            : 'border-gray-300 bg-gray-50 text-gray-900'
                                        }`}
                                />
                                <button className="rounded-lg bg-gradient-to-r from-purple-500 to-violet-600 px-4 py-2 text-white transition-colors hover:from-purple-600 hover:to-violet-700">
                                    Copy
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Notifications Section */}
                    <div>
                        <div className="mb-4 flex items-center gap-2">
                            <Bell className="h-5 w-5 text-purple-600" />
                            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Notifications</h2>
                        </div>
                        <div className="space-y-3">
                            <label className="flex items-center gap-3">
                                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-purple-600" defaultChecked />
                                <span className={theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}>Email notifications for failed traces</span>
                            </label>
                            <label className="flex items-center gap-3">
                                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-purple-600" />
                                <span className={theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}>Weekly usage reports</span>
                            </label>
                        </div>
                    </div>

                    {/* Security Section */}
                    <div>
                        <div className="mb-4 flex items-center gap-2">
                            <Shield className="h-5 w-5 text-purple-600" />
                            <h2 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Security</h2>
                        </div>
                        <div className="space-y-3">
                            <label className="flex items-center gap-3">
                                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-purple-600" defaultChecked />
                                <span className={theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}>Require authentication for API access</span>
                            </label>
                            <label className="flex items-center gap-3">
                                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-purple-600" defaultChecked />
                                <span className={theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}>Enable data encryption</span>
                            </label>
                        </div>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end">
                        <button className="rounded-lg bg-gradient-to-r from-purple-500 to-violet-600 px-6 py-2 text-white transition-colors hover:from-purple-600 hover:to-violet-700">
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentSettings;

import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import AccountSettings from './settings/AccountSettings';
import OrganizationSettings from './settings/OrganizationSettings';
import ProjectsSettings from './settings/ProjectsSettings';

const Settings = () => {
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState('account');

    const tabs = [
        {
            id: 'account',
            title: 'Account',
            description: 'Manage your account settings and preferences'
        },
        {
            id: 'organization',
            title: 'Organization',
            description: 'Manage your organization, team, and billing'
        },
        {
            id: 'projects',
            title: 'Projects & API Keys',
            description: 'Manage your projects and API keys'
        }
    ];

    return (
        <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Settings</h1>
                    <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        Manage your account, organization, and projects
                    </p>
                </div>

                {/* Tabs Navigation */}
                <div className={`border-b mb-8 ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'}`}>
                    <div className="flex gap-8 overflow-x-auto">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`pb-4 px-1 border-b-2 transition-all whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? 'border-purple-600 text-purple-600'
                                        : theme === 'dark'
                                            ? 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700'
                                            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                                }`}
                            >
                                <div className="font-semibold">{tab.title}</div>
                                <div className="text-xs mt-1">{tab.description}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="max-w-4xl">
                    {activeTab === 'account' && <AccountSettings theme={theme} />}
                    {activeTab === 'organization' && <OrganizationSettings theme={theme} />}
                    {activeTab === 'projects' && <ProjectsSettings theme={theme} />}
                </div>
            </div>
        </div>
    );
};

export default Settings;

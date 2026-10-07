import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const Comparison = () => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('Resources');
  const [objectType, setObjectType] = useState('');

  // Left side selections
  const [leftCluster, setLeftCluster] = useState('');
  const [leftNamespace, setLeftNamespace] = useState('');
  const [leftName, setLeftName] = useState('');

  // Right side selections
  const [rightCluster, setRightCluster] = useState('');
  const [rightNamespace, setRightNamespace] = useState('');
  const [rightName, setRightName] = useState('');

  const tabs = ['Resources', 'Clusters', 'Namespaces'];

  return (
    <div className={`h-full flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Tabs */}
      <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} px-6`}>
        <div className="flex space-x-0 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab
                  ? theme === 'dark'
                    ? 'border-purple-500 text-white bg-gray-800/50'
                    : 'border-purple-500 text-gray-900 bg-gray-50'
                  : theme === 'dark'
                    ? 'border-transparent text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className={`h-full ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg border ${
          theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
        } shadow-sm`}>
          <div className="p-6 space-y-6">
            {/* Object Type Selector */}
            <div>
              <label className={`block text-xs font-medium mb-2 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                Select object to compare resources
              </label>
              <div className="relative">
                <select
                  value={objectType}
                  onChange={(e) => setObjectType(e.target.value)}
                  className={`appearance-none px-3 py-2 pr-10 rounded-md border text-sm ${
                    theme === 'dark'
                      ? 'bg-[#0a0a0f] border-gray-700 text-gray-300 focus:border-purple-500'
                      : 'bg-white border-gray-300 text-gray-700 focus:border-purple-500'
                  } focus:outline-none focus:ring-1 focus:ring-purple-500 w-64 cursor-pointer`}
                >
                  <option value="">Object Type</option>
                  <option value="pods">Pods</option>
                  <option value="deployments">Deployments</option>
                  <option value="services">Services</option>
                  <option value="configmaps">ConfigMaps</option>
                  <option value="secrets">Secrets</option>
                  <option value="statefulsets">StatefulSets</option>
                  <option value="daemonsets">DaemonSets</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-2 gap-6">
              {/* Left Side */}
              <div className="space-y-3">
                {/* Cluster Dropdown */}
                <div className="relative">
                  <select
                    value={leftCluster}
                    onChange={(e) => setLeftCluster(e.target.value)}
                    className={`appearance-none w-full px-3 py-2.5 pr-10 rounded-md border text-sm ${
                      theme === 'dark'
                        ? 'bg-[#0a0a0f] border-gray-700 text-gray-400 focus:border-purple-500'
                        : 'bg-white border-gray-300 text-gray-500 focus:border-purple-500'
                    } focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer`}
                  >
                    <option value="">No clusters</option>
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Namespace Dropdown */}
                <div className="relative">
                  <select
                    value={leftNamespace}
                    onChange={(e) => setLeftNamespace(e.target.value)}
                    className={`appearance-none w-full px-3 py-2.5 pr-10 rounded-md border text-sm ${
                      theme === 'dark'
                        ? 'bg-[#0a0a0f] border-gray-700 text-gray-400 focus:border-purple-500'
                        : 'bg-white border-gray-300 text-gray-500 focus:border-purple-500'
                    } focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer`}
                  >
                    <option value="">Namespaces</option>
                    <option value="default">default</option>
                    <option value="kube-system">kube-system</option>
                    <option value="kube-public">kube-public</option>
                    <option value="monitoring">monitoring</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Names Dropdown */}
                <div className="relative">
                  <select
                    value={leftName}
                    onChange={(e) => setLeftName(e.target.value)}
                    className={`appearance-none w-full px-3 py-2.5 pr-10 rounded-md border text-sm ${
                      theme === 'dark'
                        ? 'bg-[#0a0a0f] border-gray-700 text-gray-400 focus:border-purple-500'
                        : 'bg-white border-gray-300 text-gray-500 focus:border-purple-500'
                    } focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer`}
                  >
                    <option value="">Names</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Left YAML Display */}
                <div className={`mt-2 p-4 rounded-md border ${
                  theme === 'dark' ? 'bg-[#0a0a0f] border-gray-700' : 'bg-gray-50 border-gray-200'
                } min-h-[400px] flex flex-col`}>
                  <div className="flex items-center space-x-2 mb-3">
                    <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Yaml</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                      Select resources to view comparison
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Side */}
              <div className="space-y-3">
                {/* Cluster Dropdown */}
                <div className="relative">
                  <select
                    value={rightCluster}
                    onChange={(e) => setRightCluster(e.target.value)}
                    className={`appearance-none w-full px-3 py-2.5 pr-10 rounded-md border text-sm ${
                      theme === 'dark'
                        ? 'bg-[#0a0a0f] border-gray-700 text-gray-400 focus:border-purple-500'
                        : 'bg-white border-gray-300 text-gray-500 focus:border-purple-500'
                    } focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer`}
                  >
                    <option value="">No clusters</option>
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Namespace Dropdown */}
                <div className="relative">
                  <select
                    value={rightNamespace}
                    onChange={(e) => setRightNamespace(e.target.value)}
                    className={`appearance-none w-full px-3 py-2.5 pr-10 rounded-md border text-sm ${
                      theme === 'dark'
                        ? 'bg-[#0a0a0f] border-gray-700 text-gray-400 focus:border-purple-500'
                        : 'bg-white border-gray-300 text-gray-500 focus:border-purple-500'
                    } focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer`}
                  >
                    <option value="">Namespaces</option>
                    <option value="default">default</option>
                    <option value="kube-system">kube-system</option>
                    <option value="kube-public">kube-public</option>
                    <option value="monitoring">monitoring</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Names Dropdown */}
                <div className="relative">
                  <select
                    value={rightName}
                    onChange={(e) => setRightName(e.target.value)}
                    className={`appearance-none w-full px-3 py-2.5 pr-10 rounded-md border text-sm ${
                      theme === 'dark'
                        ? 'bg-[#0a0a0f] border-gray-700 text-gray-400 focus:border-purple-500'
                        : 'bg-white border-gray-300 text-gray-500 focus:border-purple-500'
                    } focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer`}
                  >
                    <option value="">Names</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Right YAML Display */}
                <div className={`mt-2 p-4 rounded-md border ${
                  theme === 'dark' ? 'bg-[#0a0a0f] border-gray-700' : 'bg-gray-50 border-gray-200'
                } min-h-[400px] flex flex-col`}>
                  <div className="flex items-center space-x-2 mb-3">
                    <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className={`text-xs font-medium ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Yaml</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center">
                    <p className={`text-sm ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`}>
                      Select resources to view comparison
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Comparison;

import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const Trends = () => {
  const { theme } = useTheme();
  const [timeRange, setTimeRange] = useState('6h');
  const [selectedPreset, setSelectedPreset] = useState('all');
  const [viewMode, setViewMode] = useState('chart'); // chart or table

  // Sample data - replace with real API data
  const alertStats = {
    all: 0,
    high: 0,
    low: 0,
    info: 0
  };

  const alertsOverTime = [
    { time: '08:40', count: 0 },
    { time: '09:52', count: 0 },
    { time: '11:04', count: 0 },
    { time: '12:16', count: 0 },
    { time: '13:28', count: 0 },
    { time: '14:40', count: 0 }
  ];

  const topAlerts = [];
  const clustersWithAlerts = [];
  const applicationsWithAlerts = [];
  const namespacesWithAlerts = [];
  const alertsPerCluster = [];

  return (
    <div className={`flex-1 overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      <div className="p-6">
        {/* Filters Bar */}
        <div className="flex items-center space-x-3 mb-6">
          <button className={`px-4 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-gray-700 border-gray-200'} border`}>
            <span className="mr-2">≡</span> Presets
          </button>
          <button className={`px-4 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-gray-700 border-gray-200'} border`}>
            <span className="mr-2">⊕</span> Cluster
          </button>
          <button className={`px-4 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-gray-700 border-gray-200'} border`}>
            <span className="mr-2">⊕</span> Namespace
          </button>
          <button className={`px-3 py-2 rounded-lg text-sm font-medium ${theme === 'dark' ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
            Save
          </button>
        </div>

        {/* Alert Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* All Alerts */}
          <div className={`p-6 rounded-lg border-2 ${theme === 'dark' ? 'bg-slate-800/50 border-blue-500' : 'bg-white border-blue-500'} cursor-pointer hover:shadow-lg transition-shadow`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>All Prometheus Alerts</span>
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
              </svg>
            </div>
            <div className="flex items-baseline space-x-2">
              <span className={`text-4xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{alertStats.all}</span>
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>

          {/* High Alerts */}
          <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border cursor-pointer hover:shadow-lg transition-shadow`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>High</span>
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <span className="text-4xl font-bold text-red-500">{alertStats.high}</span>
          </div>

          {/* Low Alerts */}
          <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border cursor-pointer hover:shadow-lg transition-shadow`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Low</span>
                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <span className="text-4xl font-bold text-yellow-500">{alertStats.low}</span>
          </div>

          {/* Info Alerts */}
          <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border cursor-pointer hover:shadow-lg transition-shadow`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Info</span>
                <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <span className="text-4xl font-bold text-blue-400">{alertStats.info}</span>
          </div>
        </div>

        {/* Alerts Over Time Chart */}
        <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border mb-6`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Alerts Over Time</h2>
            <button className={`text-sm font-medium ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>
              Customize
            </button>
          </div>

          {/* Chart Filters */}
          <div className="flex items-center space-x-4 mb-6">
            <button className={`flex items-center space-x-2 px-3 py-1.5 rounded text-sm ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>Filters</span>
            </button>
            <button className={`flex items-center space-x-2 px-3 py-1.5 rounded text-sm ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Alert</span>
            </button>
            <button className={`flex items-center space-x-2 px-3 py-1.5 rounded text-sm ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>App</span>
            </button>
            <button className={`flex items-center space-x-2 px-3 py-1.5 rounded text-sm ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span>Priority</span>
            </button>
          </div>

          {/* Chart Area */}
          <div className="relative h-64">
            {/* Y-axis */}
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-slate-400">
              <span>1</span>
            </div>

            {/* Chart */}
            <div className="ml-8 h-full flex items-end justify-around border-b border-l border-slate-700">
              {alertsOverTime.map((point, index) => (
                <div key={index} className="flex-1 flex flex-col items-center justify-end px-2">
                  <div
                    className="w-full bg-gradient-to-t from-red-500/20 to-red-500/10 rounded-t"
                    style={{ height: '2px', minHeight: '2px' }}
                  ></div>
                  <span className={`text-xs mt-2 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                    {point.time}
                  </span>
                </div>
              ))}
            </div>

            {/* No data message */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>
                No data available
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Grid - Top 10 & Clusters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top 10 Alerts */}
          <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Top 10 Alerts</h2>
              <button className={`flex items-center space-x-2 text-sm ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>
                <span>Export</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center h-48">
              <span className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>No data available</span>
            </div>
          </div>

          {/* Clusters with Most Alerts */}
          <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Clusters with Most Alerts</h2>
              <button className={`flex items-center space-x-2 text-sm ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>
                <span>Export</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center h-48">
              <span className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>No data available</span>
            </div>
          </div>
        </div>

        {/* Bottom Grid - Applications & Namespaces */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Applications with Most Alerts */}
          <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Applications with Most Alerts</h2>
              <button className={`flex items-center space-x-2 text-sm ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>
                <span>Export</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center h-48">
              <span className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>No data available</span>
            </div>
          </div>

          {/* Namespaces with Most Alerts */}
          <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Namespaces with Most Alerts</h2>
              <button className={`flex items-center space-x-2 text-sm ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>
                <span>Export</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
            <div className="flex items-center justify-center h-48">
              <span className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>No data available</span>
            </div>
          </div>
        </div>

        {/* Alerts per Cluster */}
        <div className={`p-6 rounded-lg ${theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'} border`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Alerts per Cluster</h2>
            <div className="flex items-center space-x-3">
              {/* View Mode Toggle */}
              <div className={`flex items-center space-x-1 p-1 rounded-lg ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-100'}`}>
                <button
                  onClick={() => setViewMode('chart')}
                  className={`p-1.5 rounded ${viewMode === 'chart' ? (theme === 'dark' ? 'bg-slate-600 text-white' : 'bg-white text-gray-900 shadow') : (theme === 'dark' ? 'text-slate-400' : 'text-gray-600')}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded ${viewMode === 'table' ? (theme === 'dark' ? 'bg-slate-600 text-white' : 'bg-white text-gray-900 shadow') : (theme === 'dark' ? 'text-slate-400' : 'text-gray-600')}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>

              <button className={`flex items-center space-x-2 text-sm ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}>
                <span>Export</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center justify-center h-64">
            <span className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>No data available</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Trends;

import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const Apps = () => {
  const { theme } = useTheme();
  const [selectedView, setSelectedView] = useState('all');

  const stats = [
    { label: 'All Apps', value: '0', color: 'border-violet-500', active: true },
    { label: 'Unhealthy', value: '0', color: 'border-red-500', active: false },
    { label: 'Recently Crashed', value: '0', color: 'border-slate-600', active: false },
    { label: 'Not Ready', value: '0', color: 'border-yellow-500', active: false },
    { label: 'Has Prometheus Alerts', value: '0', color: 'border-red-400', active: false, icon: true }
  ];

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}>
              <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Apps</h1>
            <div className="flex items-center space-x-2">
              <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                <span>Presets</span>
              </button>
              <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
                <span>Cluster</span>
              </button>
              <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span>Namespace</span>
              </button>
              <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-gray-800 text-white'} rounded text-sm`}>
                Save
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className={`px-6 py-4 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className="grid grid-cols-5 gap-4">
          {stats.map((stat, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedView(stat.label.toLowerCase())}
              className={`p-4 ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} border-2 ${stat.active ? stat.color : theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} rounded-lg ${theme === 'dark' ? 'hover:border-violet-500' : 'hover:border-blue-500'} transition-all text-left`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-3xl font-bold ${stat.value === '0' ? theme === 'dark' ? 'text-slate-600' : 'text-gray-400' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {stat.value}
                </span>
                {stat.icon && (
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
              <div className="flex items-center space-x-1">
                <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>{stat.label}</span>
                <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className={`px-6 py-4 ${theme === 'dark' ? 'border-slate-800 bg-[#13131f]' : 'border-gray-200 bg-white'} border-b`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>Filters</span>
            </button>
            {/* Additional filter buttons omitted for brevity */}
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Type / to search"
              className={`w-64 pl-10 pr-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300 placeholder-slate-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} border rounded-lg text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500`}
            />
            <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} absolute left-3 top-1/2 transform -translate-y-1/2`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={`flex-1 overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className="px-6 py-4">
          <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg overflow-hidden`}>
            <table className="w-full">
              <thead className={`${theme === 'dark' ? 'bg-[#1a1a2e] border-slate-800' : 'bg-gray-50 border-gray-200'} border-b`}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>App</th>
                  <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Cluster</th>
                  <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Namespace</th>
                  <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Kind</th>
                  <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Status</th>
                  <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Pods</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center">
                    <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-slate-700' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className={`text-lg font-medium ${theme === 'dark' ? 'text-slate-500' : 'text-gray-600'}`}>No apps available</p>
                    <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-500'}`}>Connect your cluster to start monitoring your applications</p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Apps;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();
  const [selectedView, setSelectedView] = useState('all');
  const [selectedFilter, setSelectedFilter] = useState({
    cluster: '',
    namespace: '',
    kind: '',
    status: '',
    version: ''
  });

  const stats = [
    { label: 'All Apps', value: '0', color: 'border-violet-500', active: true },
    { label: 'Unhealthy', value: '0', color: 'border-red-500', active: false },
    { label: 'Recently Crashed', value: '0', color: 'border-slate-600', active: false },
    { label: 'Not Ready', value: '0', color: 'border-yellow-500', active: false },
    { label: 'Has Prometheus Alerts', value: '0', color: 'border-red-400', active: false, icon: true }
  ];

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-slate-200">
      {/* Sidebar */}
      <aside className="w-64 bg-[#13131f] border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-white">AIOps</span>
          </div>
        </div>

        {/* Upgrade Banner */}
        <div className="p-4 border-b border-slate-800">
          <button className="w-full py-2 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg text-white text-sm font-medium hover:from-emerald-600 hover:to-teal-700 transition-all flex items-center justify-center space-x-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <span>Upgrade to Pro</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="mb-6">
            <button className="w-full py-2 px-3 text-left text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors flex items-center space-x-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span>Ask HolmesGPT</span>
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Alerts</div>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Timeline
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Trends
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Report
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Managed Alerts
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Silences
            </button>
          </div>

          <div className="space-y-1 pt-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Kubernetes</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <button className="w-full py-2 px-3 text-left text-sm text-white bg-violet-600/20 border-l-2 border-violet-500 rounded transition-colors">
              Apps
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Jobs
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Nodes
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Custom Resources
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors flex items-center justify-between">
              <span>Clusters</span>
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded">AI</span>
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Metrics Explorer
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors">
              Comparison
            </button>
          </div>

          <div className="space-y-1 pt-4">
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>K8s Cost-Saving</span>
            </button>
            <button className="w-full py-2 px-3 text-left text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Plan & Usage</span>
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between text-sm">
            <button className="px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded text-xs font-medium flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Quickstart 0%</span>
            </button>
          </div>
          <div className="mt-3">
            <button className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center justify-between transition-colors">
              <span>akshay23</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-[#13131f] border-b border-slate-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button className="p-2 hover:bg-slate-800 rounded transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-white">Apps</h1>
              <div className="flex items-center space-x-2">
                <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center space-x-2 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  <span>Presets</span>
                </button>
                <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center space-x-2 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                  <span>Cluster</span>
                </button>
                <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center space-x-2 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span>Namespace</span>
                </button>
                <button className="px-3 py-1.5 bg-slate-700 text-white rounded text-sm">
                  Save
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button className="p-2 hover:bg-slate-800 rounded transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button className="p-2 hover:bg-slate-800 rounded transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button className="p-2 hover:bg-slate-800 rounded transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button className="p-2 hover:bg-slate-800 rounded transition-colors">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Stats Cards */}
        <div className="px-6 py-4 bg-[#0a0a0f]">
          <div className="grid grid-cols-5 gap-4">
            {stats.map((stat, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedView(stat.label.toLowerCase())}
                className={`p-4 bg-[#13131f] border-2 ${stat.active ? stat.color : 'border-slate-800'} rounded-lg hover:border-violet-500 transition-all text-left`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-3xl font-bold ${stat.value === '0' ? 'text-slate-600' : 'text-white'}`}>
                    {stat.value}
                  </span>
                  {stat.icon && (
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-sm text-slate-400">{stat.label}</span>
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#13131f]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center space-x-2 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span>Filters</span>
              </button>
              <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center space-x-2 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span>Kind</span>
              </button>
              <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center space-x-2 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Status</span>
              </button>
              <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center space-x-2 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span>Version</span>
              </button>
              <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 transition-colors">
                + More filters
              </button>
            </div>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type / to search"
                  className="w-64 pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
                <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Table Header & Content */}
        <div className="flex-1 overflow-auto bg-[#0a0a0f]">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-400">
                <span className="font-semibold text-white">0 Apps</span> Deployments, StatefulSets, DaemonSets and standalone Pods
              </div>
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 text-sm text-slate-400">
                  <input type="checkbox" className="w-4 h-4 bg-slate-800 border-slate-600 rounded text-violet-500 focus:ring-violet-500" />
                  <span>group by app</span>
                </label>
                <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm text-slate-300 flex items-center space-x-2 transition-colors">
                  <span>Export</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-[#13131f] border border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-[#1a1a2e] border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">App</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Cluster</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Namespace</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Kind</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Pods</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Last changed</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Version</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Mem</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">CPU</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Firing alerts</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan="11" className="px-6 py-16 text-center text-slate-500">
                      <svg className="w-16 h-16 mx-auto mb-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className="text-lg font-medium">No apps available</p>
                      <p className="text-sm mt-2">Connect your cluster to start monitoring your applications</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-end space-x-2 mt-4">
              <button className="p-2 hover:bg-slate-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button className="p-2 hover:bg-slate-800 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;

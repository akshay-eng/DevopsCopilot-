import React, { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import SettingsPanel from './SettingsPanel';

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (user?.full_name) {
      return user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.username) {
      return user.username.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const getUserDisplayName = () => {
    return user?.full_name || user?.username || user?.email || 'User';
  };

  return (
    <div className={`flex h-screen ${theme === 'dark' ? 'bg-[#0a0a0f] text-slate-200' : 'bg-gray-50 text-gray-900'}`}>
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-r flex flex-col transition-all duration-300 relative`}>
        {/* Toggle Button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`absolute -right-3 top-6 z-50 w-6 h-6 ${theme === 'dark' ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-full flex items-center justify-center transition-colors`}
        >
          <svg
            className={`w-4 h-4 ${theme === 'dark' ? 'text-white' : 'text-gray-700'} transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Logo */}
        <div className={`p-4 ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} border-b`}>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-600 rounded flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <span className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} whitespace-nowrap`}>AIOps</span>
            )}
          </div>
        </div>

        {/* Upgrade Banner */}
        {!sidebarCollapsed && (
          <div className={`p-4 ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} border-b`}>
            <button className="w-full py-2 px-4 bg-gradient-to-r from-purple-500 to-violet-600 rounded-lg text-white text-sm font-medium hover:from-purple-600 hover:to-violet-700 transition-all flex items-center justify-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <span>Upgrade to Pro</span>
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <div className="mb-6">
            <button
              onClick={() => navigate('/dashboard/holmesgpt')}
              className={`w-full py-2 px-3 text-left text-sm ${
                isActive('/dashboard/holmesgpt')
                  ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white'
                  : theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              } rounded transition-colors flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'}`}
              title={sidebarCollapsed ? 'Ask HolmesGPT' : ''}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {!sidebarCollapsed && <span>Ask HolmesGPT</span>}
            </button>
          </div>

          <div className="space-y-1">
            {!sidebarCollapsed && <div className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} uppercase tracking-wider mb-2`}>Alerts</div>}
            <button
              onClick={() => navigate('/dashboard/timeline')}
              className={`w-full py-2 px-3 text-left text-sm ${
                isActive('/dashboard/timeline')
                  ? theme === 'dark' ? 'text-white bg-violet-600/20 border-l-2 border-violet-500' : 'text-gray-900 bg-blue-50 border-l-2 border-blue-500'
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              } rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`}
              title={sidebarCollapsed ? 'Timeline' : ''}
            >
              {sidebarCollapsed ? '⏱' : 'Timeline'}
            </button>
            <button
              onClick={() => navigate('/dashboard/trends')}
              className={`w-full py-2 px-3 text-left text-sm ${
                isActive('/dashboard/trends')
                  ? theme === 'dark' ? 'text-white bg-violet-600/20 border-l-2 border-violet-500' : 'text-gray-900 bg-blue-50 border-l-2 border-blue-500'
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              } rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`}
              title={sidebarCollapsed ? 'Trends' : ''}
            >
              {sidebarCollapsed ? '📈' : 'Trends'}
            </button>
            <button className={`w-full py-2 px-3 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`} title={sidebarCollapsed ? 'Report' : ''}>
              {sidebarCollapsed ? '📊' : 'Report'}
            </button>
            <button
              onClick={() => navigate('/dashboard/managed-alerts')}
              className={`w-full py-2 px-3 text-left text-sm ${
                isActive('/dashboard/managed-alerts')
                  ? theme === 'dark' ? 'text-white bg-violet-600/20 border-l-2 border-violet-500' : 'text-gray-900 bg-blue-50 border-l-2 border-blue-500'
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              } rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`}
              title={sidebarCollapsed ? 'Managed Alerts' : ''}
            >
              {sidebarCollapsed ? '🔔' : 'Managed Alerts'}
            </button>
            <button className={`w-full py-2 px-3 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`} title={sidebarCollapsed ? 'Silences' : ''}>
              {sidebarCollapsed ? '🔕' : 'Silences'}
            </button>
          </div>

          <div className="space-y-1 pt-4">
            {!sidebarCollapsed && (
              <div className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} uppercase tracking-wider mb-2 flex items-center justify-between`}>
                <span>Kubernetes</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            )}
            <button
              onClick={() => navigate('/dashboard')}
              className={`w-full py-2 px-3 text-left text-sm ${
                isActive('/dashboard')
                  ? theme === 'dark' ? 'text-white bg-violet-600/20 border-l-2 border-violet-500' : 'text-gray-900 bg-blue-50 border-l-2 border-blue-500'
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              } rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`}
              title={sidebarCollapsed ? 'Apps' : ''}
            >
              {sidebarCollapsed ? '📱' : 'Apps'}
            </button>
            <button className={`w-full py-2 px-3 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`} title={sidebarCollapsed ? 'Jobs' : ''}>
              {sidebarCollapsed ? '⚙️' : 'Jobs'}
            </button>
            <button
              onClick={() => navigate('/dashboard/nodes')}
              className={`w-full py-2 px-3 text-left text-sm ${
                isActive('/dashboard/nodes')
                  ? theme === 'dark' ? 'text-white bg-violet-600/20 border-l-2 border-violet-500' : 'text-gray-900 bg-blue-50 border-l-2 border-blue-500'
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              } rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`}
              title={sidebarCollapsed ? 'Nodes' : ''}
            >
              {sidebarCollapsed ? '🖥' : 'Nodes'}
            </button>
            <button
              onClick={() => navigate('/dashboard/service-dependency')}
              className={`w-full py-2 px-3 text-left text-sm ${
                isActive('/dashboard/service-dependency')
                  ? theme === 'dark' ? 'text-white bg-violet-600/20 border-l-2 border-violet-500' : 'text-gray-900 bg-blue-50 border-l-2 border-blue-500'
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              } rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`}
              title={sidebarCollapsed ? 'Service Dependency' : ''}
            >
              {sidebarCollapsed ? '🔗' : 'Service Dependency'}
            </button>
            <button className={`w-full py-2 px-3 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`} title={sidebarCollapsed ? 'Custom Resources' : ''}>
              {sidebarCollapsed ? '📦' : 'Custom Resources'}
            </button>
            <button className={`w-full py-2 px-3 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} rounded transition-colors flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`} title={sidebarCollapsed ? 'Clusters' : ''}>
              {sidebarCollapsed ? '☸' : (
                <>
                  <span>Clusters</span>
                  <span className="px-1.5 py-0.5 bg-red-500 text-white text-xs rounded">AI</span>
                </>
              )}
            </button>
            <button className={`w-full py-2 px-3 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`} title={sidebarCollapsed ? 'Metrics Explorer' : ''}>
              {sidebarCollapsed ? '📊' : 'Metrics Explorer'}
            </button>
            <button
              onClick={() => navigate('/dashboard/comparison')}
              className={`w-full py-2 px-3 text-left text-sm ${
                isActive('/dashboard/comparison')
                  ? theme === 'dark' ? 'text-white bg-violet-600/20 border-l-2 border-violet-500' : 'text-gray-900 bg-blue-50 border-l-2 border-blue-500'
                  : theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
              } rounded transition-colors ${sidebarCollapsed ? 'flex justify-center' : ''}`}
              title={sidebarCollapsed ? 'Comparison' : ''}
            >
              {sidebarCollapsed ? '⚖' : 'Comparison'}
            </button>
          </div>

          <div className="space-y-1 pt-4">
            <button className={`w-full py-2 px-3 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} rounded transition-colors flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-2'}`} title={sidebarCollapsed ? 'K8s Cost-Saving' : ''}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {!sidebarCollapsed && <span>K8s Cost-Saving</span>}
            </button>
            <button className={`w-full py-2 px-3 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} rounded transition-colors flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-2'}`} title={sidebarCollapsed ? 'Plan & Usage' : ''}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {!sidebarCollapsed && <span>Plan & Usage</span>}
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className={`p-4 ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} border-t`}>
          {!sidebarCollapsed && (
            <div className="flex items-center justify-between text-sm mb-3">
              <button className="px-3 py-2 bg-purple-500/10 text-purple-400 rounded text-xs font-medium flex items-center space-x-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Quickstart 0%</span>
              </button>
            </div>
          )}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={`w-full py-2 px-3 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} transition-colors`}
              title={sidebarCollapsed ? getUserDisplayName() : ''}
            >
              {sidebarCollapsed ? (
                user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt="Avatar"
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 bg-violet-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {getUserInitials()}
                  </div>
                )
              ) : (
                <>
                  <div className="flex items-center space-x-2">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt="Avatar"
                        className="w-6 h-6 rounded-full"
                      />
                    ) : (
                      <div className="w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {getUserInitials()}
                      </div>
                    )}
                    <span className="truncate">{getUserDisplayName()}</span>
                  </div>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>

            {/* User Dropdown Menu */}
            {showUserMenu && !sidebarCollapsed && (
              <div className={`absolute bottom-full left-0 w-full mb-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} border rounded-lg shadow-lg overflow-hidden`}>
                <div className={`p-3 ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'} border-b`}>
                  <p className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    {getUserDisplayName()}
                  </p>
                  <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} truncate`}>
                    {user?.email}
                  </p>
                  {user?.oauth_provider && (
                    <p className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} mt-1`}>
                      Signed in with {user.oauth_provider}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowSettings(true)}
                  className={`w-full px-3 py-2 text-left text-sm ${theme === 'dark' ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-100'} flex items-center space-x-2 transition-colors`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Settings</span>
                </button>
                <button
                  onClick={handleLogout}
                  className={`w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center space-x-2 transition-colors`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-4 flex items-center justify-end space-x-3`}>
          <button className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}>
            <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}>
            <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}
          >
            <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}>
            <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>

        {/* Page Content */}
        <Outlet />
      </div>

      {/* Settings Panel */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
};

export default DashboardLayout;

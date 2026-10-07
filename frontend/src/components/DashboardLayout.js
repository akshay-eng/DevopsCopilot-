import React, { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../redux/slices/authSlice';
import { useTheme } from '../context/ThemeContext';
import SettingsPanel from './SettingsPanel';
import FloatingChat from './FloatingChat';
import {
  Sparkles, Activity, TrendingUp, FileText, BellRing, BellOff, Waypoints,
  LayoutGrid, Briefcase, Server, Share2, Boxes, BarChart3, ArrowLeftRight,
  Layers, GitBranch, LineChart, Bot, FolderKanban, Settings as SettingsIcon,
  BookOpen, Grid3x3, PiggyBank, Gauge, Blocks, Workflow, ChevronDown, ChevronLeft,
} from 'lucide-react';

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const { user } = useSelector(state => state.auth);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFloatingChat, setShowFloatingChat] = useState(false);
  const [aiWorkloadsExpanded, setAiWorkloadsExpanded] = useState(true);

  const isActive = (path) => location.pathname === path;

  const handleLogout = async () => {
    await dispatch(logout());
    navigate('/login');
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (user?.name) {
      return user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const getUserDisplayName = () => {
    return user?.name || user?.email || 'User';
  };

  // ── Data-driven navigation (Robusta-style: line icon + label, green active) ──
  const navSections = [
    {
      title: 'Alerts',
      items: [
        { label: 'Timeline', path: '/dashboard/timeline', icon: Activity },
        { label: 'Trends', path: '/dashboard/trends', icon: TrendingUp },
        { label: 'SOPs & Reports', path: '/dashboard/report', icon: FileText },
        { label: 'Managed Alerts', path: '/dashboard/managed-alerts', icon: BellRing },
        { label: 'Silences', icon: BellOff },
        { label: 'Correlation', path: '/dashboard/correlation', icon: Waypoints, badge: { text: 'ML', tone: 'green' } },
        { label: 'Agent Threads', path: '/dashboard/agent-threads', icon: Activity, badge: { text: 'LIVE', tone: 'blue' } },
      ],
    },
    {
      title: 'Kubernetes',
      items: [
        { label: 'Apps', path: '/dashboard', icon: LayoutGrid },
        { label: 'Jobs', icon: Briefcase },
        { label: 'Nodes', path: '/dashboard/nodes', icon: Server },
        { label: 'Service Dependency', path: '/dashboard/service-dependency', icon: Share2 },
        { label: 'Custom Resources', icon: Boxes },
        { label: 'Clusters', path: '/dashboard/clusters', icon: Grid3x3, badge: { text: 'AI', tone: 'amber' }, matchPrefix: '/dashboard/clusters/' },
        { label: 'Metrics Explorer', icon: BarChart3 },
        { label: 'Comparison', path: '/dashboard/comparison', icon: ArrowLeftRight },
      ],
    },
    {
      title: 'AI Workloads',
      badge: { text: 'NEW', tone: 'green' },
      collapsible: true,
      items: [
        { label: 'Sessions', path: '/dashboard/ai-workloads/sessions', icon: Layers },
        { label: 'Traces', path: '/dashboard/ai-workloads/traces', icon: GitBranch },
        { label: 'Analytics', path: '/dashboard/ai-workloads/analytics', icon: LineChart },
        { label: 'Agents', path: '/dashboard/ai-workloads/agents', icon: Bot },
        { label: 'Projects', path: '/dashboard/ai-workloads/projects', icon: FolderKanban },
        { label: 'Settings', path: '/dashboard/ai-workloads/settings', icon: SettingsIcon },
        { label: 'Docs', path: '/dashboard/ai-workloads/docs', icon: BookOpen },
        { label: 'MCP Catalog', path: '/dashboard/ai-workloads/mcp-catalog', icon: Grid3x3 },
      ],
    },
    {
      items: [
        { label: 'K8s Cost-Saving', path: '/dashboard/cost', icon: PiggyBank },
        { label: 'Plan & Usage', icon: Gauge },
        { label: 'Integrations', path: '/dashboard/integrations', icon: Blocks },
        { label: 'Pipelines', path: '/dashboard/pipelines', icon: Workflow },
      ],
    },
  ];

  const badgeClass = (tone) => tone === 'amber'
    ? (theme === 'dark' ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')
    : (theme === 'dark' ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700');

  const renderNavItem = (item) => {
    const active = item.path && (isActive(item.path) || (item.matchPrefix && location.pathname.startsWith(item.matchPrefix)));
    const Icon = item.icon;
    return (
      <button
        key={item.label}
        onClick={() => item.path && navigate(item.path)}
        title={sidebarCollapsed ? item.label : ''}
        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} px-2.5 py-[7px] rounded-lg text-[13px] transition-colors ${
          active
            ? (theme === 'dark' ? 'bg-blue-500/10 text-blue-400 font-medium' : 'bg-blue-50 text-blue-700 font-medium')
            : (theme === 'dark' ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100')
        }`}
      >
        <Icon size={17} strokeWidth={1.9} className="flex-shrink-0" />
        {!sidebarCollapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
        {!sidebarCollapsed && item.badge && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeClass(item.badge.tone)}`}>{item.badge.text}</span>
        )}
      </button>
    );
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

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto no-scrollbar space-y-0.5">
          {/* Ask HolmesGPT — highlighted entry */}
          <button
            onClick={() => navigate('/dashboard/holmesgpt')}
            title={sidebarCollapsed ? 'Ask HolmesGPT' : ''}
            className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-2.5'} px-2.5 py-[7px] mb-1 rounded-lg text-[13px] font-medium transition-colors ${
              isActive('/dashboard/holmesgpt')
                ? (theme === 'dark' ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700')
                : (theme === 'dark' ? 'text-slate-300 hover:text-white hover:bg-slate-800/60' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100')
            }`}
          >
            <Sparkles size={17} strokeWidth={1.9} className="flex-shrink-0 text-blue-500" />
            {!sidebarCollapsed && <span className="flex-1 text-left">Ask HolmesGPT</span>}
          </button>

          {navSections.map((sec, si) => {
            const secCollapsed = sec.collapsible && !aiWorkloadsExpanded;
            return (
              <div key={si} className="pt-3">
                {!sidebarCollapsed && (sec.title ? (
                  <div
                    className={`flex items-center justify-between px-2.5 mb-1 ${sec.collapsible ? 'cursor-pointer select-none' : ''}`}
                    onClick={sec.collapsible ? () => setAiWorkloadsExpanded(v => !v) : undefined}
                  >
                    <span className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>
                      {sec.title}
                      {sec.badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeClass(sec.badge.tone)}`}>{sec.badge.text}</span>}
                    </span>
                    {sec.collapsible && <ChevronDown size={14} className={`${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} transition-transform ${aiWorkloadsExpanded ? '' : '-rotate-90'}`} />}
                  </div>
                ) : <div className="mb-1" />)}
                {!secCollapsed && sec.items.map(renderNavItem)}
              </div>
            );
          })}
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
          {/* HolmesGPT Chat Button */}
          <button
            onClick={() => setShowFloatingChat(true)}
            className={`p-2 relative rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-800 bg-purple-500/10' : 'hover:bg-gray-100 bg-purple-50'
              }`}
            title="Ask HolmesGPT"
          >
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
          </button>

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
            onClick={() => navigate('/dashboard/settings')}
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

      {/* Floating Chat */}
      <FloatingChat isOpen={showFloatingChat} onClose={() => setShowFloatingChat(false)} />
    </div>
  );
};

export default DashboardLayout;

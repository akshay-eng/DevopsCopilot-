import React from 'react';
import { useTheme } from '../context/ThemeContext';

const SettingsPanel = ({ isOpen, onClose }) => {
  const { theme, toggleTheme } = useTheme();

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      ></div>

      {/* Settings Panel */}
      <div className={`fixed right-0 top-0 h-full w-96 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-l z-50 shadow-2xl transform transition-transform duration-300`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} border-b`}>
          <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Settings</h2>
          <button
            onClick={onClose}
            className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-600'} rounded transition-colors`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Appearance Section */}
          <div>
            <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'} mb-4 uppercase tracking-wider`}>
              Appearance
            </h3>

            {/* Theme Toggle */}
            <div className={`${theme === 'dark' ? 'bg-[#1a1a2e] border-slate-700' : 'bg-gray-50 border-gray-200'} border rounded-lg p-4`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-1`}>Theme</h4>
                  <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                    Choose your preferred theme
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => theme === 'light' ? null : toggleTheme()}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    theme === 'light'
                      ? 'border-violet-500 bg-violet-500/10'
                      : theme === 'dark'
                      ? 'border-slate-700 hover:border-slate-600 bg-[#0a0a0f]'
                      : 'border-gray-300 hover:border-gray-400 bg-white'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <svg className={`w-8 h-8 ${theme === 'light' ? 'text-violet-500' : theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span className={`text-sm font-medium ${theme === 'light' ? 'text-violet-500' : theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                      Light
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => theme === 'dark' ? null : toggleTheme()}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    theme === 'dark'
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-gray-300 hover:border-gray-400 bg-white'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <svg className={`w-8 h-8 ${theme === 'dark' ? 'text-violet-500' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    <span className={`text-sm font-medium ${theme === 'dark' ? 'text-violet-500' : 'text-gray-700'}`}>
                      Dark
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Additional Settings */}
          <div>
            <h3 className={`text-sm font-semibold ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'} mb-4 uppercase tracking-wider`}>
              General
            </h3>

            <div className="space-y-3">
              <div className={`flex items-center justify-between p-4 ${theme === 'dark' ? 'bg-[#1a1a2e] border-slate-700' : 'bg-gray-50 border-gray-200'} border rounded-lg`}>
                <div>
                  <h4 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-sm`}>Notifications</h4>
                  <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mt-0.5`}>Enable push notifications</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className={`w-11 h-6 ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-300'} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-violet-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600`}></div>
                </label>
              </div>

              <div className={`flex items-center justify-between p-4 ${theme === 'dark' ? 'bg-[#1a1a2e] border-slate-700' : 'bg-gray-50 border-gray-200'} border rounded-lg`}>
                <div>
                  <h4 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-sm`}>Auto-refresh</h4>
                  <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mt-0.5`}>Automatically refresh data</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className={`w-11 h-6 ${theme === 'dark' ? 'bg-slate-700' : 'bg-gray-300'} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-violet-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600`}></div>
                </label>
              </div>
            </div>
          </div>

          {/* About Section */}
          <div className={`${theme === 'dark' ? 'bg-[#1a1a2e] border-slate-700' : 'bg-gray-50 border-gray-200'} border rounded-lg p-4`}>
            <h4 className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-3`}>About</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Version</span>
                <span className={theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}>1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Build</span>
                <span className={theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}>2025.01.07</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsPanel;

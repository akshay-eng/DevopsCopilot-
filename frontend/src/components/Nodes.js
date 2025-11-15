import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const Nodes = () => {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [selectedCluster, setSelectedCluster] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [timeRange, setTimeRange] = useState('Last 6 hrs');

  // Mock data - empty for now showing "0 Nodes" state
  const nodes = [];

  const handleExport = (format) => {
    console.log(`Exporting as ${format}`);
    setShowExportMenu(false);
  };

  return (
    <div className={`h-full ${theme === 'dark' ? 'bg-[#0a0a0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Filters and Search Bar */}
      <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} border-b ${theme === 'dark' ? 'border-gray-800' : 'border-gray-200'} p-4`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            {/* Presets Dropdown */}
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${
                theme === 'dark'
                  ? 'bg-[#1a1a2e] border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-purple-500`}
            >
              <option value="">Presets</option>
              <option value="high-cpu">High CPU Usage</option>
              <option value="high-memory">High Memory Usage</option>
              <option value="critical-alerts">Critical Alerts</option>
              <option value="unhealthy">Unhealthy Nodes</option>
            </select>

            {/* Cluster Dropdown */}
            <select
              value={selectedCluster}
              onChange={(e) => setSelectedCluster(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${
                theme === 'dark'
                  ? 'bg-[#1a1a2e] border-gray-700 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } focus:outline-none focus:ring-2 focus:ring-purple-500`}
            >
              <option value="">Cluster</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>

            {/* Save Button */}
            <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors">
              Save
            </button>

            {/* Search Bar */}
            <div className="flex-1 relative">
              <svg className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Type / to search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  theme === 'dark'
                    ? 'bg-[#1a1a2e] border-gray-700 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>
          </div>

          {/* Export Button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Export Dropdown Menu */}
            {showExportMenu && (
              <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg ${
                theme === 'dark' ? 'bg-[#1a1a2e] border border-gray-700' : 'bg-white border border-gray-200'
              } z-10`}>
                <div className="py-1">
                  <button
                    onClick={() => handleExport('csv')}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}
                  >
                    Export as CSV
                  </button>
                  <button
                    onClick={() => handleExport('json')}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className={`w-full text-left px-4 py-2 text-sm ${
                      theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
                    }`}
                  >
                    Export as PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Table or Empty State */}
      <div className="p-6">
        {nodes.length === 0 ? (
          // Empty State
          <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg border ${
            theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
          } p-12`}>
            <div className="text-center">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${
                theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
              } mb-4`}>
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <h3 className={`text-xl font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                0 Nodes
              </h3>
              <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                No nodes
              </p>
            </div>
          </div>
        ) : (
          // Table View (will show when nodes data is available)
          <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg border ${
            theme === 'dark' ? 'border-gray-800' : 'border-gray-200'
          } overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className={theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}>
                  <tr>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Name
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Cluster
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Age
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Status
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Metadata
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Internal IP
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      External IP
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Pods
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Taints
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Memory (%)
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Memory
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      CPU (%)
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      CPU
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Firing alerts
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-medium ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    } uppercase tracking-wider`}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className={`${theme === 'dark' ? 'divide-gray-800' : 'divide-gray-200'} divide-y`}>
                  {nodes.map((node, index) => (
                    <tr key={index} className={theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">{node.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.cluster}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.age}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          node.status === 'Ready'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {node.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.metadata}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.internalIp}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.externalIp}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.pods}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.taints}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.memoryPercent}%</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.memory}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.cpuPercent}%</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.cpu}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{node.firingAlerts}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <button className="text-purple-500 hover:text-purple-600">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Nodes;

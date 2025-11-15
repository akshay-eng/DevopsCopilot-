import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const ManagedAlerts = () => {
  const { theme } = useTheme();
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showNewAlertModal, setShowNewAlertModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Recommended alert templates
  const recommendedAlerts = [
    {
      id: 1,
      name: 'KubeJobFailed',
      description: 'Job failed to complete.',
      category: 'Application Health',
      badge: 'Recommended'
    },
    {
      id: 2,
      name: 'KubePersistentVolumeFillingUp',
      description: 'PersistentVolume is filling up.',
      severity: 'critical',
      category: 'Storage',
      badge: 'Recommended'
    },
    {
      id: 3,
      name: 'KubePodCrashLooping',
      description: 'Pod is crash looping.',
      category: 'Application Health',
      badge: 'Recommended'
    },
    {
      id: 4,
      name: 'KubePodNotReady',
      description: 'Pod has been in a non-ready state for more than 15 minutes.',
      category: 'Application Health',
      badge: 'Recommended'
    }
  ];

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setShowNewAlertModal(true);
  };

  return (
    <div className={`flex-1 overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Info Banner */}
      <div className={`sticky top-0 z-10 ${theme === 'dark' ? 'bg-[#0a0a0f] border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
        <div className={`${theme === 'dark' ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'} border rounded-lg px-4 py-3 flex items-start justify-between`}>
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div>
              <p className={`text-sm ${theme === 'dark' ? 'text-blue-300' : 'text-blue-800'}`}>
                Tip: You can now create log-based alerts.{' '}
                <a href="#" className="text-blue-500 hover:text-blue-600 underline">
                  Learn More
                </a>
              </p>
            </div>
          </div>
          <button className={`${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* Empty State */}
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mb-8">
            <svg className="w-64 h-64" viewBox="0 0 400 300" fill="none">
              {/* Illustration of person with computer */}
              <rect x="80" y="120" width="180" height="120" rx="8" fill={theme === 'dark' ? '#1e293b' : '#e2e8f0'} />
              <rect x="90" y="130" width="160" height="90" rx="4" fill={theme === 'dark' ? '#0f172a' : '#f8fafc'} />
              <line x1="100" y1="145" x2="140" y2="145" stroke={theme === 'dark' ? '#3b82f6' : '#60a5fa'} strokeWidth="3" />
              <line x1="100" y1="160" x2="180" y2="160" stroke={theme === 'dark' ? '#3b82f6' : '#60a5fa'} strokeWidth="3" />
              <line x1="100" y1="175" x2="160" y2="175" stroke={theme === 'dark' ? '#3b82f6' : '#60a5fa'} strokeWidth="3" />

              {/* Chart icon */}
              <polyline points="200,170 215,160 230,165 245,150" stroke={theme === 'dark' ? '#10b981' : '#34d399'} strokeWidth="2" fill="none" />
              <circle cx="200" cy="170" r="3" fill={theme === 'dark' ? '#10b981' : '#34d399'} />
              <circle cx="215" cy="160" r="3" fill={theme === 'dark' ? '#10b981' : '#34d399'} />
              <circle cx="230" cy="165" r="3" fill={theme === 'dark' ? '#10b981' : '#34d399'} />
              <circle cx="245" cy="150" r="3" fill={theme === 'dark' ? '#10b981' : '#34d399'} />

              {/* Person */}
              <circle cx="320" cy="140" r="20" fill={theme === 'dark' ? '#818cf8' : '#a5b4fc'} />
              <path d="M 300 180 Q 320 165 340 180 L 340 220 Q 340 230 330 230 L 310 230 Q 300 230 300 220 Z" fill={theme === 'dark' ? '#34d399' : '#6ee7b7'} />
              <rect x="295" y="180" width="15" height="50" rx="7" fill={theme === 'dark' ? '#fbbf24' : '#fcd34d'} />
              <rect x="330" y="180" width="15" height="50" rx="7" fill={theme === 'dark' ? '#fbbf24' : '#fcd34d'} />
            </svg>
          </div>

          <h2 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Monitor your namespaces with Prometheus Alerts
          </h2>

          <button
            onClick={() => setShowTemplateModal(true)}
            className="mt-6 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-semibold flex items-center space-x-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New From Template</span>
          </button>
        </div>

        {/* Recommended Alerts Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Recommended Alerts
              </h3>
              <button className={`p-1 ${theme === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'} rounded`}>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            <button className="text-blue-500 hover:text-blue-600 text-sm flex items-center space-x-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Recommend alerts to your team</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {recommendedAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800 hover:border-slate-700' : 'bg-white border-gray-200 hover:border-gray-300'} border rounded-lg p-4 transition-all hover:shadow-lg`}
              >
                <div className="mb-3">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-sm`}>
                      {alert.name}
                    </h4>
                    {alert.severity === 'critical' && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                        critical
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-3`}>
                    {alert.description}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col space-y-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                      {alert.badge}
                    </span>
                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                      {alert.category}
                    </span>
                  </div>
                  <button
                    onClick={() => handleSelectTemplate(alert)}
                    className="px-4 py-1.5 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors"
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alert Templates Modal */}
      {showTemplateModal && (
        <AlertTemplatesModal
          theme={theme}
          onClose={() => setShowTemplateModal(false)}
          onSelectTemplate={(template) => {
            setSelectedTemplate(template);
            setShowTemplateModal(false);
            setShowNewAlertModal(true);
          }}
        />
      )}

      {/* New Alert From Template Modal */}
      {showNewAlertModal && (
        <NewAlertModal
          theme={theme}
          template={selectedTemplate}
          onClose={() => {
            setShowNewAlertModal(false);
            setSelectedTemplate(null);
          }}
        />
      )}
    </div>
  );
};

// Alert Templates Modal Component
const AlertTemplatesModal = ({ theme, onClose, onSelectTemplate }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Alerts');

  const categories = [
    { name: 'All Alerts', count: 133 },
    { name: 'Custom Alerts', count: 0 },
    { name: 'Application Health', count: 18 },
    { name: 'Control Plane', count: 28 },
    { name: 'Info', count: 2 },
    { name: 'Node/Cluster Health', count: 17 },
    { name: 'Prometheus Health', count: 46 },
    { name: 'Resource Usage', count: 7 },
    { name: 'Storage', count: 15 }
  ];

  const templates = [
    {
      name: 'AlertmanagerClusterCrashlooping',
      description: 'Half or more of the Alertmanager instances within the same cluster are crashlooping.',
      category: 'Prometheus Health'
    },
    {
      name: 'AlertmanagerClusterDown',
      description: 'Half or more of the Alertmanager instances within the same cluster are down.',
      category: 'Prometheus Health'
    },
    {
      name: 'AlertmanagerClusterFailedToSendAlerts',
      description: 'All Alertmanager instances in a cluster failed to send notifications to a critical integration.',
      category: 'Prometheus Health'
    },
    {
      name: 'AlertmanagerClusterFailedToSendAlerts',
      description: 'All Alertmanager instances in a cluster failed to send notifications to a non-critical integration.',
      category: 'Prometheus Health'
    },
    {
      name: 'AlertmanagerConfigInconsistent',
      description: 'Alertmanager instances within the same cluster have different configurations.',
      category: 'Prometheus Health'
    },
    {
      name: 'AlertmanagerFailedReload',
      description: 'Reloading an Alertmanager configuration has failed.',
      category: 'Prometheus Health'
    },
    {
      name: 'AlertmanagerFailedToSendAlerts',
      description: 'An Alertmanager instance failed to send notifications.',
      category: 'Prometheus Health'
    },
    {
      name: 'AlertmanagerMembersInconsistent',
      description: 'A member of an Alertmanager cluster has not found all other cluster members.',
      category: 'Prometheus Health'
    },
    {
      name: 'ConfigReloaderSidecarErrors',
      description: 'config-reloader sidecar has not had a successful reload for 10m',
      category: 'Prometheus Health'
    },
    {
      name: 'CPUThrottlingHigh',
      description: 'Processes experience elevated CPU throttling.',
      category: 'Application Health'
    },
    {
      name: 'etcdDatabaseHighFragmentation',
      description: 'etcd database size in use is less than 50% of the actual allocated storage.',
      category: 'Control Plane'
    },
    {
      name: 'etcdDatabaseQuotaLowSpace',
      description: 'etcd cluster database is running full.',
      category: 'Control Plane'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col`}>
        {/* Modal Header */}
        <div className={`flex items-center justify-between px-6 py-4 ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} border-b`}>
          <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Alert Templates
          </h2>
          <button
            onClick={onClose}
            className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search and Actions */}
        <div className={`px-6 py-4 ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} border-b`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Can't find what you are looking for?{' '}
              <button className="text-blue-500 hover:text-blue-600">
                Add your own template
              </button>
            </p>
            <div className="flex items-center space-x-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type / to search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`pl-10 pr-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-64`}
                />
                <svg className={`absolute left-3 top-2.5 w-5 h-5 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors">
                Add Template
              </button>
            </div>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Categories Sidebar */}
          <div className={`w-64 ${theme === 'dark' ? 'bg-[#0a0a0f] border-slate-800' : 'bg-gray-50 border-gray-200'} border-r p-4 overflow-y-auto`}>
            <div className="space-y-1">
              {categories.map((category) => (
                <button
                  key={category.name}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                    selectedCategory === category.name
                      ? theme === 'dark'
                        ? 'bg-violet-600/20 text-white'
                        : 'bg-blue-50 text-gray-900'
                      : theme === 'dark'
                      ? 'text-gray-300 hover:bg-slate-800'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{category.name}</span>
                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                      ({category.count})
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Templates Grid */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template, index) => (
                <div
                  key={index}
                  className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-4`}
                >
                  <h4 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} text-sm mb-2`}>
                    {template.name}
                  </h4>
                  <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-3`}>
                    {template.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                      {template.category}
                    </span>
                    <button
                      onClick={() => onSelectTemplate(template)}
                      className="px-3 py-1 text-xs bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors"
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// New Alert Modal Component
const NewAlertModal = ({ theme, template, onClose }) => {
  const [formData, setFormData] = useState({
    clusterScope: 'all',
    namespaceScope: 'all',
    duration: '5',
    durationUnit: 'minutes',
    severity: 'Critical',
    job: '*alertmanager',
    restartThreshold: '4',
    crashloopingRatio: '0.5'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto`}>
        {/* Modal Header */}
        <div className={`sticky top-0 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-4 z-10`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              New alert from template
            </h2>
            <button
              onClick={onClose}
              className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-4`}>
            {template?.name || 'AlertmanagerClusterCrashlooping'}
          </h3>

          {/* Alert Summary */}
          <div className="mb-6">
            <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
              Alert summary
            </label>
            <input
              type="text"
              defaultValue="Half or more of the Alertmanager instances within the same cluster are crashlooping."
              className={`w-full px-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          {/* Alert Description */}
          <div className="mb-6">
            <label className={`block text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
              Alert description
            </label>
            <textarea
              rows={3}
              defaultValue="{{ $value | humanizePercentage }} of Alertmanager instances within the {{$labels.job}} cluster have restarted at least 5 times in the last 10m."
              className={`w-full px-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          {/* 1. Set up scope */}
          <div className="mb-6">
            <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-3`}>
              1. Set up scope
            </h4>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input type="radio" name="cluster" defaultChecked className="text-blue-500" />
                  <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>All Clusters</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="radio" name="cluster" className="text-blue-500" />
                  <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Specific</span>
                </label>
                <select className={`flex-1 px-3 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg text-sm`}>
                  <option>Select Clusters</option>
                </select>
              </div>
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input type="radio" name="namespace" defaultChecked className="text-blue-500" />
                  <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>All Namespaces</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="radio" name="namespace" className="text-blue-500" />
                  <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Specific</span>
                </label>
                <select className={`flex-1 px-3 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg text-sm`}>
                  <option>Select Namespaces</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Define time */}
          <div className="mb-6">
            <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-3`}>
              2. Define time
            </h4>
            <div className="flex items-center space-x-3">
              <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Condition is true for at least
              </span>
              <input
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className={`w-20 px-3 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg text-sm`}
              />
              <select
                value={formData.durationUnit}
                onChange={(e) => setFormData({ ...formData, durationUnit: e.target.value })}
                className={`px-3 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg text-sm`}
              >
                <option>minutes</option>
                <option>hours</option>
                <option>days</option>
              </select>
            </div>
          </div>

          {/* 3. Choose priority */}
          <div className="mb-6">
            <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-3`}>
              3. Choose priority
            </h4>
            <div className="flex items-center space-x-3">
              <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                Severity Level
              </span>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                className={`px-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg text-sm`}
              >
                <option className="text-red-600">Critical</option>
                <option className="text-yellow-600">Warning</option>
                <option className="text-blue-600">Info</option>
              </select>
            </div>
          </div>

          {/* 4. Configure template variables */}
          <div className="mb-6">
            <h4 className={`text-sm font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'} mb-3`}>
              4. Configure template variables
            </h4>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} w-48`}>
                  Job
                </label>
                <input
                  type="text"
                  value={formData.job}
                  onChange={(e) => setFormData({ ...formData, job: e.target.value })}
                  className={`flex-1 px-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg text-sm`}
                />
              </div>
              <div className="flex items-center space-x-3">
                <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} w-48`}>
                  Restart Threshold
                </label>
                <input
                  type="number"
                  value={formData.restartThreshold}
                  onChange={(e) => setFormData({ ...formData, restartThreshold: e.target.value })}
                  className={`flex-1 px-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg text-sm`}
                />
              </div>
              <div className="flex items-center space-x-3">
                <label className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} w-48`}>
                  Cluster Crashlooping Ratio
                </label>
                <input
                  type="text"
                  value={formData.crashloopingRatio}
                  onChange={(e) => setFormData({ ...formData, crashloopingRatio: e.target.value })}
                  className={`flex-1 px-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border rounded-lg text-sm`}
                />
              </div>
            </div>

            <button className={`mt-4 text-sm ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'} hover:underline flex items-center space-x-1`}>
              <span>See PromQL</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={`sticky bottom-0 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-t px-6 py-4 flex items-center justify-between`}>
          <div className="flex items-center space-x-4">
            <button
              onClick={onClose}
              className={`px-4 py-2 ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-gray-900'} transition-colors`}
            >
              Cancel
            </button>
            <button className="text-blue-500 hover:text-blue-600 flex items-center space-x-1">
              <span>Using External Prometheus?</span>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <button className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors">
            Create new alert
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManagedAlerts;

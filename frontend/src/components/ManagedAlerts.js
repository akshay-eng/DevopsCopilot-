import React, { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getClusters, getNamespaces } from '../services/api';
import { alertCatalog, alertCategories, severityLevels } from '../config/alertCatalog';
import { backendApi } from '../services/api';

const ManagedAlerts = () => {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [namespaces, setNamespaces] = useState([]);
  const [formData, setFormData] = useState({
    cluster: '',
    namespace: 'all',
    severity: 'warning',
    variables: {}
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Fetch clusters on mount
  useEffect(() => {
    const fetchClusters = async () => {
      try {
        const clustersData = await getClusters();
        setClusters(clustersData.clusters || []);

        if (clustersData.clusters && clustersData.clusters.length > 0) {
          setSelectedCluster(clustersData.clusters[0]);
          setFormData(prev => ({ ...prev, cluster: clustersData.clusters[0].id }));
        }
      } catch (err) {
        console.error('Failed to fetch clusters:', err);
      }
    };

    fetchClusters();
  }, []);

  // Fetch namespaces when cluster changes
  useEffect(() => {
    if (!selectedCluster) return;

    const fetchNamespacesData = async () => {
      try {
        const namespacesData = await getNamespaces(selectedCluster.id);
        const namespaceNames = namespacesData.items?.map(ns => ns.name) || [];
        setNamespaces(['all', ...namespaceNames]);
      } catch (err) {
        console.error('Failed to fetch namespaces:', err);
      }
    };

    fetchNamespacesData();
  }, [selectedCluster]);

  const filteredAlerts = selectedCategory === 'all'
    ? alertCatalog
    : alertCatalog.filter(alert => alert.category === selectedCategory);

  const handleAlertSelect = (alert) => {
    setSelectedAlert(alert);
    setShowCreatePanel(true);
    setError(null);
    setSuccess(null);

    // Initialize variables with defaults
    const variables = {};
    alert.variables.forEach(variable => {
      variables[variable.name] = variable.default;
    });

    setFormData(prev => ({
      ...prev,
      severity: alert.severity,
      variables
    }));
  };

  const handleClusterChange = (clusterId) => {
    const cluster = clusters.find(c => c.id === clusterId);
    setSelectedCluster(cluster);
    setFormData(prev => ({ ...prev, cluster: clusterId, namespace: 'all' }));
  };

  const handleVariableChange = (varName, value) => {
    setFormData(prev => ({
      ...prev,
      variables: {
        ...prev.variables,
        [varName]: value
      }
    }));
  };

  const handleCreateAlert = async () => {
    if (!selectedAlert || !selectedCluster) return;

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      // Generate the PromQL expression
      const expr = selectedAlert.promql(formData.variables, selectedCluster.name, formData.namespace);
      const annotations = selectedAlert.annotations(formData.variables);

      // Get duration from variables (default to 5m if not present)
      const duration = formData.variables.duration || 5;

      // Create alert payload
      const alertPayload = {
        cluster_id: selectedCluster.id,
        alert_name: `${selectedAlert.id}_${Date.now()}`,
        alert_group: selectedAlert.category,
        expr: expr,
        duration: `${duration}m`,
        severity: formData.severity,
        summary: annotations.summary,
        description: annotations.description,
        labels: {
          alert_template: selectedAlert.id,
          cluster: selectedCluster.name,
          namespace: formData.namespace
        }
      };

      // Send to backend
      const response = await backendApi.post('/api/alerts/create', alertPayload);

      setSuccess('Alert created successfully in Prometheus!');

      // Reset form after 2 seconds
      setTimeout(() => {
        setShowCreatePanel(false);
        setSelectedAlert(null);
        setSuccess(null);
      }, 2000);

    } catch (err) {
      console.error('Failed to create alert:', err);
      setError(err.message || 'Failed to create alert');
    } finally {
      setCreating(false);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return theme === 'dark' ? 'text-red-400 bg-red-900/20' : 'text-red-600 bg-red-100';
      case 'warning': return theme === 'dark' ? 'text-yellow-400 bg-yellow-900/20' : 'text-yellow-600 bg-yellow-100';
      case 'info': return theme === 'dark' ? 'text-blue-400 bg-blue-900/20' : 'text-blue-600 bg-blue-100';
      default: return theme === 'dark' ? 'text-slate-400 bg-slate-900/20' : 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className={`flex-1 flex flex-col ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} border-b sticky top-0 z-10`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Managed Alerts
              </h1>
              <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                Create Prometheus alerts from predefined templates
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Category Filter */}
      <div className={`px-6 py-4 ${theme === 'dark' ? 'bg-slate-900/50' : 'bg-gray-100'}`}>
        <div className="flex items-center space-x-2 overflow-x-auto">
          {alertCategories.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === category.id
                  ? theme === 'dark'
                    ? 'bg-violet-600 text-white'
                    : 'bg-blue-600 text-white'
                  : theme === 'dark'
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="mr-2">{category.icon}</span>
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Alert Catalog Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAlerts.map(alert => (
            <div
              key={alert.id}
              className={`${theme === 'dark' ? 'bg-slate-900 border-slate-800 hover:border-violet-500' : 'bg-white border-gray-200 hover:border-blue-500'} rounded-xl border p-6 cursor-pointer transition-all hover:shadow-lg`}
              onClick={() => handleAlertSelect(alert)}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {alert.name}
                </h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                  {alert.severity}
                </span>
              </div>
              <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-4`}>
                {alert.description}
              </p>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                  {alert.category}
                </span>
                <button
                  className={`text-sm font-medium ${theme === 'dark' ? 'text-violet-400 hover:text-violet-300' : 'text-blue-600 hover:text-blue-700'}`}
                >
                  Configure →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Alert Side Panel */}
      {showCreatePanel && selectedAlert && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
            onClick={() => {
              setShowCreatePanel(false);
              setSelectedAlert(null);
              setError(null);
              setSuccess(null);
            }}
          />

          {/* Side Panel */}
          <div className={`fixed top-0 right-0 h-full w-[500px] z-50 transform transition-transform duration-300 shadow-2xl ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'} ${showCreatePanel ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="h-full flex flex-col overflow-hidden">
              {/* Panel Header */}
              <div className={`px-6 py-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} flex-shrink-0`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Create Alert: {selectedAlert.name}
                    </h2>
                    <p className={`text-sm mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                      {selectedAlert.description}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowCreatePanel(false);
                      setSelectedAlert(null);
                      setError(null);
                      setSuccess(null);
                    }}
                    className={`${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Success/Error Messages */}
              {success && (
                <div className="bg-green-100 dark:bg-green-900/20 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-400 px-4 py-3 rounded">
                  {success}
                </div>
              )}
              {error && (
                <div className="bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              {/* Step 1: Set up scope */}
              <div>
                <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  1. Set up scope
                </h3>

                {/* Cluster Selection */}
                <div className="mb-4">
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                    Cluster
                  </label>
                  <select
                    value={formData.cluster}
                    onChange={(e) => handleClusterChange(e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-violet-500`}
                  >
                    {clusters.length === 0 ? (
                      <option value="">No clusters available</option>
                    ) : (
                      clusters.map(cluster => (
                        <option key={cluster.id} value={cluster.id}>
                          {cluster.name || cluster.id}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Namespace Selection */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                    Namespace
                  </label>
                  <select
                    value={formData.namespace}
                    onChange={(e) => setFormData({ ...formData, namespace: e.target.value })}
                    className={`w-full px-4 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-violet-500`}
                  >
                    {namespaces.map(ns => (
                      <option key={ns} value={ns}>
                        {ns === 'all' ? 'All Namespaces' : ns}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Step 2: Configure Variables */}
              <div>
                <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  2. Configure alert parameters
                </h3>
                {selectedAlert.variables.map(variable => (
                  <div key={variable.name} className="mb-4">
                    <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                      {variable.label}
                    </label>
                    <input
                      type={variable.type}
                      min={variable.min}
                      max={variable.max}
                      value={formData.variables[variable.name] || variable.default}
                      onChange={(e) => handleVariableChange(variable.name, Number(e.target.value))}
                      className={`w-full px-4 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-violet-500`}
                    />
                  </div>
                ))}
              </div>

              {/* Step 3: Choose Priority */}
              <div>
                <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  3. Choose priority
                </h3>
                <div className="flex space-x-3">
                  {severityLevels.map(level => (
                    <button
                      key={level.id}
                      onClick={() => setFormData({ ...formData, severity: level.id })}
                      className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                        formData.severity === level.id
                          ? `border-${level.color}-500 ${theme === 'dark' ? `bg-${level.color}-900/20 text-${level.color}-400` : `bg-${level.color}-100 text-${level.color}-700`}`
                          : theme === 'dark'
                          ? 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {level.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* PromQL Preview */}
              <div>
                <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  PromQL Preview
                </h3>
                <div className={`${theme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-gray-900 border-gray-700'} rounded-lg border p-4 font-mono text-sm overflow-x-auto`}>
                  <pre className="text-green-400">
                    {selectedCluster && selectedAlert.promql(formData.variables, selectedCluster.name, formData.namespace)}
                  </pre>
                </div>
              </div>
              </div>

              {/* Panel Footer */}
              <div className={`px-6 py-4 border-t ${theme === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-gray-50'} flex-shrink-0 flex justify-end space-x-3`}>
                <button
                  onClick={() => {
                    setShowCreatePanel(false);
                    setSelectedAlert(null);
                    setError(null);
                    setSuccess(null);
                  }}
                  className={`px-6 py-2 rounded-lg font-medium ${theme === 'dark' ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAlert}
                  disabled={creating || !selectedCluster}
                  className={`px-6 py-2 rounded-lg font-medium ${theme === 'dark' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'} text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2`}
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Alert</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ManagedAlerts;

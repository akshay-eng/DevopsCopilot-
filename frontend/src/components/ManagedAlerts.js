import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { getClusters, getNamespaces } from '../services/api';
import { alertCatalog, alertCategories, severityLevels } from '../config/alertCatalog';
import { backendApi } from '../services/api';

const ManagedAlerts = () => {
  const { theme } = useTheme();
  const dk = theme === 'dark';
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

  // Active managed alerts from backend
  const [managedAlerts, setManagedAlerts] = useState([]);
  const [managedLoading, setManagedLoading] = useState(false);

  // AI Chat state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiExpanded, setAiExpanded] = useState(false);
  const aiScrollRef = React.useRef(null);

  // Fetch managed alerts from backend
  const fetchManagedAlerts = useCallback(async () => {
    setManagedLoading(true);
    try {
      const data = await backendApi.get('/api/alerts/managed');
      setManagedAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to fetch managed alerts:', err);
    } finally {
      setManagedLoading(false);
    }
  }, []);

  // Fetch clusters on mount
  useEffect(() => {
    const fetchClusters = async () => {
      try {
        const clustersData = await getClusters();
        setClusters(clustersData.clusters || []);
        if (clustersData.clusters && clustersData.clusters.length > 0) {
          setSelectedCluster(clustersData.clusters[0]);
          setFormData(prev => ({ ...prev, cluster: clustersData.clusters[0]._id }));
        }
      } catch (err) {
        console.error('Failed to fetch clusters:', err);
      }
    };
    fetchClusters();
    fetchManagedAlerts();
  }, [fetchManagedAlerts]);

  // Fetch namespaces when cluster changes
  useEffect(() => {
    if (!selectedCluster) return;
    const fetchNamespacesData = async () => {
      try {
        const namespacesData = await getNamespaces(selectedCluster._id);
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

  // Check if a catalog alert has active instances
  const getActiveInstances = (alertId) => {
    return managedAlerts.filter(ma => ma.alertId === alertId && ma.status === 'active');
  };

  const handleAlertSelect = (alert) => {
    setSelectedAlert(alert);
    setShowCreatePanel(true);
    setError(null);
    setSuccess(null);
    const variables = {};
    alert.variables.forEach(variable => {
      variables[variable.name] = variable.default;
    });
    setFormData(prev => ({ ...prev, severity: alert.severity, variables }));
  };

  const handleClusterChange = (clusterId) => {
    const cluster = clusters.find(c => c._id === clusterId);
    setSelectedCluster(cluster);
    setFormData(prev => ({ ...prev, cluster: clusterId, namespace: 'all' }));
  };

  const handleVariableChange = (varName, value) => {
    setFormData(prev => ({
      ...prev,
      variables: { ...prev.variables, [varName]: value }
    }));
  };

  const handleCreateAlert = async () => {
    if (!selectedAlert || !selectedCluster) return;
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const expr = selectedAlert.promql(formData.variables, selectedCluster.name, formData.namespace);
      const annotations = selectedAlert.annotations(formData.variables);
      const duration = formData.variables.duration || 5;

      const alertPayload = {
        cluster_id: selectedCluster._id,
        alert_id: selectedAlert.id,
        display_name: selectedAlert.name,
        alert_name: `${selectedAlert.id.replace(/-/g, '_')}_${Date.now()}`,
        alert_group: selectedAlert.category,
        expr,
        duration: `${duration}m`,
        severity: formData.severity,
        summary: annotations.summary,
        description: annotations.description,
        namespace: formData.namespace,
        variables: formData.variables,
        labels: {
          alert_template: selectedAlert.id,
          cluster: selectedCluster.name,
          namespace: formData.namespace
        }
      };

      await backendApi.post('/api/alerts/managed/create', alertPayload);
      setSuccess('Alert rule created and applied to Prometheus!');
      fetchManagedAlerts();

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

  const handleDeleteAlert = async (id) => {
    try {
      await backendApi.delete(`/api/alerts/managed/${id}`);
      fetchManagedAlerts();
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  const handleToggleAlert = async (id) => {
    try {
      await backendApi.patch(`/api/alerts/managed/${id}/toggle`);
      fetchManagedAlerts();
    } catch (err) {
      console.error('Failed to toggle alert:', err);
    }
  };

  // Apply AI-generated rule: create managed alert via backend
  const handleApplyGeneratedRule = async (rule) => {
    if (!rule || !selectedCluster) return;
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const alertPayload = {
        cluster_id: selectedCluster._id,
        alert_id: `ai-${rule.alert_name}`,
        display_name: rule.display_name || rule.alert_name,
        alert_name: `${rule.alert_name}_${Date.now()}`,
        alert_group: rule.category || 'default',
        expr: rule.expr,
        duration: rule.duration || '5m',
        severity: rule.severity || 'warning',
        summary: rule.summary || '',
        description: rule.description || '',
        namespace: formData.namespace || 'all',
        variables: {},
        labels: {
          alert_template: 'ai-generated',
          cluster: selectedCluster.name,
          namespace: formData.namespace || 'all',
        },
      };

      await backendApi.post('/api/alerts/managed/create', alertPayload);
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: `Alert rule "${rule.display_name}" has been created and applied to Prometheus successfully!`,
        generated: null,
      }]);
      fetchManagedAlerts();
    } catch (err) {
      console.error('Failed to create AI-generated alert:', err);
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: `Failed to create alert: ${err.message || 'Unknown error'}. Please try again.`,
        generated: null,
      }]);
    } finally {
      setCreating(false);
      setTimeout(() => aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    const userMsg = aiPrompt.trim();
    setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiPrompt('');
    setAiLoading(true);
    setAiExpanded(true);
    setTimeout(() => aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: 'smooth' }), 100);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/agent/alert-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: userMsg,
          clusterId: selectedCluster?._id || '',
          namespace: formData.namespace || 'all',
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent service error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';
      let generatedRule = null;
      let toolSteps = [];

      // Add a streaming assistant message
      setAiMessages(prev => [...prev, { role: 'assistant', content: '', generated: null, toolSteps: [] }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'token') {
              streamedContent += data.content;
              setAiMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: streamedContent, toolSteps: [...toolSteps] };
                }
                return updated;
              });
            } else if (data.type === 'tool_start') {
              toolSteps.push({ tool: data.tool, input: data.input, status: 'running' });
              setAiMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, toolSteps: [...toolSteps] };
                }
                return updated;
              });
            } else if (data.type === 'tool_end') {
              const idx = toolSteps.findIndex(s => s.tool === data.tool && s.status === 'running');
              if (idx !== -1) toolSteps[idx] = { ...toolSteps[idx], status: 'done', output: data.output };
              setAiMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, toolSteps: [...toolSteps] };
                }
                return updated;
              });
            } else if (data.type === 'done') {
              generatedRule = data.generatedRule;
              // Final update with generated rule
              setAiMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  // Clean up the displayed content: remove the JSON block
                  let displayContent = streamedContent
                    .replace(/```json\s*\{[\s\S]*?\}\s*```/g, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();
                  if (generatedRule?.explanation) {
                    displayContent = displayContent || generatedRule.explanation;
                  }
                  updated[updated.length - 1] = {
                    ...last,
                    content: displayContent,
                    generated: generatedRule,
                    toolSteps: [...toolSteps],
                  };
                }
                return updated;
              });
            } else if (data.type === 'error') {
              setAiMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: `Error: ${data.error}` };
                }
                return updated;
              });
            }
          } catch (parseErr) {
            // Skip malformed SSE lines
          }
        }
        setTimeout(() => aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: 'smooth' }), 30);
      }
    } catch (err) {
      console.error('AI alert generation failed:', err);
      setAiMessages(prev => [...prev, {
        role: 'assistant',
        content: `Failed to connect to the AI agent: ${err.message}. Make sure the deep-agent service is running.`,
        generated: null,
      }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiScrollRef.current?.scrollTo({ top: aiScrollRef.current.scrollHeight, behavior: 'smooth' }), 100);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return dk ? 'text-red-400 bg-red-900/20' : 'text-red-600 bg-red-100';
      case 'warning': return dk ? 'text-yellow-400 bg-yellow-900/20' : 'text-yellow-600 bg-yellow-100';
      case 'info': return dk ? 'text-blue-400 bg-blue-900/20' : 'text-blue-600 bg-blue-100';
      default: return dk ? 'text-slate-400 bg-slate-900/20' : 'text-gray-600 bg-gray-100';
    }
  };

  const getSeverityDot = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      case 'info': return 'bg-blue-500';
      default: return 'bg-slate-500';
    }
  };

  return (
    <div className={`flex-1 flex flex-col h-full min-h-0 ${dk ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`${dk ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-200'} border-b sticky top-0 z-10`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${dk ? 'text-white' : 'text-gray-900'}`}>
                Managed Alerts
              </h1>
              <p className={`text-sm mt-1 ${dk ? 'text-slate-400' : 'text-gray-600'}`}>
                Create and manage Prometheus alerting rules from predefined templates
              </p>
            </div>
            <div className="flex items-center gap-3">
              {managedAlerts.filter(a => a.status === 'active').length > 0 && (
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${dk ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  {managedAlerts.filter(a => a.status === 'active').length} Active Rules
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Category Filter */}
      <div className={`px-6 py-3 ${dk ? 'bg-slate-900/50' : 'bg-gray-100'} border-b ${dk ? 'border-slate-800' : 'border-gray-200'}`}>
        <div className="flex items-center space-x-2 overflow-x-auto">
          {alertCategories.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === category.id
                  ? dk ? 'bg-violet-600 text-white' : 'bg-blue-600 text-white'
                  : dk ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="mr-2">{category.icon}</span>
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Active Alerts Section */}
        {managedAlerts.length > 0 && (
          <div className={`px-6 pt-5 pb-2`}>
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
              Active Alert Rules ({managedAlerts.length})
            </h2>
            <div className="space-y-2 mb-4">
              {managedAlerts.map(ma => (
                <div key={ma._id} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                  ma.status === 'active'
                    ? dk ? 'bg-green-500/5 border-green-500/20' : 'bg-green-50 border-green-200'
                    : dk ? 'bg-slate-800/50 border-slate-700' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ma.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${dk ? 'text-white' : 'text-gray-900'}`}>
                        {ma.displayName || ma.alertName}
                      </div>
                      <div className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-400'} flex items-center gap-2`}>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${getSeverityColor(ma.severity)}`}>{ma.severity}</span>
                        <span>ns/{ma.namespace || 'all'}</span>
                        <span>for {ma.duration}</span>
                        <span>{new Date(ma.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      ma.status === 'active' ? (dk ? 'text-green-400' : 'text-green-700') : (dk ? 'text-slate-500' : 'text-gray-500')
                    }`}>{ma.status}</span>
                    <button onClick={() => handleToggleAlert(ma._id)}
                      className={`p-1.5 rounded ${dk ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-gray-500'}`}
                      title={ma.status === 'active' ? 'Pause' : 'Resume'}>
                      {ma.status === 'active' ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" /></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                      )}
                    </button>
                    <button onClick={() => handleDeleteAlert(ma._id)}
                      className={`p-1.5 rounded ${dk ? 'hover:bg-red-900/30 text-red-400/60 hover:text-red-400' : 'hover:bg-red-50 text-red-400 hover:text-red-600'}`}
                      title="Delete rule">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Alert Catalog Grid */}
        <div className="px-6 pb-6 pt-3">
          <h2 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
            Alert Catalogue
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAlerts.map(alert => {
              const activeInstances = getActiveInstances(alert.id);
              const isActive = activeInstances.length > 0;
              return (
                <div
                  key={alert.id}
                  className={`rounded-xl border p-5 cursor-pointer transition-all hover:shadow-lg relative ${
                    isActive
                      ? dk ? 'bg-slate-900 border-green-500/40 hover:border-green-400' : 'bg-white border-green-300 hover:border-green-500'
                      : dk ? 'bg-slate-900 border-slate-800 hover:border-violet-500' : 'bg-white border-gray-200 hover:border-blue-500'
                  }`}
                  onClick={() => handleAlertSelect(alert)}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className={`absolute top-3 right-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${dk ? 'bg-green-500/15 text-green-400' : 'bg-green-100 text-green-700'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Active ({activeInstances.length})
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${getSeverityDot(alert.severity)}`} />
                      <h3 className={`text-base font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>
                        {alert.name}
                      </h3>
                    </div>
                    {!isActive && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${dk ? 'text-slate-400' : 'text-gray-600'} mb-4 line-clamp-2`}>
                    {alert.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${dk ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                      {alert.category}
                    </span>
                    <button className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors ${
                      isActive
                        ? dk ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-green-50 text-green-700 hover:bg-green-100'
                        : dk ? 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}>
                      {isActive ? 'Configure' : 'Create Alert'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* AI Alert Creator - Bottom Bar */}
      <div className={`flex-shrink-0 border-t ${dk ? 'border-slate-800/80' : 'border-gray-200'}`}
        style={dk ? { background: 'linear-gradient(180deg, rgba(15,15,30,0.95) 0%, rgba(10,10,20,1) 100%)' } : { background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)' }}>

        {/* Expandable Chat Area */}
        {aiExpanded && aiMessages.length > 0 && (
          <div className="px-5 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${dk ? 'bg-gradient-to-br from-violet-500 to-purple-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <span className={`text-xs font-semibold tracking-wide uppercase ${dk ? 'text-slate-400' : 'text-gray-500'}`}>Conversation</span>
              </div>
              <button onClick={() => { setAiExpanded(false); setAiMessages([]); }}
                className={`p-1 rounded-md transition-colors ${dk ? 'hover:bg-slate-800 text-slate-500 hover:text-slate-300' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div ref={aiScrollRef}
              className={`max-h-[50vh] overflow-y-auto rounded-xl border p-4 space-y-4 ${dk ? 'border-slate-700/50 bg-slate-900/60 backdrop-blur-sm' : 'border-gray-200 bg-white shadow-inner'}`}
              style={{ scrollbarWidth: 'thin' }}>
              {aiMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-md text-sm ${dk ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-500/10' : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/15'}`}>
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[85%] flex gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 ${dk ? 'bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30' : 'bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200'}`}>
                        <svg className={`w-3.5 h-3.5 ${dk ? 'text-violet-400' : 'text-blue-600'}`} viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${dk ? 'text-violet-400/70' : 'text-blue-500/80'}`}>Alert Assistant</span>
                        {/* Tool call steps */}
                        {msg.toolSteps && msg.toolSteps.length > 0 && (
                          <div className={`mt-1.5 mb-2 space-y-1`}>
                            {msg.toolSteps.map((step, si) => (
                              <div key={si} className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded ${dk ? 'bg-slate-800/60 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>
                                {step.status === 'running' ? (
                                  <svg className="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                ) : (
                                  <svg className="w-3 h-3 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                )}
                                <span className="font-mono truncate">{step.tool}({step.input?.query ? `"${step.input.query.slice(0, 60)}"` : '...'})</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className={`mt-1 text-sm leading-relaxed whitespace-pre-wrap ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                          {msg.content}
                        </div>
                        {/* Generated rule preview — approval card */}
                        {msg.generated && !msg.applied && !msg.rejected && (
                          <div className={`mt-3 rounded-lg border overflow-hidden ${dk ? 'border-violet-500/30 bg-slate-800/80' : 'border-blue-200 bg-blue-50/50'}`}>
                            <div className={`px-3 py-2 text-xs font-semibold flex items-center justify-between ${dk ? 'bg-violet-500/10 text-violet-300 border-b border-violet-500/20' : 'bg-blue-100 text-blue-800 border-b border-blue-200'}`}>
                              <span>Generated Alert Rule — Awaiting Approval</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                msg.generated.severity === 'critical' ? (dk ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-700')
                                : msg.generated.severity === 'warning' ? (dk ? 'bg-yellow-500/15 text-yellow-400' : 'bg-yellow-100 text-yellow-700')
                                : (dk ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700')
                              }`}>{msg.generated.severity}</span>
                            </div>
                            <div className="px-3 py-2.5 space-y-2">
                              <div className={`text-sm font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>{msg.generated.display_name}</div>
                              {msg.generated.explanation && (
                                <div className={`text-xs ${dk ? 'text-slate-400' : 'text-gray-600'}`}>{msg.generated.explanation}</div>
                              )}
                              {/* PromQL code block */}
                              <div>
                                <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${dk ? 'text-slate-500' : 'text-gray-400'}`}>PromQL Expression</div>
                                <div className={`font-mono text-xs p-3 rounded-lg ${dk ? 'bg-slate-950 border border-slate-700' : 'bg-gray-900 border border-gray-700'} overflow-x-auto`}>
                                  <pre className="text-green-400 whitespace-pre-wrap break-all">{msg.generated.expr}</pre>
                                </div>
                              </div>
                              {/* Metadata row */}
                              <div className={`flex flex-wrap items-center gap-2 text-xs ${dk ? 'text-slate-400' : 'text-gray-500'}`}>
                                <span className={`px-2 py-0.5 rounded ${dk ? 'bg-slate-700/50' : 'bg-gray-200'}`}>Duration: {msg.generated.duration}</span>
                                <span className={`px-2 py-0.5 rounded ${dk ? 'bg-slate-700/50' : 'bg-gray-200'}`}>{msg.generated.category}</span>
                              </div>
                              {/* Summary & Description */}
                              {msg.generated.summary && (
                                <div className={`text-xs ${dk ? 'text-slate-300' : 'text-gray-700'}`}>
                                  <span className="font-semibold">Summary: </span>{msg.generated.summary}
                                </div>
                              )}
                              {msg.generated.description && (
                                <div className={`text-xs ${dk ? 'text-slate-400' : 'text-gray-600'}`}>
                                  <span className="font-semibold">Description: </span>{msg.generated.description}
                                </div>
                              )}
                            </div>
                            {/* Approve / Reject buttons */}
                            <div className={`px-3 py-2.5 border-t ${dk ? 'border-slate-700/50' : 'border-blue-200'} flex items-center gap-2`}>
                              <button
                                onClick={() => {
                                  handleApplyGeneratedRule(msg.generated);
                                  setAiMessages(prev => prev.map((m, mi) => mi === i ? { ...m, applied: true } : m));
                                }}
                                disabled={creating || !selectedCluster}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 ${dk ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20'}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                {creating ? 'Creating...' : 'Approve & Create'}
                              </button>
                              <button
                                onClick={() => {
                                  setAiMessages(prev => prev.map((m, mi) => mi === i ? { ...m, rejected: true } : m));
                                  setAiMessages(prev => [...prev, { role: 'assistant', content: 'Alert rule rejected. Feel free to describe what you\'d like changed and I\'ll generate a new one.', generated: null }]);
                                }}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${dk ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                Reject
                              </button>
                              {!selectedCluster && (
                                <span className={`text-[10px] ${dk ? 'text-red-400/70' : 'text-red-500'}`}>Select a cluster first</span>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Applied confirmation */}
                        {msg.generated && msg.applied && (
                          <div className={`mt-3 px-3 py-2 rounded-lg flex items-center gap-2 ${dk ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-200'}`}>
                            <svg className={`w-4 h-4 ${dk ? 'text-green-400' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            <span className={`text-xs font-semibold ${dk ? 'text-green-400' : 'text-green-700'}`}>Alert rule created and applied to Prometheus</span>
                          </div>
                        )}
                        {/* Rejected */}
                        {msg.generated && msg.rejected && (
                          <div className={`mt-3 px-3 py-2 rounded-lg flex items-center gap-2 ${dk ? 'bg-slate-800/50 border border-slate-700' : 'bg-gray-100 border border-gray-200'}`}>
                            <svg className={`w-4 h-4 ${dk ? 'text-slate-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            <span className={`text-xs ${dk ? 'text-slate-500' : 'text-gray-500'}`}>Rule rejected</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${dk ? 'bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30' : 'bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200'}`}>
                      <svg className={`w-3.5 h-3.5 ${dk ? 'text-violet-400' : 'text-blue-600'} animate-spin`} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z" />
                      </svg>
                    </div>
                    <div className={`px-4 py-3 rounded-2xl rounded-bl-md ${dk ? 'bg-slate-800/80 border border-slate-700/50' : 'bg-gray-100 border border-gray-200'}`}>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${dk ? 'bg-violet-400' : 'bg-blue-500'} animate-bounce`} style={{ animationDelay: '0ms' }} />
                        <div className={`w-2 h-2 rounded-full ${dk ? 'bg-violet-400' : 'bg-blue-500'} animate-bounce`} style={{ animationDelay: '150ms' }} />
                        <div className={`w-2 h-2 rounded-full ${dk ? 'bg-violet-400' : 'bg-blue-500'} animate-bounce`} style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="px-5 py-3.5">
          {/* Suggestion chips when no messages */}
          {aiMessages.length === 0 && (
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <span className={`text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${dk ? 'text-slate-600' : 'text-gray-400'}`}>Try:</span>
              {[
                'High CPU pod alert',
                'OOM kills in production',
                'Node disk pressure',
                'Pod crash loop detection',
              ].map((hint) => (
                <button key={hint} onClick={() => setAiPrompt(hint)}
                  className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs transition-all ${dk ? 'bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:border-violet-500/40 hover:text-violet-400 hover:bg-violet-500/5' : 'bg-white text-gray-500 border border-gray-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 shadow-sm'}`}>
                  {hint}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleAiSubmit} className="flex items-center gap-2.5">
            <div className={`flex-1 flex items-center gap-3 pl-4 pr-2 py-1.5 rounded-2xl border transition-all ${dk ? 'bg-slate-800/50 border-slate-700/60 focus-within:border-violet-500/50 focus-within:shadow-lg focus-within:shadow-violet-500/5' : 'bg-white border-gray-200 focus-within:border-blue-400 focus-within:shadow-lg focus-within:shadow-blue-500/5 shadow-sm'}`}>
              {/* Sparkle icon */}
              <div className={`flex-shrink-0 ${dk ? 'text-violet-400/70' : 'text-blue-400'}`}>
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z" />
                </svg>
              </div>
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe an alert in plain English..."
                className={`flex-1 bg-transparent outline-none text-sm py-2 ${dk ? 'text-white placeholder-slate-500' : 'text-gray-900 placeholder-gray-400'}`}
                disabled={aiLoading}
              />
              <button
                type="submit"
                disabled={!aiPrompt.trim() || aiLoading}
                className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:scale-95 ${dk
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/20 disabled:shadow-none'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 disabled:shadow-none'
                }`}
              >
                {aiLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                )}
              </button>
            </div>
          </form>

          <div className={`flex items-center justify-between mt-2 px-1`}>
            <span className={`text-[10px] ${dk ? 'text-slate-600' : 'text-gray-400'}`}>
              AI-powered alert creation — describe what you want to monitor
            </span>
            <div className={`flex items-center gap-1 text-[10px] ${dk ? 'text-slate-700' : 'text-gray-300'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Powered by AWS Bedrock AgentCore
            </div>
          </div>
        </div>
      </div>

      {/* Create Alert Side Panel */}
      {showCreatePanel && selectedAlert && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 transition-opacity"
            onClick={() => { setShowCreatePanel(false); setSelectedAlert(null); setError(null); setSuccess(null); }}
          />
          <div className={`fixed top-0 right-0 h-full w-[500px] z-50 shadow-2xl ${dk ? 'bg-slate-900' : 'bg-white'}`}>
            <div className="h-full flex flex-col overflow-hidden">
              {/* Panel Header */}
              <div className={`px-6 py-4 border-b ${dk ? 'border-slate-800' : 'border-gray-200'} flex-shrink-0`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className={`text-xl font-bold ${dk ? 'text-white' : 'text-gray-900'}`}>
                      Create Alert: {selectedAlert.name}
                    </h2>
                    <p className={`text-sm mt-1 ${dk ? 'text-slate-400' : 'text-gray-600'}`}>
                      {selectedAlert.description}
                    </p>
                  </div>
                  <button onClick={() => { setShowCreatePanel(false); setSelectedAlert(null); setError(null); setSuccess(null); }}
                    className={`${dk ? 'text-slate-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Panel Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {success && (
                  <div className={`${dk ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-green-100 border-green-400 text-green-700'} border px-4 py-3 rounded-lg flex items-center gap-2`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {success}
                  </div>
                )}
                {error && (
                  <div className={`${dk ? 'bg-red-900/20 border-red-700 text-red-400' : 'bg-red-100 border-red-400 text-red-700'} border px-4 py-3 rounded-lg`}>
                    {error}
                  </div>
                )}

                {/* Existing active instances */}
                {getActiveInstances(selectedAlert.id).length > 0 && (
                  <div className={`rounded-lg border p-3 ${dk ? 'bg-green-500/5 border-green-500/20' : 'bg-green-50 border-green-200'}`}>
                    <div className={`text-xs font-semibold uppercase mb-2 ${dk ? 'text-green-400' : 'text-green-700'}`}>
                      Active Instances ({getActiveInstances(selectedAlert.id).length})
                    </div>
                    {getActiveInstances(selectedAlert.id).map(inst => (
                      <div key={inst._id} className={`flex items-center justify-between py-1.5 text-xs ${dk ? 'text-slate-300' : 'text-gray-600'}`}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          ns/{inst.namespace || 'all'} · {inst.severity} · for {inst.duration}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteAlert(inst._id); }}
                          className={`px-2 py-0.5 rounded text-xs ${dk ? 'text-red-400/60 hover:text-red-400 hover:bg-red-900/30' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Step 1: Scope */}
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${dk ? 'text-white' : 'text-gray-900'}`}>1. Set up scope</h3>
                  <div className="mb-4">
                    <label className={`block text-sm font-medium mb-2 ${dk ? 'text-slate-300' : 'text-gray-700'}`}>Cluster</label>
                    <select value={formData.cluster} onChange={(e) => handleClusterChange(e.target.value)}
                      className={`w-full px-4 py-2 rounded-lg border ${dk ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-violet-500`}>
                      {clusters.length === 0 ? (
                        <option value="">No clusters available</option>
                      ) : clusters.map(cluster => (
                        <option key={cluster._id} value={cluster._id}>{cluster.name || cluster._id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${dk ? 'text-slate-300' : 'text-gray-700'}`}>Namespace</label>
                    <select value={formData.namespace} onChange={(e) => setFormData({ ...formData, namespace: e.target.value })}
                      className={`w-full px-4 py-2 rounded-lg border ${dk ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-violet-500`}>
                      {namespaces.map(ns => (
                        <option key={ns} value={ns}>{ns === 'all' ? 'All Namespaces' : ns}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Step 2: Variables */}
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${dk ? 'text-white' : 'text-gray-900'}`}>2. Configure parameters</h3>
                  {selectedAlert.variables.map(variable => (
                    <div key={variable.name} className="mb-4">
                      <label className={`block text-sm font-medium mb-2 ${dk ? 'text-slate-300' : 'text-gray-700'}`}>{variable.label}</label>
                      <input type={variable.type} min={variable.min} max={variable.max}
                        value={formData.variables[variable.name] || variable.default}
                        onChange={(e) => handleVariableChange(variable.name, Number(e.target.value))}
                        className={`w-full px-4 py-2 rounded-lg border ${dk ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-violet-500`}
                      />
                    </div>
                  ))}
                </div>

                {/* Step 3: Priority */}
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${dk ? 'text-white' : 'text-gray-900'}`}>3. Choose priority</h3>
                  <div className="flex space-x-3">
                    {severityLevels.map(level => (
                      <button key={level.id} onClick={() => setFormData({ ...formData, severity: level.id })}
                        className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                          formData.severity === level.id
                            ? level.id === 'critical' ? (dk ? 'border-red-500 bg-red-900/20 text-red-400' : 'border-red-500 bg-red-100 text-red-700')
                              : level.id === 'warning' ? (dk ? 'border-yellow-500 bg-yellow-900/20 text-yellow-400' : 'border-yellow-500 bg-yellow-100 text-yellow-700')
                              : (dk ? 'border-blue-500 bg-blue-900/20 text-blue-400' : 'border-blue-500 bg-blue-100 text-blue-700')
                            : dk ? 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                        }`}>
                        {level.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* PromQL Preview */}
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${dk ? 'text-white' : 'text-gray-900'}`}>PromQL Preview</h3>
                  <div className={`${dk ? 'bg-slate-950 border-slate-800' : 'bg-gray-900 border-gray-700'} rounded-lg border p-4 font-mono text-sm overflow-x-auto`}>
                    <pre className="text-green-400 whitespace-pre-wrap break-all">
                      {selectedCluster && selectedAlert.promql(formData.variables, selectedCluster.name, formData.namespace)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Panel Footer */}
              <div className={`px-6 py-4 border-t ${dk ? 'border-slate-800 bg-slate-900' : 'border-gray-200 bg-gray-50'} flex-shrink-0 flex justify-end space-x-3`}>
                <button onClick={() => { setShowCreatePanel(false); setSelectedAlert(null); setError(null); setSuccess(null); }}
                  className={`px-6 py-2 rounded-lg font-medium ${dk ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                  Cancel
                </button>
                <button onClick={handleCreateAlert} disabled={creating || !selectedCluster}
                  className={`px-6 py-2 rounded-lg font-medium ${dk ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'} text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2`}>
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Alert Rule</span>
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

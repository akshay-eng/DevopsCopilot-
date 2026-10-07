import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { backendApi } from '../services/api';

// ==========================================
// Source definitions
// ==========================================
const SOURCE_DEFS = {
  snow: {
    name: 'ServiceNow',
    icon: (
      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    )
  },
  jira: {
    name: 'Jira',
    icon: (
      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 00-.84-.84h-9.63zM6.77 6.8a4.36 4.36 0 004.34 4.34h1.8v1.72a4.36 4.36 0 004.34 4.34V7.63a.84.84 0 00-.83-.83H6.77zM2 11.6c0 2.4 1.96 4.35 4.34 4.35h1.8v1.72c0 2.4 1.94 4.34 4.34 4.34V12.44a.84.84 0 00-.84-.84H2z"/>
      </svg>
    )
  },
  github: {
    name: 'GitHub',
    icon: (
      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
      </svg>
    )
  },
  email: {
    name: 'Email',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )
  }
};

const Pipelines = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isDark = theme === 'dark';

  const [pipelines, setPipelines] = useState([]);
  const [sources, setSources] = useState({});
  const [dataTypes, setDataTypes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Wizard
  const [wizardStep, setWizardStep] = useState(null);
  const [wizardSource, setWizardSource] = useState(null);
  const [selectedDataTypes, setSelectedDataTypes] = useState([]);
  const [collectionNames, setCollectionNames] = useState({});
  const [creating, setCreating] = useState(false);

  // Pipeline execution
  const [expandedPipelineId, setExpandedPipelineId] = useState(null);
  const [runningPipelineId, setRunningPipelineId] = useState(null);
  const [progress, setProgress] = useState(null);
  const eventSourceRef = useRef(null);
  const [animTick, setAnimTick] = useState(0);

  // Animation ticker for particles
  useEffect(() => {
    const interval = setInterval(() => setAnimTick(t => t + 1), 100);
    return () => clearInterval(interval);
  }, []);

  const fetchPipelines = useCallback(async () => {
    try {
      setLoading(true);
      const data = await backendApi.get('/api/pipelines');
      setPipelines(data.pipelines || []);
      setSources(data.sources || {});
      setDataTypes(data.dataTypes || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipelines();
    return () => { if (eventSourceRef.current) eventSourceRef.current.close(); };
  }, [fetchPipelines]);

  // Wizard handlers
  const handleSourceClick = (sourceKey) => {
    if (!sources.milvus) {
      setError('Milvus DB is not configured. Please connect it in Integrations first.');
      return;
    }
    if (!sources[sourceKey]) {
      setError(`${SOURCE_DEFS[sourceKey]?.name || sourceKey} is not configured. Connect it in Integrations first.`);
      return;
    }
    setError(null);
    setWizardSource(sourceKey);
    setSelectedDataTypes([]);
    setCollectionNames({});
    setWizardStep('select_data');
  };

  const handleToggleDataType = (dt) => {
    setSelectedDataTypes(prev => {
      if (prev.includes(dt.key)) {
        const next = prev.filter(k => k !== dt.key);
        setCollectionNames(cn => { const c = { ...cn }; delete c[dt.key]; return c; });
        return next;
      }
      setCollectionNames(cn => ({ ...cn, [dt.key]: `${wizardSource}_${dt.key}` }));
      return [...prev, dt.key];
    });
  };

  const handleCreatePipeline = async () => {
    try {
      setCreating(true);
      setError(null);
      const sourceDTs = dataTypes[wizardSource] || [];
      const tableCollections = selectedDataTypes.map(key => {
        const dt = sourceDTs.find(d => d.key === key);
        return { table: dt.table, label: dt.label, collection: collectionNames[key] || `${wizardSource}_${key}` };
      });
      await backendApi.post('/api/pipelines', { sourceType: wizardSource, tableCollections });
      setWizardStep(null);
      setWizardSource(null);
      await fetchPipelines();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const cancelWizard = () => { setWizardStep(null); setWizardSource(null); };

  // Pipeline execution
  const handleRunPipeline = async (pipelineId) => {
    try {
      setError(null);
      setRunningPipelineId(pipelineId);
      setExpandedPipelineId(pipelineId);
      setProgress({ status: 'running', phase: 'connecting', processedRecords: 0, totalRecords: 0, tables: [], message: 'Initializing...' });

      await backendApi.post(`/api/pipelines/${pipelineId}/run`);

      const token = localStorage.getItem('token');
      const es = new EventSource(`${process.env.REACT_APP_API_URL || 'http://localhost:5001'}/api/pipelines/progress/${pipelineId}?token=${token}`);
      eventSourceRef.current = es;
      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data);
        if (data.status === 'completed' || data.status === 'failed') {
          es.close();
          eventSourceRef.current = null;
          setRunningPipelineId(null);
          fetchPipelines();
        }
      };
      es.onerror = () => { es.close(); eventSourceRef.current = null; pollProgress(pipelineId); };
    } catch (err) {
      setError(err.message);
      setRunningPipelineId(null);
    }
  };

  const pollProgress = (pipelineId) => {
    const interval = setInterval(async () => {
      try {
        const data = await backendApi.get('/api/pipelines');
        const p = (data.pipelines || []).find(x => x._id === pipelineId);
        if (p?.lastRun) {
          setProgress({
            status: p.lastRun.status, phase: p.lastRun.status === 'completed' ? 'done' : 'running',
            processedRecords: p.lastRun.processedRecords || 0, totalRecords: p.lastRun.totalRecords || 0,
            tables: p.lastRun.tableDetails || [], message: p.lastRun.error || 'Running...', durationMs: p.lastRun.durationMs
          });
          if (p.lastRun.status === 'completed' || p.lastRun.status === 'failed') {
            clearInterval(interval); setRunningPipelineId(null); fetchPipelines();
          }
        }
      } catch { /* ignore */ }
    }, 2000);
  };

  const handleDeletePipeline = async (pipelineId) => {
    await backendApi.delete(`/api/pipelines/${pipelineId}`);
    if (expandedPipelineId === pipelineId) setExpandedPipelineId(null);
    fetchPipelines();
  };

  const fmtDur = (ms) => {
    if (!ms) return '--';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  if (loading) {
    return (
      <div className={`min-h-screen p-6 ${isDark ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-6 ${isDark ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Data Pipelines</h1>
            <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Ingest data into Milvus for RAG-powered search and analytics
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${sources.milvus ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
            <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
              Milvus {sources.milvus ? 'Connected' : 'Offline'}
            </span>
            {!sources.milvus && (
              <button onClick={() => navigate('/dashboard/integrations')} className="text-xs text-violet-400 hover:text-violet-300 underline ml-1">Setup</button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-4 text-red-300 hover:text-red-200 text-lg">&times;</button>
          </div>
        )}

        {/* ============================== */}
        {/* CREATE NEW PIPELINE */}
        {/* ============================== */}
        {!wizardStep && (
          <>
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              Create New Pipeline
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {Object.entries(SOURCE_DEFS).map(([key, src]) => {
                const ok = !!sources[key];
                return (
                  <button
                    key={key}
                    onClick={() => handleSourceClick(key)}
                    className={`relative p-6 rounded-2xl border transition-all group overflow-hidden ${
                      ok
                        ? isDark ? 'border-slate-700/50 bg-gradient-to-br from-slate-900 to-slate-800/50 hover:border-violet-500/40 hover:shadow-lg hover:shadow-violet-500/5' : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-lg'
                        : isDark ? 'border-slate-800/50 bg-slate-900/20 opacity-50' : 'border-gray-200 bg-gray-50 opacity-50'
                    }`}
                  >
                    {ok && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
                    <div className={`mx-auto mb-3 w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                      ok ? isDark ? 'bg-slate-800 text-slate-300 group-hover:bg-violet-500/20 group-hover:text-violet-400 group-hover:scale-110' : 'bg-gray-100 text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-600 group-hover:scale-110' : isDark ? 'bg-slate-800/50 text-slate-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {src.icon}
                    </div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{src.name}</p>
                    <div className="flex items-center justify-center space-x-1.5 mt-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : isDark ? 'bg-slate-600' : 'bg-gray-300'}`}></span>
                      <span className={`text-xs ${ok ? 'text-emerald-400' : isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                        {ok ? 'Connected' : 'Not configured'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ============================== */}
        {/* WIZARD: Select Data Types */}
        {/* ============================== */}
        {wizardStep === 'select_data' && wizardSource && (
          <WizardDataSelect
            isDark={isDark}
            source={wizardSource}
            sourceDef={SOURCE_DEFS[wizardSource]}
            dataTypes={dataTypes[wizardSource] || []}
            selected={selectedDataTypes}
            onToggle={handleToggleDataType}
            onNext={() => selectedDataTypes.length && setWizardStep('collection_names')}
            onCancel={cancelWizard}
          />
        )}

        {/* ============================== */}
        {/* WIZARD: Collection Names */}
        {/* ============================== */}
        {wizardStep === 'collection_names' && wizardSource && (
          <WizardCollections
            isDark={isDark}
            source={wizardSource}
            sourceDef={SOURCE_DEFS[wizardSource]}
            dataTypes={dataTypes[wizardSource] || []}
            selected={selectedDataTypes}
            collectionNames={collectionNames}
            setCollectionNames={setCollectionNames}
            onBack={() => setWizardStep('select_data')}
            onCreate={handleCreatePipeline}
            creating={creating}
            onCancel={cancelWizard}
          />
        )}

        {/* ============================== */}
        {/* ACTIVE PIPELINES */}
        {/* ============================== */}
        {pipelines.length > 0 && (
          <>
            <h2 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              Active Pipelines
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full normal-case ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-500'}`}>
                {pipelines.length}
              </span>
            </h2>

            <div className="space-y-4">
              {pipelines.map(pipeline => {
                const isExpanded = expandedPipelineId === pipeline._id;
                const isRunning = runningPipelineId === pipeline._id;
                const src = SOURCE_DEFS[pipeline.sourceType] || {};
                const lastRun = pipeline.lastRun;
                const pipelineProgress = isRunning ? progress : null;

                return (
                  <div key={pipeline._id} className={`rounded-2xl border overflow-hidden transition-all ${
                    isRunning ? isDark ? 'border-violet-500/30 shadow-lg shadow-violet-500/5' : 'border-blue-400 shadow-lg shadow-blue-500/10' :
                    isDark ? 'border-slate-800 bg-slate-900/30' : 'border-gray-200 bg-white'
                  }`}>
                    {/* Header Row */}
                    <div
                      className={`px-6 py-4 flex items-center justify-between cursor-pointer transition-colors ${isDark ? 'hover:bg-slate-800/30' : 'hover:bg-gray-50'}`}
                      onClick={() => setExpandedPipelineId(isExpanded ? null : pipeline._id)}
                    >
                      <div className="flex items-center space-x-4 flex-1 min-w-0">
                        <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isRunning ? 'bg-violet-500/20 text-violet-400' :
                          pipeline.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                          pipeline.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                          isDark ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {src.icon && React.cloneElement(src.icon, { className: 'w-5 h-5' })}
                          {isRunning && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-violet-500 animate-ping"></span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{pipeline.name}</p>
                          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                            {pipeline.tableCollections?.map(tc => tc.label || tc.table).join(' / ')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 flex-shrink-0">
                        {/* Mini stats */}
                        {lastRun?.processedRecords > 0 && !isRunning && (
                          <div className={`hidden md:flex items-center space-x-3 mr-2 text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                            <span>{lastRun.processedRecords.toLocaleString()} records</span>
                            <span>{fmtDur(lastRun.durationMs)}</span>
                          </div>
                        )}

                        {/* Status */}
                        <StatusBadge status={isRunning ? 'running' : pipeline.status} isDark={isDark} />

                        {/* Actions */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRunPipeline(pipeline._id); }}
                          disabled={isRunning}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isRunning ? 'bg-violet-500/20 text-violet-300 cursor-not-allowed' :
                            'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-sm hover:shadow-md hover:shadow-violet-500/20'
                          }`}
                        >
                          {isRunning ? 'Running...' : lastRun ? 'Rerun' : 'Run'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeletePipeline(pipeline._id); }}
                          disabled={isRunning}
                          className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-slate-600 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'} ${isRunning ? 'opacity-20 cursor-not-allowed' : ''}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <svg className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''} ${isDark ? 'text-slate-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className={`border-t ${isDark ? 'border-slate-800/50' : 'border-gray-100'}`}>
                        {/* Flow Visualization */}
                        <div className="p-6">
                          <PipelineFlow
                            pipeline={pipeline}
                            isDark={isDark}
                            isRunning={isRunning}
                            progress={pipelineProgress}
                            src={src}
                            animTick={animTick}
                          />
                        </div>

                        {/* Monitoring Dashboard */}
                        {(isRunning || lastRun) && (
                          <div className={`mx-6 mb-6 rounded-xl border ${isDark ? 'border-slate-800 bg-slate-900/50' : 'border-gray-100 bg-gray-50'}`}>
                            <MonitoringDashboard
                              pipeline={pipeline}
                              isDark={isDark}
                              isRunning={isRunning}
                              progress={pipelineProgress}
                              fmtDur={fmtDur}
                            />
                          </div>
                        )}

                        {/* Run History */}
                        {pipeline.runs?.length > 0 && (
                          <div className={`mx-6 mb-6`}>
                            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Run History</p>
                            <div className="flex space-x-2 overflow-x-auto pb-1">
                              {[...pipeline.runs].reverse().slice(0, 10).map((run, i) => (
                                <div key={i} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs border ${
                                  run.status === 'completed' ? isDark ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-emerald-200 bg-emerald-50 text-emerald-600' :
                                  run.status === 'failed' ? isDark ? 'border-red-500/20 bg-red-500/5 text-red-400' : 'border-red-200 bg-red-50 text-red-600' :
                                  isDark ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-500'
                                }`}>
                                  <div className="font-medium">{run.processedRecords || 0} records</div>
                                  <div className="opacity-60">{fmtDur(run.durationMs)} &middot; {run.completedAt ? new Date(run.completedAt).toLocaleDateString() : '--'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {!pipelines.length && !wizardStep && (
          <div className={`text-center py-16 ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>
            <div className="relative mx-auto w-20 h-20 mb-4">
              <div className={`absolute inset-0 rounded-2xl ${isDark ? 'bg-slate-800/50' : 'bg-gray-100'}`}></div>
              <svg className="absolute inset-0 w-20 h-20 p-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-sm font-medium">No pipelines yet</p>
            <p className="text-xs mt-1 opacity-60">Select a source above to create your first RAG pipeline</p>
          </div>
        )}
      </div>

      {/* Global CSS */}
      <style>{`
        @keyframes flowParticle {
          0% { left: 0%; opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
          50% { box-shadow: 0 0 12px 4px rgba(139, 92, 246, 0.15); }
        }
        .flow-particle {
          animation: flowParticle 2.5s linear infinite;
        }
        .pulse-glow {
          animation: pulseGlow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

// ==========================================
// Status Badge
// ==========================================
const StatusBadge = ({ status, isDark }) => {
  const styles = {
    running: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
    completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    failed: 'bg-red-500/15 text-red-400 border-red-500/20',
    idle: isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-gray-100 text-gray-500 border-gray-200'
  };
  return (
    <span className={`inline-flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${styles[status] || styles.idle}`}>
      {status === 'running' && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></span>}
      {status === 'completed' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
      {status === 'failed' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>}
      <span className="capitalize">{status}</span>
    </span>
  );
};

// ==========================================
// Pipeline Flow Visualization (SVG-based)
// ==========================================
const PipelineFlow = ({ pipeline, isDark, isRunning, progress, src, animTick }) => {
  const tables = pipeline.tableCollections || [];
  const tableStatuses = progress?.tables || pipeline.lastRun?.tableDetails || [];
  const rowH = 56;
  const totalH = Math.max(tables.length * rowH + 20, 100);

  // Layout positions
  const srcX = 0, srcW = 120;
  const milvusX = 680, milvusW = 120;
  const tableX = 260, tableW = 140;
  const collX = 460, collW = 160;

  return (
    <div className="relative overflow-x-auto">
      <svg width="800" height={totalH} viewBox={`0 0 800 ${totalH}`} className="w-full" style={{ minWidth: 700 }}>
        <defs>
          <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#a78bfa" stopOpacity="1" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="srcGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isDark ? '#1e1b4b' : '#ede9fe'} />
            <stop offset="100%" stopColor={isDark ? '#0f0a2e' : '#f5f3ff'} />
          </linearGradient>
          <linearGradient id="milvusGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isDark ? '#022c22' : '#d1fae5'} />
            <stop offset="100%" stopColor={isDark ? '#011a14' : '#ecfdf5'} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Source Node */}
        <g>
          <rect x={srcX} y={totalH / 2 - 40} width={srcW} height={80} rx={16} fill="url(#srcGrad)" stroke={isDark ? '#4c1d95' : '#c4b5fd'} strokeWidth={isRunning ? 2 : 1} />
          {isRunning && <rect x={srcX} y={totalH / 2 - 40} width={srcW} height={80} rx={16} fill="none" stroke="#8b5cf6" strokeWidth={2} className="pulse-glow" />}
          <text x={srcX + srcW / 2} y={totalH / 2 + 5} textAnchor="middle" className={`text-xs font-semibold ${isDark ? 'fill-slate-200' : 'fill-gray-700'}`}>
            {src.name || 'Source'}
          </text>
        </g>

        {/* Milvus Node */}
        <g>
          <rect x={milvusX} y={totalH / 2 - 40} width={milvusW} height={80} rx={16} fill="url(#milvusGrad)" stroke={isDark ? '#065f46' : '#6ee7b7'} strokeWidth={1} />
          <text x={milvusX + milvusW / 2} y={totalH / 2 - 2} textAnchor="middle" className={`text-xs font-semibold ${isDark ? 'fill-emerald-300' : 'fill-emerald-700'}`}>Milvus</text>
          <text x={milvusX + milvusW / 2} y={totalH / 2 + 14} textAnchor="middle" className={`text-[10px] ${isDark ? 'fill-emerald-500' : 'fill-emerald-500'}`}>Vector DB</text>
        </g>

        {/* Per-table rows */}
        {tables.map((tc, i) => {
          const y = 10 + i * rowH + rowH / 2;
          const status = tableStatuses.find(t => t.table === tc.table);
          const isActive = isRunning && progress?.currentTable === tc.table;
          const isComplete = status?.status === 'completed';
          const isFailed = status?.status === 'failed';

          const lineColor = isActive ? '#8b5cf6' : isComplete ? '#10b981' : isFailed ? '#ef4444' : isDark ? '#334155' : '#e5e7eb';
          const nodeFill = isActive ? (isDark ? '#2e1065' : '#f3e8ff') : isComplete ? (isDark ? '#022c22' : '#ecfdf5') : isFailed ? (isDark ? '#450a0a' : '#fef2f2') : (isDark ? '#1e293b' : '#f8fafc');
          const nodeStroke = isActive ? '#8b5cf6' : isComplete ? '#10b981' : isFailed ? '#ef4444' : isDark ? '#475569' : '#d1d5db';
          const textColor = isActive ? (isDark ? 'fill-violet-300' : 'fill-violet-700') : isComplete ? (isDark ? 'fill-emerald-300' : 'fill-emerald-700') : isDark ? 'fill-slate-300' : 'fill-gray-700';

          return (
            <g key={tc.table}>
              {/* Source -> Table line */}
              <line x1={srcX + srcW} y1={totalH / 2} x2={tableX} y2={y} stroke={lineColor} strokeWidth={isActive ? 2 : 1} strokeDasharray={isActive ? '' : isComplete ? '' : '4 4'} />

              {/* Animated particles on source -> table */}
              {isActive && [0, 1, 2].map(p => {
                const t = ((animTick * 3 + p * 33) % 100) / 100;
                const px = (srcX + srcW) + (tableX - srcX - srcW) * t;
                const py = (totalH / 2) + (y - totalH / 2) * t;
                return <circle key={p} cx={px} cy={py} r={3} fill="#8b5cf6" opacity={0.8} filter="url(#glow)" />;
              })}

              {/* Table Node */}
              <rect x={tableX} y={y - 16} width={tableW} height={32} rx={8} fill={nodeFill} stroke={nodeStroke} strokeWidth={isActive ? 2 : 1} />
              <text x={tableX + tableW / 2} y={y + 1} textAnchor="middle" className={`text-[11px] font-medium ${textColor}`}>
                {tc.label || tc.table}
              </text>
              {status?.recordCount > 0 && (
                <text x={tableX + tableW - 6} y={y + 1} textAnchor="end" className={`text-[9px] ${isDark ? 'fill-slate-500' : 'fill-gray-400'}`}>
                  {status.recordCount}
                </text>
              )}

              {/* Table -> Collection line */}
              <line x1={tableX + tableW} y1={y} x2={collX} y2={y} stroke={lineColor} strokeWidth={isActive ? 2 : 1} strokeDasharray={isActive ? '' : isComplete ? '' : '4 4'} />

              {/* Animated particles on table -> collection */}
              {isActive && [0, 1].map(p => {
                const t = ((animTick * 3 + p * 50 + 20) % 100) / 100;
                const px = (tableX + tableW) + (collX - tableX - tableW) * t;
                return <circle key={p} cx={px} cy={y} r={2.5} fill="#a78bfa" opacity={0.7} filter="url(#glow)" />;
              })}

              {/* Collection Node */}
              <rect x={collX} y={y - 16} width={collW} height={32} rx={8} fill={nodeFill} stroke={nodeStroke} strokeWidth={isActive ? 2 : 1} />
              {/* DB icon */}
              <g transform={`translate(${collX + 10}, ${y - 5})`}>
                <ellipse cx={5} cy={1} rx={5} ry={2.5} fill="none" stroke={isComplete ? '#10b981' : isDark ? '#64748b' : '#9ca3af'} strokeWidth={1} />
                <line x1={0} y1={1} x2={0} y2={8} stroke={isComplete ? '#10b981' : isDark ? '#64748b' : '#9ca3af'} strokeWidth={1} />
                <line x1={10} y1={1} x2={10} y2={8} stroke={isComplete ? '#10b981' : isDark ? '#64748b' : '#9ca3af'} strokeWidth={1} />
                <ellipse cx={5} cy={8} rx={5} ry={2.5} fill="none" stroke={isComplete ? '#10b981' : isDark ? '#64748b' : '#9ca3af'} strokeWidth={1} />
              </g>
              <text x={collX + 28} y={y + 1} textAnchor="start" className={`text-[10px] font-mono ${textColor}`}>
                {tc.collection}
              </text>

              {/* Collection -> Milvus line */}
              <line x1={collX + collW} y1={y} x2={milvusX} y2={totalH / 2} stroke={lineColor} strokeWidth={isActive ? 2 : 1} strokeDasharray={isActive ? '' : isComplete ? '' : '4 4'} />

              {/* Animated particles on collection -> milvus */}
              {isActive && [0].map(p => {
                const t = ((animTick * 2 + 40) % 100) / 100;
                const px = (collX + collW) + (milvusX - collX - collW) * t;
                const py = y + (totalH / 2 - y) * t;
                return <circle key={p} cx={px} cy={py} r={3} fill="#10b981" opacity={0.7} filter="url(#glow)" />;
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ==========================================
// Monitoring Dashboard
// ==========================================
const MonitoringDashboard = ({ pipeline, isDark, isRunning, progress, fmtDur }) => {
  const data = isRunning ? progress : pipeline.lastRun;
  if (!data) return null;

  const pct = data.totalRecords > 0 ? Math.min(100, Math.round(((data.processedRecords || 0) / data.totalRecords) * 100)) : 0;
  const tables = (isRunning ? progress?.tables : pipeline.lastRun?.tableDetails) || [];

  return (
    <div className="p-5">
      {/* Top stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <MetricCard isDark={isDark} label="Progress" value={`${pct}%`} sub={isRunning ? 'syncing' : 'done'} color="violet" />
        <MetricCard isDark={isDark} label="Records" value={(data.processedRecords || 0).toLocaleString()} sub={`of ${(data.totalRecords || 0).toLocaleString()}`} color="blue" />
        <MetricCard isDark={isDark} label="Duration" value={fmtDur(data.durationMs || data.elapsedMs)} sub={isRunning ? 'elapsed' : 'total'} color="amber" />
        <MetricCard isDark={isDark} label="Throughput" value={data.recordsPerSecond ? `${data.recordsPerSecond}/s` : '--'} sub="records/sec" color="emerald" />
        <MetricCard isDark={isDark} label="ETA" value={data.estimatedRemainingMs ? fmtDur(data.estimatedRemainingMs) : (isRunning ? 'calculating' : '--')} sub="remaining" color="purple" />
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            {isRunning ? (progress?.message || 'Processing...') : (data.status === 'completed' ? 'Pipeline completed successfully' : data.error || 'Pipeline finished')}
          </span>
          {isRunning && progress?.currentTableLabel && (
            <span className={`text-xs ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>
              {progress.currentTableLabel} ({progress.currentTableIndex + 1}/{progress.totalTables})
            </span>
          )}
        </div>
        <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-gray-200'}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              data.status === 'failed' ? 'bg-red-500' :
              data.status === 'completed' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
              'bg-gradient-to-r from-violet-600 via-purple-500 to-violet-400'
            }`}
            style={{ width: `${pct}%` }}
          ></div>
        </div>
      </div>

      {/* Per-table breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {tables.map((t, i) => {
          const tc = pipeline.tableCollections?.[i];
          return (
            <div key={t.table} className={`flex items-center justify-between px-3 py-2 rounded-lg ${
              t.status === 'running' ? isDark ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-violet-50 border border-violet-200' :
              t.status === 'completed' ? isDark ? 'bg-emerald-500/5 border border-emerald-500/10' : 'bg-emerald-50 border border-emerald-200' :
              t.status === 'failed' ? isDark ? 'bg-red-500/5 border border-red-500/10' : 'bg-red-50 border border-red-200' :
              isDark ? 'bg-slate-800/50 border border-slate-700/50' : 'bg-gray-50 border border-gray-200'
            }`}>
              <div>
                <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>{tc?.label || t.table}</p>
                <p className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{tc?.collection}</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{t.recordCount || 0}</span>
                {t.status === 'completed' && <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                {t.status === 'running' && <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>}
                {t.status === 'failed' && <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>}
                {t.status === 'pending' && <span className={`w-2 h-2 rounded-full ${isDark ? 'bg-slate-600' : 'bg-gray-300'}`}></span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==========================================
// Metric Card
// ==========================================
const MetricCard = ({ isDark, label, value, sub, color }) => {
  const colors = {
    violet: isDark ? 'text-violet-400' : 'text-violet-600',
    blue: isDark ? 'text-blue-400' : 'text-blue-600',
    amber: isDark ? 'text-amber-400' : 'text-amber-600',
    emerald: isDark ? 'text-emerald-400' : 'text-emerald-600',
    purple: isDark ? 'text-purple-400' : 'text-purple-600',
  };
  return (
    <div className={`px-3 py-2.5 rounded-lg ${isDark ? 'bg-slate-800/70' : 'bg-white border border-gray-100'}`}>
      <p className={`text-[10px] uppercase tracking-wider font-semibold ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${colors[color] || colors.violet}`}>{value}</p>
      <p className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>{sub}</p>
    </div>
  );
};

// ==========================================
// Wizard: Select Data Types
// ==========================================
const WizardDataSelect = ({ isDark, source, sourceDef, dataTypes, selected, onToggle, onNext, onCancel }) => (
  <div className={`mb-10 rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200'}`}>
    <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800 bg-gradient-to-r from-violet-950/50 to-slate-900' : 'border-gray-100 bg-gradient-to-r from-violet-50 to-white'}`}>
      <div className="flex items-center space-x-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-violet-500/20 text-violet-400' : 'bg-violet-100 text-violet-600'}`}>
          {sourceDef?.icon && React.cloneElement(sourceDef.icon, { className: 'w-5 h-5' })}
        </div>
        <div>
          <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{sourceDef?.name} &rarr; Milvus</h3>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Select data types to ingest</p>
        </div>
      </div>
      <button onClick={onCancel} className={`text-sm px-3 py-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>Cancel</button>
    </div>
    <div className="p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {dataTypes.map(dt => {
          const sel = selected.includes(dt.key);
          return (
            <button key={dt.key} onClick={() => onToggle(dt)} className={`p-4 rounded-xl border-2 text-left transition-all ${sel ? isDark ? 'border-violet-500 bg-violet-500/10' : 'border-blue-500 bg-blue-50' : isDark ? 'border-slate-700 hover:border-slate-600' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{dt.label}</span>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel ? 'border-violet-500 bg-violet-500' : isDark ? 'border-slate-600' : 'border-gray-300'}`}>
                  {sel && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </div>
              </div>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Table: {dt.table}</p>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end mt-6">
        <button onClick={onNext} disabled={!selected.length} className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:shadow-violet-500/20">
          Next: Collection Names &rarr;
        </button>
      </div>
    </div>
  </div>
);

// ==========================================
// Wizard: Collection Names
// ==========================================
const WizardCollections = ({ isDark, source, sourceDef, dataTypes, selected, collectionNames, setCollectionNames, onBack, onCreate, creating, onCancel }) => (
  <div className={`mb-10 rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200'}`}>
    <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800 bg-gradient-to-r from-emerald-950/30 to-slate-900' : 'border-gray-100 bg-gradient-to-r from-emerald-50 to-white'}`}>
      <div>
        <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Milvus Collection Names</h3>
        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Set the target collection for each data type</p>
      </div>
      <button onClick={onBack} className={`text-sm px-3 py-1.5 rounded-lg ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>&larr; Back</button>
    </div>
    <div className="p-6 space-y-3">
      {selected.map(key => {
        const dt = dataTypes.find(d => d.key === key);
        return (
          <div key={key} className={`flex items-center space-x-4 p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
            <div className="flex-shrink-0 w-36">
              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{dt?.label || key}</p>
              <p className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>{dt?.table}</p>
            </div>
            <svg className={`w-5 h-5 flex-shrink-0 ${isDark ? 'text-slate-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <input
              type="text"
              value={collectionNames[key] || ''}
              onChange={(e) => setCollectionNames(prev => ({ ...prev, [key]: e.target.value }))}
              placeholder={`${source}_${key}`}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-mono ${isDark ? 'bg-slate-900 border-slate-600 text-white placeholder-slate-500 focus:border-violet-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500'} focus:outline-none focus:ring-1 ${isDark ? 'focus:ring-violet-500' : 'focus:ring-blue-500'}`}
            />
          </div>
        );
      })}
      <div className="flex justify-between pt-4">
        <button onClick={onCancel} className={`px-4 py-2 rounded-xl text-sm ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}>Cancel</button>
        <button
          onClick={onCreate}
          disabled={creating || selected.some(k => !collectionNames[k]?.trim())}
          className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:shadow-emerald-500/20"
        >
          {creating ? 'Creating...' : 'Create Pipeline'}
        </button>
      </div>
    </div>
  </div>
);

export default Pipelines;

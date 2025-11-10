import React, { useState } from 'react';

const ClusterSetup = ({ data, updateData, nextStep }) => {
  const [formData, setFormData] = useState({
    clusterType: data.clusterType || '',
    hasPrometheus: data.hasPrometheus || false,
    hasGrafana: data.hasGrafana || false
  });

  const clusterOptions = [
    {
      id: 'aws',
      name: 'Amazon EKS',
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6.76 13.482l-4.12.649 4.12 1.628v-2.277zm5.31-3.39l-4.12-1.628v2.276l4.12-.648zm-5.31-1.78l4.12 1.63V7.665l-4.12.648zm6.51 5.32l4.12.65v-2.28l-4.12.65v.98zm-1.19.18l-4.12-.65v.98l4.12 1.63v-1.96zm5.31-3.67l-4.12-1.63v1.96l4.12.65v-.98zm-4.12-3.02v2.28l4.12-.65-.02-1.63-4.1.65-.01.35z"/>
        </svg>
      ),
      description: 'Amazon Elastic Kubernetes Service'
    },
    {
      id: 'gcp',
      name: 'Google GKE',
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02.104-.045.157-.063 1.021-.349 2.096-.531 3.175-.536.335-.002.67.027 1.002.083a6.211 6.211 0 0 1 9.42-2.305 1.292 1.292 0 0 1 .322.34l2.107-2.107a1.292 1.292 0 0 1-.334-.33 9.344 9.344 0 0 0-6.615-1.975zM3.24 10.79c-.26 0-.521.01-.781.027l-.028.003a9.344 9.344 0 0 0 16.573 7.642l.002-.002-2.677-2.21a6.211 6.211 0 0 1-9.955-2.473c-.435.09-.88.135-1.326.135-.269 0-.538-.014-.808-.042z"/>
        </svg>
      ),
      description: 'Google Kubernetes Engine'
    },
    {
      id: 'azure',
      name: 'Azure AKS',
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
          <path d="M5.483 17.829l3.146-12.113h2.31l-3.145 12.113h-2.31zm8.564 0l-3.146-12.113h2.31l3.146 12.113h-2.31z"/>
        </svg>
      ),
      description: 'Azure Kubernetes Service'
    },
    {
      id: 'minikube',
      name: 'Minikube',
      icon: (
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l7.6 3.8L12 11.77 4.4 7.98 12 4.18zM4 9.47l7 3.5v7.05l-7-3.5V9.47zm9 10.55v-7.05l7-3.5v7.05l-7 3.5z"/>
        </svg>
      ),
      description: 'Local Kubernetes Cluster'
    }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.clusterType) {
      alert('Please select a cluster type');
      return;
    }
    updateData(formData);
    nextStep();
  };

  const handleClusterSelect = (clusterId) => {
    setFormData(prev => ({ ...prev, clusterType: clusterId }));
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  return (
    <div className="bg-[#13131f] rounded-xl border border-slate-800 overflow-hidden max-h-[calc(100vh-300px)] flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-8 py-6 flex-shrink-0">
        <h2 className="text-2xl font-bold text-white mb-2">Configure Your Kubernetes Cluster</h2>
        <p className="text-violet-100">Tell us about your infrastructure setup to customize your experience</p>
      </div>

      {/* Content - Scrollable */}
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
        <div className="p-8 overflow-y-auto flex-1">
          {/* Cluster Type Selection */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-slate-300 mb-4">
              Select Your Cluster Type
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clusterOptions.map((cluster) => (
                <button
                  key={cluster.id}
                  type="button"
                  onClick={() => handleClusterSelect(cluster.id)}
                  className={`relative p-6 rounded-lg border-2 transition-all text-left hover:shadow-md ${
                    formData.clusterType === cluster.id
                      ? 'border-violet-500 bg-violet-500/10 shadow-md'
                      : 'border-slate-700 hover:border-violet-500/50 bg-[#1a1a2e]'
                  }`}
                >
                  <div className="flex items-start space-x-4">
                    <div className={`flex-shrink-0 ${
                      formData.clusterType === cluster.id ? 'text-violet-400' : 'text-slate-500'
                    }`}>
                      {cluster.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-1">{cluster.name}</h3>
                      <p className="text-sm text-slate-400">{cluster.description}</p>
                    </div>
                    {formData.clusterType === cluster.id && (
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 bg-violet-500 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Monitoring Stack */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-slate-300 mb-4">
              Existing Monitoring Setup
            </label>
            <div className="bg-[#1a1a2e] rounded-lg p-6 border border-slate-700">
              <p className="text-sm text-slate-400 mb-4">
                Do you have any of the following monitoring tools already installed on your cluster?
              </p>
              <div className="space-y-3">
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="hasPrometheus"
                    checked={formData.hasPrometheus}
                    onChange={handleCheckboxChange}
                    className="w-5 h-5 text-violet-600 bg-slate-700 border-slate-600 rounded focus:ring-violet-500 cursor-pointer"
                  />
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="w-10 h-10 bg-[#13131f] rounded-lg border border-slate-700 flex items-center justify-center group-hover:border-orange-500 transition-colors">
                      <svg className="w-6 h-6 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2L2 7v10l10 5 10-5V7L12 2z"/>
                      </svg>
                    </div>
                    <div>
                      <span className="font-medium text-white">Prometheus</span>
                      <p className="text-xs text-slate-500">Metrics collection and monitoring</p>
                    </div>
                  </div>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="hasGrafana"
                    checked={formData.hasGrafana}
                    onChange={handleCheckboxChange}
                    className="w-5 h-5 text-violet-600 bg-slate-700 border-slate-600 rounded focus:ring-violet-500 cursor-pointer"
                  />
                  <div className="flex items-center space-x-3 flex-1">
                    <div className="w-10 h-10 bg-[#13131f] rounded-lg border border-slate-700 flex items-center justify-center group-hover:border-orange-500 transition-colors">
                      <svg className="w-6 h-6 text-orange-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21.5 12.2c0-1.7-1.4-3.1-3.1-3.1-.5 0-.9.1-1.3.3-.5-2.6-2.8-4.5-5.5-4.5-3.1 0-5.6 2.5-5.6 5.6 0 .3 0 .6.1.9C4.5 11.9 3 13.6 3 15.7c0 2.4 2 4.4 4.4 4.4h10.7c2.2 0 4-1.8 4-4 0-1.9-1.4-3.5-3.2-3.9z"/>
                      </svg>
                    </div>
                    <div>
                      <span className="font-medium text-white">Grafana</span>
                      <p className="text-xs text-slate-500">Visualization and dashboards</p>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-4">
            <div className="flex space-x-3">
              <svg className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-slate-300">
                <p className="font-medium mb-1">Don't worry if you don't have these installed!</p>
                <p className="text-slate-400">We'll provide step-by-step instructions to set up everything you need in the next step.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons - Fixed at bottom */}
        <div className="flex items-center justify-between px-8 py-6 border-t border-slate-800 bg-[#13131f] flex-shrink-0">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="text-slate-400 hover:text-white font-medium transition-colors flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back</span>
          </button>
          <button
            type="submit"
            className="px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg font-semibold flex items-center space-x-2"
          >
            <span>Continue</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default ClusterSetup;

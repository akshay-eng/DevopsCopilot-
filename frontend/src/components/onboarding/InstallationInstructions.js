import React, { useState } from 'react';

const InstallationInstructions = ({ data, updateData, nextStep, prevStep }) => {
  const [copiedIndex, setCopiedIndex] = useState(null);

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getInstallationSteps = () => {
    const steps = [];

    steps.push({
      title: 'Create AIOps Namespace',
      description: 'First, create a dedicated namespace for the AIOps platform',
      commands: ['kubectl create namespace aiops-platform']
    });

    if (!data.hasPrometheus) {
      steps.push({
        title: 'Install Prometheus',
        description: 'Install Prometheus for metrics collection',
        commands: [
          'helm repo add prometheus-community https://prometheus-community.github.io/helm-charts',
          'helm repo update',
          'helm install prometheus prometheus-community/kube-prometheus-stack --namespace aiops-platform'
        ]
      });
    }

    if (!data.hasGrafana) {
      steps.push({
        title: 'Install Grafana',
        description: 'Install Grafana for visualization and dashboards',
        commands: [
          'helm repo add grafana https://grafana.github.io/helm-charts',
          'helm install grafana grafana/grafana --namespace aiops-platform'
        ]
      });
    }

    steps.push({
      title: 'Install AIOps Platform Agent',
      description: 'Deploy the AIOps platform agent to your cluster',
      commands: [
        'helm repo add aiops https://charts.aiops-platform.io',
        'helm repo update',
        `helm install aiops-agent aiops/aiops-agent \\
  --namespace aiops-platform \\
  --set clusterType=${data.clusterType} \\
  --set auth.apiKey=YOUR_API_KEY_HERE`
      ]
    });

    steps.push({
      title: 'Verify Installation',
      description: 'Check that all components are running correctly',
      commands: [
        'kubectl get pods -n aiops-platform',
        'kubectl logs -n aiops-platform -l app=aiops-agent --tail=50'
      ]
    });

    return steps;
  };

  const installationSteps = getInstallationSteps();

  const handleContinue = () => {
    updateData({ installationComplete: true });
    nextStep();
  };

  return (
    <div className="bg-[#13131f] rounded-xl border border-slate-800 overflow-hidden max-h-[calc(100vh-300px)] flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-8 py-6 flex-shrink-0">
        <h2 className="text-2xl font-bold text-white mb-2">Installation Instructions</h2>
        <p className="text-violet-100">Follow these steps to install AIOps Platform on your {data.clusterType?.toUpperCase()} cluster</p>
      </div>

      {/* Content - Scrollable */}
      <div className="p-8 overflow-y-auto flex-1">
        {/* Prerequisites */}
        <div className="mb-8 bg-amber-500/10 border border-amber-500/30 rounded-lg p-5">
          <div className="flex items-start space-x-3">
            <svg className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-semibold text-amber-300 mb-2">Prerequisites</h3>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• kubectl configured and connected to your cluster</li>
                <li>• Helm 3.0+ installed on your machine</li>
                <li>• Cluster admin permissions</li>
                <li>• At least 4GB of available cluster memory</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Installation Steps */}
        <div className="space-y-6">
          {installationSteps.map((step, stepIndex) => (
            <div key={stepIndex} className="border border-slate-700 rounded-lg overflow-hidden bg-[#1a1a2e]">
              {/* Step Header */}
              <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700">
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-violet-600 text-white rounded-full flex items-center justify-center font-semibold flex-shrink-0">
                    {stepIndex + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white mb-1">{step.title}</h3>
                    <p className="text-sm text-slate-400">{step.description}</p>
                  </div>
                </div>
              </div>

              {/* Commands */}
              <div className="p-6 space-y-3">
                {step.commands.map((command, cmdIndex) => {
                  const commandKey = `${stepIndex}-${cmdIndex}`;
                  return (
                    <div key={cmdIndex} className="relative group">
                      <pre className="bg-[#0a0a0f] text-slate-200 rounded-lg p-4 overflow-x-auto text-sm font-mono border border-slate-800">
                        <code>{command}</code>
                      </pre>
                      <button
                        onClick={() => copyToClipboard(command, commandKey)}
                        className="absolute top-3 right-3 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-medium transition-all opacity-0 group-hover:opacity-100"
                      >
                        {copiedIndex === commandKey ? (
                          <span className="flex items-center space-x-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Copied!</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>Copy</span>
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Important Notes */}
        <div className="mt-8 bg-violet-500/10 border border-violet-500/30 rounded-lg p-5">
          <div className="flex items-start space-x-3">
            <svg className="w-6 h-6 text-violet-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-violet-300 mb-2">Important Notes</h3>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• Replace YOUR_API_KEY_HERE with your actual API key from the dashboard</li>
                <li>• Installation typically takes 2-3 minutes to complete</li>
                <li>• Make sure your cluster has internet access to pull container images</li>
                <li>• You can check installation progress with: <code className="bg-violet-500/20 px-1 rounded text-violet-300">kubectl get events -n aiops-platform</code></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-6 flex items-center justify-between p-4 bg-[#1a1a2e] rounded-lg border border-slate-700">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="text-sm text-slate-400">Need help with installation?</span>
          </div>
          <a href="#" className="text-sm font-medium text-violet-400 hover:text-violet-300 flex items-center space-x-1">
            <span>View Documentation</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      </div>

      {/* Action Buttons - Fixed at bottom */}
      <div className="flex items-center justify-between px-8 py-6 border-t border-slate-800 bg-[#13131f] flex-shrink-0">
        <button
          type="button"
          onClick={prevStep}
          className="text-slate-400 hover:text-white font-medium transition-colors flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Back</span>
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="px-8 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg font-semibold flex items-center space-x-2"
        >
          <span>I've Completed Installation</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default InstallationInstructions;

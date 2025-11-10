import React, { useState, useEffect } from 'react';

const ConnectivityTest = ({ data, updateData, nextStep, prevStep }) => {
  const [testState, setTestState] = useState('starting');
  const [currentTest, setCurrentTest] = useState(0);
  const [progress, setProgress] = useState(0);

  const tests = [
    { name: 'Verifying cluster connection', duration: 2000 },
    { name: 'Authenticating credentials', duration: 1500 },
    { name: 'Checking Prometheus endpoint', duration: 2500 },
    { name: 'Validating Grafana integration', duration: 1800 },
    { name: 'Testing metrics collection', duration: 2200 },
    { name: 'Establishing secure connection', duration: 1500 },
    { name: 'Finalizing setup', duration: 1000 }
  ];

  useEffect(() => {
    const startTest = setTimeout(() => {
      setTestState('testing');
      runTests();
    }, 1000);

    return () => clearTimeout(startTest);
  }, []);

  const runTests = async () => {
    for (let i = 0; i < tests.length; i++) {
      setCurrentTest(i);
      await new Promise(resolve => setTimeout(resolve, tests[i].duration));
      setProgress(((i + 1) / tests.length) * 100);
    }
    setTestState('success');
    updateData({ connectionEstablished: true });
  };

  const handleContinue = () => {
    nextStep();
  };

  const handleRetry = () => {
    setTestState('starting');
    setCurrentTest(0);
    setProgress(0);
    setTimeout(() => {
      setTestState('testing');
      runTests();
    }, 1000);
  };

  return (
    <div className="bg-[#13131f] rounded-xl border border-slate-800 overflow-hidden max-h-[calc(100vh-300px)] flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-8 py-6 flex-shrink-0">
        <h2 className="text-2xl font-bold text-white mb-2">Testing Connectivity</h2>
        <p className="text-violet-100">Establishing connection to your cluster and validating the setup</p>
      </div>

      {/* Content */}
      <div className="p-8 flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center py-12">
          {testState === 'starting' && (
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-violet-500/20 to-purple-500/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <svg className="w-12 h-12 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Initializing Connection</h3>
              <p className="text-slate-400">Preparing to test your cluster connectivity...</p>
            </div>
          )}

          {testState === 'testing' && (
            <div className="w-full max-w-2xl">
              {/* Animated Connection Graphic */}
              <div className="flex items-center justify-center mb-8 space-x-8">
                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-br from-violet-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-[#13131f] animate-pulse"></div>
                </div>

                {/* Animated Connection Lines */}
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex space-x-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-violet-500 rounded-full animate-pulse"
                        style={{
                          animationDelay: `${i * 0.2}s`,
                          animationDuration: '1s'
                        }}
                      ></div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="w-20 h-20 bg-gradient-to-br from-violet-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-[#13131f] animate-pulse"></div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-300">Connection Progress</span>
                  <span className="text-sm font-semibold text-violet-400">{Math.round(progress)}%</span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-600 to-purple-600 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>

              {/* Test Steps */}
              <div className="bg-[#1a1a2e] rounded-lg border border-slate-700 p-6">
                <div className="space-y-3">
                  {tests.map((test, index) => (
                    <div key={index} className="flex items-center space-x-3">
                      <div className={`flex-shrink-0 ${
                        index < currentTest
                          ? 'text-green-400'
                          : index === currentTest
                          ? 'text-violet-400'
                          : 'text-slate-600'
                      }`}>
                        {index < currentTest ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : index === currentTest ? (
                          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm ${
                        index < currentTest
                          ? 'text-slate-500 line-through'
                          : index === currentTest
                          ? 'text-white font-medium'
                          : 'text-slate-600'
                      }`}>
                        {test.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {testState === 'success' && (
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce border-2 border-green-500">
                <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Connection Successful!</h3>
              <p className="text-slate-400 mb-6">Your cluster is now connected to AIOps Platform</p>

              {/* Success Details */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 max-w-md mx-auto">
                <div className="space-y-3 text-left">
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-slate-300">Cluster authenticated and connected</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-slate-300">Monitoring agents deployed successfully</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-slate-300">Metrics collection started</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-slate-300">Real-time monitoring active</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {testState === 'error' && (
            <div className="text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-red-500/20 to-rose-500/20 rounded-full flex items-center justify-center mb-6 border-2 border-red-500">
                <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Connection Failed</h3>
              <p className="text-slate-400 mb-6">We couldn't establish a connection to your cluster</p>
              <button
                onClick={handleRetry}
                className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all font-medium"
              >
                Retry Connection
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      {testState === 'success' && (
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
            <span>Continue to Final Step</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      )}

      {testState === 'testing' && (
        <div className="flex items-center justify-center px-8 py-6 border-t border-slate-800 bg-[#13131f] flex-shrink-0">
          <p className="text-sm text-slate-400">Please wait while we test the connection...</p>
        </div>
      )}
    </div>
  );
};

export default ConnectivityTest;

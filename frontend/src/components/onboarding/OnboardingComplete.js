import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const OnboardingComplete = ({ data }) => {
  const navigate = useNavigate();
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    // Mark onboarding as complete
    const completeOnboarding = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (token) {
          const authServiceUrl = process.env.REACT_APP_AUTH_SERVICE_URL || 'http://localhost:5001';
          await fetch(`${authServiceUrl}/api/auth/complete-onboarding`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
        }
      } catch (error) {
        console.error('Failed to mark onboarding as complete:', error);
      }
    };

    completeOnboarding();

    // Auto-redirect to dashboard after 5 seconds
    const timer = setTimeout(() => {
      navigate('/dashboard');
      console.log('Redirecting to dashboard with data:', data);
    }, 5000);

    return () => clearTimeout(timer);
  }, [data, navigate]);

  const handleContinue = async () => {
    setCompleting(true);
    try {
      const token = localStorage.getItem('access_token');
      if (token) {
        const authServiceUrl = process.env.REACT_APP_AUTH_SERVICE_URL || 'http://localhost:5001';
        await fetch(`${authServiceUrl}/api/auth/complete-onboarding`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (error) {
      console.error('Failed to mark onboarding as complete:', error);
    }
    navigate('/dashboard');
    console.log('Manual navigation to dashboard with data:', data);
  };

  return (
    <div className="min-h-[600px] flex items-center justify-center">
      <div className="max-w-2xl w-full">
        {/* Success Animation */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-32 h-32 bg-gradient-to-br from-purple-400 to-violet-500 rounded-full mb-6 animate-bounce shadow-2xl">
            <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-slate-800 mb-4">
            Welcome to AIOps Platform!
          </h1>
          <p className="text-xl text-slate-600 mb-2">
            Your setup is complete and you're ready to go
          </p>
          <p className="text-sm text-slate-500">
            Redirecting to your dashboard in 5 seconds...
          </p>
        </div>

        {/* Setup Summary Card */}
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Setup Summary</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start space-x-4 pb-4 border-b border-slate-200">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800 mb-1">Cluster Configuration</h3>
                <p className="text-sm text-slate-600">
                  Type: <span className="font-medium text-slate-800">{data.clusterType?.toUpperCase() || 'Not specified'}</span>
                </p>
                <div className="flex items-center space-x-4 mt-2 text-sm">
                  <span className={`flex items-center ${data.hasPrometheus ? 'text-purple-600' : 'text-slate-400'}`}>
                    {data.hasPrometheus ? '✓' : '○'} Prometheus
                  </span>
                  <span className={`flex items-center ${data.hasGrafana ? 'text-purple-600' : 'text-slate-400'}`}>
                    {data.hasGrafana ? '✓' : '○'} Grafana
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-4 pb-4 border-b border-slate-200">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800 mb-1">Installation Status</h3>
                <p className="text-sm text-purple-600 font-medium">Completed Successfully</p>
              </div>
            </div>

            <div className="flex items-start space-x-4 pb-4 border-b border-slate-200">
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800 mb-1">Connection Status</h3>
                <p className="text-sm text-purple-600 font-medium flex items-center">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-2 animate-pulse"></span>
                  Connected & Monitoring
                </p>
              </div>
            </div>

            {data.referralSource && (
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800 mb-1">Referral Source</h3>
                  <p className="text-sm text-slate-600 capitalize">{data.referralSource}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Quick Start Tips
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                title: 'Explore Your Dashboard',
                description: 'Get familiar with real-time metrics and AI insights',
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                )
              },
              {
                title: 'Set Up Alerts',
                description: 'Configure intelligent alerting for your team',
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                )
              },
              {
                title: 'Invite Your Team',
                description: 'Collaborate with team members and set permissions',
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                )
              },
              {
                title: 'Review Documentation',
                description: 'Learn about advanced features and best practices',
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                )
              }
            ].map((tip, idx) => (
              <div key={idx} className="bg-white rounded-lg p-4 border border-blue-200">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {tip.icon}
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-sm mb-1">{tip.title}</h3>
                    <p className="text-xs text-slate-600">{tip.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center">
          <button
            onClick={handleContinue}
            className="px-12 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-xl hover:shadow-2xl font-semibold text-lg transform hover:scale-105"
          >
            Go to Dashboard →
          </button>
          <p className="text-sm text-slate-500 mt-4">
            Need help getting started?{' '}
            <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default OnboardingComplete;

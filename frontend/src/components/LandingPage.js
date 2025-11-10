import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation Bar */}
      <nav className="absolute top-0 w-full z-50 px-6 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white">AIOps Platform</span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
            <a href="#solutions" className="text-gray-300 hover:text-white transition-colors">Solutions</a>
            <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">Pricing</a>
            <a href="#docs" className="text-gray-300 hover:text-white transition-colors">Documentation</a>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-2.5 text-white hover:text-indigo-200 transition-colors font-medium"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/register')}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/50 font-medium"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            {/* Badge */}
            <div className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></span>
              <span className="text-indigo-300 text-sm font-medium">Powered by Advanced AI & Machine Learning</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Enterprise-Grade
              <br />
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                AIOps Platform
              </span>
            </h1>

            <p className="text-xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
              Intelligent observability, monitoring, and incident management powered by AI.
              Predict issues before they impact your business and reduce MTTR by up to 80%.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              <button
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/50 font-semibold text-lg"
              >
                Start Free Trial
              </button>
              <button className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-lg hover:bg-white/20 transition-all border border-white/20 font-semibold text-lg">
                Watch Demo
              </button>
            </div>

            {/* Trust Indicators */}
            <div className="mt-12 flex items-center justify-center space-x-8 text-gray-400 text-sm">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>SOC 2 Certified</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>GDPR Compliant</span>
              </div>
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>99.99% Uptime</span>
              </div>
            </div>
          </div>

          {/* Dashboard Preview */}
          <div className="relative max-w-6xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur-3xl opacity-20"></div>
            <div className="relative bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-white/10 p-4 shadow-2xl">
              <div className="bg-slate-900/90 rounded-lg overflow-hidden">
                {/* Mock Dashboard Header */}
                <div className="bg-slate-800/50 px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex space-x-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                    <span className="text-gray-400 text-sm">dashboard.aiops.platform</span>
                  </div>
                </div>

                {/* Mock Dashboard Content */}
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                      { label: 'System Health', value: '98.7%', trend: 'up', color: 'green' },
                      { label: 'Active Alerts', value: '23', trend: 'down', color: 'yellow' },
                      { label: 'MTTR', value: '4.2m', trend: 'down', color: 'blue' },
                      { label: 'Incidents', value: '2', trend: 'up', color: 'red' }
                    ].map((metric, idx) => (
                      <div key={idx} className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                        <div className="text-gray-400 text-xs mb-2">{metric.label}</div>
                        <div className="flex items-end justify-between">
                          <div className="text-2xl font-bold text-white">{metric.value}</div>
                          <div className={`text-${metric.color}-400 text-xs flex items-center`}>
                            {metric.trend === 'up' ? '↑' : '↓'} 12%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-white font-semibold">Real-Time Monitoring</h3>
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                        <span className="text-green-400 text-sm">Live</span>
                      </div>
                    </div>
                    <div className="h-32 relative">
                      {/* Simulated chart lines */}
                      <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
                        <path d="M0,80 Q50,20 100,40 T200,30 T300,50 T400,20"
                              stroke="url(#gradient1)" strokeWidth="2" fill="none" className="opacity-70"/>
                        <path d="M0,60 Q50,40 100,20 T200,50 T300,30 T400,40"
                              stroke="url(#gradient2)" strokeWidth="2" fill="none" className="opacity-70"/>
                        <defs>
                          <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                          </linearGradient>
                          <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#3b82f6" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Powerful Features for Modern Teams</h2>
            <p className="text-xl text-gray-400">Everything you need to maintain peak performance</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                ),
                title: 'AI-Powered Insights',
                description: 'Machine learning algorithms analyze patterns and predict incidents before they occur, reducing downtime significantly.'
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                ),
                title: 'Real-Time Monitoring',
                description: 'Monitor your entire infrastructure in real-time with sub-second data granularity and instant alerting.'
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                ),
                title: 'Automated Remediation',
                description: 'Intelligent automation responds to incidents instantly, executing predefined playbooks to resolve issues automatically.'
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                ),
                title: 'Enterprise Security',
                description: 'Bank-grade security with end-to-end encryption, SSO, RBAC, and comprehensive audit logs.'
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                ),
                title: 'Collaboration Tools',
                description: 'Built-in chat, video conferencing, and incident war rooms keep teams aligned during critical moments.'
              },
              {
                icon: (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                ),
                title: 'Unlimited Integrations',
                description: 'Connect with 500+ tools including Kubernetes, AWS, Azure, Datadog, PagerDuty, and more.'
              }
            ].map((feature, idx) => (
              <div key={idx} className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-8 border border-slate-700 hover:border-indigo-500/50 transition-all hover:shadow-xl hover:shadow-indigo-500/10">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {feature.icon}
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: '10K+', label: 'Enterprise Customers' },
                { value: '99.99%', label: 'Platform Uptime' },
                { value: '80%', label: 'Reduction in MTTR' },
                { value: '50M+', label: 'Events Processed Daily' }
              ].map((stat, idx) => (
                <div key={idx} className="text-center">
                  <div className="text-4xl md:text-5xl font-bold text-white mb-2">{stat.value}</div>
                  <div className="text-indigo-100">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Transform Your Operations?
          </h2>
          <p className="text-xl text-gray-300 mb-12">
            Join thousands of enterprises using AIOps to prevent incidents and accelerate innovation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/50 font-semibold text-lg"
            >
              Start Free 30-Day Trial
            </button>
            <button className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-lg hover:bg-white/20 transition-all border border-white/20 font-semibold text-lg">
              Schedule a Demo
            </button>
          </div>
          <p className="text-gray-400 text-sm mt-6">No credit card required • Setup in 5 minutes</p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
            <div className="col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-white">AIOps Platform</span>
              </div>
              <p className="text-gray-400 text-sm max-w-xs">
                Enterprise-grade observability and AIOps platform trusted by leading organizations worldwide.
              </p>
            </div>
            {[
              { title: 'Product', links: ['Features', 'Integrations', 'Pricing', 'Security'] },
              { title: 'Resources', links: ['Documentation', 'API Reference', 'Blog', 'Community'] },
              { title: 'Company', links: ['About', 'Careers', 'Contact', 'Partners'] }
            ].map((section, idx) => (
              <div key={idx}>
                <h4 className="text-white font-semibold mb-4">{section.title}</h4>
                <ul className="space-y-2">
                  {section.links.map((link, linkIdx) => (
                    <li key={linkIdx}>
                      <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between">
            <p className="text-gray-400 text-sm">© 2025 AIOps Platform. All rights reserved.</p>
            <div className="flex items-center space-x-6 mt-4 md:mt-0">
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Privacy Policy</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Terms of Service</a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

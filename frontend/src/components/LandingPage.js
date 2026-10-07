import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars, Float, Html } from '@react-three/drei';
import { motion } from 'framer-motion';
import ServerCluster from './3d/ServerCluster';
import ParticleNetwork from './3d/ParticleNetwork';

// Loading fallback component
function CanvasLoader() {
  return (
    <Html center>
      <div className="flex items-center justify-center">
        <div className="text-white text-xl">Loading 3D Experience...</div>
      </div>
    </Html>
  );
}

// 3D Scene Component
function Scene() {
  return (
    <>
      {/* Lighting Setup */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#6366f1" />
      <pointLight position={[10, 10, 10]} intensity={0.5} color="#8b5cf6" />

      {/* Stars background */}
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      {/* Particle Network */}
      <ParticleNetwork count={150} />

      {/* Main Server Cluster - positioned for visibility */}
      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
        <group position={[0, 0, 0]}>
          <ServerCluster />
        </group>
      </Float>

      {/* Orbit Controls for user interaction */}
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.5}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 3}
      />

      {/* Camera */}
      <PerspectiveCamera makeDefault position={[0, 2, 8]} fov={50} />
    </>
  );
}

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-slate-900 overflow-hidden">
      {/* 3D Canvas Background - Full viewport */}
      <div className="fixed inset-0 z-0">
        <Canvas>
          <Suspense fallback={<CanvasLoader />}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {/* Dark overlay for better text readability */}
      <div className="fixed inset-0 bg-gradient-to-b from-slate-900/50 via-transparent to-slate-900/90 z-10 pointer-events-none" />

      {/* Content Layer */}
      <div className="relative z-20">
        {/* Navigation Bar */}
        <motion.nav
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute top-0 w-full z-50 px-6 py-6"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between backdrop-blur-md bg-slate-900/30 rounded-2xl px-6 py-4 border border-white/10">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/50">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-white">AIOps Platform</span>
            </div>

            <div className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-300 hover:text-white transition-colors font-medium">Features</a>
              <a href="#solutions" className="text-gray-300 hover:text-white transition-colors font-medium">Solutions</a>
              <a href="#pricing" className="text-gray-300 hover:text-white transition-colors font-medium">Pricing</a>
              <a href="#docs" className="text-gray-300 hover:text-white transition-colors font-medium">Documentation</a>
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
        </motion.nav>

        {/* Hero Section */}
        <div className="relative pt-32 pb-20 px-6 min-h-screen flex items-center">
          <div className="max-w-7xl mx-auto w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left Column - Text Content */}
              <motion.div
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 1, delay: 0.3 }}
                className="text-left space-y-8"
              >
                {/* Badge */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-2 backdrop-blur-sm"
                >
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></span>
                  <span className="text-indigo-300 text-sm font-medium">Powered by Advanced AI & Machine Learning</span>
                </motion.div>

                {/* Main Headline */}
                <div>
                  <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                    className="text-6xl md:text-7xl font-bold text-white mb-6 leading-tight"
                  >
                    Enterprise-Grade
                    <br />
                    <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                      AIOps Platform
                    </span>
                  </motion.h1>

                  <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.8 }}
                    className="text-xl text-gray-300 leading-relaxed"
                  >
                    Intelligent observability, monitoring, and incident management powered by AI.
                    Predict issues before they impact your business and reduce MTTR by up to 80%.
                  </motion.p>
                </div>

                {/* CTA Buttons */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 1 }}
                  className="flex flex-col sm:flex-row items-start space-y-4 sm:space-y-0 sm:space-x-6"
                >
                  <button
                    onClick={() => navigate('/register')}
                    className="group px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/50 font-semibold text-lg hover:shadow-2xl hover:shadow-indigo-500/70 hover:scale-105"
                  >
                    Start Free Trial
                    <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
                  </button>
                  <button className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-xl hover:bg-white/20 transition-all border border-white/20 font-semibold text-lg hover:scale-105">
                    Watch Demo
                  </button>
                </motion.div>

                {/* Trust Indicators */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.8, delay: 1.2 }}
                  className="flex items-center space-x-8 text-gray-400 text-sm"
                >
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
                </motion.div>
              </motion.div>

              {/* Right Column - 3D Visualization Description */}
              <motion.div
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 1, delay: 0.5 }}
                className="hidden lg:block"
              >
                <div className="backdrop-blur-md bg-slate-900/20 rounded-2xl p-8 border border-white/10">
                  <h3 className="text-2xl font-bold text-white mb-4">Interactive Infrastructure Visualization</h3>
                  <p className="text-gray-300 mb-6">
                    Experience real-time monitoring in 3D. Click on any server node to see live metrics.
                    Watch data flow through your infrastructure with our interactive visualization.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 rounded-full bg-indigo-400 animate-pulse"></div>
                      <span className="text-gray-300">Real-time data streaming</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 rounded-full bg-purple-400 animate-pulse"></div>
                      <span className="text-gray-300">Interactive server clusters</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 rounded-full bg-pink-400 animate-pulse"></div>
                      <span className="text-gray-300">Live performance metrics</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
          id="features"
          className="py-20 px-6 bg-slate-900/80 backdrop-blur-xl"
        >
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">Powerful Features for Modern Teams</h2>
              <p className="text-xl text-gray-400">Everything you need to maintain peak performance</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  ),
                  title: 'AI-Powered Insights',
                  description: 'Machine learning algorithms analyze patterns and predict incidents before they occur, reducing downtime significantly.',
                  color: 'indigo'
                },
                {
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  ),
                  title: 'Real-Time Monitoring',
                  description: 'Monitor your entire infrastructure in real-time with sub-second data granularity and instant alerting.',
                  color: 'purple'
                },
                {
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  ),
                  title: 'Automated Remediation',
                  description: 'Intelligent automation responds to incidents instantly, executing predefined playbooks to resolve issues automatically.',
                  color: 'pink'
                },
                {
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  ),
                  title: 'Enterprise Security',
                  description: 'Bank-grade security with end-to-end encryption, SSO, RBAC, and comprehensive audit logs.',
                  color: 'emerald'
                },
                {
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  ),
                  title: 'Collaboration Tools',
                  description: 'Built-in chat, video conferencing, and incident war rooms keep teams aligned during critical moments.',
                  color: 'blue'
                },
                {
                  icon: (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  ),
                  title: 'Unlimited Integrations',
                  description: 'Connect with 500+ tools including Kubernetes, AWS, Azure, Datadog, PagerDuty, and more.',
                  color: 'violet'
                }
              ].map((feature, idx) => (
                <motion.div
                  key={idx}
                  initial={{ y: 50, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 border border-slate-700 hover:border-indigo-500/50 transition-all hover:shadow-xl hover:shadow-indigo-500/20"
                >
                  <div className={`w-14 h-14 bg-gradient-to-br from-${feature.color}-500 to-${feature.color}-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-${feature.color}-500/50`}>
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {feature.icon}
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Stats Section */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
          className="py-20 px-6"
        >
          <div className="max-w-7xl mx-auto">
            <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-3xl p-12 shadow-2xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {[
                  { value: '10K+', label: 'Enterprise Customers' },
                  { value: '99.99%', label: 'Platform Uptime' },
                  { value: '80%', label: 'Reduction in MTTR' },
                  { value: '50M+', label: 'Events Processed Daily' }
                ].map((stat, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ scale: 0 }}
                    whileInView={{ scale: 1 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    viewport={{ once: true }}
                    className="text-center"
                  >
                    <div className="text-5xl md:text-6xl font-bold text-white mb-2">{stat.value}</div>
                    <div className="text-indigo-100 font-medium">{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1 }}
          viewport={{ once: true }}
          className="py-20 px-6"
        >
          <div className="max-w-4xl mx-auto text-center backdrop-blur-xl bg-slate-900/50 rounded-3xl p-12 border border-white/10">
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to Transform Your Operations?
            </h2>
            <p className="text-xl text-gray-300 mb-12">
              Join thousands of enterprises using AIOps to prevent incidents and accelerate innovation.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/register')}
                className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/50 font-semibold text-lg"
              >
                Start Free 30-Day Trial
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full sm:w-auto px-10 py-5 bg-white/10 backdrop-blur-sm text-white rounded-xl hover:bg-white/20 transition-all border border-white/20 font-semibold text-lg"
              >
                Schedule a Demo
              </motion.button>
            </div>
            <p className="text-gray-400 text-sm mt-6">No credit card required • Setup in 5 minutes</p>
          </div>
        </motion.div>

        {/* Footer */}
        <footer className="border-t border-slate-800 py-12 px-6 backdrop-blur-xl bg-slate-900/80">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
              <div className="col-span-2">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/50">
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
                        <button className="text-gray-400 hover:text-white transition-colors text-sm">{link}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-800 pt-8 flex flex-col md:flex-row items-center justify-between">
              <p className="text-gray-400 text-sm">© 2025 AIOps Platform. All rights reserved.</p>
              <div className="flex items-center space-x-6 mt-4 md:mt-0">
                <button className="text-gray-400 hover:text-white transition-colors text-sm">Privacy Policy</button>
                <button className="text-gray-400 hover:text-white transition-colors text-sm">Terms of Service</button>
                <button className="text-gray-400 hover:text-white transition-colors text-sm">Cookie Policy</button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;

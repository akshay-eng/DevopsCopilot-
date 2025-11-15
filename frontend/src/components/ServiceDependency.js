import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import ForceGraph2D from 'react-force-graph-2d';

const ServiceDependency = () => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('api-calls'); // api-calls, service-map
  const [selectedCall, setSelectedCall] = useState(null);
  const [trafficCaptureOn, setTrafficCaptureOn] = useState(true);

  // Sample API calls data
  const apiCalls = [
    {
      id: 1,
      method: 'GET',
      status: 200,
      endpoint: '/public/v2/posts',
      source: 'mbutest.ouroboros-golang.60768854f-kzzv',
      sourcePort: '163B',
      sourceIp: '10.0.31.176:63360',
      destination: 'gorest.co.in',
      destIp: '172.67.157.231:443',
      timestamp: '02:23:30.29 PM UTC-07:00',
      size: '208'
    },
    {
      id: 2,
      method: 'POST',
      status: 401,
      endpoint: '/public/v2/users',
      source: 'mbutest.ouroboros-openapi-f46546-f696v',
      sourcePort: '841B',
      sourceIp: '10.0.30.176:53322',
      destination: 'gorest.co.in',
      destIp: '172.67.157.231:443',
      timestamp: '02:23:31.169 PM UTC-07:00',
      size: '197B'
    },
    {
      id: 3,
      method: 'GET',
      status: 200,
      endpoint: '/public/v2/users',
      source: 'mbutest.ouroboros-openapi-f46546-f696v',
      sourcePort: '206B',
      sourceIp: '10.0.30.176:63374',
      destination: 'gorest.co.in',
      destIp: '104.21.82.124:443',
      timestamp: '02:23:31.475 PM UTC-07:00',
      size: '24B'
    },
    {
      id: 4,
      method: 'GET',
      status: 200,
      endpoint: '/public/v2/posts',
      source: 'mbutest.ouroboros-golang.60768854f-kzzv',
      sourcePort: '163B',
      sourceIp: '10.0.31.176:63346',
      destination: 'gorest.co.in',
      destIp: '172.67.157.231:443',
      timestamp: '02:23:34.624 PM UTC-07:00',
      size: '36B'
    },
    {
      id: 5,
      method: 'GET',
      status: 404,
      endpoint: '/public/v2/not-found',
      source: 'mbutest.ouroboros-golang.60768854f-kzzv',
      sourcePort: '167B',
      sourceIp: '10.0.29.70:44638',
      destination: 'gorest.co.in',
      destIp: '104.21.82.124:443',
      timestamp: '02:23:35.718 PM UTC-07:00',
      size: '36B'
    }
  ];

  const getStatusColor = (status) => {
    if (status >= 200 && status < 300) return theme === 'dark' ? 'text-green-400' : 'text-green-600';
    if (status >= 400 && status < 500) return theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600';
    if (status >= 500) return theme === 'dark' ? 'text-red-400' : 'text-red-600';
    return theme === 'dark' ? 'text-gray-400' : 'text-gray-600';
  };

  const getMethodColor = (method) => {
    switch (method) {
      case 'GET':
        return theme === 'dark' ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700';
      case 'POST':
        return theme === 'dark' ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-700';
      case 'PUT':
        return theme === 'dark' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-100 text-yellow-700';
      case 'DELETE':
        return theme === 'dark' ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700';
      default:
        return theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className={`flex-1 overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Controls */}
      <div className={`sticky top-0 z-10 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${trafficCaptureOn ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  streaming live traffic
                </span>
              </div>
              <button
                onClick={() => setTrafficCaptureOn(!trafficCaptureOn)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium flex items-center space-x-2 ${
                  trafficCaptureOn
                    ? 'bg-green-500 text-white'
                    : theme === 'dark'
                    ? 'bg-slate-800 text-gray-300'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                <span>Traffic Capture: {trafficCaptureOn ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setActiveTab('api-calls')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'api-calls'
                    ? 'bg-purple-500 text-white'
                    : theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-300'
                }`}
              >
                API CALLS
              </button>
              <button
                onClick={() => setActiveTab('service-map')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'service-map'
                    ? 'bg-purple-500 text-white'
                    : theme === 'dark'
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-300'
                }`}
              >
                SERVICE MAP
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'api-calls' ? (
        <div className="flex h-full">
          {/* API Calls List */}
          <div className={`flex-1 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
            <div className="p-4 space-y-2">
              {apiCalls.map((call) => (
                <div
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className={`${
                    theme === 'dark' ? 'bg-[#13131f] hover:bg-[#1a1a2e] border-slate-800' : 'bg-white hover:bg-gray-50 border-gray-200'
                  } border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedCall?.id === call.id ? (theme === 'dark' ? 'ring-2 ring-purple-500' : 'ring-2 ring-purple-500') : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getMethodColor(call.method)}`}>
                        {call.method}
                      </span>
                      <span className={`font-semibold ${getStatusColor(call.status)}`}>
                        {call.status}
                      </span>
                      <span className={`font-mono text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {call.endpoint}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs">
                      <span className={`flex items-center space-x-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{call.timestamp}</span>
                      </span>
                      <span className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {call.size}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Source: </span>
                      <span className={`font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        {call.source}
                      </span>
                      <div className={`mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                        {call.sourceIp}
                      </div>
                    </div>
                    <div>
                      <span className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Destination: </span>
                      <span className={`font-mono ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                        {call.destination}
                      </span>
                      <div className={`mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-600'}`}>
                        {call.destIp}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800 text-gray-400' : 'bg-white border-gray-200 text-gray-600'} border-t px-4 py-3 flex items-center justify-between text-sm`}>
              <span>Displayed items: {apiCalls.length}</span>
              <span>Total captured size: 23.16GB</span>
              <span>10/08/2024, 2:24:03 PM UTC-07:00</span>
              <button className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white rounded text-xs font-medium flex items-center space-x-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
                <span>ENTERPRISE</span>
              </button>
            </div>
          </div>

          {/* Details Panel */}
          {selectedCall && (
            <div className={`w-1/2 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-l overflow-y-auto`}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    API Call Details
                  </h3>
                  <button
                    onClick={() => setSelectedCall(null)}
                    className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded-lg transition-colors`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Protocol Badge */}
                <div className="mb-6">
                  <span className="inline-block px-3 py-1 bg-purple-500/10 text-purple-500 rounded text-sm font-medium">
                    Hypertext Transfer Protocol -- HTTP/1.1
                  </span>
                </div>

                {/* Request Details */}
                <div className="space-y-6">
                  <div>
                    <h4 className={`text-sm font-semibold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Request: {selectedCall.id}
                    </h4>
                    <div className={`${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'} rounded-lg p-4 space-y-3 text-sm`}>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <span className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Response: </span>
                          <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>3kB</span>
                        </div>
                        <div>
                          <span className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Node: </span>
                          <span className={`font-mono text-xs ${theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}`}>
                            ip-10-0-37-56.ec2.internal
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                          TCP Stream: <span className="text-blue-500">10.0.37.50:11001/000000671833.pcap</span>
                        </div>
                        <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                          Index: 13
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Headers Section */}
                  <div>
                    <h4 className={`text-sm font-semibold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Headers
                    </h4>
                    <div className={`${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'} rounded-lg p-4 font-mono text-xs space-y-2`}>
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Server:</div>
                        <div className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>cloudflare</div>

                        <div className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Transfer-Encoding:</div>
                        <div className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>chunked</div>

                        <div className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Vary:</div>
                        <div className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Origin</div>

                        <div className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>X-Content-Type-Options:</div>
                        <div className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>nosniff</div>

                        <div className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>X-Download-Options:</div>
                        <div className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>noopen</div>
                      </div>
                    </div>
                  </div>

                  {/* Body Section */}
                  <div>
                    <h4 className={`text-sm font-semibold mb-3 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      Body
                    </h4>
                    <div className="flex items-center space-x-4 mb-3">
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Pretty</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" className="rounded" />
                        <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Line numbers</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>Decode Base64</span>
                      </label>
                    </div>
                    <div className={`${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'} rounded-lg p-4 font-mono text-xs overflow-x-auto`}>
                      <pre className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
{`[{
  "id": 100264,
  "user_id": 7461163,
  "title": "Consequatur cunctatio socius abscido tribuo amor vae.",
  "body": "Caput subsuno facilis..."
}]`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <ServiceMapView theme={theme} />
      )}
    </div>
  );
};

// Service Map Component with ForceGraph2D
const ServiceMapView = ({ theme }) => {
  const graphRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('graph-container');
      if (container) {
        setDimensions({
          width: container.offsetWidth,
          height: container.offsetHeight
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Network graph data
  const graphData = {
    nodes: [
      { id: 'front-end', name: 'front-end-54cddd48dc-s4llq', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 50 },
      { id: 'load-test', name: 'load-test-dcbdd9878-h4bmj', type: 'loadtest', color: theme === 'dark' ? '#3b82f6' : '#93c5fd', size: 40 },
      { id: 'catalogue', name: 'catalogue', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 35 },
      { id: 'catalogue-pod', name: 'catalogue-84967c4cf4-qsfd2', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 30 },
      { id: 'orders', name: 'orders', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 35 },
      { id: 'orders-pod', name: 'orders-649775c7cd-wwjdr', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 35 },
      { id: 'carts', name: 'carts', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 35 },
      { id: 'carts-pod', name: 'carts-8494b87f9-jl6n4', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 30 },
      { id: 'user', name: 'user', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 35 },
      { id: 'user-pod', name: 'user-85ffb869df-ftbtr', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 30 },
      { id: 'payment', name: 'payment-7f478798-fq4fr', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 30 },
      { id: 'graphql', name: 'test-graphql-server-8486446764-wnx74', type: 'service', color: theme === 'dark' ? '#22c55e' : '#86efac', size: 30 },
      { id: 'cilium-operator', name: 'cilium-operator-64c74c4954-w', type: 'system', color: theme === 'dark' ? '#ef4444' : '#fca5a5', size: 30 },
      { id: 'cilium-4pd7d', name: 'cilium-4pd7d/cilium-agent', type: 'system', color: theme === 'dark' ? '#ef4444' : '#fca5a5', size: 30 },
      { id: 'cilium-5gljw', name: 'cilium-5gljw/cilium-agent', type: 'system', color: theme === 'dark' ? '#ef4444' : '#fca5a5', size: 30 },
      { id: 'cilium-envoy-xfcng', name: 'cilium-envoy-xfcng/wrk:worker_0', type: 'system', color: theme === 'dark' ? '#ef4444' : '#fca5a5', size: 25 },
      { id: 'cilium-envoy-2qdfk', name: 'cilium-envoy-2qdfk/wrk:worker_3', type: 'system', color: theme === 'dark' ? '#ef4444' : '#fca5a5', size: 25 }
    ],
    links: [
      { source: 'front-end', target: 'load-test', value: 57.52, label: '57.52 KB/s' },
      { source: 'front-end', target: 'catalogue', value: 5.16, label: '5.16 KB/s' },
      { source: 'front-end', target: 'orders', value: 619.30, label: '619.30 B/s' },
      { source: 'front-end', target: 'carts', value: 2.55, label: '2.55 KB/s' },
      { source: 'front-end', target: 'user', value: 1.76, label: '1.76 KB/s' },
      { source: 'front-end', target: 'orders-pod', value: 1.21, label: '1.21 KB/s' },
      { source: 'load-test', target: 'front-end', value: 57.52, label: '57.52 KB/s' },
      { source: 'catalogue-pod', target: 'front-end', value: 5.16, label: '5.16 KB/s' },
      { source: 'catalogue', target: 'front-end', value: 5.16, label: '5.16 KB/s' },
      { source: 'carts', target: 'front-end', value: 2.55, label: '2.55 KB/s' },
      { source: 'carts-pod', target: 'front-end', value: 13.67, label: '13.67 B/s' },
      { source: 'orders-pod', target: 'front-end', value: 1.74, label: '1.74 KB/s' },
      { source: 'orders-pod', target: 'user', value: 3.51, label: '3.51 KB/s' },
      { source: 'user-pod', target: 'orders-pod', value: 1.76, label: '1.76 KB/s' },
      { source: 'payment', target: 'graphql', value: 2.95, label: '2.95 KB/s' },
      { source: 'carts-pod', target: 'orders-pod', value: 1.98, label: '1.98 KB/s' },
      { source: 'cilium-operator', target: 'front-end', value: 68.64, label: '68.64 KB/s' },
      { source: 'cilium-4pd7d', target: 'cilium-operator', value: 17.24, label: '17.24 B/s' },
      { source: 'cilium-5gljw', target: 'cilium-operator', value: 14.85, label: '14.85 B/s' },
      { source: 'cilium-envoy-xfcng', target: 'cilium-4pd7d', value: 42.89, label: '42.89 B/s' }
    ]
  };

  return (
    <div id="graph-container" className="h-full p-6 relative">
      <div className={`h-full ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} rounded-lg border ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} overflow-hidden relative`}>
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor={theme === 'dark' ? '#0f172a' : '#ffffff'}
          nodeRelSize={6}
          nodeVal={node => node.size}
          nodeLabel={node => node.name}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.name;
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;

            // Draw node circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.size / 3, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color;
            ctx.fill();
            ctx.strokeStyle = theme === 'dark' ? '#1e293b' : '#e2e8f0';
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();

            // Draw label
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#000000';
            ctx.fillText(label, node.x, node.y + node.size / 3 + fontSize + 2);
          }}
          linkDirectionalArrowLength={6}
          linkDirectionalArrowRelPos={1}
          linkColor={() => theme === 'dark' ? '#475569' : '#94a3b8'}
          linkWidth={link => Math.sqrt(link.value) / 2}
          linkLabel={link => link.label}
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={(link, ctx, globalScale) => {
            const label = link.label;
            const fontSize = 10 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.fillStyle = theme === 'dark' ? '#94a3b8' : '#64748b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const midX = (link.source.x + link.target.x) / 2;
            const midY = (link.source.y + link.target.y) / 2;

            ctx.fillText(label, midX, midY);
          }}
          cooldownTicks={100}
          onEngineStop={() => graphRef.current.zoomToFit(400)}
        />

        {/* Footer stats */}
        <div className={`absolute bottom-4 left-4 ${theme === 'dark' ? 'bg-[#0a0a0f]/90' : 'bg-white/90'} backdrop-blur-sm rounded-lg px-4 py-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} flex items-center space-x-6`}>
          <span>Displayed items: 3419</span>
          <span>Total captured size: 205.7GB</span>
          <span>12/21/2024, 10:45:07 PM UTC-08:00</span>
        </div>

        {/* Settings button */}
        <button className="absolute bottom-4 right-4 p-3 bg-purple-500 hover:bg-purple-600 text-white rounded-full shadow-lg transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Enterprise badge */}
        <div className="absolute top-4 right-4 px-3 py-1 bg-purple-500 text-white rounded text-xs font-medium flex items-center space-x-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
          </svg>
          <span>ENTERPRISE</span>
        </div>

        {/* Controls hint */}
        <div className={`absolute top-4 left-4 ${theme === 'dark' ? 'bg-[#0a0a0f]/90' : 'bg-white/90'} backdrop-blur-sm rounded-lg px-3 py-2 text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          <div>🖱️ Drag to pan • Scroll to zoom • Click node for details</div>
        </div>
      </div>
    </div>
  );
};

export default ServiceDependency;

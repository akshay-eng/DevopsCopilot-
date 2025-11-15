import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const Timeline = () => {
  const { theme } = useTheme();
  const [selectedTab, setSelectedTab] = useState('grouped');
  const [selectedFilters, setSelectedFilters] = useState(['High', 'Medium']);
  const [searchQuery, setSearchQuery] = useState('kafka');
  const [eventsHeight, setEventsHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);

  const timelineData = [
    { id: 1, name: 'KafkaConsumerLagIncreasing', count: 1, priority: 'high', times: [{ time: '10:15', end: '10:35' }] },
    { id: 2, name: 'KubePodCrashLooping', count: 11, priority: 'medium', times: [{ time: '04:55', end: '05:15' }] },
    { id: 3, name: 'KubeDeploymentReplicasMismatch', count: 5, priority: 'medium', times: Array(4).fill(null).map((_, i) => ({ time: `0${8 + i}:${15 + i * 20}` })) },
    { id: 4, name: 'KubePodNotReady', count: 1, priority: 'medium', times: Array(3).fill(null).map((_, i) => ({ time: `0${6 + i * 2}:${25 + i * 15}` })) },
    { id: 5, name: 'PodOOMKilled', count: 6, priority: 'info', times: Array(6).fill(null).map((_, i) => ({ time: `0${4 + i}:${30 + i * 10}` })) },
    { id: 6, name: 'CrashLoopBackoff', count: 8, priority: 'info', times: Array(3).fill(null).map((_, i) => ({ time: `0${7 + i}:${40 + i * 5}` })) },
    { id: 7, name: 'PodLifecycleWarning', count: 3, priority: 'info', times: Array(2).fill(null).map((_, i) => ({ time: `0${6 + i * 2}:${50 + i * 10}` })) },
    { id: 8, name: 'ProbeFailure', count: 5, priority: 'info', times: Array(3).fill(null).map((_, i) => ({ time: `0${5 + i * 3}:${35 + i * 15}` })) }
  ];

  const groupedEvents = [
    { priority: 'HIGH', alert: 'PodOOMKilled', cluster: 'eu-prod-atc-eks', events: 6, latest: 'May 13, 25 10:08:00', description: 'Pod stark-enterprises-consumer-5766b85d7f-jxhbh in namespace kafka OOMKilled resul...' },
    { priority: 'HIGH', alert: 'CrashLoopBackoff', cluster: 'eu-prod-atc-eks', events: 8, latest: 'May 13, 25 08:11:46', description: 'Crashing pod customer-signup-67f7bff95b-f959v in namespace kafka' },
    { priority: 'HIGH', alert: 'KafkaConsumerLagIncreasing', cluster: 'demo-cluster-3', events: 1, latest: 'May 13, 25 09:31:56', description: 'Kafka consumer lag increasing on topic notifications' },
    { priority: 'LOW', alert: 'KubeDeploymentReplicasMismatch', cluster: 'eu-prod-atc-eks', events: 5, latest: 'May 13, 25 10:42:47', description: 'Deployment has not matched the expected number of replicas.' },
    { priority: 'LOW', alert: 'KubePodCrashLooping', cluster: 'eu-prod-atc-eks', events: 11, latest: 'May 12, 25 16:36:17', description: 'Pod is crash looping.' },
    { priority: 'LOW', alert: 'KubePodNotReady', cluster: 'demo-cluster-3', events: 1, latest: 'Apr 30, 25 00:31:26', description: 'Pod has been in a non-ready state for more than 15 minutes.' }
  ];

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return theme === 'dark' ? 'bg-red-500' : 'bg-red-600';
      case 'medium': return theme === 'dark' ? 'bg-purple-500' : 'bg-purple-600';
      case 'low': return theme === 'dark' ? 'bg-yellow-500' : 'bg-yellow-600';
      case 'info': return theme === 'dark' ? 'bg-slate-500' : 'bg-slate-600';
      default: return theme === 'dark' ? 'bg-slate-500' : 'bg-slate-600';
    }
  };

  const getTimelineColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high': return theme === 'dark' ? 'bg-red-400' : 'bg-red-500';
      case 'medium': return theme === 'dark' ? 'bg-yellow-400' : 'bg-yellow-500';
      case 'low': return theme === 'dark' ? 'bg-yellow-400' : 'bg-yellow-500';
      case 'info': return theme === 'dark' ? 'bg-slate-400' : 'bg-slate-500';
      default: return theme === 'dark' ? 'bg-slate-400' : 'bg-slate-500';
    }
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight >= 200 && newHeight <= 600) {
        setEventsHeight(newHeight);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
        <div className="flex items-center justify-between mb-4">
          <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Timeline</h1>
          <div className="flex items-center space-x-3">
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>Presets</span>
            </button>
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
              <span>Cluster</span>
            </button>
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span>Namespace</span>
            </button>
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-gray-800 text-white'} rounded text-sm`}>
              Save
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>Filters</span>
            </button>
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <span>App</span>
            </button>
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span>Alert</span>
            </button>
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <span>Priority | High, Medium, ...</span>
              <span className={`px-2 py-0.5 ${theme === 'dark' ? 'bg-violet-700' : 'bg-blue-700'} rounded text-xs`}>62</span>
            </button>
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm transition-colors`}>
              Source
            </button>
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm transition-colors`}>
              More filters
            </button>
            <button className={`text-sm ${theme === 'dark' ? 'text-violet-400 hover:text-violet-300' : 'text-blue-600 hover:text-blue-700'} font-medium transition-colors`}>
              Clear All
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="kafka"
              className={`w-64 pl-10 pr-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300 placeholder-slate-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} border rounded-lg text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500`}
            />
            <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} absolute left-3 top-1/2 transform -translate-y-1/2`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-3`}>
        <div className="flex items-center space-x-6 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>High</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Medium</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Low</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Info</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Resolved</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>Changes</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}>K8s Events</span>
          </div>
          <div className="ml-auto flex items-center space-x-4">
            <span className={`text-sm ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>Alt+Drag to pan</span>
            <button className={`text-sm ${theme === 'dark' ? 'text-violet-400 hover:text-violet-300' : 'text-blue-600 hover:text-blue-700'} font-medium`}>
              Group by | Alert
            </button>
          </div>
        </div>
      </div>

      {/* Timeline Chart */}
      <div
        className={`overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'} px-6 py-4`}
        style={{ height: `calc(100vh - ${eventsHeight}px - 280px)` }}
      >
        <div className="min-w-[1200px]">
          {/* Time labels */}
          <div className="flex items-center mb-4">
            <div className="w-64 pr-4"></div>
            <div className="flex-1 flex justify-between text-xs text-slate-500 px-2">
              <span>May 13 04:58</span>
              <span>May 13 05:50</span>
              <span>May 13 06:42</span>
              <span>May 13 07:34</span>
              <span>May 13 08:26</span>
              <span>May 13 09:18</span>
              <span>May 13 10:10</span>
            </div>
          </div>

          {timelineData.map((item) => (
            <div key={item.id} className="flex items-center mb-3">
              <div className="w-64 pr-4">
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-sm ${theme === 'dark' ? 'text-violet-400' : 'text-blue-600'} hover:underline cursor-pointer`}
                    onClick={() => setSelectedAlert({
                      name: item.name,
                      priority: item.priority,
                      cluster: 'eu-prod-atc-eks',
                      namespace: 'kafka',
                      time: 'May 13, 2025 08:05:06'
                    })}
                  >
                    {item.name}
                  </span>
                  <span className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>({item.count})</span>
                </div>
              </div>
              <div className="flex-1 relative" style={{ height: '32px' }}>
                {/* Continuous colored line based on priority */}
                <div
                  className={`absolute w-full ${getTimelineColor(item.priority)}`}
                  style={{
                    height: '2px',
                    top: '50%',
                    transform: 'translateY(-50%)'
                  }}
                ></div>

                {/* Alert dots */}
                {item.times.map((time, idx) => (
                  <div
                    key={idx}
                    className={`absolute ${getTimelineColor(item.priority)} rounded-full cursor-pointer hover:scale-125 transition-transform z-10 border-2 ${theme === 'dark' ? 'border-[#0a0a0f]' : 'border-gray-50'}`}
                    style={{
                      left: `${(idx / (item.times.length - 1 || 1)) * 85 + Math.random() * 10}%`,
                      width: '10px',
                      height: '10px',
                      top: '50%',
                      transform: 'translate(-50%, -50%)'
                    }}
                    title={`${item.name} - ${time.time}`}
                    onClick={() => setSelectedAlert({
                      name: item.name,
                      priority: item.priority,
                      cluster: 'eu-prod-atc-eks',
                      namespace: 'kafka',
                      time: 'May 13, 2025 08:05:06'
                    })}
                  ></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resizable Border */}
      <div
        className={`h-1 ${isDragging ? 'bg-violet-500' : theme === 'dark' ? 'bg-slate-700 hover:bg-violet-500' : 'bg-gray-300 hover:bg-blue-500'} cursor-ns-resize transition-colors`}
        onMouseDown={handleMouseDown}
      ></div>

      {/* Events Section */}
      <div
        className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-t px-6 py-4 overflow-auto`}
        style={{ height: `${eventsHeight}px` }}
      >
        <div className="flex items-center space-x-4 mb-4">
          <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Events</h2>
          <button
            onClick={() => setSelectedTab('grouped')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectedTab === 'grouped'
                ? theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-900'
                : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Grouped Events <span className={`ml-2 px-2 py-0.5 ${theme === 'dark' ? 'bg-red-600' : 'bg-red-500'} text-white rounded text-xs`}>8</span>
          </button>
          <button
            onClick={() => setSelectedTab('stream')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              selectedTab === 'stream'
                ? theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-gray-200 text-gray-900'
                : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Event Stream <span className={`ml-2 px-2 py-0.5 ${theme === 'dark' ? 'bg-red-600' : 'bg-red-500'} text-white rounded text-xs`}>40</span>
          </button>
          <div className="ml-auto">
            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <span>Export</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Events Table */}
        <div className={`${theme === 'dark' ? 'bg-[#1a1a2e] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg overflow-hidden`}>
          <table className="w-full">
            <thead className={`${theme === 'dark' ? 'bg-slate-800/50 border-slate-800' : 'bg-gray-50 border-gray-200'} border-b`}>
              <tr>
                <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Priority</th>
                <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Alert</th>
                <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Cluster</th>
                <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Events</th>
                <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Latest</th>
                <th className={`px-6 py-3 text-left text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} uppercase tracking-wider`}>Latest event</th>
              </tr>
            </thead>
            <tbody className={`${theme === 'dark' ? 'divide-slate-800' : 'divide-gray-200'} divide-y`}>
              {groupedEvents.map((event, idx) => (
                <tr
                  key={idx}
                  className={`${theme === 'dark' ? 'hover:bg-slate-800/30' : 'hover:bg-gray-50'} transition-colors cursor-pointer`}
                  onClick={() => setSelectedAlert({
                    name: event.alert,
                    priority: event.priority,
                    cluster: event.cluster,
                    namespace: 'kafka',
                    time: event.latest,
                    description: event.description,
                    events: event.events
                  })}
                >
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 ${getPriorityColor(event.priority)} text-white text-xs font-medium rounded`}>
                      {event.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`${theme === 'dark' ? 'text-violet-400' : 'text-blue-600'} hover:underline text-sm`}>{event.alert}</span>
                  </td>
                  <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{event.cluster}</td>
                  <td className="px-6 py-4">
                    <button className={`${theme === 'dark' ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-700'} text-sm font-medium`}>
                      View {event.events} events
                    </button>
                  </td>
                  <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>{event.latest}</td>
                  <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>{event.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert Details Panel */}
      {selectedAlert && (
        <div className={`fixed inset-y-0 right-0 w-[500px] ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} shadow-2xl border-l overflow-y-auto z-50`}>
          <div className={`sticky top-0 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b p-4 flex items-center justify-between z-10`}>
            <h2 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              View App Details
            </h2>
            <button
              onClick={() => setSelectedAlert(null)}
              className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}
            >
              <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className={`border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
            <div className="flex px-4">
              <button className={`px-4 py-3 text-sm font-medium border-b-2 ${theme === 'dark' ? 'border-violet-500 text-white' : 'border-blue-500 text-gray-900'}`}>
                Event
              </button>
              <button className={`px-4 py-3 text-sm font-medium ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                Root Cause
              </button>
              <button className={`px-4 py-3 text-sm font-medium ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                Runbooks
              </button>
              <button className={`px-4 py-3 text-sm font-medium ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                Data sources
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Alert Name */}
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <span className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {selectedAlert.name}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <span className={`px-2 py-1 ${getPriorityColor(selectedAlert.priority)} text-white rounded text-xs font-medium`}>
                  {selectedAlert.priority}
                </span>
                <span className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
                  Source: Robusta
                </span>
              </div>
            </div>

            {/* Time */}
            <div className={`${theme === 'dark' ? 'bg-slate-800/50' : 'bg-gray-50'} p-4 rounded`}>
              <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Time</div>
              <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedAlert.time}</div>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Cluster</div>
                <div className={`text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedAlert.cluster}</div>
              </div>
              <div>
                <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Namespace</div>
                <div className={`text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{selectedAlert.namespace}</div>
              </div>
              <div>
                <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Kind</div>
                <div className={`text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Deployment</div>
              </div>
              <div>
                <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Name</div>
                <div className={`text-sm ${theme === 'dark' ? 'text-violet-400' : 'text-blue-600'} hover:underline cursor-pointer`}>
                  kafka-exporter-prometheus-kafka-exporter
                </div>
              </div>
            </div>

            {/* Subject */}
            <div>
              <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-2`}>Subject</div>
              <div className={`text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                kafka-exporter-prometheus-kafka-exporter-6cbff7468f-tk54p
              </div>
            </div>

            {/* Description */}
            <div>
              <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-2`}>Description</div>
              <div className={`text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                {selectedAlert.description || `Crashing pod kafka-exporter-prometheus-kafka-exporter-6cbff7468f-tk54p in namespace ${selectedAlert.namespace}`}
              </div>
            </div>

            {/* Logs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Logs</div>
                <div className="flex items-center space-x-2">
                  <button className={`p-1 ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-200'} rounded`}>
                    <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                  <button className={`p-1 ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-200'} rounded`}>
                    <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button className={`p-1 ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-200'} rounded`}>
                    <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className={`${theme === 'dark' ? 'bg-[#0a0a0f] border-slate-800' : 'bg-gray-900 border-gray-700'} border rounded p-3 font-mono text-xs overflow-x-auto`}>
                <div className={`${theme === 'dark' ? 'text-slate-300' : 'text-gray-300'} space-y-1`}>
                  <div>1  I0513 05:04:54.537199  1 kafka_exporter.go:823| Starting kafka_exporter (version=1.8.0, branch="u...</div>
                  <div>2  F0513 05:04:55.314572  1 kafka_exporter.go:924| Error Init Kafka Client: kafka: client has run o...</div>
                </div>
              </div>
            </div>

            {/* Container Crash Information */}
            <div>
              <button className="flex items-center space-x-2 mb-2">
                <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Container Crash Information
                </span>
              </button>
              <div className="ml-6 space-y-3 text-sm">
                <div>
                  <div className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Container</div>
                  <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>prometheus-kafka-exporter</div>
                </div>
                <div>
                  <div className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Restarts</div>
                  <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>193</div>
                </div>
                <div>
                  <div className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Status</div>
                  <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>WAITING</div>
                </div>
                <div>
                  <div className={`${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'} mb-1`}>Reason</div>
                  <div className={`${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>CrashLoopBackOff</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timeline;

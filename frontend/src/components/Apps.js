import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from '../context/ThemeContext';
import { getClusters, getNamespaces, calculateAge, getHealthStatus } from '../services/api';
import { ChevronsUpDown } from 'lucide-react';
import {
  fetchResources,
  selectAllResourcesForApps,
  selectIsLoading,
  selectError,
  selectHasCachedResources,
  selectCacheAge
} from '../redux/slices/resourcesSlice';

const Apps = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [selectedView, setSelectedView] = useState('all');
  const [selectedNamespace, setSelectedNamespace] = useState('all');
  const [selectedResourceType, setSelectedResourceType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [clusters, setClusters] = useState([]);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [namespaces, setNamespaces] = useState(['all']);
  const [clustersLoading, setClustersLoading] = useState(true);

  // Get clusterId
  const clusterId = selectedCluster?._id || selectedCluster?.id;

  // Constant empty array to avoid creating new references
  const EMPTY_ARRAY = useMemo(() => [], []);

  // Redux selectors with proper memoization
  const cachedResources = useSelector(state => {
    if (!clusterId) return EMPTY_ARRAY;
    return selectAllResourcesForApps(state, clusterId, selectedNamespace, selectedResourceType);
  });

  const loading = useSelector(state =>
    clusterId ? selectIsLoading(state, clusterId, selectedResourceType === 'all' ? 'pods' : selectedResourceType.toLowerCase() + 's') : false
  );
  const error = useSelector(state =>
    clusterId ? selectError(state, clusterId, selectedResourceType === 'all' ? 'pods' : selectedResourceType.toLowerCase() + 's') : null
  );

  // Fetch clusters on mount
  useEffect(() => {
    const fetchClusters = async () => {
      try {
        setClustersLoading(true);
        const clustersData = await getClusters();
        setClusters(clustersData.clusters || []);

        // Select first cluster by default
        if (clustersData.clusters && clustersData.clusters.length > 0) {
          setSelectedCluster(clustersData.clusters[0]);
        }
      } catch (err) {
        console.error('Failed to fetch clusters:', err);
      } finally {
        setClustersLoading(false);
      }
    };

    fetchClusters();
  }, []);

  // Fetch namespaces when cluster changes
  useEffect(() => {
    if (!selectedCluster) return;

    const fetchNamespacesData = async () => {
      try {
        const clusterId = selectedCluster._id || selectedCluster.id;
        const namespacesData = await getNamespaces(clusterId);
        const namespaceNames = namespacesData.items?.map(ns => ns.name) || [];
        setNamespaces(['all', ...namespaceNames]);
      } catch (err) {
        console.error('Failed to fetch namespaces:', err);
      }
    };

    fetchNamespacesData();
  }, [selectedCluster]);

  // Fetch resources when cluster or resource type changes (NOT namespace)
  // Namespace filtering is done client-side from cached data
  useEffect(() => {
    if (!selectedCluster) return;

    const clusterId = selectedCluster._id || selectedCluster.id;

    // Determine which resource types to fetch
    const resourceTypesToFetch = selectedResourceType === 'all'
      ? ['pods', 'deployments', 'services', 'statefulsets']
      : [selectedResourceType.toLowerCase() + 's'];

    // Always fetch from 'all' namespaces to populate cache
    // Then filter client-side based on selectedNamespace
    resourceTypesToFetch.forEach(resourceType => {
      dispatch(fetchResources({
        clusterId,
        resourceType,
        namespace: 'all' // Always fetch all namespaces for caching
      }));
    });
  }, [selectedCluster, selectedResourceType, dispatch]); // Removed selectedNamespace dependency

  // Transform cached resources for display
  const resources = useMemo(() => {
    return cachedResources.map(item => {
      const resourceType = item.resourceType;
      const health = getHealthStatus(item, resourceType);
      const kindMap = {
        'pods': 'Pod',
        'deployments': 'Deployment',
        'services': 'Service',
        'statefulsets': 'StatefulSet'
      };

      // Ready/desired string: pods report `ready`, controllers report `replicas`.
      const readyStr = item.replicas || item.ready
        || (Number.isFinite(item.desired) ? `${item.ready || 0}/${item.desired}` : null);

      // Services (and friends) have no phase — show a sensible label.
      const displayStatus = item.status
        || (resourceType === 'services' ? 'Active' : health.status);

      return {
        id: `${resourceType}-${item.namespace}-${item.name}`,
        name: item.name,
        cluster: selectedCluster?.name || 'Unknown',
        namespace: item.namespace,
        kind: kindMap[resourceType] || resourceType,
        status: displayStatus,
        healthStatus: health.status,
        restarts: Number(item.restarts) || 0,
        pods: readyStr || '—',
        age: calculateAge(item.age),
        alerts: 0, // TODO: Get from alerts API
        node: item.nodeName,
        ip: item.podIP || item.clusterIP
      };
    });
  }, [cachedResources, selectedCluster]);

  // Filter resources based on search
  const filteredResources = useMemo(() => {
    return resources.filter(resource => {
      const matchesSearch = searchTerm === '' ||
        resource.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        resource.namespace.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesSearch;
    });
  }, [resources, searchTerm]);

  // Calculate stats based on real data
  const stats = [
    { label: 'All Apps', value: resources.length.toString(), color: 'border-violet-500', active: true },
    { label: 'Unhealthy', value: resources.filter(r => r.healthStatus === 'Critical').length.toString(), color: 'border-red-500', active: false },
    { label: 'Recently Crashed', value: resources.filter(r => r.restarts > 0).length.toString(), color: 'border-slate-600', active: false },
    { label: 'Not Ready', value: resources.filter(r => r.healthStatus === 'Warning').length.toString(), color: 'border-yellow-500', active: false },
    { label: 'Has Prometheus Alerts', value: resources.filter(r => r.alerts > 0).length.toString(), color: 'border-red-400', active: false, icon: true }
  ];

  const resourceTypes = ['all', 'Deployment', 'StatefulSet', 'Pod', 'Service'];

  const handleResourceClick = (resource) => {
    if (selectedCluster) {
      const clusterId = selectedCluster._id || selectedCluster.id;
      navigate(`/dashboard/apps/${clusterId}/${resource.kind.toLowerCase()}/${resource.namespace}/${resource.name}`);
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Healthy': return theme === 'dark' ? 'text-green-400' : 'text-green-600';
      case 'Warning': return theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600';
      case 'Critical': return theme === 'dark' ? 'text-red-400' : 'text-red-600';
      default: return theme === 'dark' ? 'text-slate-400' : 'text-gray-600';
    }
  };

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button className={`p-2 ${theme === 'dark' ? 'hover:bg-slate-800' : 'hover:bg-gray-100'} rounded transition-colors`}>
              <svg className={`w-5 h-5 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Apps</h1>
            <div className="flex items-center space-x-2">
              {/* Cluster Selector */}
              <div className="relative">
                <select
                  value={selectedCluster?._id || selectedCluster?.id || ''}
                  onChange={(e) => {
                    const cluster = clusters.find(c => (c._id || c.id) === e.target.value);
                    setSelectedCluster(cluster);
                  }}
                  className={`pl-10 pr-10 py-1.5 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-gray-100 border-gray-300 text-gray-700'} border rounded text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 appearance-none cursor-pointer`}
                >
                  {clusters.length === 0 ? (
                    <option value="">No clusters</option>
                  ) : (
                    clusters.map(cluster => (
                      <option key={cluster._id || cluster.id} value={cluster._id || cluster.id}>
                        {cluster.name || cluster._id || cluster.id}
                      </option>
                    ))
                  )}
                </select>
                <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
                <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className={`px-6 py-4 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className="grid grid-cols-5 gap-4">
          {stats.map((stat, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedView(stat.label.toLowerCase())}
              className={`p-4 ${theme === 'dark' ? 'bg-[#13131f]' : 'bg-white'} border-2 ${stat.active ? stat.color : theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} rounded-lg ${theme === 'dark' ? 'hover:border-violet-500' : 'hover:border-blue-500'} transition-all text-left`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-3xl font-bold ${stat.value === '0' ? theme === 'dark' ? 'text-slate-600' : 'text-gray-400' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {stat.value}
                </span>
                {stat.icon && (
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
              </div>
              <div className="flex items-center space-x-1">
                <span className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>{stat.label}</span>
                <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className={`px-6 py-4 ${theme === 'dark' ? 'border-slate-800 bg-[#13131f]' : 'border-gray-200 bg-white'} border-b`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Namespace Dropdown */}
            <div className="relative">
              <select
                value={selectedNamespace}
                onChange={(e) => setSelectedNamespace(e.target.value)}
                className={`pl-10 pr-10 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-gray-100 border-gray-300 text-gray-700'} border rounded-lg text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 appearance-none cursor-pointer`}
              >
                {namespaces.map(ns => (
                  <option key={ns} value={ns}>{ns === 'all' ? 'All Namespaces' : ns}</option>
                ))}
              </select>
              <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Resource Type Dropdown */}
            <div className="relative">
              <select
                value={selectedResourceType}
                onChange={(e) => setSelectedResourceType(e.target.value)}
                className={`pl-10 pr-10 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-gray-100 border-gray-300 text-gray-700'} border rounded-lg text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 appearance-none cursor-pointer`}
              >
                {resourceTypes.map(type => (
                  <option key={type} value={type}>{type === 'all' ? 'All Resources' : type}</option>
                ))}
              </select>
              <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            <button className={`px-3 py-1.5 ${theme === 'dark' ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} rounded text-sm flex items-center space-x-2 transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>More Filters</span>
            </button>
          </div>
          <div className="flex items-center space-x-3">
            {/* Visualize Button */}
            <button
              onClick={() => navigate('/dashboard/visualization')}
              className={`px-4 py-2 ${theme === 'dark' ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'} rounded-lg text-sm font-medium flex items-center space-x-2 transition-all shadow-lg hover:shadow-xl`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span>Visualize</span>
            </button>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Type / to search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-64 pl-10 pr-4 py-2 ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300 placeholder-slate-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'} border rounded-lg text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500`}
              />
              <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} absolute left-3 top-1/2 transform -translate-y-1/2`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={`flex-1 overflow-auto ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className="px-6 py-4">
          <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg overflow-hidden`}>
            <table className="w-full">
              <thead className={`${theme === 'dark' ? 'bg-[#141414] border-slate-800' : 'bg-white border-gray-200'} border-b`}>
                <tr>
                  {[
                    { label: 'App', sort: true },
                    { label: 'Cluster', sort: true },
                    { label: 'Namespace', sort: true },
                    { label: 'Kind', sort: true },
                    { label: 'Status', sort: true },
                    { label: 'Pods', sort: true },
                    { label: 'Age', sort: true },
                    { label: 'Alerts', sort: false },
                  ].map(({ label, sort }) => (
                    <th key={label} className={`px-6 py-2.5 text-left text-[11px] font-medium ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>
                      <span className="inline-flex items-center gap-1 cursor-pointer select-none hover:opacity-80">
                        {label}
                        {sort && <ChevronsUpDown size={12} className="opacity-40" />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`${theme === 'dark' ? 'divide-slate-800' : 'divide-gray-200'} divide-y`}>
                {loading ? (
                  <tr>
                    <td colSpan="8" className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mb-4"></div>
                        <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>Loading resources...</p>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="8" className="px-6 py-16 text-center">
                      <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-red-500' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className={`text-lg font-medium ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>Failed to load resources</p>
                      <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-500'}`}>{error?.message || 'An error occurred'}</p>
                      <button
                        onClick={() => window.location.reload()}
                        className={`mt-4 px-4 py-2 ${theme === 'dark' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-lg transition-colors`}
                      >
                        Retry
                      </button>
                    </td>
                  </tr>
                ) : filteredResources.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-6 py-16 text-center">
                      <svg className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-slate-700' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                      </svg>
                      <p className={`text-lg font-medium ${theme === 'dark' ? 'text-slate-500' : 'text-gray-600'}`}>No apps found</p>
                      <p className={`text-sm mt-2 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-500'}`}>Try adjusting your filters or search criteria</p>
                    </td>
                  </tr>
                ) : (
                  filteredResources.map((resource) => (
                    <tr
                      key={resource.id}
                      onClick={() => handleResourceClick(resource)}
                      className={`${theme === 'dark' ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'} cursor-pointer transition-colors`}
                    >
                      <td className={`px-6 py-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded ${theme === 'dark' ? 'bg-violet-500/20' : 'bg-blue-100'} flex items-center justify-center`}>
                            <svg className={`w-4 h-4 ${theme === 'dark' ? 'text-violet-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                            </svg>
                          </div>
                          <span className="font-medium text-blue-600 hover:underline">{resource.name}</span>
                        </div>
                      </td>
                      <td className={`px-6 py-4 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{resource.cluster}</td>
                      <td className={`px-6 py-4`}>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${theme === 'dark' ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'}`}>
                          {resource.namespace}
                        </span>
                      </td>
                      <td className={`px-6 py-4 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{resource.kind}</td>
                      <td className={`px-6 py-4`}>
                        <div className="flex items-center space-x-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            resource.healthStatus === 'Healthy' ? 'bg-green-500' :
                            resource.healthStatus === 'Warning' ? 'bg-yellow-500' :
                            resource.healthStatus === 'Critical' ? 'bg-red-500' :
                            'bg-gray-400'
                          }`}></div>
                          <span className={getStatusColor(resource.healthStatus)}>{resource.status}</span>
                          {resource.restarts > 0 && (
                            <span className={`text-[11px] px-1.5 py-0.5 rounded ${theme === 'dark' ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                              ↻ {resource.restarts}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-6 py-4 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>{resource.pods}</td>
                      <td className={`px-6 py-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} text-sm`}>{resource.age}</td>
                      <td className={`px-6 py-4`}>
                        {resource.alerts > 0 ? (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium">
                            {resource.alerts}
                          </span>
                        ) : (
                          <span className={`${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`}>-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Apps;

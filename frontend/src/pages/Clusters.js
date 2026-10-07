import { useState, useEffect } from 'react';
import ClusterCompliance from '../components/ClusterCompliance';
import { useDispatch, useSelector } from 'react-redux';
import {
  Plus,
  Search,
  RefreshCw,
  Grid,
  List,
  Filter,
  MoreVertical,
  Server,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Edit,
  Eye,
} from 'lucide-react';
import { getClusters, deleteCluster } from '../redux/slices/clusterSlice';
import AddClusterModal from '../components/clusters/AddClusterModal';
import { useTheme } from '../context/ThemeContext';

const Clusters = () => {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const { clusters, isLoading, error } = useSelector((state) => state.cluster);

  const [filteredClusters, setFilteredClusters] = useState([]);

  // UI State
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  // Clicking a cluster opens its compliance panel; this used to alert('not implemented').
  const [complianceFor, setComplianceFor] = useState(null);

  // Fetch clusters
  useEffect(() => {
    dispatch(getClusters());
  }, [dispatch]);

  // Apply filters and search
  useEffect(() => {
    let result = [...(clusters || [])];

    // Search
    if (searchQuery) {
      result = result.filter((cluster) =>
        cluster.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by type
    if (filterType !== 'all') {
      result = result.filter((cluster) => cluster.clusterType === filterType);
    }

    // Filter by status
    if (filterStatus !== 'all') {
      result = result.filter((cluster) => cluster.status === filterStatus);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt) - new Date(a.createdAt);
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    setFilteredClusters(result);
  }, [searchQuery, filterType, filterStatus, sortBy, clusters]);

  const handleDeleteCluster = (clusterId) => {
    if (!window.confirm('Are you sure you want to delete this cluster?')) {
      return;
    }
    dispatch(deleteCluster(clusterId));
    setActiveDropdown(null);
  };

  const handleRefresh = () => {
    dispatch(getClusters());
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      connected: {
        icon: CheckCircle,
        bg: theme === 'dark' ? 'bg-green-900/50' : 'bg-green-100',
        text: theme === 'dark' ? 'text-green-200' : 'text-green-800',
        label: 'Connected',
      },
      pending: {
        icon: Clock,
        bg: theme === 'dark' ? 'bg-yellow-900/50' : 'bg-yellow-100',
        text: theme === 'dark' ? 'text-yellow-200' : 'text-yellow-800',
        label: 'Pending',
      },
      disconnected: {
        icon: XCircle,
        bg: theme === 'dark' ? 'bg-red-900/50' : 'bg-red-100',
        text: theme === 'dark' ? 'text-red-200' : 'text-red-800',
        label: 'Disconnected',
      },
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
      >
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const ClusterCard = ({ cluster }) => (
    <div
      onClick={() => setComplianceFor(cluster)}
      title={`View compliance for ${cluster.name}`}
      className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} rounded-lg border p-6 hover:shadow-lg transition-shadow relative cursor-pointer`}>
      {/* Dropdown Menu */}
      <div className="absolute top-4 right-4">
        <button
          onClick={(e) => {
            e.stopPropagation();   // the card itself opens compliance
            setActiveDropdown(activeDropdown === cluster._id ? null : cluster._id);
          }}
          className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
        >
          <MoreVertical size={20} className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} />
        </button>

        {activeDropdown === cluster._id && (
          <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg z-10 border ${theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
            <button
              onClick={() => { setActiveDropdown(null); setComplianceFor(cluster); }}
              className={`flex items-center w-full px-4 py-2 text-sm ${theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <Eye size={16} className="mr-2" />
              View Compliance
            </button>
            <button
              onClick={() => alert('Edit - not implemented yet')}
              className={`flex items-center w-full px-4 py-2 text-sm ${theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <Edit size={16} className="mr-2" />
              Edit
            </button>
            <button
              onClick={() => handleDeleteCluster(cluster._id)}
              className={`flex items-center w-full px-4 py-2 text-sm text-red-600 ${theme === 'dark' ? 'hover:bg-red-900/50' : 'hover:bg-red-50'}`}
            >
              <Trash2 size={16} className="mr-2" />
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start space-x-4">
        <div className={`p-3 rounded-lg ${theme === 'dark' ? 'bg-violet-900/50' : 'bg-violet-100'}`}>
          <Server className={`w-8 h-8 ${theme === 'dark' ? 'text-violet-400' : 'text-violet-600'}`} />
        </div>

        <div className="flex-1">
          <h3 className={`text-lg font-semibold mb-1 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{cluster.name}</h3>
          <p className={`text-sm mb-3 capitalize ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>{cluster.clusterType}</p>

          <div className="flex items-center space-x-3 mb-4">
            {getStatusBadge(cluster.status)}
          </div>

          <div className={`space-y-2 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
            <div className="flex items-center">
              <span className="font-medium w-24">Created:</span>
              <span>{new Date(cluster.createdAt).toLocaleDateString()}</span>
            </div>

            {cluster.monitoringSetup && (
              <div className="flex items-center">
                <span className="font-medium w-24">Monitoring:</span>
                <div className="flex space-x-2">
                  {cluster.monitoringSetup.hasPrometheus && (
                    <span className={`px-2 py-0.5 rounded text-xs ${theme === 'dark' ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                      Prometheus
                    </span>
                  )}
                  {cluster.monitoringSetup.hasGrafana && (
                    <span className={`px-2 py-0.5 rounded text-xs ${theme === 'dark' ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>
                      Grafana
                    </span>
                  )}
                  {cluster.monitoringSetup.hasLoki && (
                    <span className={`px-2 py-0.5 rounded text-xs ${theme === 'dark' ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-700'}`}>
                      Loki
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const ClusterListItem = ({ cluster }) => (
    <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-4 hover:shadow-md transition-shadow relative`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-violet-900/50' : 'bg-violet-100'}`}>
            <Server className={`w-6 h-6 ${theme === 'dark' ? 'text-violet-400' : 'text-violet-600'}`} />
          </div>

          <div className="flex-1">
            <h3 className={`text-base font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{cluster.name}</h3>
            <p className={`text-sm capitalize ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>{cluster.clusterType}</p>
          </div>

          <div className="flex items-center space-x-6">
            <div>{getStatusBadge(cluster.status)}</div>

            <div className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
              <p className="font-medium">Created</p>
              <p>{new Date(cluster.createdAt).toLocaleDateString()}</p>
            </div>

            {cluster.monitoringSetup && (
              <div className="flex flex-col space-y-1">
                {cluster.monitoringSetup.hasPrometheus && (
                  <span className={`px-2 py-0.5 rounded text-xs text-center ${theme === 'dark' ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                    Prometheus
                  </span>
                )}
                {cluster.monitoringSetup.hasGrafana && (
                  <span className={`px-2 py-0.5 rounded text-xs text-center ${theme === 'dark' ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-700'}`}>
                    Grafana
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Dropdown Menu */}
        <div className="ml-4">
          <button
            onClick={() =>
              setActiveDropdown(activeDropdown === cluster._id ? null : cluster._id)
            }
            className={`p-1 rounded ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
          >
            <MoreVertical size={20} className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} />
          </button>

          {activeDropdown === cluster._id && (
            <div className={`absolute right-4 mt-2 w-48 rounded-md shadow-lg z-10 border ${theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
              <button
                onClick={() => { setActiveDropdown(null); setComplianceFor(cluster); }}
                className={`flex items-center w-full px-4 py-2 text-sm ${theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Eye size={16} className="mr-2" />
                View Compliance
              </button>
              <button
                onClick={() => alert('Edit - not implemented yet')}
                className={`flex items-center w-full px-4 py-2 text-sm ${theme === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Edit size={16} className="mr-2" />
                Edit
              </button>
              <button
                onClick={() => handleDeleteCluster(cluster._id)}
                className={`flex items-center w-full px-4 py-2 text-sm text-red-600 ${theme === 'dark' ? 'hover:bg-red-900/50' : 'hover:bg-red-50'}`}
              >
                <Trash2 size={16} className="mr-2" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Clusters</h1>
              <p className={`mt-1 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                Manage your Kubernetes clusters and monitoring setup
              </p>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 transition-colors"
            >
              <Plus size={20} className="mr-2" />
              Add Cluster
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
          <div className="flex items-center justify-between space-x-4">
            {/* Search */}
            <div className="flex-1 max-w-md relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`} size={20} />
              <input
                type="text"
                placeholder="Search clusters..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border ${theme === 'dark' ? 'border-slate-700 bg-slate-800 text-white' : 'border-gray-300 bg-white text-gray-900'} rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent`}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              {/* Filter Button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`p-2 rounded-md border transition-colors ${
                  showFilters
                    ? theme === 'dark'
                      ? 'bg-violet-900/50 border-violet-700 text-violet-300'
                      : 'bg-violet-50 border-violet-300 text-violet-600'
                    : theme === 'dark'
                      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Filter size={20} />
              </button>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                className={`p-2 border rounded-md transition-colors ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
              </button>

              {/* View Toggle */}
              <div className={`flex border rounded-md ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-300'}`}>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 ${
                    viewMode === 'grid'
                      ? theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-900'
                      : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Grid size={20} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 ${
                    viewMode === 'list'
                      ? theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-900'
                      : theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <List size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className={`mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-4 ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`}>
              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent ${theme === 'dark' ? 'border-slate-700 bg-slate-800 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                >
                  <option value="all">All Types</option>
                  <option value="openshift-ocp">OpenShift OCP</option>
                  <option value="gke">GCP GKE</option>
                  <option value="eks">AWS EKS</option>
                  <option value="aks">Azure AKS</option>
                  <option value="minikube">Minikube</option>
                  <option value="k3s">K3s</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent ${theme === 'dark' ? 'border-slate-700 bg-slate-800 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                >
                  <option value="all">All Status</option>
                  <option value="connected">Connected</option>
                  <option value="pending">Pending</option>
                  <option value="disconnected">Disconnected</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-violet-500 focus:border-transparent ${theme === 'dark' ? 'border-slate-700 bg-slate-800 text-white' : 'border-gray-300 bg-white text-gray-900'}`}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name">Name (A-Z)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className={`animate-spin ${theme === 'dark' ? 'text-violet-400' : 'text-violet-600'}`} size={32} />
          </div>
        ) : error ? (
          <div className={`rounded-lg border p-4 ${theme === 'dark' ? 'bg-red-900/50 border-red-800 text-red-200' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {error}
          </div>
        ) : filteredClusters.length === 0 ? (
          <div className={`${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} rounded-lg border p-12 text-center`}>
            <Server className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-slate-600' : 'text-gray-400'}`} />
            <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>No clusters found</h3>
            <p className={`mb-6 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
              {searchQuery || filterType !== 'all' || filterStatus !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Get started by adding your first cluster'}
            </p>
            {!searchQuery && filterType === 'all' && filterStatus === 'all' && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700"
              >
                Add Cluster
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClusters.map((cluster) => (
              <ClusterCard key={cluster._id} cluster={cluster} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredClusters.map((cluster) => (
              <ClusterListItem key={cluster._id} cluster={cluster} />
            ))}
          </div>
        )}
      </div>

      {/* Add Cluster Modal */}
      <AddClusterModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onClusterAdded={() => {
          dispatch(getClusters());
        }}
      />

      {/* Click outside to close dropdown */}
      {activeDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setActiveDropdown(null)}
        />
      )}

      {complianceFor && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <ClusterCompliance
            inline
            cluster={complianceFor}
            dk={theme === 'dark'}
            onClose={() => setComplianceFor(null)}
          />
        </div>
      )}
    </div>
  );
};

export default Clusters;
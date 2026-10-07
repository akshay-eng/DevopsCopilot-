import { useEffect, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getUser } from './redux/slices/authSlice';
import { ThemeProvider } from './context/ThemeContext';
import socketService from './services/socketService';
import {
  addLogLine,
  startStream as startLogStream,
  stopStream as stopLogStream,
  setStreamError
} from './redux/slices/logsSlice';
import {
  updateClusterMetrics,
  bulkUpdateMetrics
} from './redux/slices/metricsSlice';
import { addAlert } from './redux/slices/alertsSlice';
import { updateResource } from './redux/slices/resourcesSlice';
import { addEvent } from './redux/slices/eventsSlice';
import { addTrafficEvent, updateServiceMap } from './redux/slices/networkSlice';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';
import Onboarding from './components/Onboarding';
import DashboardLayout from './components/DashboardLayout';
import Apps from './components/Apps';
import Timeline from './components/Timeline';
import Trends from './components/Trends';
import CostPage from './components/CostPage';
import Settings from './components/Settings';
import AgentThreads from './components/AgentThreads';
import ManagedAlerts from './components/ManagedAlerts';
import ServiceDependency from './components/ServiceDependency';
import Nodes from './components/Nodes';
import NodeDetailPage from './components/NodeDetailPage';
import Comparison from './components/Comparison';
import HolmesGPT from './components/HolmesGPT';
import Reports from './components/Reports';
import ClustersPage from './pages/Clusters';
import Integrations from './pages/Integrations';
import ClusterVisualization from './pages/ClusterVisualization';
import CorrelationEngine from './components/CorrelationEngine';
import ResourceDetailPage from './components/ResourceDetailPage';
import AppResourceDetailPage from './components/AppResourceDetailPage';
import OAuthCallback from './components/OAuthCallback';
import VerifyEmail from './components/VerifyEmail';
import VerifyEmailSent from './components/VerifyEmailSent';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';
import AISessions from './components/ai-workloads/Sessions';
import AIAnalytics from './components/ai-workloads/Analytics';
import AIAgents from './components/ai-workloads/Agents';
import AIProjects from './components/ai-workloads/Projects';
import AISettings from './components/ai-workloads/Settings';
import AIDocs from './components/ai-workloads/AgentDocs';
import AIOverview from './components/ai-workloads/Overview';
import AITraces from './components/ai-workloads/Traces';
import AITraceDetail from './components/ai-workloads/TraceDetail';
import AIMCP from './components/ai-workloads/MCP';
import AIGetStarted from './components/ai-workloads/GetStarted';
import AIDeploy from './components/ai-workloads/Deploy';
import AIMCPCatalog from './components/ai-workloads/MCPCatalog';
import Pipelines from './pages/Pipelines';

// Redirect /sessions?trace_id=xxx to /dashboard/ai-workloads/sessions/xxx
function SessionsRedirect() {
  const [params] = useSearchParams();
  const traceId = params.get('trace_id');
  if (traceId) {
    return <Navigate to={`/dashboard/ai-workloads/sessions/${traceId}`} replace />;
  }
  return <Navigate to="/dashboard/ai-workloads/sessions" replace />;
}

function App() {
  console.log('🚀 App.js component rendering');

  const dispatch = useDispatch();
  const { user, isAuthenticated } = useSelector(state => state.auth);
  const socketInitializedRef = useRef(false);

  console.log('🔍 App.js state:', {
    user: user ? 'exists' : 'null',
    userId: user?.id,
    isAuthenticated,
    socketInitialized: socketInitializedRef.current
  });

  // Load user on app start if token exists
  useEffect(() => {
    const token = localStorage.getItem('token');
    console.log('🔐 Token check:', { tokenExists: !!token, userExists: !!user });
    if (token && !user) {
      console.log('📞 Dispatching getUser()');
      dispatch(getUser());
    }
  }, [dispatch, user]);

  // Setup Socket.IO event listeners (memoized to prevent reconnections)
  const setupSocketListeners = useCallback(() => {
    // Pod Logs
    socketService.onPodLogs((data) => {
      dispatch(addLogLine(data));
    });

    socketService.onLogStreamStarted((data) => {
      dispatch(startLogStream(data));
    });

    socketService.onLogStreamStopped((data) => {
      dispatch(stopLogStream(data));
    });

    socketService.onLogStreamError((data) => {
      dispatch(setStreamError(data));
    });

    // Resource Updates
    socketService.onResourceUpdate((data) => {
      dispatch(updateResource(data));
    });

    // Metrics Updates
    socketService.onMetricsUpdate((data) => {
      console.log('📊 RECEIVED METRICS FROM SOCKET.IO:', data);

      // Handle different metric types
      if (data.resourceType === 'cluster') {
        console.log('Dispatching updateClusterMetrics');
        dispatch(updateClusterMetrics(data));
      } else {
        console.log('Dispatching bulkUpdateMetrics with:', {
          clusterId: data.clusterId,
          resourceType: data.resourceType,
          metricName: data.metricName,
          dataLength: data.metricData?.length
        });
        dispatch(bulkUpdateMetrics(data));
      }
    });

    // Alerts
    socketService.onAlert((data) => {
      console.log('🚨 RECEIVED ALERT FROM SOCKET.IO:', data);
      console.log('  Alert details:', {
        clusterId: data.clusterId,
        alertname: data.alertname,
        severity: data.severity,
        namespace: data.namespace,
        message: data.message
      });
      dispatch(addAlert(data));
      console.log('✅ Alert dispatched to Redux store');
    });

    // Kubernetes Events
    socketService.onK8sEvent((data) => {
      dispatch(addEvent(data));
    });

    // Cluster Heartbeat (for connection status)
    socketService.onClusterHeartbeat((data) => {
      console.log('Cluster heartbeat:', data);
      // Could update cluster status in cluster slice if needed
    });

    // Network Traffic
    socketService.onNetworkTraffic((data) => {
      console.log('📡 Network traffic event received:', data);
      dispatch(addTrafficEvent(data));
    });

    socketService.onServiceMapUpdate((data) => {
      dispatch(updateServiceMap(data));
    });
  }, [dispatch]);

  // Initialize Socket.IO connection when user is authenticated
  useEffect(() => {
    console.log('🎯 Socket initialization useEffect triggered:', {
      isAuthenticated,
      user: user ? 'exists' : 'null',
      userId: user?.id,
      socketInitialized: socketInitializedRef.current
    });

    if (isAuthenticated && user && !socketInitializedRef.current) {
      console.log('✅ CONDITIONS MET - Initializing Socket.IO connection...');
      socketService.connect();

      // Subscribe to real-time events
      setupSocketListeners();

      socketInitializedRef.current = true;

      // Log connection status after a short delay
      setTimeout(() => {
        console.log('🔌 Socket.IO connection status:', socketService.isSocketConnected());
        console.log('👤 User ID:', user?.id);
        console.log('📡 Socket should join room: user-' + user?.id);
      }, 2000);
    } else {
      console.log('❌ CONDITIONS NOT MET for Socket.IO initialization');
    }

    // Cleanup on logout
    if (!isAuthenticated && socketInitializedRef.current) {
      console.log('User logged out, disconnecting Socket.IO...');
      socketService.disconnect();
      socketInitializedRef.current = false;
    }
  }, [isAuthenticated, user, setupSocketListeners]);

  return (
    <ThemeProvider>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email-sent" element={<VerifyEmailSent />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* AgentOps SDK replay redirect: /sessions?trace_id=xxx → /dashboard/ai-workloads/sessions/xxx */}
        <Route path="/sessions" element={<SessionsRedirect />} />

        {/* OAuth Callback Route */}
        <Route path="/auth/callback" element={<OAuthCallback />} />

        {/* Onboarding Route (requires auth but not completion) */}
        <Route
          path="/onboarding/*"
          element={
            <ProtectedRoute requireOnboarding={false}>
              <Onboarding />
            </ProtectedRoute>
          }
        />

        {/* Protected Routes (requires auth + onboarding) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Apps />} />
          <Route path="apps/:clusterId/:resourceType/:namespace/:name" element={<AppResourceDetailPage />} />
          <Route path="timeline" element={<Timeline />} />
          <Route path="trends" element={<Trends />} />
          <Route path="cost" element={<CostPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="agent-threads" element={<AgentThreads />} />
          <Route path="managed-alerts" element={<ManagedAlerts />} />
          <Route path="service-dependency" element={<ServiceDependency />} />
          <Route path="nodes" element={<Nodes />} />
          <Route path="nodes/:clusterId/:nodeName" element={<NodeDetailPage />} />
          <Route path="comparison" element={<Comparison />} />
          <Route path="holmesgpt" element={<HolmesGPT />} />
          <Route path="report" element={<Reports />} />
          <Route path="clusters" element={<ClustersPage />} />
          <Route path="clusters/:clusterId/:resourceType/:namespace/:name" element={<ResourceDetailPage />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="pipelines" element={<Pipelines />} />
          <Route path="visualization" element={<ClusterVisualization />} />
          <Route path="correlation" element={<CorrelationEngine />} />
          <Route path="ai-workloads/overview" element={<AIOverview />} />
          <Route path="ai-workloads/traces" element={<AITraces />} />
          <Route path="ai-workloads/sessions/:sessionId" element={<AITraceDetail />} />
          <Route path="ai-workloads/sessions" element={<AISessions />} />
          <Route path="ai-workloads/analytics" element={<AIAnalytics />} />
          <Route path="ai-workloads/agents" element={<AIAgents />} />
          <Route path="ai-workloads/projects" element={<AIProjects />} />
          <Route path="ai-workloads/get-started" element={<AIGetStarted />} />
          <Route path="ai-workloads/deploy" element={<AIDeploy />} />
          <Route path="ai-workloads/mcp" element={<AIMCP />} />
          <Route path="ai-workloads/mcp-catalog" element={<AIMCPCatalog />} />
          <Route path="ai-workloads/settings" element={<AISettings />} />
          <Route path="ai-workloads/docs" element={<AIDocs />} />
        </Route>

        {/* Redirect unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;

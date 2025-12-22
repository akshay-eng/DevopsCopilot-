import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { getUser } from './redux/slices/authSlice';
import { ThemeProvider } from './context/ThemeContext';
import LandingPage from './components/LandingPage';
import Login from './components/Login';
import Register from './components/Register';
import Onboarding from './components/Onboarding';
import DashboardLayout from './components/DashboardLayout';
import Apps from './components/Apps';
import Timeline from './components/Timeline';
import Trends from './components/Trends';
import ManagedAlerts from './components/ManagedAlerts';
import ServiceDependency from './components/ServiceDependency';
import Nodes from './components/Nodes';
import Comparison from './components/Comparison';
import HolmesGPT from './components/HolmesGPT';
import ClustersPage from './components/ClustersPage';
import ResourceDetailPage from './components/ResourceDetailPage';
import AppResourceDetailPage from './components/AppResourceDetailPage';
import OAuthCallback from './components/OAuthCallback';
import VerifyEmail from './components/VerifyEmail';
import VerifyEmailSent from './components/VerifyEmailSent';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);

  // Load user on app start if token exists
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !user) {
      dispatch(getUser());
    }
  }, [dispatch, user]);

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
          <Route path="managed-alerts" element={<ManagedAlerts />} />
          <Route path="service-dependency" element={<ServiceDependency />} />
          <Route path="nodes" element={<Nodes />} />
          <Route path="comparison" element={<Comparison />} />
          <Route path="holmesgpt" element={<HolmesGPT />} />
          <Route path="clusters" element={<ClustersPage />} />
          <Route path="clusters/:clusterId/:resourceType/:namespace/:name" element={<ResourceDetailPage />} />
        </Route>

        {/* Redirect unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;

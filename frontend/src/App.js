import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
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
import OAuthCallback from './components/OAuthCallback';
import VerifyEmail from './components/VerifyEmail';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />

            {/* OAuth Callback Route */}
            <Route path="/auth/callback" element={<OAuthCallback />} />

            {/* Protected Routes */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Apps />} />
              <Route path="timeline" element={<Timeline />} />
              <Route path="trends" element={<Trends />} />
              <Route path="managed-alerts" element={<ManagedAlerts />} />
              <Route path="service-dependency" element={<ServiceDependency />} />
              <Route path="nodes" element={<Nodes />} />
              <Route path="comparison" element={<Comparison />} />
              <Route path="holmesgpt" element={<HolmesGPT />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

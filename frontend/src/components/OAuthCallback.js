/**
 * OAuthCallback - Handles OAuth redirect callback from Google/GitHub
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const OAuthCallback = () => {
  const navigate = useNavigate();
  const { handleOAuthCallback } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const processCallback = async () => {
      // Get query parameters
      const params = new URLSearchParams(window.location.search);
      const needsOnboarding = params.get('onboarding') === 'true';

      const result = await handleOAuthCallback();

      if (result.success) {
        // Check if user needs to complete onboarding
        if (needsOnboarding) {
          navigate('/onboarding', { replace: true });
        } else {
          // Redirect to dashboard for existing users
          navigate('/dashboard', { replace: true });
        }
      } else {
        // Show error and redirect to login after 3 seconds
        setError(result.error);
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 3000);
      }
    };

    processCallback();
  }, [handleOAuthCallback, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="max-w-md w-full bg-slate-800 rounded-xl shadow-xl p-8 text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-white mb-2">Authentication Failed</h2>
          <p className="text-slate-400 mb-4">{error}</p>
          <p className="text-sm text-slate-500">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
        <p className="mt-6 text-xl text-white font-semibold">Completing sign in...</p>
        <p className="mt-2 text-slate-400">Please wait while we authenticate your account</p>
      </div>
    </div>
  );
};

export default OAuthCallback;

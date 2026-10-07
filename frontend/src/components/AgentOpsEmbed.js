import { useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useTheme } from '../context/ThemeContext';

/**
 * AgentOpsEmbed Component
 * Embeds AgentOps dashboard in an iframe with authentication and theme sync
 */
const AgentOpsEmbed = ({ path = '/traces', className = '' }) => {
  const { user } = useSelector(state => state.auth);
  const { theme } = useTheme();
  const [agentOpsToken, setAgentOpsToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);

  // Fetch AgentOps session token
  useEffect(() => {
    const fetchToken = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/agentops/token', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch AgentOps token');
        }

        const data = await response.json();
        setAgentOpsToken(data.token);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching AgentOps token:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    if (user) {
      fetchToken();
    }
  }, [user]);

  // Sync theme with iframe
  useEffect(() => {
    if (!iframeRef.current || !agentOpsToken) return;

    const iframe = iframeRef.current;

    const handleLoad = () => {
      // Send authentication and theme data to iframe
      iframe.contentWindow.postMessage({
        type: 'AGENTOPS_INIT',
        data: {
          token: agentOpsToken,
          userId: user.id,
          userEmail: user.email,
          theme: theme,
          source: 'devops-copilot'
        }
      }, process.env.REACT_APP_AGENTOPS_DASHBOARD_URL || 'http://localhost:3001');
    };

    iframe.addEventListener('load', handleLoad);

    return () => {
      iframe.removeEventListener('load', handleLoad);
    };
  }, [agentOpsToken, user, theme]);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event) => {
      // Verify origin
      const allowedOrigin = process.env.REACT_APP_AGENTOPS_DASHBOARD_URL || 'http://localhost:3001';
      if (event.origin !== allowedOrigin) return;

      if (event.data.type === 'AGENTOPS_READY') {
        console.log('AgentOps iframe ready');
      }

      if (event.data.type === 'AGENTOPS_ERROR') {
        console.error('AgentOps iframe error:', event.data.error);
        setError(event.data.error);
      }

      if (event.data.type === 'AGENTOPS_NAVIGATE') {
        // Handle navigation events from iframe if needed
        console.log('AgentOps navigation:', event.data.path);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center justify-center h-screen ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute top-0 left-0 w-full h-full border-4 border-purple-500/20 rounded-full"></div>
            <div className="absolute top-0 left-0 w-full h-full border-4 border-t-purple-500 border-r-purple-500 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          </div>
          <p className={`text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
            Loading AgentOps...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex items-center justify-center h-screen ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
        <div className={`max-w-md ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border rounded-lg p-8 text-center`}>
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className={`text-lg font-semibold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Failed to Load AgentOps
          </h3>
          <p className={`text-sm mb-4 ${theme === 'dark' ? 'text-slate-400' : 'text-gray-600'}`}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg hover:from-purple-600 hover:to-violet-700 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Build iframe URL with token and theme
  const dashboardUrl = process.env.REACT_APP_AGENTOPS_DASHBOARD_URL || 'http://localhost:3001';
  const iframeUrl = `${dashboardUrl}${path}?embedded=true&theme=${theme}&token=${agentOpsToken}`;

  return (
    <div className={`relative w-full h-full ${className}`}>
      <iframe
        ref={iframeRef}
        src={iframeUrl}
        className={`w-full h-full border-0 ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-white'}`}
        title="AgentOps Dashboard"
        allow="clipboard-write; clipboard-read"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
      />
    </div>
  );
};

export default AgentOpsEmbed;

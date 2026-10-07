'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Client-side theme handler for AgentOps dashboard
 * Handles theme switching from URL parameters and parent window postMessage
 */
export function ThemeHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check if running in embedded mode
    const isEmbedded = searchParams.get('embedded') === 'true';
    const urlTheme = searchParams.get('theme');

    // Apply theme from URL parameter
    if (urlTheme) {
      applyTheme(urlTheme, isEmbedded);
    }

    // Listen for theme changes from parent window (iframe embedding)
    const handleMessage = (event: MessageEvent) => {
      // Verify origin - should match DevOps Copilot frontend
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env.NEXT_PUBLIC_DEVOPS_COPILOT_URL,
      ].filter(Boolean);

      if (!allowedOrigins.some(origin => event.origin === origin)) {
        console.warn('Received message from untrusted origin:', event.origin);
        return;
      }

      // Handle AgentOps initialization message
      if (event.data.type === 'AGENTOPS_INIT') {
        const { theme, token, userId, userEmail, source } = event.data.data;

        console.log('[AgentOps] Received init message:', {
          theme,
          userId,
          source,
        });

        // Apply theme
        if (theme) {
          applyTheme(theme, isEmbedded);
        }

        // Store auth data (optional - if needed for API calls)
        if (token) {
          sessionStorage.setItem('agentops_token', token);
          sessionStorage.setItem('agentops_user_id', userId);
        }

        // Send ready confirmation
        event.source?.postMessage(
          {
            type: 'AGENTOPS_READY',
            data: { status: 'initialized', theme },
          },
          { targetOrigin: event.origin } as any
        );
      }

      // Handle theme change message
      if (event.data.type === 'AGENTOPS_THEME_CHANGE') {
        const { theme } = event.data.data;
        applyTheme(theme, isEmbedded);
      }
    };

    window.addEventListener('message', handleMessage);

    // Send ready message if embedded
    if (isEmbedded && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'AGENTOPS_MOUNTED',
          data: { ready: true },
        },
        '*'
      );
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [searchParams]);

  return null; // This component doesn't render anything
}

/**
 * Apply theme to the document
 */
function applyTheme(theme: string, isEmbedded: boolean) {
  const html = document.documentElement;

  // Set theme attribute
  html.setAttribute('data-theme', 'devops-copilot');

  // Set embedded attribute
  if (isEmbedded) {
    html.setAttribute('data-embedded', 'true');
    document.body.classList.add('embedded');
  }

  // Apply light/dark mode
  if (theme === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }

  console.log('[AgentOps] Theme applied:', {
    theme,
    isEmbedded,
    dataTheme: html.getAttribute('data-theme'),
  });
}

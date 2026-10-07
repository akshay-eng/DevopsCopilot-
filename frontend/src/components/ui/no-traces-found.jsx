import React from 'react';
import { Activity } from 'lucide-react';

export const NoTracesFound = () => {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-purple-100 p-6 dark:bg-purple-900/20">
                <Activity className="h-12 w-12 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                No traces found
            </h3>
            <p className="mb-6 max-w-md text-gray-600 dark:text-gray-400">
                Start monitoring your AI agents by integrating the AgentOps SDK into your application.
            </p>
            <a
                href="https://docs.agentops.ai/v2/quickstart"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-purple-600 px-6 py-2 text-white transition-colors hover:bg-purple-700"
            >
                View Documentation
            </a>
        </div>
    );
};

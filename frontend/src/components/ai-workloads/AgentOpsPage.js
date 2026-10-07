import AgentOpsEmbed from '../AgentOpsEmbed';
import { useTheme } from '../../context/ThemeContext';

/**
 * Reusable wrapper component for AgentOps pages
 * Embeds AgentOps dashboard with proper authentication and theme
 */
const AgentOpsPage = ({ path, title }) => {
    const { theme } = useTheme();

    return (
        <div className={`flex-1 h-full flex flex-col ${theme === 'dark' ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
            {/* Optional: Add a header if needed */}
            {title && (
                <div className={`px-6 py-4 ${theme === 'dark' ? 'bg-[#13131f] border-slate-800' : 'bg-white border-gray-200'} border-b`}>
                    <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                        {title}
                    </h1>
                </div>
            )}

            {/* AgentOps Embed */}
            <div className="flex-1 overflow-hidden">
                <AgentOpsEmbed path={path} className="h-full" />
            </div>
        </div>
    );
};

export default AgentOpsPage;

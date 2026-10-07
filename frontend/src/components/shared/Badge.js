import React from 'react';

/**
 * Badge component for status indicators, tags, etc.
 *
 * @param {Object} props
 * @param {string} props.variant - Badge style variant
 * @param {string} props.theme - Theme context
 * @param {React.ReactNode} props.children - Badge content
 * @param {React.Component} props.icon - Optional icon component
 */
export const Badge = ({ variant = 'default', theme, children, icon: Icon, className = '' }) => {
    const variants = {
        default: theme === 'dark'
            ? 'bg-gray-800 text-gray-300'
            : 'bg-gray-200 text-gray-700',
        primary: 'bg-gradient-to-r from-purple-600 to-violet-600 text-white',
        success: theme === 'dark'
            ? 'bg-green-500/10 text-green-400'
            : 'bg-green-50 text-green-700',
        warning: theme === 'dark'
            ? 'bg-orange-500/10 text-orange-400'
            : 'bg-orange-50 text-orange-700',
        danger: theme === 'dark'
            ? 'bg-red-500/10 text-red-400'
            : 'bg-red-50 text-red-700',
        info: theme === 'dark'
            ? 'bg-blue-500/10 text-blue-400'
            : 'bg-blue-50 text-blue-700'
    };

    return (
        <span className={`px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${variants[variant]} ${className}`}>
            {Icon && <Icon className="w-3 h-3" />}
            {children}
        </span>
    );
};

/**
 * Status Badge with dot indicator
 */
export const StatusBadge = ({ status, theme, className = '' }) => {
    const statusConfig = {
        success: {
            label: 'Success',
            color: 'bg-green-500',
            variant: 'success'
        },
        running: {
            label: 'Running',
            color: 'bg-green-500',
            variant: 'success',
            pulse: true
        },
        pending: {
            label: 'Pending',
            color: 'bg-yellow-500',
            variant: 'warning'
        },
        failed: {
            label: 'Failed',
            color: 'bg-red-500',
            variant: 'danger'
        },
        error: {
            label: 'Error',
            color: 'bg-red-500',
            variant: 'danger'
        },
        inactive: {
            label: 'Inactive',
            color: 'bg-gray-500',
            variant: 'default'
        }
    };

    const config = statusConfig[status] || statusConfig.inactive;

    return (
        <Badge variant={config.variant} theme={theme} className={className}>
            <div className="relative">
                <div className={`w-2 h-2 ${config.color} rounded-full`} />
                {config.pulse && (
                    <div className={`absolute inset-0 w-2 h-2 ${config.color} rounded-full animate-ping`} />
                )}
            </div>
            {config.label}
        </Badge>
    );
};

/**
 * Count Badge (for notifications, etc.)
 */
export const CountBadge = ({ count, max = 99, className = '' }) => {
    const displayCount = count > max ? `${max}+` : count;

    return (
        <span className={`inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-600 rounded-full ${className}`}>
            {displayCount}
        </span>
    );
};

export default Badge;

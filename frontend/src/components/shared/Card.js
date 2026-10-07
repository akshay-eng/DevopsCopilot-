import React from 'react';

/**
 * Reusable Card component with consistent styling
 *
 * @param {Object} props
 * @param {string} props.theme - Theme context ('dark' or 'light')
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {Function} props.onClick - Optional click handler
 */
export const Card = ({ theme, children, className = '', onClick }) => {
    return (
        <div
            onClick={onClick}
            className={`rounded-xl border p-6 ${
                theme === 'dark'
                    ? 'border-gray-800 bg-[#13131f]'
                    : 'border-gray-200 bg-white'
            } ${onClick ? 'cursor-pointer transition-all hover:shadow-lg' : ''} ${className}`}
        >
            {children}
        </div>
    );
};

/**
 * Card Header component
 */
export const CardHeader = ({ theme, icon: Icon, title, subtitle, actions, iconColor, iconBg }) => {
    return (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
                {Icon && (
                    <div className={`p-3 rounded-lg ${
                        iconBg || (theme === 'dark' ? 'bg-purple-500/10' : 'bg-purple-50')
                    }`}>
                        <Icon className={`w-5 h-5 ${iconColor || 'text-purple-500'}`} />
                    </div>
                )}
                <div>
                    <h3 className="text-lg font-bold">{title}</h3>
                    {subtitle && (
                        <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>
            {actions && <div>{actions}</div>}
        </div>
    );
};

/**
 * Simple card content wrapper
 */
export const CardContent = ({ children, className = '' }) => {
    return <div className={className}>{children}</div>;
};

export default Card;

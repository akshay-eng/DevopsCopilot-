import React from 'react';
import { Loader } from 'lucide-react';

/**
 * Primary gradient button (purple/violet)
 */
export const PrimaryButton = ({ children, onClick, disabled, isLoading, icon: Icon, className = '' }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled || isLoading}
            className={`px-4 py-2 bg-gradient-to-r from-purple-600 to-violet-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${className}`}
        >
            {isLoading ? (
                <Loader className="w-4 h-4 animate-spin" />
            ) : Icon ? (
                <Icon className="w-4 h-4" />
            ) : null}
            {children}
        </button>
    );
};

/**
 * Secondary button (gray)
 */
export const SecondaryButton = ({ theme, children, onClick, disabled, icon: Icon, className = '' }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                theme === 'dark'
                    ? 'bg-gray-800 hover:bg-gray-700 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
            } ${className}`}
        >
            {Icon && <Icon className="w-4 h-4" />}
            {children}
        </button>
    );
};

/**
 * Danger button (red)
 */
export const DangerButton = ({ children, onClick, disabled, icon: Icon, className = '' }) => {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${className}`}
        >
            {Icon && <Icon className="w-4 h-4" />}
            {children}
        </button>
    );
};

/**
 * Icon button (transparent with hover)
 */
export const IconButton = ({ theme, onClick, icon: Icon, title, className = '' }) => {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-2 rounded-lg transition-colors ${
                theme === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
            } ${className}`}
        >
            <Icon className="w-4 h-4" />
        </button>
    );
};

/**
 * Tab button
 */
export const TabButton = ({ theme, active, children, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`pb-4 px-1 border-b-2 transition-all whitespace-nowrap ${
                active
                    ? 'border-purple-600 text-purple-600'
                    : theme === 'dark'
                        ? 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-700'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
        >
            {children}
        </button>
    );
};

export default { PrimaryButton, SecondaryButton, DangerButton, IconButton, TabButton };

import React from 'react';
import { Loader } from 'lucide-react';

/**
 * Loading Spinner component
 */
export const LoadingSpinner = ({ size = 'md', className = '' }) => {
    const sizes = {
        sm: 'w-4 h-4',
        md: 'w-6 h-6',
        lg: 'w-8 h-8',
        xl: 'w-12 h-12'
    };

    return <Loader className={`${sizes[size]} animate-spin ${className}`} />;
};

/**
 * Loading Skeleton component for cards/content
 */
export const Skeleton = ({ theme, className = '', variant = 'default' }) => {
    const baseClass = `animate-pulse rounded ${
        theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'
    }`;

    const variants = {
        default: 'h-4 w-full',
        text: 'h-4 w-3/4',
        title: 'h-6 w-1/2',
        circle: 'h-12 w-12 rounded-full',
        card: 'h-32 w-full rounded-xl'
    };

    return <div className={`${baseClass} ${variants[variant]} ${className}`} />;
};

/**
 * Loading Card Skeleton
 */
export const CardSkeleton = ({ theme }) => {
    return (
        <div className={`rounded-xl border p-6 animate-pulse ${
            theme === 'dark' ? 'border-gray-800 bg-gray-800/50' : 'border-gray-200 bg-gray-100'
        }`}>
            <div className="flex items-center gap-3 mb-4">
                <Skeleton theme={theme} variant="circle" />
                <div className="flex-1 space-y-2">
                    <Skeleton theme={theme} variant="title" />
                    <Skeleton theme={theme} variant="text" />
                </div>
            </div>
            <Skeleton theme={theme} className="mb-2" />
            <Skeleton theme={theme} variant="text" />
        </div>
    );
};

/**
 * Full page loading overlay
 */
export const LoadingOverlay = ({ message = 'Loading...' }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 flex flex-col items-center gap-4">
                <LoadingSpinner size="lg" />
                <p className="text-sm font-medium">{message}</p>
            </div>
        </div>
    );
};

/**
 * Inline loading state
 */
export const InlineLoading = ({ theme, message }) => {
    return (
        <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3">
                <LoadingSpinner size="md" className="text-purple-600" />
                {message && (
                    <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {message}
                    </span>
                )}
            </div>
        </div>
    );
};

export default { LoadingSpinner, Skeleton, CardSkeleton, LoadingOverlay, InlineLoading };

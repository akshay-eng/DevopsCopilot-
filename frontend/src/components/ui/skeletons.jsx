import React from 'react';

export const StatSkeleton = () => {
    return (
        <div className="animate-pulse">
            <div className="h-8 w-24 rounded bg-gray-200 dark:bg-slate-700"></div>
        </div>
    );
};

export const TraceSkeletonRow = () => {
    return (
        <tr className="border-b border-gray-200 dark:border-slate-700">
            <td className="p-4">
                <div className="h-4 w-4 animate-pulse rounded bg-gray-200 dark:bg-slate-700"></div>
            </td>
            <td className="p-4">
                <div className="h-4 w-48 animate-pulse rounded bg-gray-200 dark:bg-slate-700"></div>
            </td>
            <td className="p-4">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-slate-700"></div>
            </td>
            <td className="p-4">
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-slate-700"></div>
            </td>
            <td className="p-4">
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-slate-700"></div>
            </td>
            <td className="p-4">
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200 dark:bg-slate-700"></div>
            </td>
        </tr>
    );
};

export const ChartSkeleton = () => {
    return (
        <div className="h-64 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700"></div>
    );
};

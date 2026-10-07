import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { InformationCircleIcon } from 'hugeicons-react';

export const ChartCard = ({
    title,
    tooltipContent,
    children,
    cardStyles = '',
    cardHeaderStyles = '',
    cardTitleStyles = '',
    cardTitleTextStyles = '',
    cardContentStyles = '',
}) => {
    return (
        <div className={`rounded-lg border bg-white dark:bg-slate-800 ${cardStyles}`}>
            <div className={`flex items-center justify-between p-4 ${cardHeaderStyles}`}>
                <div className={`flex items-center gap-2 ${cardTitleStyles}`}>
                    <h3 className={`text-sm font-medium text-gray-700 dark:text-gray-300 ${cardTitleTextStyles}`}>
                        {title}
                    </h3>
                    {tooltipContent && (
                        <TooltipProvider delayDuration={200}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <InformationCircleIcon className="h-4 w-4 cursor-help text-gray-400" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs rounded-md bg-gray-900 p-2 text-xs text-white">
                                    {tooltipContent}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </div>
            <div className={`px-4 pb-4 ${cardContentStyles}`}>
                {children}
            </div>
        </div>
    );
};

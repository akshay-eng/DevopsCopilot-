import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';

const Progress = React.forwardRef(({ className = '', value, ...props }, ref) => (
    <ProgressPrimitive.Root
        ref={ref}
        className={`relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700 ${className}`}
        {...props}
    >
        <ProgressPrimitive.Indicator
            className="h-full w-full flex-1 bg-purple-600 transition-all dark:bg-purple-500"
            style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
    </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

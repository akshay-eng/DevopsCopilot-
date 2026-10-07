import React from 'react';
import { format } from 'date-fns';
import { generateTimelineTicks } from '../../../utils/spanUtils';

const TimelineAxis = ({ totalDurationMs, globalStartTimestamp, isDark }) => {
  const ticks = generateTimelineTicks(totalDurationMs);
  const startTime = globalStartTimestamp ? new Date(globalStartTimestamp) : null;

  // Only show first and last absolute timestamps to avoid clutter
  const firstTick = ticks[0];

  return (
    <div className={`border-t ${isDark ? 'border-slate-800' : 'border-gray-200'}`}>
      <div className="flex">
        {/* Empty space matching label column (40%) */}
        <div className="w-2/5 flex-shrink-0" />

        {/* Tick area matching bar column (60%) */}
        <div
          className={`relative flex-1 border-l pr-3 ${isDark ? 'border-slate-800' : 'border-gray-200'}`}
          style={{ height: 36 }}
        >
          {/* Tick marks */}
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: `${tick.percent}%`, transform: 'translateX(-50%)' }}
            >
              <div className={`h-2 w-px ${isDark ? 'bg-slate-600' : 'bg-gray-300'}`} />
              <span className={`mt-0.5 text-[9px] whitespace-nowrap ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                {tick.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Absolute timestamps row (first and last) */}
      {startTime && (
        <div className="flex">
          <div className="w-2/5 flex-shrink-0" />
          <div className={`relative flex-1 border-l pr-3 ${isDark ? 'border-slate-800' : 'border-gray-200'}`}>
            {/* Start timestamp */}
            <span
              className={`absolute text-[9px] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}
              style={{ left: `${firstTick?.percent || 0}%`, top: 0 }}
            >
              {format(startTime, 'HH:mm:ss')}
            </span>
            {/* End timestamp */}
            <span
              className={`absolute text-[9px] ${isDark ? 'text-slate-600' : 'text-gray-400'}`}
              style={{ right: 12, top: 0 }}
            >
              {format(new Date(startTime.getTime() + totalDurationMs), 'HH:mm:ss')}
            </span>
            <div style={{ height: 14 }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineAxis;

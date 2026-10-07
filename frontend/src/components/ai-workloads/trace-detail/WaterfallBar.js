import React from 'react';
import { SPAN_COLORS, getSpanDisplayName, formatDurationMs } from '../../../utils/spanUtils';

const WaterfallBar = ({ span, isSelected, onClick, showBarText, isDark }) => {
  const color = SPAN_COLORS[span.classification] || SPAN_COLORS.unknown;
  const displayName = getSpanDisplayName(span);
  const indent = span.depth * 16;

  return (
    <div
      onClick={() => onClick(span)}
      className={`flex cursor-pointer items-center border-b transition-colors ${
        isSelected
          ? isDark ? 'bg-slate-700/60' : 'bg-blue-50'
          : isDark ? 'hover:bg-slate-800/40' : 'hover:bg-gray-50'
      } ${isDark ? 'border-slate-800' : 'border-gray-100'}`}
      style={{ minHeight: 32 }}
    >
      {/* Left label area (40%) */}
      <div
        className="flex w-2/5 flex-shrink-0 items-center gap-2 overflow-hidden px-3 py-1"
        style={{ paddingLeft: indent + 12 }}
      >
        {/* Color dot */}
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: isDark ? color.light : color.bg }}
        />
        {/* Span name */}
        <span
          className={`truncate text-xs font-medium ${isDark ? 'text-slate-200' : 'text-gray-800'}`}
          title={displayName}
        >
          {displayName}
        </span>
        {/* Duration badge */}
        <span className={`ml-auto flex-shrink-0 text-[10px] ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
          {formatDurationMs(span.durationMs)}
        </span>
      </div>

      {/* Right bar area (60%) */}
      <div className={`relative flex-1 py-1 pr-3 ${isDark ? 'border-l border-slate-800' : 'border-l border-gray-200'}`}>
        <div className="relative h-5">
          <div
            className="absolute top-0 h-full rounded-sm transition-all"
            style={{
              left: `${span.leftPercent}%`,
              width: `${span.widthPercent}%`,
              backgroundColor: isDark ? color.light : color.bg,
              opacity: isSelected ? 1 : 0.8,
              minWidth: 4,
            }}
          >
            {showBarText && span.widthPercent > 8 && (
              <span className="absolute inset-0 flex items-center px-1 text-[9px] font-medium text-white truncate">
                {formatDurationMs(span.durationMs)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaterfallBar;

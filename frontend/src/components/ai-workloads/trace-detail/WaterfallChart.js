import React from 'react';
import WaterfallBar from './WaterfallBar';
import TimelineAxis from './TimelineAxis';
import { SPAN_COLORS } from '../../../utils/spanUtils';

const WaterfallChart = ({
  spans,
  totalDurationMs,
  globalStartTimestamp,
  selectedSpanId,
  onSpanClick,
  filters,
  onToggleFilter,
  showBarText,
  onShowBarTextChange,
  showTooltip,
  onShowTooltipChange,
  isDark,
}) => {
  // Apply filter by classification
  const visibleSpans = spans.filter(s => filters[s.classification] !== false);

  return (
    <div className="flex h-full flex-col">
      {/* ═══ Filter chips row (inside waterfall area) ═══ */}
      <div className={`flex items-center gap-3 border-b px-4 py-3 ${isDark ? 'border-slate-800' : 'border-gray-100'}`}>
        {Object.entries(filters).map(([key, value]) => {
          const color = SPAN_COLORS[key] || SPAN_COLORS.unknown;
          return (
            <button
              key={key}
              onClick={() => onToggleFilter(key)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors ${
                value
                  ? isDark
                    ? 'border-slate-600 bg-slate-800 text-slate-200'
                    : 'border-gray-300 bg-white text-gray-800 shadow-sm'
                  : isDark
                  ? 'border-slate-700 bg-slate-800/30 text-slate-600'
                  : 'border-gray-200 bg-gray-50 text-gray-400'
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: value ? (isDark ? color.light : color.bg) : 'transparent',
                  border: value ? 'none' : `1.5px solid ${isDark ? '#475569' : '#d1d5db'}`,
                }}
              />
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          );
        })}
      </div>

      {/* ═══ Span rows ═══ */}
      <div className="flex-1 overflow-y-auto">
        {visibleSpans.map(span => (
          <WaterfallBar
            key={span.id}
            span={span}
            isSelected={selectedSpanId === span.id}
            onClick={onSpanClick}
            showBarText={showBarText}
            isDark={isDark}
          />
        ))}
        {visibleSpans.length === 0 && (
          <div className={`py-8 text-center text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            No spans match the selected filters
          </div>
        )}
      </div>

      {/* ═══ Bottom bar: checkboxes (left) + timeline axis ═══ */}
      <div className="relative">
        {/* Checkboxes floating bottom-left */}
        <div className={`absolute bottom-full left-3 mb-2 z-10 rounded-lg border px-3 py-2 shadow-sm ${
          isDark ? 'border-slate-700 bg-[#13131f]' : 'border-gray-200 bg-white'
        }`}>
          <label className={`flex items-center gap-2 text-xs cursor-pointer ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
            <input
              type="checkbox"
              checked={showBarText}
              onChange={e => onShowBarTextChange(e.target.checked)}
              className="rounded border-gray-400 text-blue-500 focus:ring-blue-500"
            />
            Show Bar Text
          </label>
          <label className={`mt-1.5 flex items-center gap-2 text-xs cursor-pointer ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
            <input
              type="checkbox"
              checked={showTooltip}
              onChange={e => onShowTooltipChange(e.target.checked)}
              className="rounded border-gray-400 text-blue-500 focus:ring-blue-500"
            />
            Show tooltip
          </label>
        </div>

        {/* Timeline axis */}
        <TimelineAxis
          totalDurationMs={totalDurationMs}
          globalStartTimestamp={globalStartTimestamp}
          isDark={isDark}
        />
      </div>
    </div>
  );
};

export default WaterfallChart;

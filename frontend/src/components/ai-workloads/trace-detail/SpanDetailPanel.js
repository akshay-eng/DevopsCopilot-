import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import {
  classifySpan,
  extractSpanDetails,
  formatDurationMs,
} from '../../../utils/spanUtils';
import SpanDetailPrettify from './SpanDetailPrettify';
import SpanDetailRawJson from './SpanDetailRawJson';

const SpanDetailPanel = ({ span, isDark }) => {
  const [contentView, setContentView] = useState('prettify');
  const [copied, setCopied] = useState(false);

  if (!span) {
    return (
      <div className={`flex h-full items-center justify-center ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
        <p className="text-sm">Select a span to view details</p>
      </div>
    );
  }

  const category = classifySpan(span);
  const details = extractSpanDetails(span);

  const durationMs = span.durationMs != null
    ? span.durationMs
    : span.duration
      ? span.duration / 1e6
      : 0;

  // Determine tab label based on span type
  const prettifyTabLabel = category === 'tool' ? 'Tool View' : 'Prettify';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(span, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabClass = (active) =>
    `border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
      active
        ? isDark ? 'border-blue-400 text-blue-400' : 'border-blue-600 text-blue-600'
        : isDark
        ? 'border-transparent text-slate-400 hover:text-slate-200'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  // Format the span type display name (remove dots, clean up)
  const displayName = (span.event_type || 'Span')
    .replace('default.', '')
    .replace('.execute', '')
    .replace('openai.chat.completion', 'openai.chat');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ═══ Span header ═══ */}
      <div className={`border-b px-5 py-4 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
        <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          {displayName}
        </h3>

        {/* Time and duration */}
        <div className={`mt-2 space-y-0.5 text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
          <div>
            Time:{' '}
            <span className={isDark ? 'text-slate-200' : 'text-gray-800'}>
              {span.init_timestamp ? format(new Date(span.init_timestamp), 'HH:mm:ss') : '—'}
              {span.end_timestamp && ` - ${format(new Date(span.end_timestamp), 'HH:mm:ss')}`}
            </span>
          </div>
          <div>
            Duration:{' '}
            <span className={isDark ? 'text-slate-200' : 'text-gray-800'}>
              {formatDurationMs(durationMs)}
            </span>
          </div>
          {details.model && (
            <div className="flex items-center gap-1.5">
              Model:{' '}
              <span className={`inline-flex items-center gap-1 ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                </svg>
                {details.model}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Metrics for LLM / agent spans ═══ */}
      {(category === 'llm' || category === 'agent') && (details.totalTokens > 0 || details.totalCost > 0) && (
        <div className={`flex border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
          {/* Cost column */}
          <div className={`flex-1 border-r px-5 py-3 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
            <div className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Cost</div>
            <div className={`mt-1 space-y-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              <div>Prompt: <span className={isDark ? 'text-slate-200' : 'text-gray-800'}>${details.promptCost.toFixed(7)}</span></div>
              <div>Completion: <span className={isDark ? 'text-slate-200' : 'text-gray-800'}>${details.completionCost.toFixed(7)}</span></div>
              <div className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Total: ${details.totalCost.toFixed(7)}
              </div>
            </div>
          </div>
          {/* Tokens column */}
          <div className="flex-1 px-5 py-3">
            <div className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Tokens</div>
            <div className={`mt-1 space-y-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              <div>Prompt: <span className={isDark ? 'text-slate-200' : 'text-gray-800'}>{details.promptTokens}</span></div>
              <div>Completion: <span className={isDark ? 'text-slate-200' : 'text-gray-800'}>{details.completionTokens}</span></div>
              <div className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Total: {details.totalTokens}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Prettify / Tool View / Raw JSON tabs ═══ */}
      <div className={`flex items-center justify-between border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
        <div className="flex">
          <button onClick={() => setContentView('prettify')} className={tabClass(contentView === 'prettify')}>
            {prettifyTabLabel}
          </button>
          <button onClick={() => setContentView('raw')} className={tabClass(contentView === 'raw')}>
            Raw JSON
          </button>
        </div>
        <button
          onClick={copyToClipboard}
          className={`mr-4 flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'}`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* ═══ Content area ═══ */}
      <div className="flex-1 overflow-y-auto p-5">
        {contentView === 'prettify' ? (
          <SpanDetailPrettify span={span} isDark={isDark} />
        ) : (
          <SpanDetailRawJson span={span} isDark={isDark} />
        )}
      </div>
    </div>
  );
};

export default SpanDetailPanel;

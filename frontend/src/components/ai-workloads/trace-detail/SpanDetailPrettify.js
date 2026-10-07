import React, { useState } from 'react';
import { Copy, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight } from 'lucide-react';
import { classifySpan, extractSpanDetails } from '../../../utils/spanUtils';

const SpanDetailPrettify = ({ span, isDark }) => {
  const category = classifySpan(span);
  const details = extractSpanDetails(span);

  // ── LLM / Agent span: chat-style messages ─────────────────────────────────
  if (category === 'llm' || category === 'agent') {
    // Build a message list from prompts + completions
    const messages = [];

    // Add prompt messages
    details.prompts.forEach((msg) => {
      messages.push({ role: msg.role, content: msg.content });
    });

    // Add completion messages
    details.completions.forEach((msg) => {
      messages.push({ role: msg.role || 'assistant', content: msg.content });
    });

    // If no structured messages, show params that look like content
    if (messages.length === 0) {
      const params = span.params || {};
      // Try common content keys
      const contentKeys = Object.keys(params).filter(k =>
        k.includes('content') || k.includes('prompt') || k.includes('completion') || k.includes('response')
      );
      contentKeys.forEach(k => {
        if (params[k]) {
          messages.push({ role: k.includes('prompt') || k.includes('user') ? 'user' : 'assistant', content: params[k] });
        }
      });
    }

    if (messages.length === 0) {
      return <FallbackParams span={span} isDark={isDark} />;
    }

    return (
      <div className="space-y-4">
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} isDark={isDark} />
        ))}
      </div>
    );
  }

  // ── Tool span: collapsible Tool View ──────────────────────────────────────
  if (category === 'tool') {
    return (
      <div className="space-y-3">
        {details.toolName && (
          <CollapsibleSection title="Tool Name" isDark={isDark} defaultOpen>
            <div className={`rounded-lg border p-3 font-mono text-sm ${
              isDark ? 'border-slate-700 bg-slate-800/50 text-slate-200' : 'border-gray-200 bg-gray-50 text-gray-800'
            }`}>
              {details.toolName}
            </div>
          </CollapsibleSection>
        )}
        {details.toolArgs && (
          <CollapsibleSection title="Parameters" isDark={isDark} defaultOpen>
            <div className={`rounded-lg border p-3 font-mono text-sm whitespace-pre-wrap ${
              isDark ? 'border-slate-700 bg-slate-800/50 text-slate-200' : 'border-gray-200 bg-gray-50 text-gray-800'
            }`}>
              {typeof details.toolArgs === 'string'
                ? tryPrettyJson(details.toolArgs)
                : JSON.stringify(details.toolArgs, null, 2)}
            </div>
          </CollapsibleSection>
        )}
        {details.toolResult && (
          <CollapsibleSection title="Result" isDark={isDark} defaultOpen>
            <div className={`rounded-lg border p-3 font-mono text-sm whitespace-pre-wrap ${
              isDark ? 'border-slate-700 bg-slate-800/50 text-slate-200' : 'border-gray-200 bg-gray-50 text-gray-800'
            }`}>
              {typeof details.toolResult === 'string'
                ? tryPrettyJson(details.toolResult)
                : JSON.stringify(details.toolResult, null, 2)}
            </div>
          </CollapsibleSection>
        )}
        {!details.toolName && !details.toolArgs && !details.toolResult && (
          <FallbackParams span={span} isDark={isDark} />
        )}
      </div>
    );
  }

  // ── Session span ──────────────────────────────────────────────────────────
  if (category === 'session') {
    return (
      <div className="space-y-4">
        {details.endState && (
          <div>
            <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              End State
            </div>
            <div className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              details.endState === 'Success'
                ? isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                : isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
            }`}>
              {details.endState}
            </div>
          </div>
        )}
        {details.tags && details.tags.length > 0 && (
          <div>
            <div className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
              Tags
            </div>
            <div className="flex flex-wrap gap-1.5">
              {details.tags.map((tag, i) => (
                <span key={i} className={`rounded-full px-3 py-1 text-xs font-medium ${
                  isDark ? 'bg-slate-700 text-slate-300' : 'bg-gray-200 text-gray-700'
                }`}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Workflow / unknown ────────────────────────────────────────────────────
  return <FallbackParams span={span} isDark={isDark} />;
};

// ── Chat message component (like the reference screenshot) ──────────────────
const ChatMessage = ({ message, isDark }) => {
  const [copied, setCopied] = useState(false);
  const role = (message.role || 'user').toLowerCase();

  const copyText = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // User messages: right-aligned bubble
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className={`max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-sm ${
          isDark ? 'bg-blue-600/20 text-blue-100' : 'bg-blue-50 text-gray-800'
        }`}>
          <RenderMarkdown text={message.content} isDark={isDark} />
        </div>
      </div>
    );
  }

  // System messages: full width, muted
  if (role === 'system') {
    return (
      <div className={`rounded-lg border px-4 py-3 text-xs ${
        isDark ? 'border-slate-700 bg-slate-800/40 text-slate-400' : 'border-gray-200 bg-gray-50 text-gray-500'
      }`}>
        <span className={`mb-1 block text-[10px] font-semibold uppercase ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
          System
        </span>
        <RenderMarkdown text={message.content} isDark={isDark} />
      </div>
    );
  }

  // Tool messages
  if (role === 'tool' || role === 'function') {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
          T
        </div>
        <div className="flex-1">
          <div className={`rounded-xl px-4 py-3 text-sm ${
            isDark ? 'bg-slate-800/60 text-slate-200' : 'bg-gray-50 text-gray-800'
          }`}>
            <RenderMarkdown text={message.content} isDark={isDark} />
          </div>
          <MessageActions onCopy={copyText} copied={copied} isDark={isDark} />
        </div>
      </div>
    );
  }

  // Assistant messages
  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
        isDark ? 'bg-emerald-600' : 'bg-emerald-500'
      }`}>
        A
      </div>
      <div className="flex-1">
        <div className={`text-sm leading-relaxed ${isDark ? 'text-slate-200' : 'text-gray-800'}`}>
          <RenderMarkdown text={message.content} isDark={isDark} />
        </div>
        <MessageActions onCopy={copyText} copied={copied} isDark={isDark} />
      </div>
    </div>
  );
};

// ── Message action buttons (copy, thumbs up, thumbs down) ──────────────────
const MessageActions = ({ onCopy, copied, isDark }) => (
  <div className="mt-1.5 flex items-center gap-2">
    <button
      onClick={onCopy}
      className={`p-1 rounded transition-colors ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
    <button className={`p-1 rounded transition-colors ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}>
      <ThumbsUp className="h-3.5 w-3.5" />
    </button>
    <button className={`p-1 rounded transition-colors ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600'}`}>
      <ThumbsDown className="h-3.5 w-3.5" />
    </button>
  </div>
);

// ── Collapsible section for tool view ───────────────────────────────────────
const CollapsibleSection = ({ title, isDark, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-2 py-2 text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {open && <div className="pl-6">{children}</div>}
    </div>
  );
};

// ── Simple markdown renderer (bold, code, newlines) ─────────────────────────
const RenderMarkdown = ({ text, isDark }) => {
  if (!text) return null;
  // Split by bold markers **...**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

// ── Fallback: show all params as key-value ──────────────────────────────────
const FallbackParams = ({ span, isDark }) => {
  const params = span.params || {};
  const entries = Object.entries(params).filter(([, v]) => v !== '' && v != null);
  if (entries.length === 0) {
    return (
      <div className={`py-4 text-center text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
        No detailed content available for this span
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {entries.slice(0, 30).map(([key, value]) => (
        <CollapsibleSection key={key} title={key} isDark={isDark} defaultOpen={false}>
          <div className={`rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap ${
            isDark ? 'border-slate-700 bg-slate-800/50 text-slate-300' : 'border-gray-200 bg-gray-50 text-gray-700'
          }`}>
            {typeof value === 'string' ? tryPrettyJson(value) : JSON.stringify(value, null, 2)}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
};

function tryPrettyJson(str) {
  try {
    const obj = JSON.parse(str);
    return JSON.stringify(obj, null, 2);
  } catch {
    return str;
  }
}

export default SpanDetailPrettify;

import React from 'react';

const SpanDetailRawJson = ({ span, isDark }) => {
  const jsonStr = JSON.stringify(span, null, 2);
  const lines = jsonStr.split('\n');

  return (
    <div className="relative">
      <div className="flex font-mono text-xs">
        {/* Line numbers */}
        <div
          className={`select-none border-r px-3 py-3 text-right ${
            isDark
              ? 'border-slate-700 bg-slate-900/50 text-slate-600'
              : 'border-gray-200 bg-gray-50 text-gray-400'
          }`}
          style={{ minWidth: 44 }}
        >
          {lines.map((_, i) => (
            <div key={i} className="leading-5">{i + 1}</div>
          ))}
        </div>

        {/* JSON content */}
        <div className="flex-1 overflow-x-auto">
          <pre className={`p-3 leading-5 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
            {lines.map((line, i) => {
              const highlighted = line
                .replace(/"([^"]+)":/g, `<span class="${isDark ? 'text-blue-400' : 'text-blue-600'}">"$1"</span>:`)
                .replace(/: "([^"]*)"/g, `: <span class="${isDark ? 'text-green-400' : 'text-green-600'}">"$1"</span>`)
                .replace(/: (true|false|null)/g, `: <span class="${isDark ? 'text-purple-400' : 'text-purple-600'}">$1</span>`)
                .replace(/: (-?\d+\.?\d*)/g, `: <span class="${isDark ? 'text-orange-400' : 'text-orange-600'}">$1</span>`);

              return (
                <div key={i} dangerouslySetInnerHTML={{ __html: highlighted }} />
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default SpanDetailRawJson;

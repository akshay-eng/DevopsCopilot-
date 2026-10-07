import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import ReactMarkdown from 'react-markdown';
import {
  Folder, FileText, FileCode2, FileType2, Image as ImageIcon, File as FileIcon,
  ChevronLeft, ChevronRight, Search, LayoutGrid, List as ListIcon, X, Download,
  BookOpen, Server, Package, Sparkles, Loader2, ArrowUp,
} from 'lucide-react';
import { getDocumentTree, getDocumentFile, getDocumentBlobUrl } from '../services/api';

const ROOT_ICONS = { book: BookOpen, server: Server, package: Package, sparkles: Sparkles };

const KIND = {
  md: 'Markdown', markdown: 'Markdown', yaml: 'YAML', yml: 'YAML', json: 'JSON',
  pdf: 'PDF Document', txt: 'Plain Text', log: 'Log File', sh: 'Shell Script',
  js: 'JavaScript', py: 'Python', tpl: 'Template', png: 'PNG Image', jpg: 'JPEG Image',
  jpeg: 'JPEG Image', svg: 'SVG Image', csv: 'CSV', html: 'HTML', conf: 'Config',
};
const kindOf = (n) => (n.type === 'dir' ? 'Folder' : (KIND[n.ext] || (n.ext ? `${n.ext.toUpperCase()} File` : 'Document')));

const CODE_EXT = new Set(['yaml', 'yml', 'json', 'sh', 'bash', 'js', 'jsx', 'ts', 'py', 'tpl', 'conf', 'cfg', 'ini', 'toml', 'sql', 'xml', 'html', 'css', 'env']);
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

const fileIcon = (n) => {
  if (n.type === 'dir') return Folder;
  if (n.ext === 'pdf') return FileType2;
  if (IMG_EXT.has(n.ext)) return ImageIcon;
  if (n.ext === 'md' || n.ext === 'markdown' || n.ext === 'txt') return FileText;
  if (CODE_EXT.has(n.ext)) return FileCode2;
  return FileIcon;
};
const iconTint = (n) => {
  if (n.type === 'dir') return '#60a5fa';
  if (n.ext === 'pdf') return '#f87171';
  if (n.ext === 'md' || n.ext === 'markdown') return '#a5b4fc';
  if (IMG_EXT.has(n.ext)) return '#86efac';
  if (CODE_EXT.has(n.ext)) return '#fcd34d';
  return '#9ca3af';
};

const fmtSize = (b) => {
  if (b == null) return '--';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};
const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--');

const Reports = () => {
  const { theme } = useTheme();
  const dk = theme === 'dark';

  const [roots, setRoots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cwd, setCwd] = useState([]);          // path segments, e.g. ['runbooks','trivy-operator']
  const [history, setHistory] = useState([[]]);
  const [hIdx, setHIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('list');
  const [query, setQuery] = useState('');
  const [fileState, setFileState] = useState({ loading: false, text: null, blobUrl: null, error: null });

  // Locally generated SOPs become a virtual root so everything lives in one browser.
  const sopRoot = useMemo(() => {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('holmesgpt_reports') || '[]'); } catch { saved = []; }
    return {
      name: 'Generated SOPs', path: 'sops', type: 'dir', icon: 'sparkles', root: true,
      children: saved.map((r) => ({
        name: r.fileName || `${(r.title || 'report').replace(/\s+/g, '-')}.md`,
        path: `sops/${r.id}`, type: 'file', ext: 'md',
        size: (r.summary || '').length, modified: r.createdAt, _report: r,
      })),
    };
  }, []);

  useEffect(() => {
    getDocumentTree()
      .then((r) => { if (r?.success) setRoots(r.roots || []); })
      .catch(() => setRoots([]))
      .finally(() => setLoading(false));
  }, []);

  const allRoots = useMemo(() => [...roots, sopRoot], [roots, sopRoot]);

  // Resolve current folder node from the path segments.
  const currentChildren = useMemo(() => {
    if (cwd.length === 0) return allRoots;
    let node = allRoots.find((r) => r.path === cwd[0]);
    for (let i = 1; i < cwd.length && node; i++) {
      node = (node.children || []).find((c) => c.name === cwd[i]);
    }
    return node?.children || [];
  }, [allRoots, cwd]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return currentChildren;
    return currentChildren.filter((c) => c.name.toLowerCase().includes(q));
  }, [currentChildren, query]);

  const go = useCallback((segments) => {
    setCwd(segments);
    setSelected(null);
    setHistory((h) => { const next = h.slice(0, hIdx + 1); next.push(segments); return next; });
    setHIdx((i) => i + 1);
  }, [hIdx]);

  const back = () => { if (hIdx > 0) { setHIdx(hIdx - 1); setCwd(history[hIdx - 1]); setSelected(null); } };
  const fwd = () => { if (hIdx < history.length - 1) { setHIdx(hIdx + 1); setCwd(history[hIdx + 1]); setSelected(null); } };

  const open = (node) => {
    if (node.type === 'dir') go(cwd.length === 0 ? [node.path] : [...cwd, node.name]);
    else setSelected(node);
  };

  // Load the selected file's contents.
  useEffect(() => {
    let revoked = null;
    if (!selected) { setFileState({ loading: false, text: null, blobUrl: null, error: null }); return undefined; }

    if (selected._report) {
      setFileState({ loading: false, text: selected._report.summary || '_No content_', blobUrl: null, error: null });
      return undefined;
    }

    setFileState({ loading: true, text: null, blobUrl: null, error: null });
    const isBinary = selected.ext === 'pdf' || IMG_EXT.has(selected.ext);
    if (isBinary) {
      getDocumentBlobUrl(selected.path)
        .then((url) => { revoked = url; setFileState({ loading: false, text: null, blobUrl: url, error: null }); })
        .catch((e) => setFileState({ loading: false, text: null, blobUrl: null, error: e.message }));
    } else {
      getDocumentFile(selected.path)
        .then((r) => setFileState({ loading: false, text: r?.content ?? '', blobUrl: null, error: r?.success ? null : (r?.error || 'Unable to read file') }))
        .catch((e) => setFileState({ loading: false, text: null, blobUrl: null, error: e.message }));
    }
    return () => { if (revoked) URL.revokeObjectURL(revoked); };
  }, [selected]);

  // ── styles ────────────────────────────────────────────────────────────────
  const shell = dk ? 'bg-[#0a0a0a]' : 'bg-[#f4f6fa]';
  const panel = dk ? 'bg-[#141414] border-[#1f1f1f]' : 'bg-white border-gray-200';
  const sidebar = dk ? 'bg-[#101010] border-[#1f1f1f]' : 'bg-[#f7f8fa] border-gray-200';
  const heading = dk ? 'text-gray-100' : 'text-gray-900';
  const soft = dk ? 'text-gray-500' : 'text-gray-400';
  const row = dk ? 'hover:bg-[#1c1c1c]' : 'hover:bg-gray-50';

  const breadcrumb = ['Documents', ...cwd.map((seg, i) => (i === 0 ? (allRoots.find((r) => r.path === seg)?.name || seg) : seg))];

  const renderPreview = () => {
    if (fileState.loading) {
      return <div className="flex items-center justify-center h-full gap-2"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className={`text-[13px] ${soft}`}>Loading…</span></div>;
    }
    if (fileState.error) {
      return <div className={`flex items-center justify-center h-full text-[13px] text-red-400`}>{fileState.error}</div>;
    }
    if (fileState.blobUrl) {
      if (selected.ext === 'pdf') {
        return <iframe title={selected.name} src={fileState.blobUrl} className="w-full h-full border-0 rounded-xl" />;
      }
      return <div className="h-full flex items-center justify-center p-4"><img src={fileState.blobUrl} alt={selected.name} className="max-w-full max-h-full rounded-xl" /></div>;
    }
    if (fileState.text == null) return null;

    const ext = selected.ext;
    if (ext === 'md' || ext === 'markdown') {
      return (
        <div className={`px-6 py-5 text-[14px] leading-relaxed ${dk ? 'text-gray-300' : 'text-gray-700'}`}>
          <ReactMarkdown
            components={{
              h1: ({ ...p }) => <h1 className={`text-[22px] font-bold mt-2 mb-3 ${heading}`} {...p} />,
              h2: ({ ...p }) => <h2 className={`text-[18px] font-semibold mt-5 mb-2 ${heading}`} {...p} />,
              h3: ({ ...p }) => <h3 className={`text-[15px] font-semibold mt-4 mb-1.5 ${heading}`} {...p} />,
              p: ({ ...p }) => <p className="my-2.5" {...p} />,
              ul: ({ ...p }) => <ul className="list-disc pl-5 my-2.5 space-y-1" {...p} />,
              ol: ({ ...p }) => <ol className="list-decimal pl-5 my-2.5 space-y-1" {...p} />,
              a: ({ ...p }) => <a className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer" {...p} />,
              // react-markdown v10 no longer passes `inline`; fenced blocks are
              // the ones that carry a `language-*` class.
              code: ({ className, children, ...p }) => (/language-/.test(className || '')
                ? <code className={`font-mono ${className || ''}`} {...p}>{children}</code>
                : <code className={`px-1.5 py-0.5 rounded text-[12.5px] font-mono ${dk ? 'bg-[#232323] text-amber-300' : 'bg-gray-100 text-pink-600'}`} {...p}>{children}</code>),
              pre: ({ ...p }) => <pre className={`my-3 p-3.5 rounded-xl overflow-x-auto text-[12.5px] font-mono ${dk ? 'bg-[#0f0f0f] border border-[#232323] text-gray-300' : 'bg-[#f7f8fa] border border-gray-200 text-gray-800'}`} {...p} />,
              blockquote: ({ ...p }) => <blockquote className={`border-l-2 pl-3 my-3 italic ${dk ? 'border-[#333] text-gray-400' : 'border-gray-300 text-gray-500'}`} {...p} />,
              table: ({ ...p }) => <table className="w-full my-3 text-[13px] border-collapse" {...p} />,
              th: ({ ...p }) => <th className={`text-left px-2.5 py-1.5 border-b font-semibold ${dk ? 'border-[#232323]' : 'border-gray-200'}`} {...p} />,
              td: ({ ...p }) => <td className={`px-2.5 py-1.5 border-b ${dk ? 'border-[#1a1a1a]' : 'border-gray-100'}`} {...p} />,
            }}
          >{fileState.text}</ReactMarkdown>
        </div>
      );
    }

    // Code / plain text with line numbers (Finder "Quick Look" feel)
    const lines = String(fileState.text).split('\n');
    return (
      <div className={`h-full overflow-auto font-mono text-[12.5px] leading-[1.6] ${dk ? 'text-gray-300' : 'text-gray-800'}`}>
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className={`select-none text-right pr-3 pl-4 w-12 align-top ${dk ? 'text-gray-700' : 'text-gray-300'}`}>{i + 1}</td>
                <td className="pr-4 whitespace-pre-wrap break-words align-top">{l || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${shell}`}>
      <div className="flex-1 flex overflow-hidden p-5 gap-0">
        <div className={`flex-1 flex overflow-hidden rounded-2xl border ${panel} shadow-sm`}>

          {/* ── Sidebar ── */}
          <aside className={`w-[220px] shrink-0 border-r ${sidebar} flex flex-col`}>
            <div className="px-4 pt-4 pb-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${soft}`}>Locations</span>
            </div>
            <nav className="px-2 space-y-0.5 overflow-y-auto no-scrollbar">
              <button onClick={() => go([])}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${cwd.length === 0 ? (dk ? 'bg-[#232323] text-white' : 'bg-[#e6ecf7] text-gray-900') : `${dk ? 'text-gray-400' : 'text-gray-600'} ${row}`}`}>
                <Folder size={15} style={{ color: '#60a5fa' }} /> All documents
              </button>
              {allRoots.map((r) => {
                const Icon = ROOT_ICONS[r.icon] || Folder;
                const activeRoot = cwd[0] === r.path;
                return (
                  <button key={r.path} onClick={() => go([r.path])}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors ${activeRoot ? (dk ? 'bg-[#232323] text-white' : 'bg-[#e6ecf7] text-gray-900') : `${dk ? 'text-gray-400' : 'text-gray-600'} ${row}`}`}>
                    <Icon size={15} style={{ color: '#60a5fa' }} />
                    <span className="truncate flex-1 text-left">{r.name}</span>
                    <span className={`text-[11px] ${soft}`}>{(r.children || []).length}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* ── Main ── */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Toolbar */}
            <div className={`flex items-center gap-3 px-4 py-2.5 border-b ${dk ? 'border-[#1f1f1f]' : 'border-gray-200'}`}>
              <div className="flex items-center gap-1">
                <button onClick={back} disabled={hIdx === 0}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 ${dk ? 'text-gray-400 hover:bg-[#1c1c1c]' : 'text-gray-500 hover:bg-gray-100'}`}><ChevronLeft size={16} /></button>
                <button onClick={fwd} disabled={hIdx >= history.length - 1}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 ${dk ? 'text-gray-400 hover:bg-[#1c1c1c]' : 'text-gray-500 hover:bg-gray-100'}`}><ChevronRight size={16} /></button>
                <button onClick={() => go(cwd.slice(0, -1))} disabled={cwd.length === 0}
                  title="Up" className={`w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 ${dk ? 'text-gray-400 hover:bg-[#1c1c1c]' : 'text-gray-500 hover:bg-gray-100'}`}><ArrowUp size={15} /></button>
              </div>

              {/* Breadcrumb */}
              <div className="flex items-center gap-1 min-w-0 flex-1">
                {breadcrumb.map((seg, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight size={13} className={soft} />}
                    <button onClick={() => go(i === 0 ? [] : cwd.slice(0, i))}
                      className={`text-[13px] truncate px-1 rounded ${i === breadcrumb.length - 1 ? `font-semibold ${heading}` : `${soft} hover:underline`}`}>
                      {seg}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className={`inline-flex rounded-lg p-0.5 ${dk ? 'bg-[#1a1a1a]' : 'bg-gray-100'}`}>
                  <button onClick={() => setView('list')} className={`w-7 h-6 rounded-md flex items-center justify-center ${view === 'list' ? (dk ? 'bg-[#2a2a2a] text-white' : 'bg-white text-gray-900 shadow-sm') : soft}`}><ListIcon size={13} /></button>
                  <button onClick={() => setView('grid')} className={`w-7 h-6 rounded-md flex items-center justify-center ${view === 'grid' ? (dk ? 'bg-[#2a2a2a] text-white' : 'bg-white text-gray-900 shadow-sm') : soft}`}><LayoutGrid size={13} /></button>
                </div>
                <div className="relative">
                  <Search size={13} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${soft}`} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search"
                    className={`w-40 pl-7 pr-2 py-1.5 text-[12.5px] rounded-lg outline-none ${dk ? 'bg-[#1a1a1a] text-gray-200 placeholder-gray-600' : 'bg-gray-100 text-gray-800 placeholder-gray-400'}`} />
                </div>
              </div>
            </div>

            {/* Body: file list + preview */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              <div className={`${selected ? 'w-1/2' : 'flex-1'} overflow-y-auto min-w-0`}>
                {loading ? (
                  <div className="flex items-center justify-center h-40 gap-2"><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className={`text-[13px] ${soft}`}>Loading documents…</span></div>
                ) : visible.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center h-40 ${soft}`}>
                    <Folder size={34} className="mb-2 opacity-40" />
                    <p className="text-[13px]">{query ? 'No matches' : 'This folder is empty'}</p>
                  </div>
                ) : view === 'grid' ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 p-4">
                    {visible.map((n) => {
                      const Icon = fileIcon(n);
                      const isSel = selected?.path === n.path;
                      return (
                        <button key={n.path} onDoubleClick={() => open(n)} onClick={() => (n.type === 'dir' ? open(n) : setSelected(n))}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${isSel ? (dk ? 'bg-[#232323]' : 'bg-[#e6ecf7]') : row}`}>
                          <Icon size={34} strokeWidth={1.4} style={{ color: iconTint(n) }} />
                          <span className={`text-[11.5px] text-center leading-tight break-all line-clamp-2 ${dk ? 'text-gray-300' : 'text-gray-700'}`}>{n.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className={`sticky top-0 ${dk ? 'bg-[#141414]' : 'bg-white'}`}>
                      <tr className={`text-[11.5px] ${soft}`}>
                        <th className="text-left font-medium px-4 py-2">Name</th>
                        <th className="text-left font-medium px-4 py-2 w-48">Date Modified</th>
                        <th className="text-right font-medium px-4 py-2 w-20">Size</th>
                        <th className="text-left font-medium px-4 py-2 w-28">Kind</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((n) => {
                        const Icon = fileIcon(n);
                        const isSel = selected?.path === n.path;
                        return (
                          <tr key={n.path} onDoubleClick={() => open(n)} onClick={() => (n.type === 'dir' ? open(n) : setSelected(n))}
                            className={`cursor-pointer ${isSel ? (dk ? 'bg-[#232323]' : 'bg-[#e6ecf7]') : row}`}>
                            <td className="px-4 py-[7px]">
                              <span className="flex items-center gap-2.5 min-w-0">
                                <Icon size={16} strokeWidth={1.7} style={{ color: iconTint(n) }} className="shrink-0" />
                                <span className={`text-[13px] truncate ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{n.name}</span>
                              </span>
                            </td>
                            <td className={`px-4 py-[7px] text-[12px] ${soft}`}>{fmtDate(n.modified)}</td>
                            <td className={`px-4 py-[7px] text-[12px] text-right ${soft}`}>{n.type === 'dir' ? '--' : fmtSize(n.size)}</td>
                            <td className={`px-4 py-[7px] text-[12px] ${soft}`}>{kindOf(n)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Preview pane */}
              {selected && (
                <div className={`w-1/2 border-l flex flex-col min-w-0 ${dk ? 'border-[#1f1f1f] bg-[#101010]' : 'border-gray-200 bg-[#fbfcfe]'}`}>
                  <div className={`flex items-center gap-2 px-4 py-2.5 border-b shrink-0 ${dk ? 'border-[#1f1f1f]' : 'border-gray-200'}`}>
                    {React.createElement(fileIcon(selected), { size: 15, style: { color: iconTint(selected) } })}
                    <span className={`text-[13px] font-medium truncate flex-1 ${heading}`}>{selected.name}</span>
                    <span className={`text-[11px] ${soft}`}>{kindOf(selected)} · {fmtSize(selected.size)}</span>
                    {fileState.blobUrl && (
                      <a href={fileState.blobUrl} download={selected.name} className={`p-1.5 rounded-lg ${soft} ${dk ? 'hover:bg-[#1c1c1c]' : 'hover:bg-gray-100'}`}><Download size={14} /></a>
                    )}
                    <button onClick={() => setSelected(null)} className={`p-1.5 rounded-lg ${soft} ${dk ? 'hover:bg-[#1c1c1c]' : 'hover:bg-gray-100'}`}><X size={14} /></button>
                  </div>
                  <div className="flex-1 overflow-auto min-h-0">{renderPreview()}</div>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className={`px-4 py-1.5 border-t text-[11.5px] shrink-0 ${dk ? 'border-[#1f1f1f] text-gray-600' : 'border-gray-200 text-gray-400'}`}>
              {visible.length} item{visible.length === 1 ? '' : 's'}{selected ? ` · ${selected.name} selected` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;

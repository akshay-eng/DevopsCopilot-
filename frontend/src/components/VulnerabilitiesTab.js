import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert, ShieldCheck, ExternalLink, Wrench, X, Loader2,
  CheckCircle2, AlertTriangle, Clock, Ticket, RefreshCw, PackageOpen, MinusCircle,
} from 'lucide-react';
import { getResourceVulnerabilities, remediateVulnerability, explainVulnerability } from '../services/api';
import { Sparkles, ChevronDown, Lightbulb, ShieldQuestion, CheckSquare } from 'lucide-react';

const SEV = {
  CRITICAL: { label: 'Critical', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  HIGH: { label: 'High', color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
  MEDIUM: { label: 'Medium', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  LOW: { label: 'Low', color: '#65758b', bg: 'rgba(101,117,139,0.12)' },
  UNKNOWN: { label: 'Unknown', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

const relTime = (iso) => {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const StepIcon = ({ status }) => {
  if (status === 'done') return <CheckCircle2 size={16} className="text-green-500" />;
  if (status === 'failed') return <AlertTriangle size={16} className="text-red-500" />;
  if (status === 'pending') return <Clock size={16} className="text-blue-500" />;
  return <MinusCircle size={16} className="text-gray-400" />;
};

const VulnerabilitiesTab = ({ theme, namespace, kind, name }) => {
  const dk = theme === 'dark';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [remediation, setRemediation] = useState(null); // { open, target, result, running, apply, targetImage, container, currentImage, vulns }
  // AI explanations, keyed by CVE row: { loading, data, error }
  const [explain, setExplain] = useState({});

  const toggleExplain = async (key, v) => {
    const cur = explain[key];
    if (cur && !cur.error) {
      setExplain((e) => ({ ...e, [key]: { ...cur, open: !cur.open } }));
      return;
    }
    setExplain((e) => ({ ...e, [key]: { loading: true, open: true } }));
    try {
      const r = await explainVulnerability(
        { id: v.id, severity: v.severity, score: v.score, package: v.package, installedVersion: v.installedVersion, fixedVersion: v.fixedVersion, title: v.title },
        { kind, name, namespace },
        v.image
      );
      setExplain((e) => ({ ...e, [key]: { loading: false, open: true, data: r?.explanation } }));
    } catch (err) {
      setExplain((e) => ({ ...e, [key]: { loading: false, open: true, error: err.message } }));
    }
  };

  const fetchVulns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getResourceVulnerabilities(namespace, kind, name);
      setData(res);
    } catch (e) {
      setData({ success: false, error: e.message, installed: true, vulnerabilities: [], summary: {} });
    } finally {
      setLoading(false);
    }
  }, [namespace, kind, name]);

  useEffect(() => { fetchVulns(); }, [fetchVulns]);

  const openRemediation = (vulns, container, currentImage) => {
    setRemediation({
      open: true, running: false, result: null, apply: false,
      container: container || data?.images?.[0]?.container || '',
      currentImage: currentImage || data?.images?.[0]?.image || '',
      targetImage: currentImage || data?.images?.[0]?.image || '',
      vulns,
    });
  };

  const runRemediation = async () => {
    setRemediation((r) => ({ ...r, running: true }));
    try {
      const result = await remediateVulnerability({
        resource: { namespace, kind, name },
        vulnerabilities: remediation.vulns.map((v) => ({ id: v.id, severity: v.severity, package: v.package, fixable: v.fixable })),
        container: remediation.container,
        currentImage: remediation.currentImage,
        targetImage: remediation.targetImage,
        apply: remediation.apply,
      });
      setRemediation((r) => ({ ...r, running: false, result }));
    } catch (e) {
      setRemediation((r) => ({ ...r, running: false, result: { error: e.message, steps: [] } }));
    }
  };

  const card = dk ? 'bg-[#161616] border-[#262626]' : 'bg-white border-gray-200';
  const sub = dk ? 'text-gray-500' : 'text-gray-400';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span className={sub}>Loading vulnerability scan…</span>
      </div>
    );
  }

  // Operator not installed
  if (data && data.installed === false) {
    return (
      <div className={`rounded-2xl border p-10 text-center ${card}`}>
        <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-amber-500" />
        <h3 className={`text-[16px] font-semibold mb-1 ${dk ? 'text-white' : 'text-gray-900'}`}>Vulnerability scanning not enabled</h3>
        <p className={`text-[13px] mb-4 ${sub}`}>
          Trivy Operator isn't detected in this cluster{data.reason ? ` (${data.reason})` : ''}. Install it to see per-resource CVEs.
        </p>
        <code className={`inline-block text-left text-[12px] px-4 py-3 rounded-lg ${dk ? 'bg-black text-gray-300 border border-[#262626]' : 'bg-gray-50 text-gray-700 border border-gray-200'}`}>
          helm repo add aqua https://aquasecurity.github.io/helm-charts/<br />
          helm upgrade --install trivy-operator aqua/trivy-operator \<br />
          &nbsp;&nbsp;-n trivy-system --create-namespace
        </code>
      </div>
    );
  }

  const summary = data?.summary || {};
  const vulns = data?.vulnerabilities || [];
  const fixable = vulns.filter((v) => v.fixable);

  const sevChips = [
    ['CRITICAL', summary.critical], ['HIGH', summary.high], ['MEDIUM', summary.medium], ['LOW', summary.low],
  ];

  return (
    <div className="space-y-5">
      {/* Header: summary + actions */}
      <div className={`rounded-2xl border p-5 ${card}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            {vulns.length === 0 && !data?.lastScanned ? (
              // Operator is installed but hasn't produced a report for this
              // workload yet — that is NOT the same as "clean".
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                <div>
                  <span className={`text-[15px] font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Scan pending</span>
                  <p className={`text-[12px] ${sub}`}>Trivy Operator is scanning this workload — results usually appear within a few minutes.</p>
                </div>
              </div>
            ) : vulns.length === 0 ? (
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-500" />
                <span className={`text-[15px] font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>No known vulnerabilities</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                  <span className={`text-[22px] font-bold tracking-tight ${dk ? 'text-white' : 'text-gray-900'}`}>{summary.total}</span>
                  <span className={`text-[13px] ${sub}`}>total</span>
                </div>
                <div className="flex items-center gap-2">
                  {sevChips.map(([sev, count]) => (
                    <span key={sev} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold"
                      style={{ background: SEV[sev].bg, color: SEV[sev].color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV[sev].color }} />
                      {count || 0} {SEV[sev].label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[12px] ${sub} flex items-center gap-1.5`}
              title={data?.lastScanned ? `Last scan: ${new Date(data.lastScanned).toLocaleString()} · rescans every 6h` : 'Awaiting first scan'}>
              <Clock size={13} /> {data?.lastScanned ? `Scanned ${relTime(data.lastScanned)}` : 'Awaiting first scan'}
            </span>
            <button onClick={fetchVulns} className={`p-1.5 rounded-lg border ${dk ? 'border-[#262626] text-gray-400 hover:text-white hover:bg-[#1e1e1e]' : 'border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>
              <RefreshCw size={14} />
            </button>
            {fixable.length > 0 && (
              <button onClick={() => openRemediation(fixable)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                <Wrench size={14} /> Remediate all fixable ({fixable.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CVE table */}
      {vulns.length > 0 && (
        <div className={`rounded-2xl border overflow-hidden ${card}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className={`text-[11px] uppercase tracking-wider ${dk ? 'text-gray-500 bg-[#1a1a1a]' : 'text-gray-400 bg-gray-50'}`}>
                  <th className="text-left font-semibold px-4 py-2.5">Severity</th>
                  <th className="text-left font-semibold px-4 py-2.5">Vulnerability</th>
                  <th className="text-left font-semibold px-4 py-2.5">Package</th>
                  <th className="text-left font-semibold px-4 py-2.5">Installed → Fixed</th>
                  <th className="text-left font-semibold px-4 py-2.5">Container</th>
                  <th className="text-right font-semibold px-4 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${dk ? 'divide-[#262626]' : 'divide-gray-100'}`}>
                {vulns.map((v, i) => {
                  const s = SEV[v.severity] || SEV.UNKNOWN;
                  const key = `${v.id}-${v.package}-${i}`;
                  const ex = explain[key];
                  return (
                    <tr key={key} className={dk ? 'hover:bg-[#1c1c1c]' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ background: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                        {v.score ? <span className={`ml-2 text-[11px] ${sub}`}>{v.score}</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <a href={v.primaryLink} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[13px] font-medium text-blue-600 hover:underline dark:text-blue-400">
                          {v.id} <ExternalLink size={11} className="opacity-60" />
                        </a>
                        <div className={`text-[12px] truncate max-w-[320px] ${sub}`} title={v.title}>{v.title}</div>
                      </td>
                      <td className={`px-4 py-3 text-[13px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>{v.package}</td>
                      <td className="px-4 py-3 text-[12px] font-mono">
                        <span className={dk ? 'text-gray-400' : 'text-gray-600'}>{v.installedVersion}</span>
                        {v.fixable ? (
                          <span className="text-green-500"> → {v.fixedVersion}</span>
                        ) : (
                          <span className={sub}> → no fix</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-[12px] ${sub}`}>{v.container || '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => toggleExplain(key, v)} title="AI explanation: cause, impact and fix"
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 mr-2 rounded-md text-[12px] font-medium border transition-colors ${dk ? 'border-[#333] text-gray-300 hover:bg-[#232323]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          {ex?.loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} className="text-indigo-400" />}
                          Explain
                          <ChevronDown size={11} className={`transition-transform ${ex?.open ? 'rotate-180' : ''}`} />
                        </button>
                        {v.fixable ? (
                          <button onClick={() => openRemediation([v], v.container, v.image)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium border transition-colors ${dk ? 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10' : 'border-blue-200 text-blue-600 hover:bg-blue-50'}`}>
                            <Wrench size={12} /> Remediate
                          </button>
                        ) : (
                          <span className={`text-[11px] ${sub}`}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                }).flatMap((row, i) => {
                  const v = vulns[i];
                  const key = `${v.id}-${v.package}-${i}`;
                  const ex = explain[key];
                  if (!ex?.open) return [row];
                  const Section = ({ icon: Icon, label, text, tint }) => (
                    <div className="flex items-start gap-2.5">
                      <span className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0 mt-0.5" style={{ background: `${tint}22`, color: tint }}>
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0">
                        <div className={`text-[12px] font-semibold ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{label}</div>
                        <p className={`text-[12.5px] leading-relaxed mt-0.5 ${dk ? 'text-gray-400' : 'text-gray-600'}`}>{text}</p>
                      </div>
                    </div>
                  );
                  return [row, (
                    <tr key={`${key}-explain`}>
                      <td colSpan={6} className={`px-4 pb-4 pt-0 ${dk ? 'bg-[#141414]' : 'bg-[#f8f9fc]'}`}>
                        {ex.loading ? (
                          <div className={`flex items-center gap-2 py-3 text-[12.5px] ${sub}`}>
                            <Loader2 size={13} className="animate-spin text-indigo-400" /> Analysing {v.id}…
                          </div>
                        ) : ex.error ? (
                          <div className="py-3 text-[12.5px] text-red-500">{ex.error}</div>
                        ) : ex.data ? (
                          <div className={`rounded-xl p-4 space-y-3 ${dk ? 'bg-[#0f0f0f] border border-[#232323]' : 'bg-white border border-gray-200'}`}>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ex.data.source === 'ai' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-gray-500/15 text-gray-400'}`}>
                                {ex.data.source === 'ai' ? 'AI analysis' : 'heuristic'}
                              </span>
                              <span className={`text-[11.5px] ${sub}`}>{v.id}</span>
                            </div>
                            <Section icon={ShieldQuestion} label="Root cause" text={ex.data.cause} tint="#a5b4fc" />
                            {ex.data.impact && <Section icon={AlertTriangle} label="Impact" text={ex.data.impact} tint="#fdba74" />}
                            <Section icon={Lightbulb} label="How to fix" text={ex.data.fix} tint="#86efac" />
                            {ex.data.verification && <Section icon={CheckSquare} label="Verify" text={ex.data.verification} tint="#93c5fd" />}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )];
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Remediation modal */}
      {remediation?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !remediation.running && setRemediation(null)}>
          <div onClick={(e) => e.stopPropagation()} className={`w-full max-w-lg rounded-2xl border shadow-2xl ${dk ? 'bg-[#141414] border-[#262626]' : 'bg-white border-gray-200'}`}>
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dk ? 'border-[#262626]' : 'border-gray-100'}`}>
              <div className="flex items-center gap-2">
                <Wrench size={18} className="text-blue-500" />
                <h3 className={`text-[15px] font-semibold ${dk ? 'text-white' : 'text-gray-900'}`}>Remediate {remediation.vulns.length} vulnerabilit{remediation.vulns.length === 1 ? 'y' : 'ies'}</h3>
              </div>
              <button onClick={() => !remediation.running && setRemediation(null)} className={sub}><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {!remediation.result ? (
                <>
                  <div className={`text-[13px] ${dk ? 'text-gray-300' : 'text-gray-700'}`}>
                    The AI agent will open a change request{remediation.apply ? ' and roll the workload to the fixed image' : ' and prepare the fix'}.
                  </div>
                  <div className={`rounded-lg border p-3 text-[12px] space-y-2 ${dk ? 'border-[#262626] bg-[#1a1a1a]' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2"><PackageOpen size={13} className={sub} /><span className={sub}>Target</span> <span className={dk ? 'text-gray-200' : 'text-gray-800'}>{kind}/{name}</span></div>
                    <div>
                      <label className={`block mb-1 ${sub}`}>Container image</label>
                      <input value={remediation.targetImage} onChange={(e) => setRemediation((r) => ({ ...r, targetImage: e.target.value }))}
                        className={`w-full px-2.5 py-1.5 rounded-md font-mono text-[12px] border focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${dk ? 'bg-black border-[#333] text-gray-200' : 'bg-white border-gray-200 text-gray-900'}`} />
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {remediation.vulns.slice(0, 12).map((v) => (
                        <span key={v.id} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: (SEV[v.severity] || SEV.UNKNOWN).bg, color: (SEV[v.severity] || SEV.UNKNOWN).color }}>{v.id}</span>
                      ))}
                      {remediation.vulns.length > 12 && <span className={`text-[10px] ${sub}`}>+{remediation.vulns.length - 12} more</span>}
                    </div>
                  </div>
                  <label className={`flex items-center gap-2 text-[13px] cursor-pointer ${dk ? 'text-gray-300' : 'text-gray-700'}`}>
                    <input type="checkbox" checked={remediation.apply} onChange={(e) => setRemediation((r) => ({ ...r, apply: e.target.checked }))} className="accent-blue-600" />
                    Apply the image patch now (otherwise raise the change request only)
                  </label>
                </>
              ) : (
                <div className="space-y-3">
                  {remediation.result.error && (
                    <div className="text-[13px] text-red-500 flex items-center gap-2"><AlertTriangle size={15} /> {remediation.result.error}</div>
                  )}
                  {(remediation.result.steps || []).map((st, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="mt-0.5"><StepIcon status={st.status} /></div>
                      <div className="flex-1">
                        <div className={`text-[13px] font-medium ${dk ? 'text-gray-200' : 'text-gray-800'}`}>{st.label}</div>
                        <div className={`text-[12px] ${sub}`}>{st.detail}</div>
                        {st.ticket && st.ticket.url && (
                          <a href={st.ticket.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-blue-500 hover:underline mt-0.5">
                            <Ticket size={12} /> {st.ticket.number} <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`flex items-center justify-end gap-2 px-5 py-3.5 border-t ${dk ? 'border-[#262626]' : 'border-gray-100'}`}>
              {!remediation.result ? (
                <>
                  <button onClick={() => setRemediation(null)} disabled={remediation.running} className={`px-3 py-1.5 rounded-lg text-[13px] font-medium ${dk ? 'text-gray-300 hover:bg-[#1e1e1e]' : 'text-gray-600 hover:bg-gray-100'}`}>Cancel</button>
                  <button onClick={runRemediation} disabled={remediation.running} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60">
                    {remediation.running ? <><Loader2 size={14} className="animate-spin" /> Remediating…</> : <><Wrench size={14} /> Start remediation</>}
                  </button>
                </>
              ) : (
                <button onClick={() => { setRemediation(null); fetchVulns(); }} className="px-4 py-1.5 rounded-lg text-[13px] font-medium bg-blue-600 hover:bg-blue-700 text-white">Done</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VulnerabilitiesTab;

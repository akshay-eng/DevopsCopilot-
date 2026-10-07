import React, { useState, useEffect, useCallback } from 'react';
import {
  X, ShieldCheck, ShieldAlert, Loader2, RefreshCw, Wrench, ChevronDown, ChevronRight,
  AlertTriangle, CheckCircle2, HelpCircle, Link2, Server,
} from 'lucide-react';
import {
  evaluateCompliance, getLastCompliance, remediateCompliance,
  getClusterAccess, bindClusterToLocal, getPlatformFootprint,
} from '../services/api';

const STATUS = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626', idle: '#64748b' };

const STATUS_STYLE = {
  pass: { color: STATUS.ok, Icon: CheckCircle2, label: 'Pass' },
  warn: { color: STATUS.warn, Icon: AlertTriangle, label: 'Warn' },
  fail: { color: STATUS.bad, Icon: ShieldAlert, label: 'Fail' },
  unknown: { color: STATUS.idle, Icon: HelpCircle, label: 'Not checked' },
};

const scoreColor = (s) => (s == null ? STATUS.idle : s >= 90 ? STATUS.ok : s >= 60 ? STATUS.warn : STATUS.bad);

/**
 * Compliance for one cluster.
 *
 * Shows the data's provenance prominently: a result read through an unverified
 * kubeconfig is not evidence about this cluster, and the panel says so rather
 * than presenting a score that looks authoritative.
 */
const ClusterCompliance = ({ cluster, onClose, dk = true, inline = false }) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [access, setAccess] = useState(null);
  const [footprint, setFootprint] = useState(null);
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState(null);

  const clusterId = cluster?._id || cluster?.id;

  const panel = dk ? 'bg-[#171719] border-[#2e2e33]' : 'bg-white border-gray-200';
  const h1 = dk ? 'text-gray-50' : 'text-gray-900';
  const h2 = dk ? 'text-gray-200' : 'text-gray-800';
  const muted = dk ? 'text-gray-500' : 'text-gray-500';
  const faint = dk ? 'text-gray-600' : 'text-gray-400';
  const divide = dk ? 'divide-[#242429]' : 'divide-gray-100';
  const borderC = dk ? 'border-[#2e2e33]' : 'border-gray-200';
  const sub = dk ? 'bg-[#0f0f10]' : 'bg-[#fafbfc]';

  const loadAll = useCallback(async () => {
    if (!clusterId) return;
    setLoading(true);
    const [last, acc, fp] = await Promise.all([
      getLastCompliance(clusterId).catch(() => null),
      getClusterAccess(clusterId).catch(() => null),
      getPlatformFootprint(clusterId).catch(() => null),
    ]);
    if (last?.result) setResult({ ...last.result, stored: true });
    setAccess(acc || null);
    setFootprint(fp?.success ? fp : null);
    setLoading(false);
  }, [clusterId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const run = async () => {
    setRunning(true); setMessage(null);
    try {
      const r = await evaluateCompliance(clusterId);
      if (r?.success) {
        setResult({ ...r, stored: false });
        if (r.evaluated === false) setMessage({ tone: 'warn', text: r.dataSource?.warning || 'This cluster could not be read.' });
      } else setMessage({ tone: 'bad', text: r?.error || 'Evaluation failed.' });
    } catch (e) {
      setMessage({ tone: 'bad', text: e.message });
    } finally { setRunning(false); }
  };

  const fix = async () => {
    setFixing(true); setMessage(null);
    try {
      const r = await remediateCompliance(clusterId);
      if (r?.success) {
        setResult({ ...r.after, stored: false });
        const did = r.applied.map((a) => a.detail).join('; ');
        setMessage({
          tone: r.applied.length ? 'ok' : 'warn',
          text: r.applied.length
            ? `Applied ${r.applied.length} fix(es): ${did}. ${r.manual.length} item(s) still need a human.`
            : `Nothing could be fixed automatically — ${r.manual.length} item(s) need a human.`,
        });
      } else setMessage({ tone: 'bad', text: r?.error || 'Remediation failed.' });
    } catch (e) {
      setMessage({ tone: 'bad', text: e.message });
    } finally { setFixing(false); }
  };

  const bind = async () => {
    try {
      const r = await bindClusterToLocal(clusterId);
      if (r?.success) {
        setMessage({ tone: 'ok', text: `Bound to ${r.context} (${r.nodes.length} nodes). Re-run the checks.` });
        setAccess(await getClusterAccess(clusterId).catch(() => null));
      } else setMessage({ tone: 'bad', text: r?.error || 'Could not bind.' });
    } catch (e) { setMessage({ tone: 'bad', text: e.message }); }
  };

  const checks = result?.checks || [];
  const counts = result?.counts || {
    pass: result?.passed, fail: result?.failed, warn: result?.warned, unknown: result?.unknown,
  };
  const score = result?.score;
  const remediable = checks.filter((c) => c.remediable);

  // Inline mode renders in the page flow (under the cluster listing); modal
  // mode keeps the overlay. Same body either way.
  const Shell = ({ children }) => (inline ? (
    <div className={`w-full rounded-2xl border overflow-hidden ${panel}`}>{children}</div>
  ) : (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div className={`relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border shadow-2xl ${panel}`}>
        {children}
      </div>
    </div>
  ));

  return (
    <Shell>
      <>

        {/* header */}
        <div className={`${inline ? '' : 'sticky top-0 z-10'} flex items-start justify-between gap-4 px-6 py-5 border-b ${borderC} ${dk ? 'bg-[#171719]' : 'bg-white'}`}>
          <div className="min-w-0">
            <h2 className={`text-[17px] font-semibold tracking-tight ${h1}`}>Compliance — {cluster?.name}</h2>
            <p className={`text-[12.5px] mt-1 ${muted}`}>
              {result?.policy ? `Policy: ${result.policy.name} (${result.policy.source})` : 'Checks this cluster against your baseline'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={run} disabled={running}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] border disabled:opacity-50 ${dk ? 'border-[#2a2a2a] text-gray-200 hover:bg-[#232329]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              {running ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Run checks
            </button>
            {remediable.length > 0 && (
              <button onClick={fix} disabled={fixing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium text-white disabled:opacity-50"
                style={{ background: '#6366f1' }}>
                {fixing ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />} Fix {remediable.length}
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className={`p-1.5 rounded-lg ${dk ? 'text-gray-400 hover:bg-[#232329]' : 'text-gray-500 hover:bg-gray-100'}`}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* provenance — an unverified read is not evidence about this cluster */}
        {access && !access.verified && (
          <div className={`flex items-start gap-2.5 px-6 py-3 border-b ${borderC} ${dk ? 'bg-amber-500/5' : 'bg-amber-50'}`}>
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className={`text-[12px] ${dk ? 'text-amber-200/90' : 'text-amber-800'}`}>
                {access.warning || 'This cluster could not be confirmed.'}
              </p>
              {access.mode === 'local' && (
                <button onClick={bind}
                  className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] border ${dk ? 'border-amber-500/30 text-amber-300' : 'border-amber-300 text-amber-800'}`}>
                  <Link2 size={11} /> This backend is that cluster — bind it
                </button>
              )}
            </div>
          </div>
        )}

        {message && (
          <div className={`px-6 py-3 text-[12.5px] border-b ${borderC}`}
            style={{ color: message.tone === 'ok' ? STATUS.ok : message.tone === 'warn' ? STATUS.warn : STATUS.bad }}>
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" style={{ color: '#6366f1' }} />
            <span className={`text-[13px] ${muted}`}>Loading compliance…</span>
          </div>
        ) : !result ? (
          <div className="py-14 px-6 text-center">
            <ShieldCheck size={22} className={`mx-auto mb-3 ${faint}`} />
            <p className={`text-[14px] font-medium ${h1}`}>Not evaluated yet</p>
            <p className={`text-[12.5px] mt-1.5 ${muted}`}>Run the checks to score this cluster against your baseline.</p>
          </div>
        ) : (
          <>
            {/* score */}
            <div className={`grid grid-cols-2 sm:grid-cols-4 divide-x border-b ${divide} ${borderC}`}>
              <div className="px-5 py-4">
                <div className="text-[26px] font-medium tabular-nums" style={{ color: scoreColor(score) }}>
                  {score == null ? '—' : `${score}%`}
                </div>
                <div className={`text-[10.5px] uppercase tracking-[0.07em] mt-1 ${muted}`}>Compliance score</div>
              </div>
              {[['Passing', counts.pass, STATUS.ok], ['Failing', counts.fail, STATUS.bad], ['Not checked', counts.unknown, STATUS.idle]].map(([label, v, c]) => (
                <div key={label} className="px-5 py-4">
                  <div className="text-[26px] font-medium tabular-nums" style={{ color: v ? c : undefined }}>{v ?? 0}</div>
                  <div className={`text-[10.5px] uppercase tracking-[0.07em] mt-1 ${muted}`}>{label}</div>
                </div>
              ))}
            </div>

            {/* checks */}
            <div className={`divide-y ${divide}`}>
              {checks.map((c) => {
                const st = STATUS_STYLE[c.status] || STATUS_STYLE.unknown;
                const isOpen = open === c.rule;
                return (
                  <div key={c.rule}>
                    <button onClick={() => setOpen(isOpen ? null : c.rule)}
                      className={`w-full flex items-start gap-3 px-6 py-3.5 text-left ${dk ? 'hover:bg-[#1c1c20]' : 'hover:bg-gray-50'}`}>
                      {isOpen ? <ChevronDown size={14} className={`${faint} mt-0.5`} /> : <ChevronRight size={14} className={`${faint} mt-0.5`} />}
                      <st.Icon size={15} style={{ color: st.color }} className="shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[13px] font-medium ${h1}`}>{c.name}</span>
                          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${dk ? 'bg-[#232329] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                            {c.severity}
                          </span>
                          {c.remediable && (
                            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                              style={{ background: '#6366f11a', color: '#6366f1' }}>auto-fixable</span>
                          )}
                        </div>
                        <p className={`text-[12px] mt-0.5 ${muted}`}>{c.summary}</p>
                      </div>
                      <span className="text-[11.5px] shrink-0" style={{ color: st.color }}>{st.label}</span>
                    </button>

                    {isOpen && (
                      <div className={`px-6 pb-4 pt-1 ${sub}`}>
                        {c.description && <p className={`text-[12px] mb-3 ${muted}`}>{c.description}</p>}
                        {c.evidence?.length > 0 && (
                          <div className="mb-3">
                            <h4 className={`text-[10.5px] uppercase tracking-[0.07em] mb-1.5 ${muted}`}>Evidence</h4>
                            <div className="space-y-1">
                              {c.evidence.slice(0, 12).map((e, i) => (
                                <div key={i} className="flex items-center justify-between gap-3">
                                  <span className={`text-[12px] ${h2}`}>{e.name}</span>
                                  <span className="text-[11.5px] tabular-nums"
                                    style={{ color: e.ok === false ? STATUS.bad : e.ok === true ? STATUS.ok : undefined }}>
                                    {e.detail}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(c.remediation?.steps?.length > 0 || c.remediation?.manual) && (
                          <div>
                            <h4 className={`text-[10.5px] uppercase tracking-[0.07em] mb-1.5 ${muted}`}>
                              {c.remediable ? 'Fix' : 'Needs a human'}
                            </h4>
                            {c.remediation.manual && <p className={`text-[12px] ${muted}`}>{c.remediation.manual}</p>}
                            {c.remediation.steps?.map((s, i) => (
                              <code key={i} className={`block text-[11.5px] font-mono mt-1 ${dk ? 'text-gray-300' : 'text-gray-700'}`}>{s}</code>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* what our own install costs this cluster */}
            {footprint?.available && (
              <div className={`px-6 py-4 border-t ${borderC}`}>
                <h3 className={`text-[10.5px] uppercase tracking-[0.07em] mb-3 ${muted}`}>Platform footprint on this cluster</h3>
                <div className="flex flex-wrap gap-x-7 gap-y-2">
                  {[
                    ['Pods', footprint.totals.pods, footprint.share.podPct],
                    ['CPU', `${footprint.totals.cpuCores} cores`, footprint.share.cpuPct],
                    ['Memory', `${footprint.totals.memoryGi} Gi`, footprint.share.memoryPct],
                  ].map(([label, v, pct]) => (
                    <div key={label}>
                      <div className={`text-[13.5px] ${h1}`}>{v} <span className={faint}>· {pct}%</span></div>
                      <div className={`text-[10.5px] uppercase tracking-[0.07em] ${muted}`}>{label} of cluster</div>
                    </div>
                  ))}
                </div>
                {footprint.components?.filter((c) => c.installed && c.status !== 'healthy').map((c) => (
                  <p key={c.id} className="text-[11.5px] mt-2" style={{ color: STATUS.warn }}>
                    <Server size={10} className="inline mr-1" />{c.label}: {(c.issues || []).join('; ') || c.status}
                  </p>
                ))}
              </div>
            )}

            <div className={`px-6 py-3 text-[11px] border-t ${borderC} ${faint}`}>
              {result.evaluatedAt && `Evaluated ${new Date(result.evaluatedAt).toLocaleString()}`}
              {result.dataSource && ` · read via ${result.dataSource.mode}${result.dataSource.verified ? ' (verified)' : ' (unverified)'}`}
              {result.stored && ' · stored result, run the checks for a live one'}
            </div>
          </>
        )}
      </>
    </Shell>
  );
};

export default ClusterCompliance;

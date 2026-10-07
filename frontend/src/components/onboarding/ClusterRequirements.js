import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive, Boxes, ShieldCheck, Info, Loader2 } from 'lucide-react';
import { getChartFootprint, getComplianceCatalog, getCompliancePolicy } from '../../services/api';

/**
 * What the cluster must provide, and what we will take from it.
 *
 * Shown during onboarding so the requirements and the install cost are known
 * BEFORE the Helm chart goes on, not discovered afterwards. Two separate
 * numbers are shown deliberately: `requests` is capacity the scheduler reserves
 * the moment you install, `limits` is the worst case — sizing on one and
 * budgeting on the other is the usual mistake.
 */
const ClusterRequirements = ({ nodeCount = 3, compact = false }) => {
  const [footprint, setFootprint] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [optional, setOptional] = useState(['prometheus', 'node-exporter', 'kube-state-metrics']);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [fp, pol, cat] = await Promise.all([
        getChartFootprint(nodeCount, optional).catch(() => null),
        getCompliancePolicy().catch(() => null),
        getComplianceCatalog().catch(() => null),
      ]);
      if (!alive) return;
      setFootprint(fp?.success ? fp : null);
      setPolicy(pol?.policy || null);
      setCatalog(cat?.rules || null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [nodeCount, optional]);

  const toggle = (id) => setOptional((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const ruleName = (id) => catalog?.find((r) => r.id === id)?.name || id;

  /** Turn a policy rule's params into the sentence an operator actually needs. */
  const ruleRequirement = (r) => {
    const p = r.params || {};
    switch (r.rule) {
      case 'min_node_resources':
        return `Every ${p.scope === 'workers only' ? 'worker' : 'node'} needs at least ${p.minCpu ?? 2} vCPU and ${p.minMemoryGi ?? 8} Gi memory`;
      case 'control_plane_count':
        return `${p.mode === 'at least' ? 'At least' : 'Exactly'} ${p.expected ?? 1} control-plane node${(p.expected ?? 1) === 1 ? '' : 's'}`;
      case 'min_node_count':
        return `At least ${p.minimum ?? 2} Ready nodes`;
      case 'required_namespaces':
        return `Namespaces present: ${(Array.isArray(p.namespaces) ? p.namespaces : []).join(', ') || '—'}`;
      case 'isolate_core_components':
        return `Core add-ons in the ${p.namespace || 'kube-critical'} namespace`;
      case 'critical_pod_priority':
        return `Core pods carry a system PriorityClass`;
      case 'platform_agent_healthy':
        return 'The platform agent must be running after install';
      default:
        return ruleName(r.rule);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6">
        <Loader2 size={15} className="animate-spin text-violet-400" />
        <span className="text-sm text-slate-400">Loading requirements…</span>
      </div>
    );
  }

  const rules = policy?.rules || [];

  return (
    <div className="space-y-5">
      {/* ── What your cluster must provide ── */}
      <div className="rounded-lg border border-slate-700 bg-[#13131f] p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} className="text-violet-400" />
          <h3 className="text-sm font-semibold text-white">Compliance baseline</h3>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
            {policy?.source === 'built-in' ? 'default' : policy?.source}
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Once the cluster is connected it is checked against these. Failing a check does not block
          onboarding — you will see a score and what to fix.
        </p>
        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.rule} className="flex items-start gap-2.5">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: r.severity === 'critical' || r.severity === 'high' ? '#dc2626' : '#d97706' }} />
              <div>
                <span className="text-[13px] text-slate-200">{ruleRequirement(r)}</span>
                <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-500">{r.severity}</span>
              </div>
            </li>
          ))}
          {rules.length === 0 && <li className="text-[13px] text-slate-500">No baseline configured.</li>}
        </ul>
      </div>

      {/* ── What we will install ── */}
      {footprint && (
        <div className="rounded-lg border border-slate-700 bg-[#13131f] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Boxes size={16} className="text-violet-400" />
            <h3 className="text-sm font-semibold text-white">What the Helm chart will use</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Sized for {footprint.nodeCount} node{footprint.nodeCount === 1 ? '' : 's'}. Toggle the optional
            components to see how the footprint changes.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              ['Pods', footprint.pods, Boxes],
              ['CPU reserved', `${footprint.requests.cpu} cores`, Cpu],
              ['Memory reserved', `${footprint.requests.memoryGi} Gi`, HardDrive],
              ['Disk (PVC)', footprint.persistentStorageGi ? `${footprint.persistentStorageGi} Gi` : 'none', HardDrive],
            ].map(([label, value, Icon]) => (
              <div key={label} className="rounded-md border border-slate-800 bg-slate-900/40 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                  <Icon size={11} /> {label}
                </div>
                <div className="text-[15px] text-white mt-0.5 tabular-nums">{value}</div>
              </div>
            ))}
          </div>

          <p className="text-[11.5px] text-slate-500 mb-3">
            Worst case if everything runs at its limit: <span className="text-slate-300">{footprint.limits.cpu} cores</span> and{' '}
            <span className="text-slate-300">{footprint.limits.memoryGi} Gi</span>.
          </p>

          <div className="space-y-1.5">
            {footprint.components.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-1">
                <label className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    disabled={c.required}
                    checked={c.required || optional.includes(c.id)}
                    onChange={() => toggle(c.id)}
                    className="w-3.5 h-3.5 rounded border-slate-600 text-violet-500 focus:ring-violet-500 disabled:opacity-50"
                  />
                  <span className="text-[13px] text-slate-200 truncate">{c.label}</span>
                  {c.required && <span className="text-[10px] uppercase tracking-wide text-slate-500">required</span>}
                  {c.copies > 1 && <span className="text-[11px] text-slate-500">×{c.copies}</span>}
                </label>
                <span className="text-[11.5px] text-slate-500 tabular-nums shrink-0">
                  {c.requests.cpu}c · {c.requests.memoryMi} Mi
                </span>
              </div>
            ))}
          </div>

          {/* Reserved is not the same as used, and the gap is large. */}
          {footprint.measuredReference && (
            <div className="flex items-start gap-2 mt-4 pt-3 border-t border-slate-800">
              <Info size={12} className="text-slate-500 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-slate-500">
                On a real install ({footprint.measuredReference.cluster}) the whole stack actually used{' '}
                <span className="text-slate-300">{footprint.measuredReference.cpuCores} cores</span> and{' '}
                <span className="text-slate-300">{footprint.measuredReference.memoryGi} Gi</span> — about{' '}
                {footprint.measuredReference.sharePct.cpu}% of CPU and {footprint.measuredReference.sharePct.memory}% of
                memory. Reserved capacity is higher than real usage.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClusterRequirements;

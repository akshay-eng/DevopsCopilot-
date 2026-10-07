import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
  backendApi, generateNlpWidget, getCustomWidgets, saveCustomWidget, deleteCustomWidget,
  getClusters, getNodes, getResources, getClusterHistory,
} from '../services/api';
import {
  RefreshCw, Sparkles, Wand2, Plus, Trash2, Loader2, X, ChevronRight, ArrowLeft,
  Flag, AlertTriangle, Layers, Boxes, Server, Download, Calendar,
} from 'lucide-react';
import TrendsWidget from './TrendsWidget';
import TrendDetail from './TrendDetail';
import {
  PALETTE, GradientLine, Violin, densityOf, Composition, StackedMicroBars,
  HBars, VBars, TreemapTile, MetricTile, SignalCard,
} from './TrendTiles';

const STATUS = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626', idle: '#64748b' };

/** Identity is never colour-alone: every multi-series tile carries one of these. */
const Legend = ({ items, dk }) => (
  <span className="inline-flex items-center gap-2.5">
    {items.map(([label, color]) => (
      <span key={label} className="inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-sm" style={{ background: color }} />
        <span className={dk ? 'text-gray-500' : 'text-gray-500'}>{label}</span>
      </span>
    ))}
  </span>
);

const RANGES = [['24H', 24], ['7D', 168], ['30D', 720]];
const num = (n) => (n ?? 0).toLocaleString();
const plural = (n, word) => (n === 1 ? word : `${word}s`);
const parseReady = (s) => {
  if (typeof s === 'string' && s.includes('/')) {
    const [a, b] = s.split('/').map(Number);
    return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0];
  }
  return [0, 0];
};
const parseCpu = (c) => (c ? parseInt(String(c).replace(/[^\d]/g, ''), 10) || 0 : 0);
const days = (iso) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);
/** `repo/name:tag` → the pieces we care about; digests and implicit tags included. */
const parseImageRef = (ref = '') => {
  const noDigest = String(ref).split('@')[0];
  const slash = noDigest.lastIndexOf('/');
  const lastPart = noDigest.slice(slash + 1);
  const colon = lastPart.lastIndexOf(':');
  const tag = colon > -1 ? lastPart.slice(colon + 1) : 'latest';
  const path = colon > -1 ? noDigest.slice(0, noDigest.length - (lastPart.length - colon)) : noDigest;
  const registry = path.includes('/') && /[.:]/.test(path.split('/')[0]) ? path.split('/')[0] : 'docker.io';
  return { repo: path, tag, registry, ref: noDigest };
};
const parseMemGi = (m) => {
  if (!m) return 0;
  const v = parseInt(String(m).replace(/[^\d]/g, ''), 10) || 0;
  return /Ki/i.test(m) ? Math.round((v / 1048576) * 10) / 10 : /Mi/i.test(m) ? Math.round((v / 1024) * 10) / 10 : v;
};
// The trends endpoint returns absolute deltas vs the previous window of the same
// length; turn that into the percentage the tile chips show.
const pctOf = (current, delta) => {
  if (delta == null) return null;
  const prev = (current || 0) - delta;
  if (!prev) return null;
  return Math.round((delta / prev) * 100);
};

const Trends = () => {
  const { theme } = useTheme();
  const dk = theme === 'dark';
  const navigate = useNavigate();

  const [tab, setTab] = useState('alerts');
  const [detail, setDetail] = useState(null);
  const [range, setRange] = useState('30D');
  const [clusters, setClusters] = useState([]);
  const [clusterId, setClusterId] = useState('');
  const hours = useMemo(() => RANGES.find((r) => r[0] === range)?.[1] || 720, [range]);

  const page = dk ? 'bg-[#0b0b0b]' : 'bg-white';
  const h1 = dk ? 'text-gray-50' : 'text-gray-900';
  const h2 = dk ? 'text-gray-200' : 'text-gray-800';
  const muted = dk ? 'text-gray-500' : 'text-gray-500';
  const faint = dk ? 'text-gray-600' : 'text-gray-400';
  const divide = dk ? 'divide-[#1e1e1e]' : 'divide-gray-100';
  const borderC = dk ? 'border-[#1e1e1e]' : 'border-gray-100';
  const card = `rounded-xl border ${dk ? 'bg-[#131313] border-[#232323]' : 'bg-white border-gray-200'}`;

  useEffect(() => {
    getClusters().then((r) => {
      const list = Array.isArray(r) ? r : (r?.clusters || []);
      setClusters(list);
      if (list.length && !clusterId) setClusterId(list[0]._id || list[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── alerts ────────────────────────────────────────────────────────────────
  const [alertData, setAlertData] = useState(null);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const res = await backendApi.get('/api/alerts/trends', { params: { hours } });
      if (res?.success) setAlertData(res);
    } catch (e) { /* ignore */ } finally { setLoadingAlerts(false); }
  }, [hours]);
  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const [vulnSummary, setVulnSummary] = useState(null);
  useEffect(() => {
    backendApi.get('/api/vulnerabilities/summary').then((r) => { if (r?.installed) setVulnSummary(r); }).catch(() => {});
  }, []);

  // `|| {}` / `|| []` would hand every dependent useMemo a brand-new object each
  // render, so they are memoised on alertData instead.
  const summary = useMemo(() => alertData?.summary || {}, [alertData]);
  const delta = useMemo(() => summary.delta || {}, [summary]);
  const overTime = useMemo(() => alertData?.overTime || [], [alertData]);
  const series = useMemo(() => ({
    total: overTime.map((b) => b.total || 0),
    critical: overTime.map((b) => b.critical || 0),
    warning: overTime.map((b) => b.warning || 0),
    info: overTime.map((b) => b.info || 0),
    firing: overTime.map((b) => (b.critical || 0) + (b.warning || 0)),
    stacks: overTime.map((b) => [b.critical || 0, b.warning || 0, b.info || 0]),
  }), [overTime]);

  const fmtBucket = useCallback(
    (iso) => new Date(iso).toLocaleString([], hours <= 24
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', hour: '2-digit' }),
    [hours]
  );
  const timeline = useMemo(() => overTime.map((b) => ({
    label: fmtBucket(b.time), Critical: b.critical || 0, Warning: b.warning || 0,
    Info: b.info || 0, Total: b.total || 0,
  })), [overTime, fmtBucket]);

  const axisFrom = overTime.length ? new Date(overTime[0].time).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
  const axisTo = overTime.length ? new Date(overTime[overTime.length - 1].time).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';

  const nsAll = useMemo(
    () => (alertData?.byNamespace || []).map((n) => ({
      name: n.namespace || 'unknown', value: n.count || 0,
      Critical: n.critical || 0, Warning: n.warning || 0, Info: n.info || 0,
    })),
    [alertData]
  );
  const nsItems = useMemo(() => nsAll.slice(0, 6), [nsAll]);
  const clusterAll = useMemo(
    () => (alertData?.byCluster || []).map((c) => ({
      name: c.clusterName || c.clusterId, value: c.count || 0,
      Critical: c.critical || 0, Warning: c.warning || 0, Info: c.info || 0,
    })),
    [alertData]
  );
  const podAll = useMemo(
    () => (alertData?.byPod || []).map((p) => ({
      name: p.pod, value: p.count || 0, namespace: p.namespace, severity: p.severity,
    })),
    [alertData]
  );
  const topAlertsFull = useMemo(() => (alertData?.topAlerts || []), [alertData]);
  const topAlertItems = useMemo(
    () => topAlertsFull.slice(0, 8).map((a) => ({ name: a.alertname, value: a.count })),
    [topAlertsFull]
  );

  const resolutionRate = summary.total ? Math.round(((summary.resolved || 0) / summary.total) * 100) : 0;
  const peak = useMemo(() => {
    if (!overTime.length) return null;
    const i = series.total.indexOf(Math.max(...series.total));
    return { count: series.total[i], when: overTime[i]?.time };
  }, [overTime, series.total]);
  const avgPerBucket = useMemo(
    () => (series.total.length ? Math.round(series.total.reduce((s, v) => s + v, 0) / series.total.length) : 0),
    [series.total]
  );

  // ── kubernetes ────────────────────────────────────────────────────────────
  const [k8s, setK8s] = useState({ nodes: [], pods: [], deployments: [], statefulsets: [], services: [], loading: false });
  const [history, setHistory] = useState(null);
  const [drill, setDrill] = useState(null);

  const fetchK8s = useCallback(async () => {
    if (!clusterId) return;
    setK8s((s) => ({ ...s, loading: true }));
    try {
      const [nodesR, podsR, depR, stsR, svcR] = await Promise.all([
        getNodes(clusterId).catch(() => null),
        getResources(clusterId, 'pods', 'all').catch(() => null),
        getResources(clusterId, 'deployments', 'all').catch(() => null),
        getResources(clusterId, 'statefulsets', 'all').catch(() => null),
        getResources(clusterId, 'services', 'all').catch(() => null),
      ]);
      getClusterHistory(clusterId, hours)
        .then((h) => setHistory(h?.success ? h : { available: false, reason: 'History unavailable.' }))
        .catch(() => setHistory({ available: false, reason: 'Prometheus is not reachable.' }));
      // /nodes returns `nodes`, /resources returns `items`
      const arr = (r) => (Array.isArray(r) ? r : (r?.items || r?.nodes || r?.resources || r?.data || []));
      setK8s({
        nodes: arr(nodesR), pods: arr(podsR), deployments: arr(depR),
        statefulsets: arr(stsR), services: arr(svcR), loading: false,
      });
    } catch (e) { setK8s((s) => ({ ...s, loading: false })); }
  }, [clusterId, hours]);
  useEffect(() => { if (tab === 'kubernetes') fetchK8s(); }, [tab, fetchK8s]);

  const kpi = useMemo(() => {
    const { nodes, pods, deployments, statefulsets } = k8s;
    const phase = { Running: 0, Pending: 0, Failed: 0, Succeeded: 0, Unknown: 0 };
    let restarts = 0, notReady = 0;
    pods.forEach((p) => {
      const s = p.status || 'Unknown';
      if (phase[s] === undefined) phase.Unknown += 1; else phase[s] += 1;
      restarts += Number(p.restarts) || 0;
      const [r, t] = parseReady(p.ready);
      if (t > 0 && r < t) notReady += 1;
    });
    const workloads = [...deployments, ...statefulsets];
    const wReady = workloads.filter((w) => { const [r, d] = parseReady(w.replicas); return d === 0 || r >= d; }).length;
    return {
      nodesReady: nodes.filter((n) => n.status === 'Ready').length, nodesTotal: nodes.length,
      podsTotal: pods.length, phase, restarts, notReady,
      workloadsReady: wReady, workloadsTotal: workloads.length,
    };
  }, [k8s]);

  const byNamespace = useMemo(() => {
    const m = {};
    k8s.pods.forEach((p) => {
      const ns = p.namespace || 'default';
      m[ns] = m[ns] || { name: ns, value: 0, running: 0, pending: 0, bad: 0, restarts: 0 };
      m[ns].value += 1;
      if (p.status === 'Running') m[ns].running += 1;
      else if (p.status === 'Pending') m[ns].pending += 1;
      else m[ns].bad += 1;
      m[ns].restarts += Number(p.restarts) || 0;
    });
    return Object.values(m).sort((a, b) => b.value - a.value);
  }, [k8s.pods]);

  const nsStacks = useMemo(() => byNamespace.slice(0, 8), [byNamespace]);

  const nodeLoad = useMemo(
    () => k8s.nodes.map((n) => ({ name: n.name, value: Number(n.pod_count) || 0 })),
    [k8s.nodes]
  );

  // Per-node pod-slot utilisation — the real capacity pressure signal.
  const nodeUtil = useMemo(() => k8s.nodes.map((n) => {
    const cap = Number(n.capacity?.pods) || 0;
    return { name: n.name, used: Number(n.pod_count) || 0, cap, pct: cap ? Math.round(((Number(n.pod_count) || 0) / cap) * 100) : 0 };
  }), [k8s.nodes]);
  const fleetCap = useMemo(() => nodeUtil.reduce((a, n) => ({ used: a.used + n.used, cap: a.cap + n.cap }), { used: 0, cap: 0 }), [nodeUtil]);

  const restartValues = useMemo(
    () => k8s.pods.map((p) => Number(p.restarts) || 0).filter((v) => v > 0),
    [k8s.pods]
  );
  const restartTop = useMemo(
    () => k8s.pods.filter((p) => (Number(p.restarts) || 0) > 0)
      .sort((a, b) => b.restarts - a.restarts)
      .map((p) => ({ name: p.name, value: Number(p.restarts) || 0, namespace: p.namespace })),
    [k8s.pods]
  );

  // Container images in flight — registry spread and tag hygiene are both real
  // ops signals the resource payload already carries.
  const images = useMemo(() => {
    const byRef = {}, byRegistry = {};
    let containers = 0, floating = 0;
    const floatingPods = [];
    k8s.pods.forEach((p) => {
      (p.containers || []).forEach((c) => {
        if (!c.image) return;
        containers += 1;
        const { repo, tag, registry, ref } = parseImageRef(c.image);
        byRef[ref] = byRef[ref] || { name: ref, value: 0, repo, tag, registry };
        byRef[ref].value += 1;
        byRegistry[registry] = (byRegistry[registry] || 0) + 1;
        if (tag === 'latest' || !/[.\d]/.test(tag)) {
          floating += 1;
          floatingPods.push({ pod: p.name, namespace: p.namespace, image: ref, tag });
        }
      });
    });
    return {
      containers,
      unique: Object.values(byRef).sort((a, b) => b.value - a.value),
      registries: Object.entries(byRegistry).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      floating, floatingPods, pinned: containers - floating,
    };
  }, [k8s.pods]);

  // ── historical series (Prometheus) ──────────────────────────────────────
  const hist = history?.available ? history : null;
  const histLabel = useCallback((t) => new Date(t).toLocaleString([], { hour: '2-digit', minute: '2-digit' }), []);
  const histTable = useCallback((key, header) => {
    const pts = hist?.series?.[key] || [];
    return { title: 'Per sample', columns: ['Time', header], rows: pts.map((p) => [histLabel(p.t), p.v]) };
  }, [hist, histLabel]);
  const histChart = useCallback((key, name) => (hist?.series?.[key] || []).map((p) => ({ label: histLabel(p.t), [name]: p.v })), [hist, histLabel]);
  // Prometheus only keeps so much; say so rather than drawing a flat line.
  const histWindow = hist
    ? `${hist.effectiveHours}h of history${hist.truncated ? ` (Prometheus retains ${hist.retentionHours}h)` : ''}`
    : '';

  const podAges = useMemo(() => k8s.pods.map((p) => days(p.age)).filter((d) => d >= 0), [k8s.pods]);
  const medianAge = useMemo(() => {
    if (!podAges.length) return null;
    const s = [...podAges].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }, [podAges]);
  const svcTypes = useMemo(() => {
    const m = {};
    k8s.services.forEach((s) => { const t = s.type || 'ClusterIP'; m[t] = (m[t] || 0) + 1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [k8s.services]);

  const drillData = useMemo(() => {
    if (!drill) return null;
    const pods = drill.type === 'node'
      ? k8s.pods.filter((p) => p.nodeName === drill.key)
      : k8s.pods.filter((p) => (p.namespace || 'default') === drill.key);
    const phase = {};
    pods.forEach((p) => { const s = p.status || 'Unknown'; phase[s] = (phase[s] || 0) + 1; });
    return {
      pods,
      workloads: drill.type === 'namespace'
        ? [...k8s.deployments, ...k8s.statefulsets].filter((w) => (w.namespace || 'default') === drill.key) : [],
      phaseItems: Object.entries(phase).map(([name, value]) => ({ name, value })),
      restarts: pods.reduce((s, p) => s + (Number(p.restarts) || 0), 0),
      node: drill.type === 'node' ? k8s.nodes.find((n) => n.name === drill.key) : null,
    };
  }, [drill, k8s]);

  // ── AI widget builder ─────────────────────────────────────────────────────
  const [customWidgets, setCustomWidgets] = useState([]);
  const [nlpPrompt, setNlpPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState(null);
  const [widgetName, setWidgetName] = useState('');
  const [savingWidget, setSavingWidget] = useState(false);

  useEffect(() => {
    getCustomWidgets().then((r) => { if (r?.success) setCustomWidgets(r.widgets || []); }).catch(() => {});
  }, []);

  const sources = useMemo(() => {
    const vt = vulnSummary?.totals || {};
    return {
      alerts_over_time: overTime.map((b) => ({ label: new Date(b.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), Critical: b.critical, Warning: b.warning, Info: b.info, Total: b.total })),
      alerts_by_severity: [
        { name: 'Critical', value: summary.criticalCount || 0 },
        { name: 'Warning', value: summary.warningCount || 0 },
        { name: 'Info', value: summary.infoCount || 0 },
      ].filter((d) => d.value > 0),
      alerts_by_namespace: (alertData?.byNamespace || []).map((n) => ({ name: (n.namespace || 'unknown').slice(0, 18), value: n.count })),
      alerts_by_cluster: (alertData?.byCluster || []).map((c) => ({ name: (c.clusterName || c.clusterId || '').slice(0, 20), Critical: c.critical, Warning: c.warning, Info: c.info })),
      alerts_top: topAlertItems.map((a) => ({ name: String(a.name).slice(0, 26), value: a.value })),
      alerts_summary: { total: summary.total || 0, critical: summary.criticalCount || 0, value: summary.total || 0 },
      vuln_by_severity: [
        { name: 'Critical', value: vt.critical || 0 }, { name: 'High', value: vt.high || 0 },
        { name: 'Medium', value: vt.medium || 0 }, { name: 'Low', value: vt.low || 0 },
      ].filter((d) => d.value > 0),
      vuln_by_namespace: (vulnSummary?.byNamespace || []).map((n) => ({ name: (n.namespace || '').slice(0, 18), value: n.total })),
      vuln_top_images: (vulnSummary?.topImages || []).map((im) => ({ name: (im.image || '').slice(0, 26), value: im.total })),
      vuln_summary: { total: vt.total || 0, critical: vt.critical || 0, value: vt.total || 0 },
    };
  }, [alertData, overTime, summary, vulnSummary, topAlertItems]);

  const availability = useMemo(() => Object.fromEntries(Object.entries(sources).map(([k, v]) => [
    k, Array.isArray(v) ? v.length : ((v && (v.total || v.value)) ? 1 : 0),
  ])), [sources]);

  const runGenerate = async () => {
    if (!nlpPrompt.trim()) return;
    setGenerating(true); setPreview(null);
    try {
      const r = await generateNlpWidget(nlpPrompt.trim(), availability);
      if (r?.success) { setPreview(r.widget); setWidgetName(r.widget?.title || ''); }
    } catch (e) { /* ignore */ } finally { setGenerating(false); }
  };
  const addWidget = async () => {
    if (!preview || preview.possible === false) return;
    setSavingWidget(true);
    try {
      const r = await saveCustomWidget({ ...preview, title: (widgetName || preview.title || 'Untitled').trim() });
      if (r?.success) { setCustomWidgets(r.widgets); setPreview(null); setNlpPrompt(''); setWidgetName(''); }
    } catch (e) { /* ignore */ } finally { setSavingWidget(false); }
  };
  const removeWidget = async (id) => {
    try { const r = await deleteCustomWidget(id); if (r?.success) setCustomWidgets(r.widgets); } catch { /* ignore */ }
  };

  // ── signal carousel ───────────────────────────────────────────────────────
  const scroller = useRef(null);
  const [slide, setSlide] = useState(0);
  const [scrollable, setScrollable] = useState(false);
  // Dots are only meaningful when the row actually overflows.
  useEffect(() => {
    const check = () => {
      const el = scroller.current;
      if (el) setScrollable(el.scrollWidth > el.clientWidth + 4);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [vulnSummary, alertData]);
  const scrollTo = (i) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * (el.clientWidth / 2), behavior: 'smooth' });
    setSlide(i);
  };

  const vt = vulnSummary?.totals || {};
  const signals = [
    {
      tint: 'rose', icon: Flag, label: 'Firing alerts', value: `${num(summary.firing)} active`,
      description: 'Alerts currently firing across all connected clusters, not yet resolved.',
      actionLabel: 'Review alerts', onAction: () => navigate('/dashboard/timeline'),
      severity: (summary.firing || 0) > 50 ? 'High' : (summary.firing || 0) > 0 ? 'Medium' : 'Low',
    },
    {
      tint: 'amber', icon: AlertTriangle, label: 'Critical severity', value: `${num(summary.criticalCount)} critical`,
      description: `Highest-severity alerts in this window — ${summary.total ? Math.round((summary.criticalCount / summary.total) * 100) : 0}% of total volume.`,
      actionLabel: 'Open cases', onAction: () => navigate('/dashboard/correlation'),
      severity: (summary.criticalCount || 0) > 0 ? 'High' : 'Low',
    },
    {
      tint: 'teal', icon: Layers, label: 'Vulnerabilities', value: vulnSummary ? `${num(vt.total)} findings` : 'Not scanned',
      description: vulnSummary
        ? `Trivy found ${num(vt.critical)} critical and ${num(vt.high)} high across ${num(vulnSummary.scannedWorkloads)} workloads.`
        : 'Trivy Operator has not reported any scans for this cluster yet.',
      actionLabel: 'View findings', onAction: () => navigate('/dashboard/apps'),
      severity: (vt.critical || 0) > 0 ? 'High' : (vt.high || 0) > 0 ? 'Medium' : 'Low',
    },
    {
      tint: 'blue', icon: Boxes, label: 'Correlated incidents', value: `${num(alertData?.topAlerts?.length || 0)} patterns`,
      description: 'Distinct alert signatures grouped by the correlation engine for root-cause analysis.',
      actionLabel: 'Open correlation', onAction: () => navigate('/dashboard/correlation'),
      severity: 'Medium',
    },
  ];

  return (
    <div className={`flex-1 overflow-auto ${page}`}>
      <div className="px-8 py-7 max-w-[1500px] mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-6 flex-wrap mb-7">
          <div>
            <h1 className={`text-[26px] font-semibold tracking-tight ${h1}`}>Operations Intelligence</h1>
            <p className={`text-[13px] mt-1 ${muted}`}>AI-detected signals across alerts, workloads and vulnerabilities</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={clusterId} onChange={(e) => { setClusterId(e.target.value); setDrill(null); }}
              className={`px-3 py-2 rounded-lg text-[12.5px] border outline-none ${dk ? 'bg-[#131313] border-[#232323] text-gray-300' : 'bg-white border-gray-200 text-gray-700'}`}>
              {clusters.length === 0 && <option value="">No clusters</option>}
              {clusters.map((c) => <option key={c._id || c.id} value={c._id || c.id}>{c.name || c._id}</option>)}
            </select>
            <div className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border ${dk ? 'bg-[#131313] border-[#232323]' : 'bg-white border-gray-200'}`}>
              <Calendar size={13} className={faint} />
              {RANGES.map(([l]) => (
                <button key={l} onClick={() => setRange(l)}
                  className={`px-2 py-0.5 rounded text-[12px] font-medium ${range === l ? (dk ? 'bg-[#232323] text-gray-100' : 'bg-gray-100 text-gray-900') : muted}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => (tab === 'alerts' ? fetchAlerts() : fetchK8s())}
              className={`p-2 rounded-lg border ${dk ? 'bg-[#131313] border-[#232323] text-gray-400' : 'bg-white border-gray-200 text-gray-500'}`}>
              <RefreshCw size={14} className={(tab === 'alerts' ? loadingAlerts : k8s.loading) ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => navigate('/dashboard/report')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-medium ${dk ? 'bg-gray-100 text-gray-900' : 'bg-gray-900 text-white'}`}>
              <Download size={13} /> Export report
            </button>
          </div>
        </div>

        {/* Signal carousel */}
        <div className="relative">
          <div ref={scroller} onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / (e.currentTarget.clientWidth / 2)))}
            className="flex gap-4 overflow-x-auto no-scrollbar pb-1 scroll-smooth">
            {signals.map((s, i) => <SignalCard key={i} {...s} dk={dk} />)}
          </div>
          <div className={`items-center justify-center gap-1.5 mt-4 ${scrollable ? 'flex' : 'hidden'}`}>
            {signals.map((_, i) => (
              <button key={i} onClick={() => scrollTo(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === slide ? 7 : 6, height: i === slide ? 7 : 6,
                  background: i === slide ? (dk ? '#e5e5e5' : '#111827') : (dk ? '#333' : '#d4d4d8'),
                }} />
            ))}
          </div>
        </div>

        {/* AI banner */}
        <div className={`${card} p-4 mt-7`}>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: `${PALETTE.indigo}1a`, color: PALETTE.indigo }}>
              <Sparkles size={15} />
            </span>
            <div>
              <h2 className={`text-[13.5px] font-semibold ${h2}`}>Visual AI assistant</h2>
              <p className={`text-[11.5px] ${faint}`}>Describe a chart in plain English. Name it, and it is added to your dashboard below.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Wand2 size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${faint}`} />
              <input value={nlpPrompt} onChange={(e) => setNlpPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runGenerate()}
                placeholder="e.g. alerts by namespace as a bar chart"
                className={`w-full pl-9 pr-3 py-2.5 text-[13px] rounded-lg border outline-none ${dk ? 'bg-[#0e0e0e] border-[#232323] text-gray-200 placeholder-gray-600' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
            </div>
            <button onClick={runGenerate} disabled={generating || !nlpPrompt.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white disabled:opacity-50"
              style={{ background: PALETTE.indigo }}>
              {generating ? <><Loader2 size={14} className="animate-spin" /> Building</> : 'Generate'}
            </button>
          </div>

          {preview && preview.possible === false && (
            <div className={`mt-3 rounded-lg p-3 flex items-start gap-2.5 border ${dk ? 'bg-amber-500/5 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
              <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className={`text-[12.5px] font-medium ${dk ? 'text-amber-300' : 'text-amber-800'}`}>Can’t build that yet</div>
                <p className={`text-[12px] mt-0.5 ${dk ? 'text-amber-200/80' : 'text-amber-700'}`}>{preview.reason}</p>
              </div>
              <button onClick={() => setPreview(null)} className={faint}><X size={14} /></button>
            </div>
          )}
          {preview && preview.possible !== false && (
            <div className={`mt-3 rounded-lg border p-3 ${dk ? 'border-[#232323] bg-[#0e0e0e]' : 'border-gray-200 bg-[#fafbfc]'}`}>
              <div className="flex items-center gap-2 mb-2.5">
                <input value={widgetName} onChange={(e) => setWidgetName(e.target.value)} placeholder="Name this widget"
                  className={`flex-1 px-3 py-1.5 text-[12.5px] rounded-md border outline-none ${dk ? 'bg-[#131313] border-[#232323] text-gray-200' : 'bg-white border-gray-200 text-gray-900'}`} />
                <span className={`text-[10.5px] px-1.5 py-0.5 rounded shrink-0 ${dk ? 'bg-[#1e1e1e] text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                  {preview.source === 'ai' ? 'AI' : 'assist'} · {preview.type}
                </span>
                <button onClick={() => setPreview(null)} className={`p-1.5 rounded ${faint}`}><X size={14} /></button>
                <button onClick={addWidget} disabled={savingWidget || !widgetName.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-white disabled:opacity-50" style={{ background: PALETTE.indigo }}>
                  {savingWidget ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add to dashboard
                </button>
              </div>
              <TrendsWidget spec={preview} sources={sources} theme={theme} height={220} />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className={`flex items-center gap-1 border-b mt-7 ${borderC}`}>
          {[['alerts', 'Alerts & Incidents'], ['kubernetes', 'Kubernetes']].map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setDrill(null); }}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === id
                ? (dk ? 'border-gray-100 text-gray-100' : 'border-gray-900 text-gray-900')
                : `border-transparent ${muted}`}`}>{label}</button>
          ))}
        </div>

        {/* ── ALERTS TILE GRID ── */}
        {tab === 'alerts' && (
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-x divide-y ${divide} border-b ${borderC}`}>
            <MetricTile dk={dk} value={num(summary.firing)} caption="Alerts firing now"
              axisLeft={axisFrom} axisRight={axisTo}
              onClick={() => setDetail({
                title: 'Alerts firing over time', subtitle: `Critical + warning per bucket · last ${range}`,
                kind: 'area', data: timeline, series: ['Critical', 'Warning'], xKey: 'label',
                stats: [
                  { label: 'Firing now', value: num(summary.firing), tone: STATUS.bad },
                  { label: 'Peak bucket', value: num(peak?.count) },
                  { label: 'Avg per bucket', value: num(avgPerBucket) },
                  { label: 'Buckets', value: num(timeline.length) },
                ],
                table: { title: 'Per bucket', columns: ['Bucket', 'Critical', 'Warning', 'Info', 'Total'],
                  rows: timeline.map((t) => [t.label, t.Critical, t.Warning, t.Info, t.Total]) },
              })}>
              <GradientLine data={series.firing.map((v) => ({ v }))} color={PALETTE.indigo} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={`${resolutionRate}%`} caption="Alert resolution rate"
              axisLeft={`${num(summary.total)} alerts in window`} axisRight=""
              onClick={() => setDetail({
                title: 'Resolution rate', subtitle: 'How much of the window’s alert volume has been closed out',
                kind: 'bar', data: [
                  { name: 'Resolved', value: summary.resolved || 0 },
                  { name: 'Firing', value: summary.firing || 0 },
                ], xKey: 'name',
                stats: [
                  { label: 'Resolved', value: num(summary.resolved), tone: STATUS.ok },
                  { label: 'Still firing', value: num(summary.firing), tone: STATUS.bad },
                  { label: 'Resolution rate', value: `${resolutionRate}%` },
                  { label: 'Total', value: num(summary.total) },
                ],
                table: { title: 'Most frequent unresolved signatures', columns: ['Alert', 'Severity', 'Namespace', 'Count'],
                  rows: topAlertsFull.filter((a) => a.status === 'firing').map((a) => [a.alertname, a.severity, a.namespace || '—', a.count]) },
              })}>
              <Composition dk={dk} segments={[
                { label: 'Resolved', value: summary.resolved || 0, color: STATUS.ok },
                { label: 'Still firing', value: summary.firing || 0, color: STATUS.bad },
              ]} />
            </MetricTile>

            <MetricTile dk={dk} value={num(summary.criticalCount)} caption="Critical severity alerts"
              delta={pctOf(summary.criticalCount, delta.critical) != null ? `${Math.abs(pctOf(summary.criticalCount, delta.critical))}%` : null}
              deltaDir={(delta.critical || 0) <= 0 ? 'down' : 'up'}
              axisLeft={<Legend items={[['Critical', STATUS.bad], ['Warning', STATUS.warn], ['Info', STATUS.idle]]} dk={dk} />}
              axisRight={axisTo}
              onClick={() => setDetail({
                title: 'Severity mix over time', subtitle: `Every alert bucketed by severity · last ${range}`,
                kind: 'stackedBar', data: timeline, series: ['Critical', 'Warning', 'Info'], xKey: 'label',
                stats: [
                  { label: 'Critical', value: num(summary.criticalCount), tone: STATUS.bad },
                  { label: 'Warning', value: num(summary.warningCount), tone: STATUS.warn },
                  { label: 'Info', value: num(summary.infoCount), tone: STATUS.idle },
                  { label: 'Critical share', value: `${summary.total ? Math.round((summary.criticalCount / summary.total) * 100) : 0}%` },
                ],
                table: { title: 'Per bucket', columns: ['Bucket', 'Critical', 'Warning', 'Info'],
                  rows: timeline.map((t) => [t.label, t.Critical, t.Warning, t.Info]) },
              })}>
              <StackedMicroBars data={series.stacks} colors={[STATUS.bad, STATUS.warn, STATUS.idle]} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={num(summary.total)} caption="Total alert volume"
              delta={pctOf(summary.total, delta.total) != null ? `${Math.abs(pctOf(summary.total, delta.total))}%` : null}
              deltaDir={(delta.total || 0) <= 0 ? 'down' : 'up'}
              axisLeft={axisFrom} axisRight={axisTo}
              onClick={() => setDetail({
                title: 'Total alert volume', subtitle: `All severities per bucket · last ${range}`,
                kind: 'bar', data: timeline, series: ['Total'], xKey: 'label',
                stats: [
                  { label: 'Total', value: num(summary.total) },
                  { label: 'vs previous', value: `${(delta.total || 0) > 0 ? '+' : ''}${num(delta.total)}` },
                  { label: 'Peak bucket', value: num(peak?.count) },
                  { label: 'Avg per bucket', value: num(avgPerBucket) },
                ],
                table: { title: 'Per bucket', columns: ['Bucket', 'Total'], rows: timeline.map((t) => [t.label, t.Total]) },
              })}>
              <VBars data={series.total} color={PALETTE.violet} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={num(nsAll.length)} caption="Namespaces affected"
              axisLeft="0" axisRight={String(Math.max(...nsAll.map((i) => i.value), 0) || 0)}
              onClick={() => setDetail({
                title: 'Alerts by namespace', subtitle: 'Where the noise is coming from, split by severity',
                kind: 'hbar', data: nsAll.slice(0, 12), series: ['Critical', 'Warning', 'Info'], xKey: 'name',
                stats: [
                  { label: 'Namespaces', value: num(nsAll.length) },
                  { label: 'Noisiest', value: nsAll[0]?.name || '—' },
                  { label: 'Its share', value: `${summary.total && nsAll[0] ? Math.round((nsAll[0].value / summary.total) * 100) : 0}%` },
                  { label: 'Total', value: num(summary.total) },
                ],
                table: { title: 'All namespaces', columns: ['Namespace', 'Critical', 'Warning', 'Info', 'Total'],
                  rows: nsAll.map((n) => [n.name, n.Critical, n.Warning, n.Info, n.value]) },
              })}>
              <HBars items={nsItems} color={PALETTE.blue} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={num(topAlertsFull.length)} caption="Distinct alert signatures"
              axisLeft={topAlertsFull[0] ? `top: ${topAlertsFull[0].alertname}`.slice(0, 34) : ''} axisRight=""
              onClick={() => setDetail({
                title: 'Alert signatures', subtitle: 'Distinct alertnames ranked by how often they fired',
                kind: 'treemap', data: topAlertItems, xKey: 'name',
                stats: [
                  { label: 'Signatures', value: num(topAlertsFull.length) },
                  { label: 'Most frequent', value: num(topAlertsFull[0]?.count) },
                  { label: 'Still firing', value: num(topAlertsFull.filter((a) => a.status === 'firing').length) },
                  { label: 'Total', value: num(summary.total) },
                ],
                table: { title: 'Signatures', columns: ['Alert', 'Severity', 'Namespace', 'Status', 'Count'],
                  rows: topAlertsFull.map((a) => [a.alertname, a.severity, a.namespace || '—', a.status, a.count]) },
              })}>
              <TreemapTile data={topAlertItems} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={num(summary.warningCount)} caption="Warning severity alerts"
              delta={pctOf(summary.warningCount, delta.warning) != null ? `${Math.abs(pctOf(summary.warningCount, delta.warning))}%` : null}
              deltaDir={(delta.warning || 0) <= 0 ? 'down' : 'up'}
              axisLeft={axisFrom} axisRight={axisTo}
              onClick={() => setDetail({
                title: 'Warning alerts over time', subtitle: `Warning + medium severity · last ${range}`,
                kind: 'area', data: timeline, series: ['Warning'], xKey: 'label',
                stats: [
                  { label: 'Warning', value: num(summary.warningCount), tone: STATUS.warn },
                  { label: 'vs previous', value: `${(delta.warning || 0) > 0 ? '+' : ''}${num(delta.warning)}` },
                  { label: 'Share of total', value: `${summary.total ? Math.round((summary.warningCount / summary.total) * 100) : 0}%` },
                  { label: 'Buckets', value: num(timeline.length) },
                ],
                table: { title: 'Per bucket', columns: ['Bucket', 'Warning'], rows: timeline.map((t) => [t.label, t.Warning]) },
              })}>
              <GradientLine data={series.warning.map((v) => ({ v }))} color={STATUS.warn} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={num(summary.infoCount)} caption="Informational alerts"
              axisLeft={axisFrom} axisRight={axisTo}
              onClick={() => setDetail({
                title: 'Informational alerts over time', subtitle: `Info + low severity · last ${range}`,
                kind: 'area', data: timeline, series: ['Info'], xKey: 'label',
                stats: [
                  { label: 'Info', value: num(summary.infoCount), tone: STATUS.idle },
                  { label: 'Share of total', value: `${summary.total ? Math.round((summary.infoCount / summary.total) * 100) : 0}%` },
                  { label: 'Avg per bucket', value: num(timeline.length ? Math.round(summary.infoCount / timeline.length) : 0) },
                  { label: 'Buckets', value: num(timeline.length) },
                ],
                table: { title: 'Per bucket', columns: ['Bucket', 'Info'], rows: timeline.map((t) => [t.label, t.Info]) },
              })}>
              <GradientLine data={series.info.map((v) => ({ v }))} color={STATUS.idle} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={num(clusterAll.length)} caption="Clusters reporting"
              axisLeft={<Legend items={[['Critical', STATUS.bad], ['Warning', STATUS.warn], ['Info', STATUS.idle]]} dk={dk} />} axisRight=""
              onClick={() => setDetail({
                title: 'Alerts by cluster', subtitle: 'Severity mix per connected cluster',
                kind: 'hbar', data: clusterAll, series: ['Critical', 'Warning', 'Info'], xKey: 'name',
                stats: [
                  { label: 'Clusters', value: num(clusterAll.length) },
                  { label: 'Noisiest', value: clusterAll[0]?.name || '—' },
                  { label: 'Its alerts', value: num(clusterAll[0]?.value) },
                  { label: 'Total', value: num(summary.total) },
                ],
                table: { title: 'Clusters', columns: ['Cluster', 'Critical', 'Warning', 'Info', 'Total'],
                  rows: clusterAll.map((c) => [c.name, c.Critical, c.Warning, c.Info, c.value]) },
              })}>
              <StackedMicroBars
                data={clusterAll.slice(0, 8).map((c) => [c.Critical, c.Warning, c.Info])}
                labels={clusterAll.slice(0, 8).map((c) => c.name)}
                colors={[STATUS.bad, STATUS.warn, STATUS.idle]} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={num(podAll.length)} caption="Pods raising alerts"
              axisLeft={podAll[0] ? `worst: ${podAll[0].value}` : ''} axisRight=""
              onClick={() => setDetail({
                title: 'Alerts by pod', subtitle: 'The workloads generating the most alert traffic',
                kind: 'hbar', data: podAll.map((p) => ({ name: p.name.slice(0, 32), value: p.value })), xKey: 'name',
                stats: [
                  { label: 'Pods alerting', value: num(podAll.length) },
                  { label: 'Worst pod', value: num(podAll[0]?.value) },
                  { label: 'Its namespace', value: podAll[0]?.namespace || '—' },
                  { label: 'Total', value: num(podAll.reduce((s, p) => s + p.value, 0)) },
                ],
                table: { title: 'Pods', columns: ['Pod', 'Namespace', 'Severity', 'Alerts'],
                  rows: podAll.map((p) => [p.name, p.namespace || '—', p.severity || '—', p.value]) },
              })}>
              <HBars items={podAll.slice(0, 6)} color={PALETTE.teal} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={num(peak?.count)} caption="Peak alerts in one bucket"
              axisLeft={peak?.when ? fmtBucket(peak.when) : ''} axisRight={`avg ${num(avgPerBucket)}`}
              onClick={() => setDetail({
                title: 'Alert bursts', subtitle: 'Volume per bucket — spikes mark incident windows',
                kind: 'bar', data: timeline, series: ['Total'], xKey: 'label',
                stats: [
                  { label: 'Peak', value: num(peak?.count), tone: STATUS.bad },
                  { label: 'Peak at', value: peak?.when ? fmtBucket(peak.when) : '—' },
                  { label: 'Average', value: num(avgPerBucket) },
                  { label: 'Peak vs avg', value: avgPerBucket ? `${Math.round((peak?.count || 0) / avgPerBucket)}×` : '—' },
                ],
                table: { title: 'Busiest buckets', columns: ['Bucket', 'Total', 'Critical'],
                  rows: [...timeline].sort((a, b) => b.Total - a.Total).map((t) => [t.label, t.Total, t.Critical]) },
              })}>
              <Violin density={densityOf(series.total)} color={PALETTE.orange} dk={dk} />
            </MetricTile>

            <MetricTile dk={dk} value={vulnSummary ? num(vulnSummary.totals?.total) : '—'} caption="Vulnerability findings"
              axisLeft={vulnSummary ? <Legend items={[['Critical', STATUS.bad], ['High', '#e06a30'], ['Medium', '#d9a441'], ['Low', '#94a3b8']]} dk={dk} /> : 'Trivy not reporting'}
              axisRight=""
              onClick={vulnSummary ? () => setDetail({
                title: 'Vulnerabilities by severity', subtitle: `Trivy findings across ${num(vulnSummary.scannedWorkloads)} scanned workloads`,
                kind: 'bar', data: [
                  { name: 'Critical', value: vulnSummary.totals?.critical || 0 },
                  { name: 'High', value: vulnSummary.totals?.high || 0 },
                  { name: 'Medium', value: vulnSummary.totals?.medium || 0 },
                  { name: 'Low', value: vulnSummary.totals?.low || 0 },
                ], xKey: 'name',
                stats: [
                  { label: 'Critical', value: num(vulnSummary.totals?.critical), tone: STATUS.bad },
                  { label: 'High', value: num(vulnSummary.totals?.high), tone: '#e06a30' },
                  { label: 'Total', value: num(vulnSummary.totals?.total) },
                  { label: 'Workloads', value: num(vulnSummary.scannedWorkloads) },
                ],
                table: { title: 'Most vulnerable images', columns: ['Image', 'Findings'],
                  rows: (vulnSummary.topImages || []).map((im) => [im.image, im.total]) },
              }) : undefined}>
              {vulnSummary ? (
                <Composition dk={dk} segments={[
                  { label: 'Critical', value: vulnSummary.totals?.critical || 0, color: STATUS.bad },
                  { label: 'High', value: vulnSummary.totals?.high || 0, color: '#e06a30' },
                  { label: 'Medium', value: vulnSummary.totals?.medium || 0, color: '#d9a441' },
                  { label: 'Low', value: vulnSummary.totals?.low || 0, color: '#94a3b8' },
                ]} />
              ) : (
                <div className={`flex items-center justify-center text-[11.5px] ${faint}`} style={{ height: 96 }}>Trivy Operator not detected</div>
              )}
            </MetricTile>
          </div>
        )}

        {/* ── KUBERNETES TILE GRID ── */}
        {tab === 'kubernetes' && (
          <>
            {!clusterId ? (
              <div className="py-16 text-center"><p className={`text-[13px] ${muted}`}>Select a cluster to view fleet health.</p></div>
            ) : k8s.loading ? (
              <div className="py-16 flex items-center justify-center gap-2">
                <Loader2 size={15} className="animate-spin" style={{ color: PALETTE.indigo }} />
                <span className={`text-[13px] ${muted}`}>Reading cluster state…</span>
              </div>
            ) : (
              <>
                {/* The tiles below are a point-in-time snapshot; only the CPU and memory
                    tiles have a time axis, and only as far back as Prometheus retains. */}
                {history && (history.truncated || !history.available) && (
                  <div className={`flex items-start gap-2 px-5 py-2.5 text-[11.5px] border-b ${borderC} ${faint}`}>
                    <AlertTriangle size={13} className="shrink-0 mt-[1px] text-amber-500" />
                    <span>
                      {history.available
                        ? `Showing ${history.effectiveHours}h of history — Prometheus on this cluster retains ${history.retentionHours}h, so the ${range} range cannot be covered. Raise --storage.tsdb.retention.time to see further back. Counts below are current state.`
                        : `${history.reason || 'History unavailable.'} CPU and memory show capacity only; counts below are current state.`}
                    </span>
                  </div>
                )}
                <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 divide-x divide-y ${divide} border-b ${borderC}`}>
                  <MetricTile dk={dk} value={`${kpi.nodesReady}/${kpi.nodesTotal}`} caption="Nodes ready"
                    axisLeft="pods scheduled per node" axisRight={String(Math.max(...nodeLoad.map((n) => n.value), 0))}
                    onClick={() => setDetail({
                      title: 'Node fleet', subtitle: 'Pods scheduled on each node, against its capacity',
                      kind: 'hbar', data: nodeUtil.map((n) => ({ name: n.name, value: n.used })), xKey: 'name',
                      stats: [
                        { label: 'Ready', value: `${kpi.nodesReady}/${kpi.nodesTotal}`, tone: kpi.nodesReady === kpi.nodesTotal ? STATUS.ok : STATUS.bad },
                        { label: 'Total CPU', value: `${k8s.nodes.reduce((s, n) => s + parseCpu(n.capacity?.cpu), 0)} cores` },
                        { label: 'Total memory', value: `${Math.round(k8s.nodes.reduce((s, n) => s + parseMemGi(n.capacity?.memory), 0))} Gi` },
                        { label: 'Pod slots', value: num(fleetCap.cap) },
                      ],
                      table: { title: 'Nodes', columns: ['Node', 'Status', 'Pods', 'Capacity', 'CPU', 'Memory (Gi)'],
                        rows: k8s.nodes.map((n) => [n.name, n.status, n.pod_count ?? 0, n.capacity?.pods ?? '—', parseCpu(n.capacity?.cpu), parseMemGi(n.capacity?.memory)]) },
                    })}>
                    <HBars items={nodeLoad} color={PALETTE.blue} dk={dk} />
                  </MetricTile>

                  <MetricTile dk={dk} value={`${kpi.phase.Running}/${kpi.podsTotal}`} caption="Pods running"
                    axisLeft={<Legend items={[['Running', STATUS.ok], ['Pending', STATUS.warn], ['Other', STATUS.bad]]} dk={dk} />} axisRight=""
                    onClick={() => setDetail({
                      title: 'Pod phase by namespace', subtitle: 'Every pod in the cluster, grouped by namespace and phase',
                      kind: 'hbar', data: byNamespace.slice(0, 12).map((n) => ({ name: n.name, Running: n.running, Pending: n.pending, Failed: n.bad })),
                      series: ['Running', 'Pending', 'Failed'], xKey: 'name',
                      stats: [
                        { label: 'Running', value: num(kpi.phase.Running), tone: STATUS.ok },
                        { label: 'Pending', value: num(kpi.phase.Pending), tone: STATUS.warn },
                        { label: 'Failed', value: num(kpi.phase.Failed), tone: STATUS.bad },
                        { label: 'Total pods', value: num(kpi.podsTotal) },
                      ],
                      table: { title: 'Namespaces', columns: ['Namespace', 'Running', 'Pending', 'Other', 'Total'],
                        rows: byNamespace.map((n) => [n.name, n.running, n.pending, n.bad, n.value]) },
                    })}>
                    <StackedMicroBars
                      data={nsStacks.map((n) => [n.running, n.pending, n.bad])}
                      labels={nsStacks.map((n) => n.name)}
                      colors={[STATUS.ok, STATUS.warn, STATUS.bad]} dk={dk} />
                  </MetricTile>

                  <MetricTile dk={dk} value={`${kpi.workloadsReady}/${kpi.workloadsTotal}`} caption="Workloads at desired replicas"
                    axisLeft="deployments + statefulsets" axisRight=""
                    onClick={() => setDetail({
                      title: 'Workload readiness', subtitle: 'Deployments and statefulsets against their desired replica count',
                      kind: 'hbar',
                      data: [...k8s.deployments, ...k8s.statefulsets].slice(0, 14).map((w) => {
                        const [r, d] = parseReady(w.replicas);
                        return { name: `${w.namespace}/${w.name}`.slice(0, 30), Ready: r, Missing: Math.max(0, d - r) };
                      }),
                      series: ['Ready', 'Missing'], xKey: 'name',
                      stats: [
                        { label: 'At desired', value: num(kpi.workloadsReady), tone: STATUS.ok },
                        { label: 'Degraded', value: num(kpi.workloadsTotal - kpi.workloadsReady), tone: kpi.workloadsReady === kpi.workloadsTotal ? STATUS.idle : STATUS.warn },
                        { label: 'Deployments', value: num(k8s.deployments.length) },
                        { label: 'StatefulSets', value: num(k8s.statefulsets.length) },
                      ],
                      table: { title: 'Workloads', columns: ['Workload', 'Namespace', 'Replicas', 'Age (days)'],
                        rows: [...k8s.deployments, ...k8s.statefulsets].map((w) => [w.name, w.namespace, w.replicas, days(w.age)]) },
                    })}>
                    <Composition dk={dk} segments={[
                      { label: 'At desired', value: kpi.workloadsReady, color: STATUS.ok },
                      { label: 'Degraded', value: kpi.workloadsTotal - kpi.workloadsReady, color: STATUS.warn },
                    ]} />
                  </MetricTile>

                  <MetricTile dk={dk} value={num(kpi.restarts)} caption="Container restarts"
                    axisLeft={`${kpi.notReady} ${plural(kpi.notReady, 'pod')} not fully ready`} axisRight={restartValues.length ? `${restartValues.length} ${plural(restartValues.length, 'pod')} affected` : ''}
                    onClick={restartTop.length ? () => setDetail({
                      title: 'Container restarts', subtitle: 'Pods that have restarted, ranked — repeat restarts usually mean a crash loop',
                      kind: 'hbar', data: restartTop.slice(0, 14).map((p) => ({ name: p.name.slice(0, 30), value: p.value })), xKey: 'name',
                      stats: [
                        { label: 'Total restarts', value: num(kpi.restarts), tone: STATUS.warn },
                        { label: 'Pods affected', value: num(restartTop.length) },
                        { label: 'Worst pod', value: num(restartTop[0]?.value), tone: STATUS.bad },
                        { label: 'Not ready', value: num(kpi.notReady) },
                      ],
                      table: { title: 'Restarting pods', columns: ['Pod', 'Namespace', 'Restarts'],
                        rows: restartTop.map((p) => [p.name, p.namespace, p.value]) },
                    }) : undefined}>
                    {densityOf(restartValues)
                      ? <Violin density={densityOf(restartValues)} color={PALETTE.orange} dk={dk} />
                      : restartValues.length
                        ? <VBars data={restartValues.slice(0, 24)} color={PALETTE.violet} dk={dk} />
                        : <div className={`flex items-center justify-center text-[11.5px] ${faint}`} style={{ height: 96 }}>No restarts — fleet stable</div>}
                  </MetricTile>

                  <MetricTile dk={dk} value={num(byNamespace.length)} caption="Namespaces in use"
                    axisLeft={byNamespace[0] ? `largest: ${byNamespace[0].name}` : ''} axisRight=""
                    onClick={() => setDetail({
                      title: 'Namespaces', subtitle: 'How the cluster’s pods are distributed across namespaces',
                      kind: 'treemap', data: byNamespace, xKey: 'name',
                      stats: [
                        { label: 'Namespaces', value: num(byNamespace.length) },
                        { label: 'Largest', value: byNamespace[0]?.name || '—' },
                        { label: 'Its pods', value: num(byNamespace[0]?.value) },
                        { label: 'Total pods', value: num(kpi.podsTotal) },
                      ],
                      table: { title: 'Namespaces', columns: ['Namespace', 'Pods', 'Running', 'Restarts'],
                        rows: byNamespace.map((n) => [n.name, n.value, n.running, n.restarts]) },
                    })}>
                    <TreemapTile data={byNamespace} dk={dk} />
                  </MetricTile>

                  <MetricTile dk={dk} value={fleetCap.cap ? `${Math.round((fleetCap.used / fleetCap.cap) * 100)}%` : '—'}
                    caption="Pod slots used across fleet"
                    axisLeft={`${num(fleetCap.used)} of ${num(fleetCap.cap)} slots`} axisRight=""
                    onClick={() => setDetail({
                      title: 'Scheduling headroom', subtitle: 'Pod-slot utilisation per node — how much room is left to schedule',
                      kind: 'bar', data: nodeUtil.map((n) => ({ name: n.name, value: n.pct })), xKey: 'name',
                      unit: 'Percent of each node’s pod capacity currently in use.',
                      stats: [
                        { label: 'Fleet usage', value: `${fleetCap.cap ? Math.round((fleetCap.used / fleetCap.cap) * 100) : 0}%` },
                        { label: 'Slots used', value: num(fleetCap.used) },
                        { label: 'Slots free', value: num(fleetCap.cap - fleetCap.used), tone: STATUS.ok },
                        { label: 'Busiest node', value: `${Math.max(...nodeUtil.map((n) => n.pct), 0)}%` },
                      ],
                      table: { title: 'Nodes', columns: ['Node', 'Used', 'Capacity', 'Used %'],
                        rows: nodeUtil.map((n) => [n.name, n.used, n.cap, `${n.pct}%`]) },
                    })}>
                    <VBars data={nodeUtil.map((n) => n.pct)} labels={nodeUtil.map((n) => n.name)}
                      color={PALETTE.violet} dk={dk} />
                  </MetricTile>

                  <MetricTile dk={dk} value={num(images.unique.length)} caption="Distinct container images"
                    axisLeft={`${num(images.containers)} containers`} axisRight=""
                    onClick={() => setDetail({
                      title: 'Container images', subtitle: 'Every image running in the cluster, by how many containers use it',
                      kind: 'treemap', data: images.unique.slice(0, 16).map((i) => ({ name: i.repo.split('/').pop(), value: i.value })), xKey: 'name',
                      stats: [
                        { label: 'Distinct images', value: num(images.unique.length) },
                        { label: 'Containers', value: num(images.containers) },
                        { label: 'Registries', value: num(images.registries.length) },
                        { label: 'Most used', value: num(images.unique[0]?.value) },
                      ],
                      table: { title: 'Images', columns: ['Image', 'Tag', 'Registry', 'Containers'],
                        rows: images.unique.map((i) => [i.repo, i.tag, i.registry, i.value]) },
                    })}>
                    <TreemapTile data={images.unique.slice(0, 8).map((i) => ({ name: i.repo.split('/').pop(), value: i.value }))} dk={dk} />
                  </MetricTile>

                  <MetricTile dk={dk} value={images.containers ? `${Math.round((images.pinned / images.containers) * 100)}%` : '—'}
                    caption="Images on a pinned tag"
                    axisLeft={images.floating ? `${images.floating} on a floating tag` : 'all pinned'} axisRight=""
                    onClick={() => setDetail({
                      title: 'Image tag hygiene', subtitle: 'A floating tag such as :latest makes a rollout unreproducible — the same tag can resolve to a different image tomorrow',
                      kind: 'bar', data: [
                        { name: 'Pinned', value: images.pinned },
                        { name: 'Floating', value: images.floating },
                      ], xKey: 'name',
                      stats: [
                        { label: 'Pinned', value: num(images.pinned), tone: STATUS.ok },
                        { label: 'Floating', value: num(images.floating), tone: images.floating ? STATUS.warn : STATUS.idle },
                        { label: 'Containers', value: num(images.containers) },
                        { label: 'Pinned share', value: `${images.containers ? Math.round((images.pinned / images.containers) * 100) : 0}%` },
                      ],
                      table: { title: 'Containers on a floating tag', columns: ['Pod', 'Namespace', 'Image', 'Tag'],
                        rows: images.floatingPods.map((f) => [f.pod, f.namespace, f.image, f.tag]) },
                    })}>
                    <Composition dk={dk} segments={[
                      { label: 'Pinned', value: images.pinned, color: STATUS.ok },
                      { label: 'Floating', value: images.floating, color: STATUS.warn },
                    ]} />
                  </MetricTile>

                  <MetricTile dk={dk} value={medianAge != null ? `${medianAge}d` : '—'}
                    caption="Median pod age"
                    axisLeft={podAges.length ? `oldest ${Math.max(...podAges)}d` : ''} axisRight={podAges.length ? `newest ${Math.min(...podAges)}d` : ''}
                    onClick={() => setDetail({
                      title: 'Workload age', subtitle: 'How long pods have been running — a very old pod has not picked up recent image changes',
                      kind: 'hbar',
                      data: [...k8s.pods].sort((a, b) => days(b.age) - days(a.age)).slice(0, 14)
                        .map((p) => ({ name: p.name.slice(0, 30), value: days(p.age) })),
                      xKey: 'name', unit: 'Age in days since the pod started.',
                      stats: [
                        { label: 'Oldest', value: `${Math.max(...podAges, 0)}d` },
                        { label: 'Newest', value: `${Math.min(...podAges, 0)}d` },
                        { label: 'Median', value: `${medianAge ?? 0}d` },
                        { label: 'Pods', value: num(podAges.length) },
                      ],
                      table: { title: 'Pods by age', columns: ['Pod', 'Namespace', 'Node', 'Age (days)'],
                        rows: [...k8s.pods].sort((a, b) => days(b.age) - days(a.age)).map((p) => [p.name, p.namespace, p.nodeName || '—', days(p.age)]) },
                    })}>
                    {densityOf(podAges)
                      ? <Violin density={densityOf(podAges)} color={PALETTE.orangeSoft} dk={dk} />
                      : <VBars data={podAges.slice(0, 24)} color={PALETTE.orangeSoft} dk={dk} />}
                  </MetricTile>

                  <MetricTile dk={dk} value={num(k8s.services.length)} caption="Services exposed"
                    axisLeft={svcTypes.map((t) => `${t.name} ${t.value}`).join(' · ').slice(0, 40)} axisRight=""
                    onClick={() => setDetail({
                      title: 'Services', subtitle: 'Service types in the cluster — NodePort and LoadBalancer reach outside it',
                      kind: 'bar', data: svcTypes, xKey: 'name',
                      stats: [
                        { label: 'Services', value: num(k8s.services.length) },
                        ...svcTypes.slice(0, 3).map((t) => ({ label: t.name, value: num(t.value) })),
                      ],
                      table: { title: 'Services', columns: ['Service', 'Namespace', 'Type', 'Cluster IP', 'Ports'],
                        rows: k8s.services.map((s) => [s.name, s.namespace, s.type, s.clusterIP || '—', (s.ports || []).join(', ')]) },
                    })}>
                    <HBars items={svcTypes} color={PALETTE.teal} dk={dk} />
                  </MetricTile>

                  <MetricTile dk={dk}
                    value={hist?.current?.cpuPct != null ? `${hist.current.cpuPct}%` : `${k8s.nodes.reduce((a, n) => a + parseCpu(n.capacity?.cpu), 0)}`}
                    caption={hist?.current?.cpuPct != null ? 'CPU in use across fleet' : 'CPU cores in fleet'}
                    axisLeft={hist?.current?.cpuPct != null
                      ? `${(hist.current.cpuUsedCores || 0).toFixed(1)} of ${hist.current.cpuCapacityCores} cores`
                      : 'cores per node'}
                    axisRight={hist ? histWindow.split(' (')[0] : ''}
                    onClick={hist?.series?.cpuPct?.length ? () => setDetail({
                      title: 'CPU utilisation', subtitle: `Share of fleet CPU in use · ${histWindow}`,
                      kind: 'area', data: histChart('cpuPct', 'CPU %'), series: ['CPU %'], xKey: 'label',
                      unit: 'Percent of allocatable CPU, from container CPU rate over 5m windows.',
                      stats: [
                        { label: 'Now', value: `${hist.current.cpuPct}%` },
                        { label: 'Peak', value: `${Math.max(...hist.series.cpuPct.map((x) => x.v))}%`, tone: STATUS.warn },
                        { label: 'Cores used', value: (hist.current.cpuUsedCores || 0).toFixed(2) },
                        { label: 'Cores total', value: num(hist.current.cpuCapacityCores) },
                      ],
                      table: histTable('cpuPct', 'CPU %'),
                    }) : () => setDetail({
                      title: 'CPU capacity', subtitle: 'Cores each node advertises to the scheduler',
                      kind: 'bar', data: k8s.nodes.map((n) => ({ name: n.name, value: parseCpu(n.capacity?.cpu) })), xKey: 'name',
                      unit: 'Capacity only — Prometheus history is unavailable, so live utilisation cannot be shown.',
                      stats: [
                        { label: 'Total cores', value: num(k8s.nodes.reduce((a, n) => a + parseCpu(n.capacity?.cpu), 0)) },
                        { label: 'Nodes', value: num(k8s.nodes.length) },
                      ],
                      table: { title: 'Nodes', columns: ['Node', 'Capacity', 'Allocatable'],
                        rows: k8s.nodes.map((n) => [n.name, parseCpu(n.capacity?.cpu), parseCpu(n.allocatable?.cpu)]) },
                    })}>
                    {hist?.series?.cpuPct?.length
                      ? <GradientLine data={hist.series.cpuPct.map((x) => ({ v: x.v }))} color={PALETTE.indigo} dk={dk} />
                      : <VBars data={k8s.nodes.map((n) => parseCpu(n.capacity?.cpu))} labels={k8s.nodes.map((n) => n.name)} color={PALETTE.indigo} dk={dk} />}
                  </MetricTile>

                  <MetricTile dk={dk}
                    value={hist?.current?.memPct != null ? `${hist.current.memPct}%` : `${Math.round(k8s.nodes.reduce((a, n) => a + parseMemGi(n.capacity?.memory), 0))} Gi`}
                    caption={hist?.current?.memPct != null ? 'Memory in use across fleet' : 'Memory in fleet'}
                    axisLeft={hist?.current?.memPct != null
                      ? `${(hist.current.memUsedBytes / 1073741824).toFixed(1)} of ${Math.round(hist.current.memCapacityBytes / 1073741824)} Gi`
                      : 'Gi per node'}
                    axisRight={hist ? histWindow.split(' (')[0] : ''}
                    onClick={hist?.series?.memPct?.length ? () => setDetail({
                      title: 'Memory utilisation', subtitle: `Share of fleet memory in use · ${histWindow}`,
                      kind: 'area', data: histChart('memPct', 'Memory %'), series: ['Memory %'], xKey: 'label',
                      unit: 'Percent of allocatable memory, from container working-set bytes.',
                      stats: [
                        { label: 'Now', value: `${hist.current.memPct}%` },
                        { label: 'Peak', value: `${Math.max(...hist.series.memPct.map((x) => x.v))}%`, tone: STATUS.warn },
                        { label: 'In use', value: `${(hist.current.memUsedBytes / 1073741824).toFixed(1)} Gi` },
                        { label: 'Total', value: `${Math.round(hist.current.memCapacityBytes / 1073741824)} Gi` },
                      ],
                      table: histTable('memPct', 'Memory %'),
                    }) : () => setDetail({
                      title: 'Memory capacity', subtitle: 'Memory each node advertises to the scheduler',
                      kind: 'bar', data: k8s.nodes.map((n) => ({ name: n.name, value: parseMemGi(n.capacity?.memory) })), xKey: 'name',
                      unit: 'Capacity only — Prometheus history is unavailable, so live utilisation cannot be shown.',
                      stats: [
                        { label: 'Total', value: `${Math.round(k8s.nodes.reduce((a, n) => a + parseMemGi(n.capacity?.memory), 0))} Gi` },
                        { label: 'Nodes', value: num(k8s.nodes.length) },
                      ],
                      table: { title: 'Nodes', columns: ['Node', 'Capacity (Gi)', 'Allocatable (Gi)'],
                        rows: k8s.nodes.map((n) => [n.name, parseMemGi(n.capacity?.memory), parseMemGi(n.allocatable?.memory)]) },
                    })}>
                    {hist?.series?.memPct?.length
                      ? <GradientLine data={hist.series.memPct.map((x) => ({ v: x.v }))} color={PALETTE.blue} dk={dk} />
                      : <VBars data={k8s.nodes.map((n) => parseMemGi(n.capacity?.memory))} labels={k8s.nodes.map((n) => n.name)} color={PALETTE.blue} dk={dk} />}
                  </MetricTile>
                </div>

                {/* Nodes list */}
                <div className="px-6 py-6">
                  <h3 className={`text-[11px] uppercase tracking-[0.07em] mb-4 ${muted}`}>Nodes · click to inspect</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px]">
                      <thead>
                        <tr className={`text-[10.5px] uppercase tracking-wide ${faint}`}>
                          <th className="text-left font-medium pb-2">Node</th>
                          <th className="text-left font-medium pb-2">Status</th>
                          <th className="text-left font-medium pb-2">Roles</th>
                          <th className="text-right font-medium pb-2">Pods</th>
                          <th className="text-right font-medium pb-2">CPU</th>
                          <th className="text-right font-medium pb-2">Memory</th>
                          <th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${divide}`}>
                        {k8s.nodes.map((n) => {
                          const ready = n.status === 'Ready';
                          return (
                            <tr key={n.name} onClick={() => setDrill({ type: 'node', key: n.name })}
                              className={`cursor-pointer ${dk ? 'hover:bg-[#161616]' : 'hover:bg-gray-50'}`}>
                              <td className={`py-2.5 text-[12.5px] ${h2}`}>{n.name}</td>
                              <td className="py-2.5">
                                <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: ready ? '#16a34a' : '#dc2626' }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: ready ? '#16a34a' : '#dc2626' }} />{n.status}
                                </span>
                              </td>
                              <td className={`py-2.5 text-[12px] ${muted}`}>{(n.roles || []).join(', ')}</td>
                              <td className={`py-2.5 text-[12px] text-right tabular-nums ${muted}`}>{n.pod_count ?? '—'}{n.capacity?.pods ? ` / ${n.capacity.pods}` : ''}</td>
                              <td className={`py-2.5 text-[12px] text-right tabular-nums ${muted}`}>{parseCpu(n.capacity?.cpu) || '—'}</td>
                              <td className={`py-2.5 text-[12px] text-right tabular-nums ${muted}`}>{parseMemGi(n.capacity?.memory) ? `${parseMemGi(n.capacity.memory)} Gi` : '—'}</td>
                              <td className="py-2.5 text-right"><ChevronRight size={14} className={faint} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Drill-down */}
                {drill && drillData && (
                  <div className={`${card} p-5 mt-2`}>
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2.5">
                        <button onClick={() => setDrill(null)} className={`p-1.5 rounded-md ${muted} ${dk ? 'hover:bg-[#1e1e1e]' : 'hover:bg-gray-100'}`}><ArrowLeft size={15} /></button>
                        <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: `${PALETTE.indigo}1a`, color: PALETTE.indigo }}>
                          {drill.type === 'node' ? <Server size={14} /> : <Layers size={14} />}
                        </span>
                        <div>
                          <h3 className={`text-[14px] font-semibold ${h1}`}>{drill.key}</h3>
                          <p className={`text-[11.5px] ${faint}`}>{drill.type === 'node' ? 'Node' : 'Namespace'} · {drillData.pods.length} pods · {drillData.restarts} restarts</p>
                        </div>
                      </div>
                      {drill.type === 'node' && drillData.node && (
                        <div className={`text-[11.5px] text-right ${muted}`}>
                          <div>{drillData.node.internal_ip}</div>
                          <div className={faint}>{drillData.node.node_info?.os_image || ''}</div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div>
                        <h4 className={`text-[10.5px] uppercase tracking-[0.07em] mb-3 ${muted}`}>Pods by phase</h4>
                        <HBars items={drillData.phaseItems} color={PALETTE.teal} height={100} dk={dk} />
                        <div className={`mt-2 space-y-1 text-[11.5px] ${muted}`}>
                          {drillData.phaseItems.map((p) => (
                            <div key={p.name} className="flex justify-between"><span>{p.name}</span><span className="tabular-nums">{p.value}</span></div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className={`text-[10.5px] uppercase tracking-[0.07em] mb-3 ${muted}`}>
                          {drill.type === 'namespace' ? 'Workloads' : 'Capacity'}
                        </h4>
                        {drill.type === 'namespace' ? (
                          drillData.workloads.length === 0
                            ? <p className={`text-[12px] ${faint}`}>No deployments or statefulsets</p>
                            : <div className="space-y-1.5 max-h-[150px] overflow-y-auto no-scrollbar">
                                {drillData.workloads.map((w, i) => {
                                  const [r, d] = parseReady(w.replicas);
                                  return (
                                    <div key={i} className="flex justify-between gap-2">
                                      <span className={`text-[12px] truncate ${muted}`}>{w.name}</span>
                                      <span className="text-[11.5px] tabular-nums shrink-0" style={{ color: (d === 0 || r >= d) ? '#16a34a' : '#d97706' }}>{w.replicas}</span>
                                    </div>
                                  );
                                })}
                              </div>
                        ) : (
                          <div className={`space-y-1.5 text-[12px] ${muted}`}>
                            <div className="flex justify-between"><span>CPU</span><span className="tabular-nums">{parseCpu(drillData.node?.capacity?.cpu) || '—'} cores</span></div>
                            <div className="flex justify-between"><span>Memory</span><span className="tabular-nums">{parseMemGi(drillData.node?.capacity?.memory) || '—'} Gi</span></div>
                            <div className="flex justify-between"><span>Pod capacity</span><span className="tabular-nums">{drillData.node?.capacity?.pods || '—'}</span></div>
                            <div className="flex justify-between"><span>Scheduled</span><span className="tabular-nums">{drillData.pods.length}</span></div>
                            <div className="flex justify-between"><span>Kernel</span><span className="tabular-nums text-[11px]">{drillData.node?.node_info?.kernel_version || '—'}</span></div>
                          </div>
                        )}
                      </div>
                      <div>
                        <h4 className={`text-[10.5px] uppercase tracking-[0.07em] mb-3 ${muted}`}>Pods ({drillData.pods.length})</h4>
                        <div className="space-y-1 max-h-[150px] overflow-y-auto no-scrollbar">
                          {drillData.pods.slice(0, 40).map((p, i) => (
                            <button key={i} onClick={() => navigate(`/dashboard/apps/${clusterId}/pod/${p.namespace}/${p.name}`)}
                              className="w-full flex items-center justify-between gap-2 text-left">
                              <span className={`text-[12px] truncate ${muted}`}>{p.name}</span>
                              <span className="text-[11px] shrink-0" style={{ color: p.status === 'Running' ? '#16a34a' : p.status === 'Pending' ? '#d97706' : '#dc2626' }}>{p.status}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Saved widgets */}
        {customWidgets.length > 0 && (
          <div className="pt-8">
            <h2 className={`text-[11px] uppercase tracking-[0.07em] mb-4 ${muted}`}>Saved widgets</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {customWidgets.map((w) => (
                <div key={w.id} className={`${card} p-4`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <h3 className={`text-[13px] font-semibold truncate ${h2}`}>{w.title}</h3>
                      {w.prompt && <p className={`text-[11.5px] truncate ${faint}`}>{w.prompt}</p>}
                    </div>
                    <button onClick={() => removeWidget(w.id)} className={`p-1.5 rounded shrink-0 ${dk ? 'text-gray-600 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}><Trash2 size={13} /></button>
                  </div>
                  <TrendsWidget spec={w} sources={sources} theme={theme} height={200} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {detail && <TrendDetail detail={detail} onClose={() => setDetail(null)} dk={dk} />}
    </div>
  );
};

export default Trends;

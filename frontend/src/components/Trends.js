import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
  backendApi, generateNlpWidget, getCustomWidgets, saveCustomWidget, deleteCustomWidget,
  getClusters, getNodes, getResources, getClusterHistory, getFleetOverview,
} from '../services/api';
import {
  RefreshCw, Sparkles, Wand2, Plus, Trash2, Loader2, X, ChevronRight, ArrowLeft,
  Flag, AlertTriangle, Layers, Boxes, Server, Download, Calendar,
} from 'lucide-react';
import TrendsWidget from './TrendsWidget';
import FleetDashboard from './FleetDashboard';
import ExecutiveDashboard from './ExecutiveDashboard';
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

/**
 * Last-seen fleet payload, per time range. A dashboard that already showed you
 * these numbers a minute ago should not go blank while it re-reads the estate.
 */
const FLEET_SNAP_KEY = 'aiops-fleet-snapshot';
const FLEET_SNAP_MAX_AGE_MS = 15 * 60 * 1000;
const readFleetSnapshot = (hours) => {
  try {
    const all = JSON.parse(localStorage.getItem(FLEET_SNAP_KEY) || '{}');
    const hit = all[String(hours)];
    if (!hit || Date.now() - hit.at > FLEET_SNAP_MAX_AGE_MS) return null;
    return hit.value;
  } catch { return null; }
};
const writeFleetSnapshot = (hours, value) => {
  try {
    const all = JSON.parse(localStorage.getItem(FLEET_SNAP_KEY) || '{}');
    all[String(hours)] = { at: Date.now(), value };
    localStorage.setItem(FLEET_SNAP_KEY, JSON.stringify(all));
  } catch { /* quota or private mode — the dashboard still works, just colder */ }
};

const Trends = () => {
  const { theme } = useTheme();
  const dk = theme === 'dark';
  const navigate = useNavigate();

  const [tab, setTab] = useState('fleet');
  const [detail, setDetail] = useState(null);
  const [range, setRange] = useState('30D');
  const [clusters, setClusters] = useState([]);
  const [clusterId, setClusterId] = useState('');
  const hours = useMemo(() => RANGES.find((r) => r[0] === range)?.[1] || 720, [range]);

  // ── fleet (every cluster, one call) ──────────────────────────────────
  // Replaces the per-cluster dropdown: the dashboard describes the whole
  // estate, and each row carries its cluster so views can group by it.
  // The rollup reads every cluster, so a cold call takes seconds. Keep the last
  // payload in the browser and paint it immediately on arrival, then refresh
  // behind what is already on screen — nobody should watch a spinner to see
  // numbers we already had.
  const [fleet, setFleet] = useState(() => readFleetSnapshot(hours));
  const [fleetLoading, setFleetLoading] = useState(() => !readFleetSnapshot(hours));
  const [fleetStale, setFleetStale] = useState(false);
  const [fleetError, setFleetError] = useState(null);
  const fetchFleet = useCallback(async (refresh = false) => {
    const cached = readFleetSnapshot(hours);
    if (cached) { setFleet(cached); setFleetLoading(false); setFleetStale(true); }
    else { setFleetLoading(true); }
    setFleetError(null);
    try {
      const r = await getFleetOverview(hours, refresh);
      if (r?.success) { setFleet(r); writeFleetSnapshot(hours, r); }
      else if (!cached) setFleetError(r?.error || 'Could not load the fleet.');
    } catch (e) {
      if (!cached) setFleetError(e.message || 'Could not load the fleet.');
    } finally { setFleetLoading(false); setFleetStale(false); }
  }, [hours]);
  useEffect(() => { fetchFleet(); }, [fetchFleet]);

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
            <p className={`text-[13px] mt-1 ${muted}`}>
              Every connected cluster, in one view
              {fleet?.clusters && (
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10.5px] align-middle ${dk ? 'bg-[#1e1e1e] text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                  {fleet.clusters.reachable} of {fleet.clusters.total} cluster{fleet.clusters.total === 1 ? '' : 's'}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border ${dk ? 'bg-[#131313] border-[#232323]' : 'bg-white border-gray-200'}`}>
              <Calendar size={13} className={faint} />
              {RANGES.map(([l]) => (
                <button key={l} onClick={() => setRange(l)}
                  className={`px-2 py-0.5 rounded text-[12px] font-medium ${range === l ? (dk ? 'bg-[#232323] text-gray-100' : 'bg-gray-100 text-gray-900') : muted}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => { fetchFleet(true); fetchAlerts(); }}
              className={`p-2 rounded-lg border ${dk ? 'bg-[#131313] border-[#232323] text-gray-400' : 'bg-white border-gray-200 text-gray-500'}`}>
              <RefreshCw size={14} className={(fleetLoading || fleetStale || loadingAlerts) ? 'animate-spin' : ''} />
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
          {[['fleet', 'Fleet Operations'], ['executive', 'Executive']].map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setDrill(null); }}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${tab === id
                ? (dk ? 'border-gray-100 text-gray-100' : 'border-gray-900 text-gray-900')
                : `border-transparent ${muted}`}`}>{label}</button>
          ))}
        </div>

        {/* ── FLEET OPERATIONS ── */}
        {tab === 'fleet' && (
          <div className="mt-6">
            {fleetError ? (
              <div className={`${card} px-6 py-10 text-center`}>
                <p className={`text-[13px] ${muted}`}>{fleetError}</p>
                <button onClick={() => fetchFleet(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
                  style={{ background: PALETTE.indigo }}>
                  <RefreshCw size={13} /> Try again
                </button>
              </div>
            ) : fleetLoading && !fleet ? (
              <div className="py-20 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" style={{ color: PALETTE.indigo }} />
                <span className={`text-[13px] ${muted}`}>Reading every cluster…</span>
              </div>
            ) : (
              <FleetDashboard fleet={fleet} dk={dk} hours={hours} />
            )}
          </div>
        )}

        {/* ── EXECUTIVE ── */}
        {tab === 'executive' && (
          <div className="mt-6">
            {fleetLoading && !fleet ? (
              <div className="py-20 flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" style={{ color: PALETTE.indigo }} />
                <span className={`text-[13px] ${muted}`}>Reading every cluster…</span>
              </div>
            ) : (
              <ExecutiveDashboard fleet={fleet} dk={dk} onGoToTab={setTab} />
            )}
          </div>
        )}

        {/* Saved widgets */}
        {tab === 'fleet' && customWidgets.length > 0 && (
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

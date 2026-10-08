"""
Alert Clustering — groups alerts that belong to the same real-world incident.

An incident is a set of alerts that fired close together, on related topology,
about related things. Those are three independent questions, so the distance
between two alerts is a weighted blend of three normalised sub-distances:

    distance = w_time * time + w_topo * topology + w_sem * semantics

Clustering is **average-linkage agglomerative**, not DBSCAN. DBSCAN is
density-based and transitive: if A is near B and B is near C, all three land in
one cluster even when A and C are unrelated. On alert data that chains every
alert in a busy namespace into a single catch-all group. Average linkage
compares a candidate against the *mean* distance to a whole cluster, so an
unrelated alert cannot be dragged in by a single intermediate neighbour.

⚠ The historical bug this replaces: time distance was normalised by the maximum
span **present in the data**. Over a 24h window that made two alerts an hour
apart score 3600/86400 = 0.04 — effectively simultaneous — so the time term
collapsed to noise and topology alone decided everything. Time is now scaled
against an absolute window (CORRELATION_TIME_SCALE_MIN), so "an hour apart"
means the same thing regardless of how much history was fetched.
"""

import logging
import os
import re
from datetime import datetime, timezone
from collections import defaultdict

import numpy as np
from sklearn.cluster import AgglomerativeClustering

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Absolute time scale: alerts this many minutes apart are maximally distant in
# time. Everything closer scales linearly toward 0.
TIME_SCALE_MIN = float(os.getenv("CORRELATION_TIME_SCALE_MIN", "20"))

TIME_WEIGHT = 0.40
TOPO_WEIGHT = 0.35
SEM_WEIGHT = 0.25

# Merge threshold on the blended distance. Lower = more, tighter incidents.
DISTANCE_THRESHOLD = float(os.getenv("CORRELATION_DISTANCE_THRESHOLD", "0.45"))

# Alerts whose names share a subsystem are related even on different pods.
# Each family is a set of regexes matched against the alert name.
ALERT_FAMILIES = {
    "control-plane": [r"^etcd", r"KubeController", r"KubeScheduler", r"KubeAPI", r"KubeProxy"],
    "node": [r"^Node", r"^KubeNode", r"InstanceDown", r"ClockNotSync"],
    "workload": [r"KubePod", r"KubeDeployment", r"KubeStatefulSet", r"KubeDaemonSet",
                 r"KubeJob", r"CrashLoop", r"ContainerWaiting"],
    "resource": [r"CPUThrottling", r"Memory", r"OOM", r"CPU", r"Throttl"],
    "storage": [r"PVC", r"PersistentVolume", r"Disk", r"Volume"],
    "network": [r"Network", r"Latency", r"Dial", r"Timeout", r"Unreachable", r"DNS"],
    "observability": [r"Prometheus", r"Alertmanager", r"Watchdog", r"InfoInhibitor",
                      r"TargetDown", r"ScrapeError"],
}

_WORD_RE = re.compile(r"[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|\d+")


def _parse_ts(ts_str):
    """Parse an ISO timestamp string to epoch seconds."""
    if isinstance(ts_str, (int, float)):
        return float(ts_str)
    try:
        dt = datetime.fromisoformat(str(ts_str).replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return 0.0


def _alert_time(alert):
    """Prefer startsAt (when the condition began) over receivedAt (when we saw it)."""
    for field in ("startsAt", "receivedAt", "createdAt"):
        t = _parse_ts(alert.get(field, 0))
        if t:
            return t
    return 0.0


def _families(name):
    """Which subsystem families an alert name belongs to."""
    out = set()
    for family, patterns in ALERT_FAMILIES.items():
        for p in patterns:
            if re.search(p, name or "", re.IGNORECASE):
                out.add(family)
                break
    return out


def _tokens(name):
    """CamelCase-aware tokens, for comparing alert names that share wording."""
    return {t.lower() for t in _WORD_RE.findall(name or "") if len(t) > 2}


# ---------------------------------------------------------------------------
# Sub-distances
# ---------------------------------------------------------------------------

def _time_distance_matrix(alerts):
    """
    |t_i - t_j| scaled against an ABSOLUTE window, not the data's own span.
    Alerts >= TIME_SCALE_MIN apart are maximally distant.
    """
    times = np.array([_alert_time(a) for a in alerts], dtype=float)

    # An alert with no usable timestamp must not read as "simultaneous with
    # everything"; park it at maximum distance from the rest instead.
    missing = times <= 0
    diff = np.abs(times[:, None] - times[None, :]) / (TIME_SCALE_MIN * 60.0)
    np.clip(diff, 0.0, 1.0, out=diff)
    if missing.any():
        diff[missing, :] = 1.0
        diff[:, missing] = 1.0
        np.fill_diagonal(diff, 0.0)
    return diff


def _topology_distance_matrix(alerts, adjacency):
    """
    How far apart two alerts are in the infrastructure.

      same pod                          -> 0.0
      same workload (pod name prefix)   -> 0.15
      same namespace + connected        -> 0.25
      same namespace                    -> 0.45
      same node, different namespace    -> 0.55
      connected across namespaces       -> 0.7
      otherwise                         -> 1.0
    """
    n = len(alerts)
    dist = np.ones((n, n))

    pods = [(a.get("pod") or "").strip() for a in alerts]
    nss = [(a.get("namespace") or "").strip() for a in alerts]
    nodes = [(a.get("node") or "").strip() for a in alerts]
    owners = [_workload_of(p) for p in pods]

    # "N/A" is a placeholder the alert pipeline writes, not a real pod.
    pods = ["" if p.upper() in ("N/A", "NONE", "UNKNOWN") else p for p in pods]

    for i in range(n):
        for j in range(i, n):
            d = _pair_topology(
                pods[i], pods[j], nss[i], nss[j], nodes[i], nodes[j],
                owners[i], owners[j], adjacency,
            )
            dist[i, j] = d
            dist[j, i] = d

    np.fill_diagonal(dist, 0.0)
    return dist


def _pair_topology(pod_a, pod_b, ns_a, ns_b, node_a, node_b, own_a, own_b, adjacency):
    if pod_a and pod_a == pod_b:
        return 0.0
    if own_a and own_a == own_b and ns_a == ns_b:
        return 0.15
    if ns_a and ns_a == ns_b:
        return 0.25 if _are_connected(pod_a, pod_b, adjacency) else 0.45
    if node_a and node_a == node_b:
        return 0.55
    if _are_connected(pod_a, pod_b, adjacency):
        return 0.7
    return 1.0


def _workload_of(pod_name):
    """
    Strip the ReplicaSet/pod suffixes so two pods of one Deployment match:
    'prometheus-kube-state-metrics-fcbc55d55-xsszv' -> 'prometheus-kube-state-metrics'.
    """
    if not pod_name:
        return ""
    parts = pod_name.split("-")
    while parts and re.fullmatch(r"[a-z0-9]{5,10}", parts[-1]):
        parts.pop()
    return "-".join(parts) if parts else pod_name


def _are_connected(name_a, name_b, adjacency):
    """Direct neighbours in the service map."""
    if not name_a or not name_b or not adjacency:
        return False
    return name_b in adjacency.get(name_a, set()) or name_a in adjacency.get(name_b, set())


def _semantic_distance_matrix(alerts):
    """
    How related two alerts are *as statements*, independent of where they fired.

      identical name            -> 0.0
      shared subsystem family   -> 0.35, less when wording also overlaps
      shared wording only       -> 0.6
      unrelated                 -> 1.0
    """
    n = len(alerts)
    names = [(a.get("alertname") or "") for a in alerts]
    fams = [_families(x) for x in names]
    toks = [_tokens(x) for x in names]

    dist = np.ones((n, n))
    for i in range(n):
        for j in range(i, n):
            if names[i] and names[i] == names[j]:
                d = 0.0
            else:
                shared_fam = bool(fams[i] & fams[j])
                union = toks[i] | toks[j]
                jac = len(toks[i] & toks[j]) / len(union) if union else 0.0
                if shared_fam:
                    d = 0.35 * (1.0 - jac)
                elif jac > 0:
                    d = 1.0 - 0.4 * jac
                else:
                    d = 1.0
            dist[i, j] = d
            dist[j, i] = d

    np.fill_diagonal(dist, 0.0)
    return dist


# ---------------------------------------------------------------------------
# Build adjacency from service-map links
# ---------------------------------------------------------------------------

def build_adjacency(service_map):
    """
    {node_name: {neighbour_names}} from service_map {nodes, links}.
    Link endpoints may be given as ids or as names, so index both.
    """
    adj = defaultdict(set)
    nodes_by_id = {}

    for node in (service_map or {}).get("nodes", []):
        nid = node.get("id", "")
        name = node.get("name", nid)
        if nid:
            nodes_by_id[nid] = name

    for link in (service_map or {}).get("links", []):
        src = link.get("source", "")
        dst = link.get("target", "")
        if isinstance(src, dict):
            src = src.get("id", "")
        if isinstance(dst, dict):
            dst = dst.get("id", "")
        src_name = nodes_by_id.get(src, src)
        dst_name = nodes_by_id.get(dst, dst)
        if src_name and dst_name:
            adj[src_name].add(dst_name)
            adj[dst_name].add(src_name)

    return dict(adj)


# ---------------------------------------------------------------------------
# Main clustering function
# ---------------------------------------------------------------------------

def _signature(alert):
    """What makes two alert records the same ongoing condition."""
    return (
        (alert.get("alertname") or "").strip(),
        (alert.get("namespace") or "").strip(),
        (alert.get("pod") or "").strip(),
        (alert.get("node") or "").strip(),
    )


def deduplicate(alerts):
    """
    Collapse re-notifications of one condition into a single representative.

    Prometheus re-sends every firing alert on each evaluation interval, so one
    ongoing problem arrives as dozens of identical records minutes apart. Left
    as-is they cluster into one *incident per repeat* — which is precisely why
    the same control-plane failure showed up five times. Here each distinct
    (alertname, namespace, pod, node) becomes one representative carrying
    `occurrences`, `first_seen` and `last_seen`; the raw records are kept on
    `_raw` so evidence and counts downstream stay complete.

    The representative is the LATEST record, so its status reflects whether the
    condition is still firing rather than how it started.
    """
    by_sig = defaultdict(list)
    for a in alerts:
        by_sig[_signature(a)].append(a)

    reps = []
    for _sig, group in by_sig.items():
        group.sort(key=_alert_time)
        rep = dict(group[-1])
        rep["occurrences"] = len(group)

        # first_seen and last_seen measure DIFFERENT clocks and must be read
        # from different fields. `startsAt` is when Prometheus says the
        # condition began — for a long-standing problem that can be months ago.
        # `receivedAt` is when we last heard about it. Taking both from
        # startsAt (as this did) collapsed the window to the few seconds between
        # the original alerts, so a problem firing since June reported a
        # 30-second duration.
        begins = [t for t in (_parse_ts(a.get("startsAt") or a.get("receivedAt")) for a in group) if t]
        heard = [t for t in (_parse_ts(a.get("receivedAt") or a.get("startsAt")) for a in group) if t]

        rep["first_seen"] = (
            datetime.fromtimestamp(min(begins), tz=timezone.utc).isoformat() if begins else None
        )
        rep["last_seen"] = (
            datetime.fromtimestamp(max(heard), tz=timezone.utc).isoformat() if heard else None
        )
        # Cluster on when the condition BEGAN. Using the latest repeat would let
        # two long-running problems look simultaneous purely because both are
        # still being re-sent now.
        if begins:
            rep["startsAt"] = rep["first_seen"]
        rep["_raw"] = group
        # Still firing if any record in the window says so.
        if any((a.get("status") or "") == "firing" for a in group):
            rep["status"] = "firing"
        reps.append(rep)

    log.info("Deduplicated %d alert records into %d distinct conditions", len(alerts), len(reps))
    return reps


def cluster_alerts(alerts, service_map=None, time_window_min=None,
                   eps=None, min_samples=None):
    """
    Cluster alerts into incident groups.

    `eps` is accepted as the merge threshold for backwards compatibility with
    the previous DBSCAN signature; `min_samples` is ignored (average linkage has
    no density parameter) and kept only so existing callers do not break.

    Returns a list of cluster dicts, largest first.
    """
    if not alerts:
        return []

    # One ongoing condition, one data point — before anything is measured.
    alerts = deduplicate(alerts)

    if len(alerts) == 1:
        return [_make_cluster(0, alerts)]

    adjacency = build_adjacency(service_map) if service_map else {}

    time_dist = _time_distance_matrix(alerts)
    topo_dist = _topology_distance_matrix(alerts, adjacency)
    sem_dist = _semantic_distance_matrix(alerts)

    composite = (
        TIME_WEIGHT * time_dist
        + TOPO_WEIGHT * topo_dist
        + SEM_WEIGHT * sem_dist
    )
    # Floating-point asymmetry upsets sklearn's precomputed metric check.
    composite = (composite + composite.T) / 2.0
    np.fill_diagonal(composite, 0.0)

    threshold = eps or DISTANCE_THRESHOLD
    model = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=threshold,
        metric="precomputed",
        linkage="average",
    )
    labels = model.fit_predict(composite)

    groups = defaultdict(list)
    for idx, label in enumerate(labels):
        groups[int(label)].append(alerts[idx])

    merged = _merge_same_condition(list(groups.values()))

    clusters = []
    for cid, group_alerts in enumerate(sorted(merged, key=len, reverse=True)):
        clusters.append(_make_cluster(cid, group_alerts))

    log.info(
        "Clustered %d alerts into %d groups (threshold=%.2f, time_scale=%.0fmin)",
        len(alerts), len(clusters), threshold, TIME_SCALE_MIN,
    )
    return clusters


def _merge_same_condition(groups):
    """
    Merge clusters that describe the same condition in the same place.

    Time is a real signal, but it must not split one incident into several just
    because instances began hours apart — 'NodeClockNotSynchronising in
    monitoring' is one incident whether two nodes drifted together or a day
    apart. So after clustering, groups with an identical alert-name set and
    overlapping namespaces are folded together.

    Deliberately conservative: it requires the name sets to be EQUAL, not merely
    to intersect, so a broad incident never swallows a narrower unrelated one.
    """
    signatures = []
    for g in groups:
        names = frozenset(a.get("alertname", "") for a in g if a.get("alertname"))
        nss = frozenset(a.get("namespace", "") for a in g if a.get("namespace"))
        signatures.append((names, nss))

    out = []
    out_sigs = []
    for g, (names, nss) in zip(groups, signatures):
        for i, (onames, onss) in enumerate(out_sigs):
            if names and names == onames and (not nss or not onss or nss & onss):
                out[i].extend(g)
                out_sigs[i] = (onames, onss | nss)
                break
        else:
            out.append(list(g))
            out_sigs.append((names, nss))

    if len(out) != len(groups):
        log.info("Merged %d time-split groups into %d incidents", len(groups), len(out))
    return out


def _make_cluster(cid, alerts):
    """Build a cluster summary dict from a list of alert docs."""
    times = [t for t in (_alert_time(a) for a in alerts) if t]
    pods = sorted({a.get("pod", "") for a in alerts
                   if a.get("pod") and str(a.get("pod")).upper() != "N/A"})
    namespaces = sorted({a.get("namespace", "") for a in alerts if a.get("namespace")})
    nodes = sorted({a.get("node", "") for a in alerts if a.get("node")})
    alert_names = sorted({a.get("alertname", "") for a in alerts if a.get("alertname")})
    workloads = sorted({w for w in (_workload_of(a.get("pod", "")) for a in alerts) if w})

    sev_counts = defaultdict(int)
    status_counts = defaultdict(int)
    for a in alerts:
        sev_counts[a.get("severity", "unknown")] += 1
        status_counts[a.get("status", "unknown")] += 1

    # Distinct conditions vs total notifications: an incident of 6 conditions
    # that re-fired 40 times each is one incident, and both numbers matter.
    occurrences = sum(int(a.get("occurrences", 1) or 1) for a in alerts)

    # Span the FULL life of every condition, not just the representatives.
    starts = [_parse_ts(a["first_seen"]) for a in alerts if a.get("first_seen")]
    ends = [_parse_ts(a["last_seen"]) for a in alerts if a.get("last_seen")]
    times = times + [t for t in starts + ends if t]

    min_t = min(times) if times else 0
    max_t = max(times) if times else 0

    # Which families this incident spans — useful for naming it downstream.
    families = sorted({f for n in alert_names for f in _families(n)})

    # `_raw` carried every original record so counts could be computed; emitting
    # it would send the whole alert set a second time inside the response.
    emitted = [{k: v for k, v in a.items() if k != "_raw"} for a in alerts]

    return {
        "cluster_id": cid,
        "alert_count": len(alerts),
        "condition_count": len(alerts),
        "occurrence_count": occurrences,
        "alerts": emitted,
        "time_range": {
            "start": datetime.fromtimestamp(min_t, tz=timezone.utc).isoformat() if min_t else None,
            "end": datetime.fromtimestamp(max_t, tz=timezone.utc).isoformat() if max_t else None,
            "duration_seconds": max_t - min_t if min_t and max_t else 0,
        },
        "namespaces": namespaces,
        "pods": pods,
        "nodes": nodes,
        "workloads": workloads,
        "alert_names": alert_names,
        "families": families,
        "severities": dict(sev_counts),
        "statuses": dict(status_counts),
    }

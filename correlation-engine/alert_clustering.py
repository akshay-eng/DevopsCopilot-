"""
Alert Clustering — groups alerts that fire close together in time
and share topological proximity (same namespace, connected pods).

Uses DBSCAN on a composite distance metric:
  distance = w_time * time_distance + w_topo * topology_distance

Alerts that land in the same cluster are likely related to one incident.
"""

import logging
from datetime import datetime, timezone
from collections import defaultdict

import numpy as np
from sklearn.cluster import DBSCAN

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TIME_WINDOW_MINUTES = 5       # default, overridden by env
TIME_WEIGHT = 0.6             # weight for temporal distance
TOPO_WEIGHT = 0.4             # weight for topological distance
DBSCAN_EPS = 0.35             # distance threshold for DBSCAN
DBSCAN_MIN_SAMPLES = 1        # min alerts to form a cluster (1 = no noise)


def _parse_ts(ts_str):
    """Parse an ISO timestamp string to epoch seconds."""
    if isinstance(ts_str, (int, float)):
        return float(ts_str)
    try:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Distance computation
# ---------------------------------------------------------------------------

def _time_distance_matrix(alerts):
    """
    NxN matrix where entry (i,j) = |t_i - t_j| normalised to [0,1]
    by dividing by the max time span in the set.
    """
    n = len(alerts)
    times = np.array([_parse_ts(a.get("receivedAt", 0)) for a in alerts])
    diff = np.abs(times[:, None] - times[None, :])
    max_diff = diff.max()
    if max_diff > 0:
        diff /= max_diff
    return diff


def _topology_distance_matrix(alerts, adjacency):
    """
    NxN matrix where entry (i,j) represents how "far apart" two alerts
    are in the service topology.

    Rules:
      - same pod                    → 0.0
      - same namespace, connected   → 0.2
      - same namespace, not connected → 0.5
      - different namespace, connected → 0.6
      - different namespace, not connected → 1.0
    """
    n = len(alerts)
    dist = np.ones((n, n))

    for i in range(n):
        for j in range(i, n):
            a, b = alerts[i], alerts[j]
            pod_a = a.get("pod", "") or ""
            pod_b = b.get("pod", "") or ""
            ns_a = a.get("namespace", "") or ""
            ns_b = b.get("namespace", "") or ""

            if pod_a and pod_a == pod_b:
                d = 0.0
            elif ns_a and ns_a == ns_b:
                # Check if pods are connected in the service map
                if _are_connected(pod_a, pod_b, adjacency):
                    d = 0.2
                else:
                    d = 0.5
            elif _are_connected(pod_a, pod_b, adjacency):
                d = 0.6
            else:
                d = 1.0

            dist[i, j] = d
            dist[j, i] = d

    return dist


def _are_connected(name_a, name_b, adjacency):
    """Check if two pod/service names are connected (direct neighbours)."""
    if not name_a or not name_b or not adjacency:
        return False
    # adjacency: {node_name: set_of_neighbour_names}
    neighbours_a = adjacency.get(name_a, set())
    neighbours_b = adjacency.get(name_b, set())
    return name_b in neighbours_a or name_a in neighbours_b


# ---------------------------------------------------------------------------
# Build adjacency from service-map links
# ---------------------------------------------------------------------------

def build_adjacency(service_map):
    """
    Build an adjacency dict from the service-map links.
    service_map = {nodes: [...], links: [{source, target, ...}]}
    Returns {node_name: {neighbour_names}}.
    """
    adj = defaultdict(set)
    nodes_by_id = {}

    for node in service_map.get("nodes", []):
        nid = node.get("id", "")
        name = node.get("name", nid)
        nodes_by_id[nid] = name

    for link in service_map.get("links", []):
        src = link.get("source", "")
        dst = link.get("target", "")
        src_name = nodes_by_id.get(src, src)
        dst_name = nodes_by_id.get(dst, dst)
        if src_name and dst_name:
            adj[src_name].add(dst_name)
            adj[dst_name].add(src_name)

    return dict(adj)


# ---------------------------------------------------------------------------
# Main clustering function
# ---------------------------------------------------------------------------

def cluster_alerts(alerts, service_map=None, time_window_min=None,
                   eps=None, min_samples=None):
    """
    Cluster alerts into incident groups.

    Parameters
    ----------
    alerts : list[dict]
        Alert documents from MongoDB.
    service_map : dict, optional
        {nodes: [...], links: [...]} from the network module.
    time_window_min : float, optional
        Override for TIME_WINDOW_MINUTES (unused directly, but informs eps).
    eps : float, optional
        DBSCAN eps parameter.
    min_samples : int, optional
        DBSCAN min_samples parameter.

    Returns
    -------
    list[dict]
        Each dict represents a cluster:
        {
            "cluster_id": int,
            "alerts": [alert_docs],
            "time_range": {"start": iso, "end": iso},
            "namespaces": [str],
            "pods": [str],
            "severities": {severity: count},
            "alert_names": [str],
        }
    """
    if not alerts:
        return []

    n = len(alerts)
    if n == 1:
        a = alerts[0]
        return [_make_cluster(0, [a])]

    # Build adjacency from service map
    adjacency = build_adjacency(service_map) if service_map else {}

    # Compute distance matrices
    time_dist = _time_distance_matrix(alerts)
    topo_dist = _topology_distance_matrix(alerts, adjacency)

    # Composite distance
    composite = TIME_WEIGHT * time_dist + TOPO_WEIGHT * topo_dist

    # Run DBSCAN
    _eps = eps or DBSCAN_EPS
    _min = min_samples or DBSCAN_MIN_SAMPLES
    db = DBSCAN(eps=_eps, min_samples=_min, metric="precomputed")
    labels = db.fit_predict(composite)

    # Group alerts by label
    groups = defaultdict(list)
    for idx, label in enumerate(labels):
        # DBSCAN labels noise as -1; treat each noise point as its own cluster
        key = label if label >= 0 else f"noise_{idx}"
        groups[key].append(alerts[idx])

    clusters = []
    for cid, (key, group_alerts) in enumerate(sorted(groups.items(), key=lambda x: len(x[1]), reverse=True)):
        clusters.append(_make_cluster(cid, group_alerts))

    log.info("Clustered %d alerts into %d groups", n, len(clusters))
    return clusters


def _make_cluster(cid, alerts):
    """Build a cluster summary dict from a list of alert docs."""
    times = [_parse_ts(a.get("receivedAt", 0)) for a in alerts]
    pods = list({a.get("pod", "") for a in alerts if a.get("pod")})
    namespaces = list({a.get("namespace", "") for a in alerts if a.get("namespace")})
    alert_names = list({a.get("alertname", "") for a in alerts if a.get("alertname")})

    sev_counts = defaultdict(int)
    for a in alerts:
        sev_counts[a.get("severity", "unknown")] += 1

    status_counts = defaultdict(int)
    for a in alerts:
        status_counts[a.get("status", "unknown")] += 1

    min_t = min(times) if times else 0
    max_t = max(times) if times else 0

    return {
        "cluster_id": cid,
        "alert_count": len(alerts),
        "alerts": alerts,
        "time_range": {
            "start": datetime.fromtimestamp(min_t, tz=timezone.utc).isoformat() if min_t else None,
            "end": datetime.fromtimestamp(max_t, tz=timezone.utc).isoformat() if max_t else None,
            "duration_seconds": max_t - min_t if min_t and max_t else 0,
        },
        "namespaces": namespaces,
        "pods": pods,
        "alert_names": alert_names,
        "severities": dict(sev_counts),
        "statuses": dict(status_counts),
    }

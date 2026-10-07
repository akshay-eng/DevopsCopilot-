"""
Graph Analysis — builds a service dependency graph from the network
service-map and uses a modified PageRank to rank which pod is the
most likely root cause of a correlated alert cluster.

Key insight: faults propagate *downstream* in a dependency graph.
If Pod A calls Pod B and Pod B is failing, Pod A's alerts are symptoms.
The root cause is the *most upstream* anomalous node.

Algorithm:
  1. Build directed graph from service-map links (caller → callee)
  2. For each pod in the alert cluster, set its "fault weight" based on:
     - anomaly score from Isolation Forest
     - temporal order (earlier alerts score higher)
     - severity weight
  3. Run reverse-PageRank (propagate blame upstream)
  4. Rank pods by final score → top pod is the root cause
"""

import logging
from collections import defaultdict

import networkx as nx

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Severity weights
# ---------------------------------------------------------------------------

SEVERITY_WEIGHT = {
    "critical": 1.0,
    "high": 0.8,
    "warning": 0.6,
    "medium": 0.5,
    "low": 0.3,
    "info": 0.1,
}

# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_dependency_graph(service_map):
    """
    Build a directed graph from the service-map.

    Nodes = services/pods
    Edges = caller → callee (source → target in the service-map links)

    Edge attributes include request count, error rate, avg latency.
    """
    G = nx.DiGraph()

    nodes_by_id = {}
    for node in service_map.get("nodes", []):
        nid = node.get("id", "")
        name = node.get("name", nid)
        ns = node.get("namespace", "")
        nodes_by_id[nid] = name
        G.add_node(name, namespace=ns, ip=node.get("ip", ""),
                   node_id=nid, **{k: v for k, v in node.items()
                                    if k not in ("id", "name", "namespace", "ip")})

    for link in service_map.get("links", []):
        src_id = link.get("source", "")
        dst_id = link.get("target", "")
        src = nodes_by_id.get(src_id, src_id)
        dst = nodes_by_id.get(dst_id, dst_id)

        if src and dst:
            G.add_edge(
                src, dst,
                request_count=link.get("requestCount", link.get("value", 0)),
                error_rate=link.get("errorRate", 0),
                avg_latency=link.get("avgLatency", 0),
                total_bytes=link.get("totalBytes", 0),
            )

    log.info("Built dependency graph: %d nodes, %d edges", G.number_of_nodes(), G.number_of_edges())
    return G


# ---------------------------------------------------------------------------
# Fault scoring
# ---------------------------------------------------------------------------

def _compute_fault_weights(cluster, anomaly_results):
    """
    Compute per-pod fault weights based on anomaly scores, temporal
    order, and severity.

    Returns {pod_or_service_name: weight}.
    """
    weights = defaultdict(float)
    alerts = cluster.get("alerts", [])

    if not alerts:
        return weights

    # Sort by time to determine temporal order
    def _ts(a):
        ts = a.get("receivedAt", "")
        if isinstance(ts, str):
            try:
                from datetime import datetime
                return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
            except Exception:
                return 0
        return float(ts) if ts else 0

    sorted_alerts = sorted(alerts, key=_ts)
    n = len(sorted_alerts)

    for rank, alert in enumerate(sorted_alerts):
        pod = alert.get("pod", "")
        svc = alert.get("service", "")
        name = pod or svc
        if not name:
            continue

        severity = alert.get("severity", "info").lower()
        sev_w = SEVERITY_WEIGHT.get(severity, 0.3)

        # Earlier alerts get higher temporal weight (linear decay)
        temporal_w = 1.0 - (rank / max(n, 1)) * 0.5  # range [0.5, 1.0]

        # Anomaly weight from ML analysis
        anomaly_w = 0.5  # default if no analysis
        if name in anomaly_results:
            anomaly_w = anomaly_results[name].get("overall_anomaly_score", 0.5)

        # Combined weight
        combined = 0.3 * sev_w + 0.3 * temporal_w + 0.4 * anomaly_w
        weights[name] = max(weights[name], combined)

    return dict(weights)


# ---------------------------------------------------------------------------
# Root cause ranking
# ---------------------------------------------------------------------------

def find_root_cause(cluster, service_map, anomaly_results=None):
    """
    Main entry point: given an alert cluster, the service-map graph,
    and per-pod anomaly results, determine the most likely root cause.

    Returns
    -------
    dict
        {
            "root_cause": {
                "pod": str,
                "score": float,
                "reasoning": str,
            },
            "causal_chain": [
                {"pod": str, "role": "root_cause"|"affected", "score": float},
                ...
            ],
            "graph_stats": {
                "nodes": int,
                "edges": int,
                "affected_pods": int,
            },
            "evidence": [str],
        }
    """
    if anomaly_results is None:
        anomaly_results = {}

    G = build_dependency_graph(service_map)
    fault_weights = _compute_fault_weights(cluster, anomaly_results)

    pods_in_cluster = set(cluster.get("pods", []))
    alert_names = cluster.get("alert_names", [])

    # If the graph is empty or has no overlap with alerted pods,
    # fall back to pure anomaly + temporal ranking
    graph_pods = set(G.nodes())
    overlap = pods_in_cluster & graph_pods

    if not overlap and not fault_weights:
        return _fallback_ranking(cluster, anomaly_results)

    # --- Modified PageRank ---
    # We want to find which node, when it fails, explains the most
    # downstream failures. So we use personalized PageRank where
    # the personalization vector is the fault weights.

    # Add alerted pods that aren't in the graph yet
    for pod in pods_in_cluster:
        if pod not in G:
            G.add_node(pod, namespace="", synthetic=True)

    # Build personalization vector
    personalization = {}
    for node in G.nodes():
        personalization[node] = fault_weights.get(node, 0.01)

    # Normalize
    total = sum(personalization.values())
    if total > 0:
        personalization = {k: v / total for k, v in personalization.items()}

    try:
        # Run PageRank on the REVERSED graph
        # (blame flows upstream: if A→B and B is failing, A gets blamed less)
        G_rev = G.reverse()
        pr_scores = nx.pagerank(
            G_rev,
            alpha=0.85,
            personalization=personalization,
            max_iter=100,
            tol=1e-6,
        )
    except Exception as e:
        log.warning("PageRank failed: %s, falling back", e)
        return _fallback_ranking(cluster, anomaly_results)

    # Combine PageRank with fault weights
    final_scores = {}
    for pod in pods_in_cluster | set(fault_weights.keys()):
        pr = pr_scores.get(pod, 0)
        fw = fault_weights.get(pod, 0)
        final_scores[pod] = 0.6 * pr + 0.4 * fw

    if not final_scores:
        return _fallback_ranking(cluster, anomaly_results)

    # Sort by score descending
    ranked = sorted(final_scores.items(), key=lambda x: x[1], reverse=True)

    root_pod, root_score = ranked[0]

    # Build causal chain
    causal_chain = []
    for pod, score in ranked:
        role = "root_cause" if pod == root_pod else "affected"
        causal_chain.append({
            "pod": pod,
            "role": role,
            "score": round(score, 4),
            "anomaly": anomaly_results.get(pod, {}).get("summary", "No analysis"),
        })

    # Build evidence list
    evidence = _build_evidence(root_pod, causal_chain, G, anomaly_results, cluster)

    # Determine downstream impact from root cause
    downstream = []
    if root_pod in G:
        downstream = list(nx.descendants(G, root_pod))

    # Serialize the graph for frontend visualization
    graph_nodes = []
    for node in G.nodes():
        nd = G.nodes[node]
        is_root = node == root_pod
        is_affected = node in pods_in_cluster
        graph_nodes.append({
            "id": node,
            "namespace": nd.get("namespace", _get_ns(node, G, cluster)),
            "is_root_cause": is_root,
            "is_affected": is_affected,
            "score": round(final_scores.get(node, 0), 4),
            "anomaly_score": round(anomaly_results.get(node, {}).get("overall_anomaly_score", 0), 4),
            "alert_count": sum(1 for a in cluster.get("alerts", []) if a.get("pod") == node),
            "severity": _max_severity(node, cluster),
        })

    graph_edges = []
    for src, dst, data in G.edges(data=True):
        graph_edges.append({
            "source": src,
            "target": dst,
            "request_count": data.get("request_count", 0),
            "error_rate": round(data.get("error_rate", 0), 4),
            "avg_latency": round(data.get("avg_latency", 0), 2),
            "total_bytes": data.get("total_bytes", 0),
        })

    return {
        "root_cause": {
            "pod": root_pod,
            "score": round(root_score, 4),
            "namespace": _get_ns(root_pod, G, cluster),
            "anomaly_summary": anomaly_results.get(root_pod, {}).get("summary", ""),
            "anomalous_metrics": anomaly_results.get(root_pod, {}).get("anomalous_metrics", []),
        },
        "causal_chain": causal_chain,
        "downstream_impact": downstream,
        "graph_stats": {
            "nodes": G.number_of_nodes(),
            "edges": G.number_of_edges(),
            "affected_pods": len(pods_in_cluster),
        },
        "evidence": evidence,
        "topology": {
            "nodes": graph_nodes,
            "edges": graph_edges,
        },
    }


def _fallback_ranking(cluster, anomaly_results):
    """Rank by anomaly score + severity when the graph can't help."""
    pods = cluster.get("pods", [])
    alerts = cluster.get("alerts", [])

    if not pods:
        # Use alert names as identifiers
        scores = {}
        for a in alerts:
            name = a.get("alertname", "unknown")
            sev = SEVERITY_WEIGHT.get(a.get("severity", "info").lower(), 0.3)
            scores[name] = max(scores.get(name, 0), sev)

        if not scores:
            return {
                "root_cause": {"pod": "unknown", "score": 0, "namespace": ""},
                "causal_chain": [],
                "downstream_impact": [],
                "graph_stats": {"nodes": 0, "edges": 0, "affected_pods": 0},
                "evidence": ["No pods or graph data available for analysis."],
            }

        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return {
            "root_cause": {"pod": ranked[0][0], "score": round(ranked[0][1], 4), "namespace": ""},
            "causal_chain": [{"pod": n, "role": "root_cause" if i == 0 else "affected",
                              "score": round(s, 4)} for i, (n, s) in enumerate(ranked)],
            "downstream_impact": [],
            "graph_stats": {"nodes": 0, "edges": 0, "affected_pods": len(pods)},
            "evidence": ["Ranking based on severity only (no service graph available)."],
        }

    # Rank pods by anomaly score
    scored = []
    for pod in pods:
        ar = anomaly_results.get(pod, {})
        score = ar.get("overall_anomaly_score", 0.5)
        scored.append((pod, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    root_pod = scored[0][0]

    return {
        "root_cause": {
            "pod": root_pod,
            "score": round(scored[0][1], 4),
            "namespace": "",
            "anomaly_summary": anomaly_results.get(root_pod, {}).get("summary", ""),
        },
        "causal_chain": [
            {"pod": p, "role": "root_cause" if p == root_pod else "affected",
             "score": round(s, 4)} for p, s in scored
        ],
        "downstream_impact": [],
        "graph_stats": {"nodes": 0, "edges": 0, "affected_pods": len(pods)},
        "evidence": ["Ranking based on anomaly scores (no service graph available)."],
    }


def _max_severity(pod, cluster):
    """Get the highest severity for a pod from alerts."""
    rank = {"critical": 5, "high": 4, "warning": 3, "medium": 2, "low": 1, "info": 0}
    best = "info"
    for a in cluster.get("alerts", []):
        if a.get("pod") == pod:
            sev = a.get("severity", "info").lower()
            if rank.get(sev, 0) > rank.get(best, 0):
                best = sev
    return best


def _get_ns(pod, G, cluster):
    """Get namespace for a pod from graph or cluster data."""
    if pod in G.nodes:
        ns = G.nodes[pod].get("namespace", "")
        if ns:
            return ns
    for a in cluster.get("alerts", []):
        if a.get("pod") == pod:
            return a.get("namespace", "")
    return ""


def _build_evidence(root_pod, causal_chain, G, anomaly_results, cluster):
    """Build human-readable evidence strings."""
    evidence = []

    # 1. Temporal evidence
    alerts = cluster.get("alerts", [])
    root_alerts = [a for a in alerts if a.get("pod") == root_pod]
    if root_alerts:
        first = root_alerts[0].get("receivedAt", "")
        evidence.append(f"First alert on {root_pod} at {first}")

    # 2. Graph evidence
    if root_pod in G:
        out_degree = G.out_degree(root_pod)
        in_degree = G.in_degree(root_pod)
        if out_degree > 0:
            callees = list(G.successors(root_pod))
            evidence.append(
                f"{root_pod} calls {out_degree} services: {', '.join(callees[:5])}"
            )
        if in_degree > 0:
            callers = list(G.predecessors(root_pod))
            evidence.append(
                f"{root_pod} is called by {in_degree} services: {', '.join(callers[:5])}"
            )

    # 3. Anomaly evidence
    ar = anomaly_results.get(root_pod, {})
    if ar.get("anomalous_metrics"):
        evidence.append(
            f"Anomalous metrics on {root_pod}: {', '.join(ar['anomalous_metrics'])}"
        )
    if ar.get("summary"):
        evidence.append(ar["summary"])

    # 4. Cascade evidence
    affected = [c for c in causal_chain if c["role"] == "affected"]
    if affected:
        evidence.append(
            f"Likely cascade to {len(affected)} other pods: "
            + ", ".join(c["pod"] for c in affected[:5])
        )

    return evidence

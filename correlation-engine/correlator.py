"""
Correlator — main orchestrator that ties together:
  1. Data fetching (alerts, metrics, service map)
  2. Alert clustering (DBSCAN)
  3. Anomaly detection (Isolation Forest + z-scores)
  4. Graph-based root cause analysis (PageRank)

Produces a final correlation report for a user/cluster.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from data_fetcher import (
    fetch_alerts,
    fetch_pod_metrics,
    fetch_service_map,
    fetch_network_traffic,
    fetch_network_flows,
)
from alert_clustering import cluster_alerts
from anomaly_detection import analyze_pod
from graph_analysis import find_root_cause

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_CLUSTERS_TO_ANALYZE = 10
MAX_PODS_FOR_ANOMALY = 20
ANOMALY_BASELINE_HOURS = 24
METRIC_FETCH_WORKERS = 4


# ---------------------------------------------------------------------------
# Main correlation pipeline
# ---------------------------------------------------------------------------

def run_correlation(user_id, cluster_id=None, token=None, hours=48):
    """
    Run the full correlation pipeline.

    Parameters
    ----------
    user_id : str
        MongoDB user ID.
    cluster_id : str, optional
        Limit to a specific K8s cluster.
    token : str, optional
        JWT token for calling authService APIs (service map, traffic).
    hours : int
        How far back to look for alerts.

    Returns
    -------
    dict
        {
            "success": True,
            "timestamp": iso,
            "total_alerts": int,
            "clusters": [
                {
                    "cluster_id": int,
                    "alert_count": int,
                    "time_range": {...},
                    "pods": [...],
                    "namespaces": [...],
                    "severities": {...},
                    "alert_names": [...],
                    "root_cause_analysis": {
                        "root_cause": {...},
                        "causal_chain": [...],
                        "evidence": [...],
                    },
                    "anomaly_details": {pod: {...}, ...},
                },
                ...
            ],
            "summary": str,
            "execution_time_ms": int,
        }
    """
    t0 = time.time()

    log.info("=== Starting correlation for user=%s cluster=%s hours=%d ===",
             user_id, cluster_id, hours)

    # -----------------------------------------------------------------------
    # Step 1: Fetch alerts
    # -----------------------------------------------------------------------
    alerts = fetch_alerts(user_id, hours=hours, cluster_id=cluster_id, token=token)
    if not alerts:
        return {
            "success": True,
            "timestamp": _now_iso(),
            "total_alerts": 0,
            "clusters": [],
            "summary": "No alerts found in the specified time window.",
            "execution_time_ms": int((time.time() - t0) * 1000),
        }

    # -----------------------------------------------------------------------
    # Step 2: Fetch service map (for topology-aware clustering & graph analysis)
    # -----------------------------------------------------------------------
    service_map = {"nodes": [], "links": []}
    if cluster_id and token:
        service_map = fetch_service_map(cluster_id, token)
        log.info("Service map: %d nodes, %d links",
                 len(service_map.get("nodes", [])),
                 len(service_map.get("links", [])))

    # -----------------------------------------------------------------------
    # Step 2b: Fetch network traffic flows
    # -----------------------------------------------------------------------
    network_flows = []
    if cluster_id and token:
        network_flows = fetch_network_flows(cluster_id, token)
        log.info("Network flows: %d entries", len(network_flows))

    # -----------------------------------------------------------------------
    # Step 3: Cluster alerts
    # -----------------------------------------------------------------------
    alert_clusters = cluster_alerts(alerts, service_map=service_map)
    log.info("Found %d alert clusters from %d alerts", len(alert_clusters), len(alerts))

    # Limit to top N clusters by size
    alert_clusters = alert_clusters[:MAX_CLUSTERS_TO_ANALYZE]

    # -----------------------------------------------------------------------
    # Step 4: For each cluster, run anomaly detection + root cause analysis
    # -----------------------------------------------------------------------
    results = []

    for cluster in alert_clusters:
        cluster_result = _analyze_cluster(cluster, service_map)
        results.append(cluster_result)

    # -----------------------------------------------------------------------
    # Step 5: Build summary
    # -----------------------------------------------------------------------
    total_time = int((time.time() - t0) * 1000)

    root_causes = [r["root_cause_analysis"]["root_cause"]["pod"]
                   for r in results if r.get("root_cause_analysis", {}).get("root_cause")]

    summary_parts = [
        f"Analyzed {len(alerts)} alerts across {len(alert_clusters)} incident clusters.",
    ]
    if root_causes:
        unique_roots = list(dict.fromkeys(root_causes))  # dedupe preserving order
        summary_parts.append(
            f"Top root causes: {', '.join(unique_roots[:5])}."
        )

    firing = sum(1 for a in alerts if a.get("status") == "firing")
    if firing:
        summary_parts.append(f"{firing} alerts currently firing.")

    return {
        "success": True,
        "timestamp": _now_iso(),
        "total_alerts": len(alerts),
        "total_clusters": len(alert_clusters),
        "clusters": results,
        "summary": " ".join(summary_parts),
        "execution_time_ms": total_time,
        "service_map": service_map,
        "network_flows": network_flows[:100],
    }


# ---------------------------------------------------------------------------
# Per-cluster analysis
# ---------------------------------------------------------------------------

def _analyze_cluster(cluster, service_map):
    """Analyze a single alert cluster: anomaly detection + root cause."""
    pods = cluster.get("pods", [])
    namespaces = cluster.get("namespaces", [])

    # --- Anomaly detection for each pod ---
    anomaly_results = {}

    pods_to_analyze = pods[:MAX_PODS_FOR_ANOMALY]

    if pods_to_analyze:
        # Find namespace for each pod from the alerts
        pod_ns_map = {}
        for alert in cluster.get("alerts", []):
            pod = alert.get("pod", "")
            ns = alert.get("namespace", "")
            if pod and ns:
                pod_ns_map[pod] = ns

        # Fetch metrics in parallel
        with ThreadPoolExecutor(max_workers=METRIC_FETCH_WORKERS) as executor:
            futures = {}
            for pod in pods_to_analyze:
                ns = pod_ns_map.get(pod, "")
                if not ns:
                    # Try to find namespace from other alerts in same cluster
                    ns = namespaces[0] if namespaces else "default"
                futures[executor.submit(fetch_pod_metrics, ns, pod, ANOMALY_BASELINE_HOURS)] = pod

            for future in as_completed(futures):
                pod = futures[future]
                try:
                    metrics = future.result()
                    # Run anomaly detection
                    analysis = analyze_pod(metrics)
                    anomaly_results[pod] = analysis
                    log.info("Anomaly analysis for %s: score=%.3f anomalous=%s",
                             pod, analysis["overall_anomaly_score"], analysis["is_anomalous"])
                except Exception as e:
                    log.error("Failed to analyze pod %s: %s", pod, e)
                    anomaly_results[pod] = {
                        "overall_anomaly_score": 0.5,
                        "is_anomalous": False,
                        "summary": f"Analysis failed: {e}",
                        "anomalous_metrics": [],
                        "per_metric": {},
                    }

    # --- Root cause analysis ---
    rca = find_root_cause(cluster, service_map, anomaly_results)

    # Build result (strip raw alert docs to keep response size manageable)
    alert_summaries = []
    for a in cluster.get("alerts", [])[:50]:  # cap at 50
        alert_summaries.append({
            "alertname": a.get("alertname"),
            "severity": a.get("severity"),
            "status": a.get("status"),
            "pod": a.get("pod"),
            "namespace": a.get("namespace"),
            "receivedAt": a.get("receivedAt"),
            "message": a.get("message", a.get("annotations", {}).get("summary", "")),
        })

    return {
        "cluster_id": cluster["cluster_id"],
        "alert_count": cluster["alert_count"],
        "time_range": cluster["time_range"],
        "pods": cluster["pods"],
        "namespaces": cluster["namespaces"],
        "alert_names": cluster["alert_names"],
        "severities": cluster["severities"],
        "statuses": cluster.get("statuses", {}),
        "alerts": alert_summaries,
        "root_cause_analysis": rca,
        "anomaly_details": {
            pod: {
                "overall_anomaly_score": ar.get("overall_anomaly_score", 0),
                "is_anomalous": ar.get("is_anomalous", False),
                "anomalous_metrics": ar.get("anomalous_metrics", []),
                "summary": ar.get("summary", ""),
                "per_metric": ar.get("per_metric", {}),
            }
            for pod, ar in anomaly_results.items()
        },
    }


def _now_iso():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Analyze a specific set of alerts (for on-demand correlation)
# ---------------------------------------------------------------------------

def correlate_specific_alerts(alert_ids, user_id, token=None):
    """
    Correlate a specific set of alerts (by their MongoDB _ids).
    Used when a user selects alerts in the UI and clicks "Correlate".
    """
    from data_fetcher import _get_db
    from bson import ObjectId

    db = _get_db()
    alerts = []
    for aid in alert_ids:
        try:
            doc = db.alert_history.find_one({"_id": ObjectId(aid), "userId": user_id})
            if doc:
                doc["_id"] = str(doc["_id"])
                alerts.append(doc)
        except Exception:
            continue

    if not alerts:
        return {"success": False, "error": "No matching alerts found."}

    # Get cluster ID from the first alert
    cluster_id = alerts[0].get("clusterId")

    # Fetch service map
    service_map = {"nodes": [], "links": []}
    if cluster_id and token:
        service_map = fetch_service_map(cluster_id, token)

    # Cluster these specific alerts
    alert_clusters = cluster_alerts(alerts, service_map=service_map)

    results = []
    for cluster in alert_clusters:
        results.append(_analyze_cluster(cluster, service_map))

    return {
        "success": True,
        "timestamp": _now_iso(),
        "total_alerts": len(alerts),
        "total_clusters": len(alert_clusters),
        "clusters": results,
    }

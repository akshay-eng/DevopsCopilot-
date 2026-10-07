"""
Data Fetcher — pulls alerts from MongoDB, metrics from Prometheus,
and service-map / network data from the in-memory buffers exposed
by authService's network routes.
"""

import os
import time
import logging
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
import requests

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------

_mongo_client = None
_db = None


def _get_db():
    global _mongo_client, _db
    if _db is None:
        uri = os.getenv("MONGO_DB_URI")
        _mongo_client = MongoClient(uri, serverSelectionTimeoutMS=10000, socketTimeoutMS=300000, connectTimeoutMS=15000)
        _db = _mongo_client.get_default_database()
        log.info("Connected to MongoDB: %s", _db.name)
    return _db


def fetch_alerts(user_id: str, hours: int = 48, cluster_id: str = None, token: str = None):
    """
    Fetch alerts via authService HTTP API (fast, uses Node.js Mongoose pooling).
    Falls back to direct MongoDB if no token is provided.
    """
    # Try authService HTTP API first, then direct MongoDB as fallback
    if token:
        try:
            params = {"hours": hours, "limit": 500}
            if cluster_id:
                params["clusterId"] = cluster_id
            resp = requests.get(
                f"{_auth()}/api/alerts/for-correlation",
                headers={"Authorization": f"Bearer {token}"},
                params=params,
                timeout=120,
            )
            if resp.ok:
                data = resp.json()
                alerts = data.get("alerts", [])
                if alerts:
                    log.info("Fetched %d alerts via authService API for user=%s hours=%d", len(alerts), user_id, hours)
                    return alerts
                log.info("authService returned 0 alerts, trying direct MongoDB")
        except Exception as e:
            log.warning("authService alerts API failed: %s, falling back to MongoDB", e)

    # Direct MongoDB — fetch in small pages to handle slow network
    try:
        db = _get_db()
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        query = {"userId": user_id, "createdAt": {"$gte": since}}
        if cluster_id:
            query["clusterId"] = cluster_id

        projection = {
            "alertname": 1, "severity": 1, "status": 1, "pod": 1, "namespace": 1,
            "clusterId": 1, "receivedAt": 1, "startsAt": 1, "endsAt": 1,
            "message": 1, "service": 1, "userId": 1, "createdAt": 1,
        }
        cursor = db.alert_history.find(query, projection).sort("createdAt", -1).limit(500).batch_size(25)
        alerts = []
        for doc in cursor:
            doc["_id"] = str(doc["_id"])
            if "createdAt" in doc:
                doc["createdAt"] = str(doc["createdAt"])
            alerts.append(doc)
        log.info("Fetched %d alerts via MongoDB for user=%s hours=%d", len(alerts), user_id, hours)
        return alerts
    except Exception as e:
        log.error("MongoDB fetch failed: %s", e)
        return []


def fetch_alert_names(user_id: str, hours: int = 48, cluster_id: str = None):
    """Return distinct alert names in the window."""
    db = _get_db()
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    query = {"userId": user_id, "createdAt": {"$gte": since}}
    if cluster_id:
        query["clusterId"] = cluster_id
    return db.alert_history.distinct("alertname", query)


# ---------------------------------------------------------------------------
# Prometheus
# ---------------------------------------------------------------------------

PROM_URL = None


def _prom():
    global PROM_URL
    if PROM_URL is None:
        PROM_URL = os.getenv("PROMETHEUS_URL", "http://192.168.1.5:32738")
    return PROM_URL


def prom_query_range(query: str, start: float, end: float, step: str = "60s"):
    """Execute a Prometheus range query and return the raw result list."""
    try:
        resp = requests.get(
            f"{_prom()}/api/v1/query_range",
            params={"query": query, "start": start, "end": end, "step": step},
            timeout=10,
        )
        data = resp.json()
        if data.get("status") == "success":
            return data["data"]["result"]
        log.warning("Prometheus query failed: %s", data.get("error"))
        return []
    except Exception as e:
        log.error("Prometheus request error: %s", e)
        return []


def prom_instant(query: str):
    """Execute a Prometheus instant query."""
    try:
        resp = requests.get(
            f"{_prom()}/api/v1/query",
            params={"query": query},
            timeout=10,
        )
        data = resp.json()
        if data.get("status") == "success":
            return data["data"]["result"]
        return []
    except Exception as e:
        log.error("Prometheus instant query error: %s", e)
        return []


def fetch_pod_metrics(namespace: str, pod: str, hours: int = 24):
    """
    Fetch CPU, memory, network, restart metrics for a pod over the
    given window.  Returns dict of metric_name -> list of (timestamp, value).
    """
    end = time.time()
    start = end - hours * 3600
    step = "120s" if hours > 6 else "60s"

    metrics = {}

    queries = {
        "cpu_usage": f'rate(container_cpu_usage_seconds_total{{namespace="{namespace}",pod="{pod}",container!="POD",container!=""}}[5m])',
        "memory_usage": f'container_memory_working_set_bytes{{namespace="{namespace}",pod="{pod}",container!="POD",container!=""}}',
        "network_rx": f'rate(container_network_receive_bytes_total{{namespace="{namespace}",pod="{pod}"}}[5m])',
        "network_tx": f'rate(container_network_transmit_bytes_total{{namespace="{namespace}",pod="{pod}"}}[5m])',
        "restarts": f'kube_pod_container_status_restarts_total{{namespace="{namespace}",pod="{pod}"}}',
    }

    for name, q in queries.items():
        result = prom_query_range(q, start, end, step)
        if result:
            # Take the first matching series
            values = [(float(ts), float(val)) for ts, val in result[0].get("values", [])]
            metrics[name] = values
        else:
            metrics[name] = []

    return metrics


def fetch_namespace_metrics(namespace: str, hours: int = 24):
    """Fetch aggregate metrics for all pods in a namespace."""
    end = time.time()
    start = end - hours * 3600
    step = "300s"

    queries = {
        "cpu_by_pod": f'sum by (pod) (rate(container_cpu_usage_seconds_total{{namespace="{namespace}",container!="POD",container!=""}}[5m]))',
        "memory_by_pod": f'sum by (pod) (container_memory_working_set_bytes{{namespace="{namespace}",container!="POD",container!=""}})',
    }

    results = {}
    for name, q in queries.items():
        raw = prom_query_range(q, start, end, step)
        results[name] = raw  # list of series, each with metric.pod + values
    return results


# ---------------------------------------------------------------------------
# Service Map / Network (from authService in-memory buffers)
# ---------------------------------------------------------------------------

AUTH_URL = None


def _auth():
    global AUTH_URL
    if AUTH_URL is None:
        AUTH_URL = os.getenv("AUTH_SERVICE_URL", "http://localhost:5001")
    return AUTH_URL


def fetch_service_map(cluster_id: str, token: str):
    """
    Get the live service-map from the authService network routes.
    Returns {nodes: [...], links: [...]}.
    """
    try:
        resp = requests.get(
            f"{_auth()}/api/clusters/{cluster_id}/network/service-map",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.ok:
            data = resp.json()
            return {
                "nodes": data.get("nodes", []),
                "links": data.get("links", []),
            }
        log.warning("Service map fetch failed: %s", resp.status_code)
    except Exception as e:
        log.error("Service map request error: %s", e)
    return {"nodes": [], "links": []}


def fetch_network_traffic(cluster_id: str, token: str, limit: int = 500):
    """Get recent traffic events from authService buffer."""
    try:
        resp = requests.get(
            f"{_auth()}/api/clusters/{cluster_id}/network/traffic",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": limit},
            timeout=10,
        )
        if resp.ok:
            return resp.json().get("events", [])
    except Exception as e:
        log.error("Network traffic request error: %s", e)
    return []


def fetch_network_flows(cluster_id: str, token: str):
    """Get aggregated flow summaries."""
    try:
        resp = requests.get(
            f"{_auth()}/api/clusters/{cluster_id}/network/flows",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": 200},
            timeout=10,
        )
        if resp.ok:
            return resp.json().get("flows", [])
    except Exception as e:
        log.error("Network flows request error: %s", e)
    return []

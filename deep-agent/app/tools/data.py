import httpx
from langchain_core.tools import tool
from app.config import settings


@tool
def get_alerts(cluster_id: str = "", hours: int = 24, severity: str = "") -> str:
    """Get recent alerts from the DevOps Copilot platform.

    Args:
        cluster_id: Filter by cluster ID. Leave empty for all clusters.
        hours: How many hours back to look (default 24)
        severity: Filter by severity: 'critical', 'warning', 'info'. Leave empty for all.
    """
    try:
        params = {"hours": hours, "limit": 50}
        if cluster_id:
            params["clusterId"] = cluster_id
        if severity:
            params["severity"] = severity
        resp = httpx.get(
            f"{settings.auth_service_url}/api/alerts/all",
            params=params,
            timeout=10,
        )
        data = resp.json()
        alerts = data.get("alerts", data.get("data", []))
        if not alerts:
            return "No recent alerts found."
        lines = []
        for a in alerts[:30]:
            sev = a.get("severity", "?")
            name = a.get("alertname", "?")
            ns = a.get("namespace", "?")
            pod = a.get("pod", "N/A")
            msg = a.get("message", a.get("summary", ""))
            ts = str(a.get("startsAt", a.get("receivedAt", "")))[:19]
            lines.append(f"  [{ts}] [{sev}] {name} — {ns}/{pod}: {msg}")
        return f"Found {len(alerts)} alerts (showing {len(lines)}):\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR fetching alerts: {str(e)}"


@tool
def get_timeline(cluster_id: str = "", hours: int = 24) -> str:
    """Get unified timeline of alerts and K8s changes for a cluster.

    Args:
        cluster_id: Filter by cluster ID
        hours: How many hours back to look (default 24)
    """
    try:
        params = {"hours": hours, "limit": 50}
        if cluster_id:
            params["clusterId"] = cluster_id
        resp = httpx.get(
            f"{settings.auth_service_url}/api/timeline/events",
            params=params,
            timeout=10,
        )
        data = resp.json()
        events = data.get("events", [])
        if not events:
            return "No timeline events found."
        lines = []
        for e in events[:30]:
            etype = e.get("type", "unknown")
            ts = str(e.get("timestamp", ""))[:19]
            if etype == "alert":
                lines.append(f"  [{ts}] ALERT: {e.get('alertname', '')} ({e.get('severity', '')})")
            else:
                lines.append(f"  [{ts}] CHANGE: {e.get('summary', e.get('message', ''))}")
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR fetching timeline: {str(e)}"


@tool
def get_network_traffic(cluster_id: str, limit: int = 50) -> str:
    """Get recent HTTP network traffic events captured by the network monitor.

    Args:
        cluster_id: The cluster ID to get traffic for
        limit: Max number of events to return (default 50)
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/network/traffic",
            params={"limit": limit},
            timeout=10,
        )
        data = resp.json()
        events = data.get("events", data.get("traffic", []))
        if not events:
            return "No network traffic events found."
        lines = []
        for ev in events[:30]:
            method = ev.get("method", "?")
            path = ev.get("path", ev.get("url", "?"))
            status = ev.get("statusCode", ev.get("status", "?"))
            src = ev.get("srcService", ev.get("src", "?"))
            dst = ev.get("dstService", ev.get("dst", "?"))
            lines.append(f"  {src} → {dst}: {method} {path} [{status}]")
        return f"Found {len(events)} traffic events:\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR fetching network traffic: {str(e)}"


@tool
def get_cluster_info(cluster_id: str) -> str:
    """Get cluster metadata and connection details from DevOps Copilot.

    Args:
        cluster_id: The cluster ID
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}",
            timeout=10,
        )
        data = resp.json()
        cluster = data.get("cluster", data)
        if not cluster:
            return "Cluster not found."
        lines = [
            f"Name: {cluster.get('name', '?')}",
            f"ID: {cluster.get('_id', cluster_id)}",
            f"Status: {cluster.get('status', '?')}",
            f"Agent URL: {cluster.get('agentUrl', '?')}",
            f"Created: {str(cluster.get('createdAt', '?'))[:19]}",
        ]
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR fetching cluster info: {str(e)}"

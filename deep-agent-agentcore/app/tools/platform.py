"""
Direct platform tools — thin wrappers around authService REST APIs.

These tools give the agent read access to all AIOps platform data:
clusters, alerts, timeline, correlation, network, metrics, managed alerts.

Auth: Tools read the JWT from the auth_token_var context variable,
which is set before graph invocation in the route handler.
"""
import httpx
from langchain_core.tools import tool
from app.config import settings
from app.agent.state import auth_token_var, cluster_id_var

TIMEOUT = 15


def _headers() -> dict:
    """Build auth headers from context variable."""
    token = auth_token_var.get("")
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def _fmt_alert(a: dict) -> str:
    sev = a.get("severity", "?")
    name = a.get("alertname", a.get("labels", {}).get("alertname", "?"))
    ns = a.get("namespace", a.get("labels", {}).get("namespace", "?"))
    pod = a.get("pod", a.get("labels", {}).get("pod", ""))
    msg = a.get("message", a.get("summary", a.get("annotations", {}).get("summary", "")))
    ts = str(a.get("startsAt", a.get("receivedAt", a.get("timestamp", ""))))[:19]
    loc = f"{ns}/{pod}" if pod else ns
    return f"  [{ts}] [{sev}] {name} — {loc}: {msg}"


# ─── Clusters ────────────────────────────────────────────────────────────────

@tool
def list_clusters() -> str:
    """List all Kubernetes clusters registered by the user."""
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters",
            headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        clusters = data.get("clusters", [])
        if not clusters:
            return "No clusters registered."
        lines = []
        for c in clusters:
            status = c.get("status", "unknown")
            name = c.get("name", "unnamed")
            cid = c.get("_id", "?")
            lines.append(f"  {name} (id={cid}) — status: {status}")
        return f"Found {len(clusters)} cluster(s):\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_cluster_details(cluster_id: str) -> str:
    """Get detailed info about a specific cluster including status and agent URL.

    Args:
        cluster_id: The cluster ID
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}",
            headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        c = data.get("cluster", data)
        lines = [
            f"Name: {c.get('name', '?')}",
            f"ID: {c.get('_id', cluster_id)}",
            f"Status: {c.get('status', '?')}",
            f"Agent URL: {c.get('agentUrl', 'N/A')}",
            f"Provider: {c.get('provider', 'N/A')}",
            f"Created: {str(c.get('createdAt', '?'))[:19]}",
        ]
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_cluster_topology(cluster_id: str) -> str:
    """Get the service dependency topology/map for a cluster. Shows how services connect.

    Args:
        cluster_id: The cluster ID
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/topology",
            headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        nodes = data.get("nodes", [])
        edges = data.get("edges", data.get("links", []))
        lines = [f"Topology: {len(nodes)} services, {len(edges)} connections"]
        for n in nodes[:20]:
            lines.append(f"  Service: {n.get('name', n.get('id', '?'))} ({n.get('type', '?')})")
        for e in edges[:20]:
            lines.append(f"  {e.get('source', '?')} → {e.get('target', '?')}")
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


# ─── Kubernetes Resources ────────────────────────────────────────────────────

@tool
def get_namespaces(cluster_id: str) -> str:
    """List all namespaces in a cluster.

    Args:
        cluster_id: The cluster ID
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/namespaces",
            headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        items = data.get("items", data.get("namespaces", []))
        names = [ns.get("name", ns.get("metadata", {}).get("name", "?")) for ns in items]
        return f"Namespaces ({len(names)}): " + ", ".join(names)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_resources(cluster_id: str, resource_type: str, namespace: str = "") -> str:
    """Get Kubernetes resources (pods, deployments, services, statefulsets, daemonsets, jobs, configmaps, secrets, ingresses).

    Args:
        cluster_id: The cluster ID
        resource_type: Type of resource: pods, deployments, services, statefulsets, daemonsets, jobs, configmaps, ingresses
        namespace: Namespace to filter by. Leave empty for all namespaces.
    """
    try:
        params = {}
        if namespace:
            params["namespace"] = namespace
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/resources/{resource_type}",
            params=params, headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        items = data.get("items", data.get("resources", []))
        if not items:
            return f"No {resource_type} found."
        lines = [f"Found {len(items)} {resource_type}:"]
        for item in items[:30]:
            if isinstance(item, str):
                lines.append(f"  {item}")
                continue
            meta = item.get("metadata", item) if isinstance(item, dict) else {}
            name = meta.get("name", "?") if isinstance(meta, dict) else str(meta)
            ns = meta.get("namespace", "?") if isinstance(meta, dict) else "?"
            status = item.get("status", {}) if isinstance(item, dict) else {}
            if isinstance(status, str):
                status = {"phase": status}
            phase = status.get("phase", "") if isinstance(status, dict) else ""
            ready = ""
            if resource_type == "pods":
                conditions = status.get("conditions", [])
                is_ready = any(c.get("type") == "Ready" and c.get("status") == "True" for c in conditions)
                ready = " [Ready]" if is_ready else " [NotReady]"
                restarts = sum(cs.get("restartCount", 0) for cs in status.get("containerStatuses", []))
                if restarts > 0:
                    ready += f" restarts={restarts}"
            elif resource_type == "deployments":
                avail = status.get("availableReplicas", 0)
                desired = item.get("spec", {}).get("replicas", 0)
                ready = f" [{avail}/{desired} ready]"
            lines.append(f"  {ns}/{name}{' ' + phase if phase else ''}{ready}")
        if len(items) > 30:
            lines.append(f"  ... and {len(items) - 30} more")
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_resource_yaml(cluster_id: str, resource_type: str, namespace: str, name: str) -> str:
    """Get the YAML definition of a specific Kubernetes resource.

    Args:
        cluster_id: The cluster ID
        resource_type: Type: pods, deployments, services, etc.
        namespace: Namespace of the resource
        name: Name of the resource
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/resources/{resource_type}/{namespace}/{name}/yaml",
            headers=_headers(), timeout=TIMEOUT,
        )
        text = resp.text
        if len(text) > 4000:
            text = text[:4000] + "\n... (truncated)"
        return text
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_pod_logs(cluster_id: str, namespace: str, pod_name: str, container: str = "", lines: int = 100) -> str:
    """Get logs from a specific pod.

    Args:
        cluster_id: The cluster ID
        namespace: Pod namespace
        pod_name: Pod name
        container: Container name (optional, for multi-container pods)
        lines: Number of log lines to fetch (default 100)
    """
    try:
        params = {"tailLines": lines}
        if container:
            params["container"] = container
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/pods/{namespace}/{pod_name}/logs",
            params=params, headers=_headers(), timeout=TIMEOUT,
        )
        text = resp.text
        if len(text) > 5000:
            text = text[:5000] + "\n... (truncated)"
        return text if text.strip() else "No logs available."
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_pod_metrics(cluster_id: str, namespace: str, pod_name: str) -> str:
    """Get CPU and memory metrics for a specific pod.

    Args:
        cluster_id: The cluster ID
        namespace: Pod namespace
        pod_name: Pod name
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/pods/{namespace}/{pod_name}/metrics",
            headers=_headers(), timeout=TIMEOUT,
        )
        return resp.text[:3000]
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_node_metrics(cluster_id: str, node_name: str) -> str:
    """Get CPU, memory, and disk metrics for a specific cluster node.

    Args:
        cluster_id: The cluster ID
        node_name: Node name
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/nodes/{node_name}/metrics",
            headers=_headers(), timeout=TIMEOUT,
        )
        return resp.text[:3000]
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_cluster_metrics(cluster_id: str) -> str:
    """Get cluster-wide metrics summary (CPU, memory, pod counts).

    Args:
        cluster_id: The cluster ID
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/metrics",
            headers=_headers(), timeout=TIMEOUT,
        )
        return resp.text[:3000]
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_k8s_events(cluster_id: str, namespace: str = "") -> str:
    """Get recent Kubernetes events (warnings, errors, scheduling, scaling).

    Args:
        cluster_id: The cluster ID
        namespace: Filter by namespace (optional)
    """
    try:
        params = {}
        if namespace:
            params["namespace"] = namespace
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/events",
            params=params, headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        events = data.get("events", data.get("items", []))
        if not events:
            return "No Kubernetes events found."
        lines = []
        for ev in events[:30]:
            etype = ev.get("type", "Normal")
            reason = ev.get("reason", "?")
            msg = ev.get("message", "")[:120]
            obj = ev.get("involvedObject", {})
            name = f"{obj.get('kind', '')}/{obj.get('name', '')}"
            ts = str(ev.get("lastTimestamp", ev.get("eventTime", "")))[:19]
            lines.append(f"  [{ts}] [{etype}] {reason} — {name}: {msg}")
        return f"Found {len(events)} events:\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


# ─── Alerts ──────────────────────────────────────────────────────────────────

@tool
def get_alerts(cluster_id: str = "", hours: int = 24, severity: str = "") -> str:
    """Get recent alerts from the platform. Shows alert history with severity and details.

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
            params=params, headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        alerts = data.get("alerts", data.get("data", []))
        if not alerts:
            return "No recent alerts found."
        lines = [_fmt_alert(a) for a in alerts[:30]]
        return f"Found {len(alerts)} alerts (showing {len(lines)}):\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_alert_timeline_grouped(cluster_id: str = "", hours: int = 24) -> str:
    """Get alerts grouped by name with counts, first/last seen. Good for spotting patterns.

    Args:
        cluster_id: Filter by cluster ID
        hours: How many hours back (default 24)
    """
    try:
        params = {"hours": hours}
        if cluster_id:
            params["clusterId"] = cluster_id
        resp = httpx.get(
            f"{settings.auth_service_url}/api/alerts/timeline-grouped",
            params=params, headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        groups = data.get("groups", data.get("alerts", []))
        if not groups:
            return "No grouped alerts found."
        lines = []
        for g in groups[:20]:
            name = g.get("alertname", g.get("_id", "?"))
            count = g.get("count", 0)
            sev = g.get("severity", "?")
            first = str(g.get("firstSeen", ""))[:19]
            last = str(g.get("lastSeen", ""))[:19]
            lines.append(f"  {name} [{sev}] — {count}x (first: {first}, last: {last})")
        return f"Alert groups:\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_managed_alerts() -> str:
    """List all managed (user-created) Prometheus alert rules with their status."""
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/alerts/managed",
            headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        alerts = data.get("alerts", [])
        if not alerts:
            return "No managed alert rules configured."
        lines = []
        for a in alerts:
            name = a.get("displayName", a.get("alertName", "?"))
            status = a.get("status", "?")
            sev = a.get("severity", "?")
            expr = a.get("expr", "")[:80]
            lines.append(f"  {name} [{status}] [{sev}] — {expr}")
        return f"Managed alerts ({len(alerts)}):\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


# ─── Timeline & Correlation ──────────────────────────────────────────────────

@tool
def get_timeline_events(cluster_id: str = "", hours: int = 24) -> str:
    """Get unified timeline of alerts + Kubernetes changes merged by timestamp.

    Args:
        cluster_id: Filter by cluster ID
        hours: How many hours back (default 24)
    """
    try:
        params = {"hours": hours, "limit": 50}
        if cluster_id:
            params["clusterId"] = cluster_id
        resp = httpx.get(
            f"{settings.auth_service_url}/api/timeline/events",
            params=params, headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        events = data.get("events", [])
        if not events:
            return "No timeline events."
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
        return f"ERROR: {e}"


@tool
def get_correlated_incidents(cluster_id: str = "") -> str:
    """Get correlated incidents from root cause analysis. Shows which alerts are related and the suspected root cause.

    Args:
        cluster_id: Filter by cluster ID (optional)
    """
    try:
        params = {}
        if cluster_id:
            params["clusterId"] = cluster_id
        resp = httpx.get(
            f"{settings.auth_service_url}/api/correlation/incidents",
            params=params, headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        incidents = data.get("incidents", [])
        if not incidents:
            return "No correlated incidents found."
        lines = []
        for inc in incidents[:10]:
            root = inc.get("rootCause", inc.get("root_cause", {}))
            root_pod = root.get("pod", root.get("name", "unknown"))
            alert_count = inc.get("alertCount", len(inc.get("alerts", [])))
            status = inc.get("status", "open")
            ts = str(inc.get("createdAt", inc.get("timestamp", "")))[:19]
            lines.append(f"  [{ts}] Root cause: {root_pod} — {alert_count} related alerts — status: {status}")
        return f"Correlated incidents ({len(incidents)}):\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def run_correlation_analysis(cluster_id: str, hours: int = 48) -> str:
    """Trigger a root cause correlation analysis for a cluster. Analyzes recent alerts to find patterns and root causes.

    Args:
        cluster_id: The cluster ID to analyze
        hours: How many hours of alerts to analyze (default 48)
    """
    try:
        resp = httpx.post(
            f"{settings.auth_service_url}/api/correlation/analyze",
            json={"clusterId": cluster_id, "hours": hours},
            headers=_headers(), timeout=30,
        )
        data = resp.json()
        if data.get("success") is False:
            return f"Correlation failed: {data.get('error', 'unknown')}"
        summary = data.get("summary", "")
        clusters_data = data.get("clusters", [])
        lines = [f"Correlation complete. {summary}"]
        for cl in clusters_data[:5]:
            root = cl.get("root_cause_analysis", {}).get("root_cause", {})
            if root:
                lines.append(f"  Root cause: {root.get('pod', '?')} (score: {root.get('score', '?')})")
            lines.append(f"  Alerts: {cl.get('alert_count', '?')}, Pods: {len(cl.get('pods', []))}")
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


# ─── Network ────────────────────────────────────────────────────────────────

@tool
def get_network_traffic(cluster_id: str, limit: int = 50) -> str:
    """Get recent HTTP network traffic events captured by the eBPF network monitor.

    Args:
        cluster_id: The cluster ID
        limit: Max events (default 50)
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/network/traffic",
            params={"limit": limit}, headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        events = data.get("events", data.get("traffic", []))
        if not events:
            return "No network traffic events."
        lines = []
        for ev in events[:30]:
            method = ev.get("method", "?")
            path = ev.get("path", ev.get("url", "?"))
            status = ev.get("statusCode", ev.get("status", "?"))
            src = ev.get("srcService", ev.get("src", "?"))
            dst = ev.get("dstService", ev.get("dst", "?"))
            lines.append(f"  {src} → {dst}: {method} {path} [{status}]")
        return f"Traffic events ({len(events)}):\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_service_map(cluster_id: str) -> str:
    """Get the service dependency map showing how services communicate. Built from real network traffic.

    Args:
        cluster_id: The cluster ID
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/network/service-map",
            headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        services = data.get("services", data.get("nodes", []))
        edges = data.get("edges", data.get("connections", []))
        lines = [f"Service map: {len(services)} services, {len(edges)} connections"]
        for s in services[:20]:
            name = s.get("name", s.get("service", "?"))
            ns = s.get("namespace", "?")
            lines.append(f"  {ns}/{name}")
        for e in edges[:20]:
            lines.append(f"  {e.get('source', '?')} → {e.get('target', '?')} ({e.get('count', '?')} requests)")
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


@tool
def get_network_flows(cluster_id: str) -> str:
    """Get L4 network flow summaries aggregated by source/destination pair.

    Args:
        cluster_id: The cluster ID
    """
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/clusters/{cluster_id}/network/flows",
            headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        flows = data.get("flows", [])
        if not flows:
            return "No network flows found."
        lines = []
        for f in flows[:30]:
            src = f.get("src", f.get("source", "?"))
            dst = f.get("dst", f.get("destination", "?"))
            count = f.get("count", f.get("packets", "?"))
            byt = f.get("bytes", "?")
            lines.append(f"  {src} → {dst}: {count} flows, {byt} bytes")
        return f"Network flows ({len(flows)}):\n" + "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"


# ─── Integrations ────────────────────────────────────────────────────────────

@tool
def get_integrations() -> str:
    """List all configured integrations (ServiceNow, Slack, GitHub, etc.) and their status."""
    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/integrations",
            headers=_headers(), timeout=TIMEOUT,
        )
        data = resp.json()
        integrations = data.get("integrations", [])
        if not integrations:
            return "No integrations configured."
        lines = []
        for i in integrations:
            itype = i.get("type", "?")
            status = i.get("status", "?")
            lines.append(f"  {itype}: {status}")
        return "\n".join(lines)
    except Exception as e:
        return f"ERROR: {e}"

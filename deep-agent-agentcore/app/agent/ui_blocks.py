"""
A2UI-inspired structured UI block extractor.

Parses tool results and agent responses to emit structured UI components
via SSE events. The frontend renders these as interactive native widgets
instead of plain text.

Block types:
- status_cards: Health/status cards with colored indicators (clickable)
- resource_table: K8s resource table with status pills (clickable rows)
- alert_list: Alert cards with severity and investigate buttons
- metric_cards: Metric summary cards with values
- chart: Time series chart data for recharts
- event_list: K8s events with type indicators
- cluster_select: Clickable cluster selection buttons
- namespace_select: Clickable namespace buttons
- action_prompt: Warning about recommended actions needing approval
- form_input: Form fields for collecting user input
"""
import json
import re


def extract_ui_blocks(tool_name: str, tool_output: str, tool_input: dict = None) -> list:
    """Extract structured UI blocks from a tool's output."""
    blocks = []

    if tool_name == "list_clusters":
        clusters = _parse_cluster_list(tool_output)
        if clusters:
            blocks.append({
                "type": "status_cards",
                "title": "Registered Clusters",
                "cards": clusters,
                "clickAction": "investigate_cluster",
            })

    elif tool_name == "get_namespaces":
        namespaces = _parse_namespace_list(tool_output)
        if namespaces:
            cluster_id = (tool_input or {}).get("cluster_id", "")
            blocks.append({
                "type": "chip_select",
                "title": "Namespaces",
                "chips": namespaces,
                "promptTemplate": "Show me pods in namespace \"{value}\"",
            })

    elif tool_name == "get_resources" and tool_input:
        resource_type = tool_input.get("resource_type", "")
        if resource_type == "pods":
            pods = _parse_pod_list(tool_output)
            if pods:
                blocks.append({
                    "type": "resource_table",
                    "title": "Pods",
                    "resourceType": "pods",
                    "columns": ["Name", "Namespace", "Status", "Restarts"],
                    "rows": pods,
                    "clickPrompt": "Show me logs and metrics for pod \"{name}\" in namespace \"{namespace}\"",
                })
        elif resource_type == "deployments":
            deps = _parse_deployment_list(tool_output)
            if deps:
                blocks.append({
                    "type": "resource_table",
                    "title": "Deployments",
                    "resourceType": "deployments",
                    "columns": ["Name", "Namespace", "Ready", "Status"],
                    "rows": deps,
                    "clickPrompt": "Describe deployment \"{name}\" in namespace \"{namespace}\" and check its health",
                })

    elif tool_name == "get_alerts":
        alerts = _parse_alert_list(tool_output)
        if alerts:
            blocks.append({
                "type": "alert_list",
                "title": "Recent Alerts",
                "alerts": alerts,
            })

    elif tool_name in ("get_cluster_metrics", "get_pod_metrics", "get_node_metrics"):
        metrics = _parse_metrics(tool_output)
        if metrics:
            blocks.append({
                "type": "metric_cards",
                "title": "Metrics",
                "metrics": metrics,
            })

    elif tool_name == "prometheus_query_range":
        chart = _extract_chart_from_output(tool_output)
        if chart:
            blocks.append(chart)

    elif tool_name == "get_k8s_events":
        events = _parse_k8s_events(tool_output)
        if events:
            blocks.append({
                "type": "event_list",
                "title": "Kubernetes Events",
                "events": events,
            })

    elif tool_name == "get_correlated_incidents":
        incidents = _parse_incidents(tool_output)
        if incidents:
            blocks.append({
                "type": "incident_cards",
                "title": "Correlated Incidents",
                "incidents": incidents,
            })

    elif tool_name == "get_network_traffic":
        traffic = _parse_traffic(tool_output)
        if traffic:
            blocks.append({
                "type": "traffic_table",
                "title": "Network Traffic",
                "columns": ["Source", "Destination", "Method", "Path", "Status"],
                "rows": traffic,
            })

    # ITSM tool results — parse SNOW ticket details
    elif tool_name == "itsm_create_incident":
        ticket = _parse_itsm_result(tool_output, "incident")
        if ticket:
            blocks.append(ticket)

    elif tool_name == "itsm_create_change_request":
        ticket = _parse_itsm_result(tool_output, "change")
        if ticket:
            blocks.append(ticket)

    elif tool_name == "itsm_close_ticket":
        ticket = _parse_itsm_closure(tool_output)
        if ticket:
            blocks.append(ticket)

    return blocks


def extract_response_ui_blocks(content: str) -> list:
    """Extract interactive UI blocks from the agent's text response."""
    blocks = []

    if re.search(r'which cluster|select.*cluster|specify.*cluster|choose.*cluster', content, re.I):
        blocks.append({"type": "cluster_select"})

    if re.search(r'which namespace|select.*namespace|specify.*namespace', content, re.I):
        blocks.append({"type": "namespace_input"})

    # Detect completed ITSM operations or complex remediation — offer SOP only for these
    has_ticket = bool(re.search(r'INC\d{7,}|CHG\d{7,}', content))
    has_closure = bool(re.search(r'(permanently\s*closed|incident\s*closed|change.*closed|resolved.*closed|ticket.*closed)\b', content, re.I))
    has_remediation = bool(re.search(r'(remediat.*complet|fix\s*applied|implementation\s*complet|pipeline\s*complete)\b', content, re.I))
    # Only offer SOP for actual ITSM closures or completed remediation pipelines
    if has_ticket and (has_closure or has_remediation):
        ticket_m = re.search(r'(INC\d{7,}|CHG\d{7,})', content)
        blocks.append({
            "type": "sop_offer",
            "ticketNumber": ticket_m.group(1) if ticket_m else "",
            "content": content,
        })

    # Detect recommended WRITE actions that need approval — not read-only questions
    write_action = re.search(r'(scale|restart|delete|apply|rollback|upgrade|patch|rollout|modify|change|update)\b', content, re.I)
    approval_ask = re.search(r'shall I proceed|do you approve|confirm.*action|want me to (apply|scale|delete|restart|rollback|execute)', content, re.I)
    if write_action and approval_ask:
        actions = [
            {"label": "Approve", "prompt": "Yes, proceed with the action", "style": "primary"},
            {"label": "Reject", "prompt": "No, do not proceed", "style": "secondary"},
            {"label": "Create Change Request", "prompt": "Create a ServiceNow change request for this instead", "style": "outline"},
        ]
        blocks.append({"type": "action_buttons", "actions": actions})

    return blocks


# ── Chart data extraction ────────────────────────────────────────────────────

def _extract_chart_from_output(output: str) -> dict | None:
    """Extract chart data from the __CHART_DATA__ marker in tool output."""
    try:
        marker = "__CHART_DATA__:"
        idx = output.find(marker)
        if idx == -1:
            return None
        raw = output[idx + len(marker):]
        data = json.loads(raw)
        return {
            "type": "chart",
            "title": data.get("query", "Metrics"),
            "duration": data.get("duration", "1h"),
            "series": data.get("series", []),
        }
    except Exception:
        return None


# ── Parsers ──────────────────────────────────────────────────────────────────

def _parse_cluster_list(output: str) -> list:
    cards = []
    for line in output.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('Found'):
            continue
        m = re.match(r'(.+?)\s*\(id=([^)]+)\)\s*[—-]\s*status:\s*(\w+)', line)
        if m:
            name, cid, status = m.groups()
            cards.append({
                "name": name.strip(), "id": cid.strip(), "status": status.strip(),
                "statusColor": "green" if status == "connected" else "yellow" if status == "pending" else "red",
                "clickPrompt": f'Use cluster "{name.strip()}" (ID: {cid.strip()})',
            })
    return cards


def _parse_namespace_list(output: str) -> list:
    # Format: "Namespaces (N): ns1, ns2, ns3"
    m = re.search(r'Namespaces\s*\(\d+\):\s*(.+)', output)
    if m:
        return [{"label": ns.strip(), "value": ns.strip()} for ns in m.group(1).split(',') if ns.strip()]
    return []


def _parse_pod_list(output: str) -> list:
    rows = []
    for line in output.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('Found') or line.startswith('...'):
            continue
        m = re.match(r'(\S+)/(\S+)\s*(.*)', line)
        if m:
            ns, name, rest = m.groups()
            status, restarts = "Running", "0"
            if "[NotReady]" in rest: status = "NotReady"
            elif "[Ready]" in rest: status = "Ready"
            r = re.search(r'restarts=(\d+)', rest)
            if r: restarts = r.group(1)
            phase_m = re.match(r'(\w+)', rest.strip())
            if phase_m and phase_m.group(1) in ('Running', 'Pending', 'Failed', 'Succeeded', 'CrashLoopBackOff'):
                status = phase_m.group(1)
            status_color = "green"
            if status in ("NotReady", "Failed", "CrashLoopBackOff"): status_color = "red"
            elif status in ("Pending",): status_color = "yellow"
            rows.append({"cells": [name, ns, status, restarts], "statusColor": status_color, "name": name, "namespace": ns})
    return rows


def _parse_deployment_list(output: str) -> list:
    rows = []
    for line in output.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('Found') or line.startswith('...'):
            continue
        m = re.match(r'(\S+)/(\S+)\s*(.*)', line)
        if m:
            ns, name, rest = m.groups()
            ready = rest.strip() if rest.strip() else "?"
            status_color = "green"
            ready_m = re.search(r'\[(\d+)/(\d+)\s*ready\]', rest)
            if ready_m:
                avail, desired = int(ready_m.group(1)), int(ready_m.group(2))
                ready = f"{avail}/{desired}"
                if avail < desired: status_color = "yellow"
                if avail == 0: status_color = "red"
            rows.append({"cells": [name, ns, ready, "Active" if status_color == "green" else "Degraded"],
                         "statusColor": status_color, "name": name, "namespace": ns})
    return rows


def _parse_alert_list(output: str) -> list:
    alerts = []
    for line in output.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('Found'):
            continue
        m = re.match(r'\[([^\]]*)\]\s*\[(\w+)\]\s*(\S+)\s*[—-]\s*(.+?):\s*(.*)', line)
        if m:
            ts, sev, name, loc, msg = m.groups()
            alerts.append({"timestamp": ts.strip(), "severity": sev.strip(), "name": name.strip(),
                          "location": loc.strip(), "message": msg.strip()})
    return alerts[:15]


def _parse_metrics(output: str) -> list:
    metrics = []
    try:
        data = json.loads(output)
        m = data.get("metrics", {})
        cluster = m.get("cluster", {})
        cpu, mem, pods = cluster.get("cpu", {}), cluster.get("memory", {}), cluster.get("pods", {})
        if cpu.get("total"):
            pct = round((cpu.get("usage", 0) / cpu["total"]) * 100, 1) if cpu["total"] else 0
            metrics.append({"label": "CPU", "value": f"{pct}%", "total": f"{cpu['total']} cores", "color": "blue",
                           "clickPrompt": "Show me CPU usage trends over the last 6 hours"})
        if mem.get("total"):
            pct = round((mem.get("usage", 0) / mem["total"]) * 100, 1) if mem["total"] else 0
            metrics.append({"label": "Memory", "value": f"{pct}%", "total": f"{round(mem['total']/1024/1024/1024, 1)} GB", "color": "purple",
                           "clickPrompt": "Show me memory usage trends over the last 6 hours"})
        if pods:
            total = pods.get("running", 0) + pods.get("pending", 0) + pods.get("failed", 0)
            metrics.append({"label": "Pods Running", "value": str(pods.get("running", 0)), "total": f"of {total}", "color": "green",
                           "clickPrompt": "List all pods and their status"})
            if pods.get("failed", 0) > 0:
                metrics.append({"label": "Pods Failed", "value": str(pods["failed"]), "total": "", "color": "red",
                               "clickPrompt": "Show me the failed pods and their logs"})
    except (json.JSONDecodeError, KeyError, TypeError):
        pass
    return metrics


def _parse_k8s_events(output: str) -> list:
    events = []
    for line in output.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('Found') or line.startswith('No '):
            continue
        m = re.match(r'\[([^\]]*)\]\s*\[(\w+)\]\s*(\w+)\s*[—-]\s*(.+?):\s*(.*)', line)
        if m:
            ts, etype, reason, obj, msg = m.groups()
            events.append({"timestamp": ts.strip(), "type": etype.strip(), "reason": reason.strip(),
                          "object": obj.strip(), "message": msg.strip()[:120],
                          "clickPrompt": f'Investigate the {reason.strip()} event on {obj.strip()}'})
    return events[:15]


def _parse_incidents(output: str) -> list:
    incidents = []
    for line in output.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('Correlated') or line.startswith('No '):
            continue
        m = re.match(r'\[([^\]]*)\]\s*Root cause:\s*(\S+)\s*[—-]\s*(\d+)\s*related alerts\s*[—-]\s*status:\s*(\w+)', line)
        if m:
            ts, root, count, status = m.groups()
            incidents.append({"timestamp": ts.strip(), "rootCause": root.strip(), "alertCount": int(count),
                             "status": status.strip(),
                             "clickPrompt": f'Show me the details of the incident with root cause {root.strip()}'})
    return incidents[:10]


def _parse_itsm_result(output: str, ticket_type: str) -> dict | None:
    """Parse ITSM agent output into a structured ticket card."""
    try:
        fields = {}
        # Extract common patterns from the ITSM agent response
        patterns = {
            "number": r"(?:Incident|Change)\s*Number\s*:\s*(\S+)",
            "short_description": r"Short Description\s*:\s*(.+?)(?:\n|$)",
            "urgency": r"Urgency\s*:\s*(.+?)(?:\n|$)",
            "impact": r"Impact\s*:\s*(.+?)(?:\n|$)",
            "priority": r"Priority\s*:\s*(.+?)(?:\n|$)",
            "state": r"(?:Current\s*)?State\s*:\s*(.+?)(?:\n|$)",
            "assignment_group": r"Assignment\s*Group\s*:\s*(.+?)(?:\n|$)",
            "assigned_to": r"Assigned\s*To\s*:\s*(.+?)(?:\n|$)",
            "type": r"Type\s*:\s*(.+?)(?:\n|$)",
            "risk": r"Risk\s*:\s*(.+?)(?:\n|$)",
            "close_code": r"Close\s*Code\s*:\s*(.+?)(?:\n|$)",
        }
        for key, pattern in patterns.items():
            m = re.search(pattern, output, re.I)
            if m:
                fields[key] = m.group(1).strip()

        if not fields.get("number"):
            # Try to find INC or CHG number anywhere
            m = re.search(r"(INC\d{7,}|CHG\d{7,})", output)
            if m:
                fields["number"] = m.group(1)

        if not fields.get("number"):
            return None

        return {
            "type": "snow_ticket",
            "ticketType": ticket_type,
            "fields": fields,
            "rawOutput": output[:500],
        }
    except Exception:
        return None


def _parse_itsm_closure(output: str) -> dict | None:
    """Parse ticket closure result."""
    m = re.search(r"(INC\d{7,}|CHG\d{7,})", output)
    if not m:
        return None
    number = m.group(1)
    closed = bool(re.search(r"closed|resolved|complete", output, re.I))
    return {
        "type": "snow_ticket_closed",
        "number": number,
        "closed": closed,
        "rawOutput": output[:300],
    }


def _parse_traffic(output: str) -> list:
    rows = []
    for line in output.strip().split('\n'):
        line = line.strip()
        if not line or line.startswith('Traffic') or line.startswith('No '):
            continue
        m = re.match(r'(\S+)\s*→\s*(\S+):\s*(\w+)\s+(\S+)\s+\[(\S+)\]', line)
        if m:
            src, dst, method, path, status = m.groups()
            status_color = "green" if status.startswith("2") else "red" if status.startswith("5") else "yellow"
            rows.append({"cells": [src, dst, method, path[:50], status], "statusColor": status_color})
    return rows[:20]

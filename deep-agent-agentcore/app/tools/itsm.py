"""
ITSM tools for HolmesGPT. Calls ServiceNow MCP via persistent session.
"""
import re
import json
import logging
from langchain_core.tools import tool

logger = logging.getLogger(__name__)


def _call_snow(tool_name: str, args: dict) -> str:
    """Call a ServiceNow MCP tool via the persistent session. Reconnects if needed."""
    from app.tools.mcp_tools import _sessions, MCPSession, _resolve_url

    session = _sessions.get("servicenow")

    # Try to reconnect if session is dead
    if not session or not session.is_alive():
        logger.info("SNOW session dead, attempting reconnect...")
        import socket
        # Check if port 8000 is reachable
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            reachable = sock.connect_ex(('127.0.0.1', 8000)) == 0
            sock.close()
            if reachable:
                new_session = MCPSession("http://localhost:8000", "servicenow")
                if new_session.connect():
                    _sessions["servicenow"] = new_session
                    session = new_session
                    logger.info(f"SNOW reconnected with {len(session.tools)} tools")
                else:
                    return "ERROR: ServiceNow MCP connection failed. Check port-forward."
            else:
                return "ERROR: ServiceNow MCP not reachable on port 8000. Run: kubectl port-forward -n mcp-servers svc/servicenow-mcp 8000:8000"
        except Exception as e:
            return f"ERROR: ServiceNow MCP connection error: {e}"

    return session.call_tool(tool_name, args)


@tool
def itsm_create_incident(
    context: str,
    short_description: str,
    urgency: str = "2",
    impact: str = "2",
) -> str:
    """Create a ServiceNow incident with investigation context.

    Args:
        context: Investigation findings — pod name, namespace, cluster, error, root cause. Be thorough.
        short_description: Concise summary (max 160 chars)
        urgency: 1=High, 2=Medium, 3=Low
        impact: 1=High, 2=Medium, 3=Low
    """
    steps = []

    # MCP create_incident takes a single JSON string param "incident"
    incident_data = json.dumps({
        "short_description": short_description,
        "description": f"{context}\n\nCreated by DevOps Copilot HolmesGPT",
        "urgency": urgency,
        "impact": impact,
    })
    result = _call_snow("create_incident", {"incident": incident_data})
    steps.append(("Create incident", result))

    # Extract INC number
    inc = ""
    m = re.search(r"(INC\d{7,})", result)
    if m:
        inc = m.group(1)
    if not inc:
        m = re.search(r"number['\"]?\s*[:=]\s*['\"]?(INC\w+)", result, re.I)
        if m:
            inc = m.group(1)

    if inc:
        # MCP add_work_notes takes "number" and "work_notes"
        r2 = _call_snow("add_work_notes", {
            "number": inc,
            "work_notes": f"HolmesGPT Investigation:\n{context[:3000]}",
        })
        steps.append(("Add work notes", "Done" if "error" not in r2.lower() else r2[:100]))
    else:
        inc = "[check ServiceNow]"

    return f"""Incident Number: {inc}
Short Description: {short_description}
Urgency: {urgency} | Impact: {impact}
State: New

Steps:
{chr(10).join(f"  {i+1}. {s[0]}: {s[1][:120]}" for i, s in enumerate(steps))}"""


@tool
def itsm_create_change_request(
    context: str,
    short_description: str,
    change_type: str = "normal",
    risk: str = "Moderate",
    priority: str = "3",
) -> str:
    """Create a ServiceNow change request.

    Args:
        context: What needs to change, why, affected services, rollback plan.
        short_description: Concise change summary
        change_type: normal, standard, or emergency
        risk: High, Moderate, or Low
        priority: 1=Critical, 2=High, 3=Moderate, 4=Low
    """
    steps = []

    # MCP create_change_request takes "params" as JSON string
    params = json.dumps({
        "short_description": short_description,
        "description": f"{context}\n\nCreated by DevOps Copilot HolmesGPT",
        "type": change_type,
        "risk": risk,
        "priority": priority,
        "justification": context[:500],
        "backout_plan": "Revert to previous configuration",
        "test_plan": "Verify service health post-change",
    })
    result = _call_snow("create_change_request", {"params": params})
    steps.append(("Create change", result))

    chg = ""
    m = re.search(r"(CHG\d{7,})", result)
    if m:
        chg = m.group(1)

    if chg:
        # MCP move_change_state takes "change_id" and "target_state"
        r2 = _call_snow("move_change_state", {"change_id": chg, "target_state": "Assess"})
        steps.append(("Move to Assess", "Done" if "error" not in r2.lower() else r2[:80]))
        r3 = _call_snow("move_change_state", {"change_id": chg, "target_state": "Authorize"})
        steps.append(("Move to Authorize", "Done" if "error" not in r3.lower() else r3[:80]))
    else:
        chg = "[check ServiceNow]"

    return f"""Change Number: {chg}
Short Description: {short_description}
Type: {change_type} | Risk: {risk} | Priority: {priority}
State: Authorize (awaiting CAB)

Steps:
{chr(10).join(f"  {i+1}. {s[0]}: {s[1][:120]}" for i, s in enumerate(steps))}

Next: Say "The change is approved" when CAB approves."""


@tool
def itsm_update_ticket(
    ticket_number: str,
    update_description: str,
) -> str:
    """Update a ServiceNow incident or change request.

    Args:
        ticket_number: INC or CHG number
        update_description: What to update (natural language)
    """
    # MCP natural_language_update takes "command"
    result = _call_snow("natural_language_update", {
        "command": f"{update_description} for {ticket_number}",
    })
    return f"Updated {ticket_number}: {result[:500]}"


@tool
def itsm_close_ticket(
    ticket_number: str,
    resolution_notes: str = "",
) -> str:
    """Close a ServiceNow ticket. Only when user explicitly confirms.

    Args:
        ticket_number: INC or CHG number
        resolution_notes: Resolution summary
    """
    notes = resolution_notes or "Resolved by DevOps Copilot HolmesGPT"
    steps = []

    if ticket_number.startswith("INC"):
        # MCP resolve_incident takes incident_id, resolution_code, resolution_notes
        r1 = _call_snow("resolve_incident", {
            "incident_id": ticket_number,
            "resolution_code": "Solved (Permanently)",
            "resolution_notes": notes,
        })
        steps.append(("Resolve", r1[:80]))
        # MCP close_incident_self_heal takes incident_id, resolution_notes
        r2 = _call_snow("close_incident_self_heal", {
            "incident_id": ticket_number,
            "resolution_notes": notes,
        })
        steps.append(("Close", r2[:80]))
    elif ticket_number.startswith("CHG"):
        r1 = _call_snow("move_change_state", {"change_id": ticket_number, "target_state": "Review"})
        steps.append(("Review", r1[:80]))
        r2 = _call_snow("move_change_state", {"change_id": ticket_number, "target_state": "Closed"})
        steps.append(("Close", r2[:80]))

    return f"""Ticket {ticket_number} closed.
Resolution: {notes}
{chr(10).join(f"  {s[0]}: {s[1]}" for s in steps)}"""

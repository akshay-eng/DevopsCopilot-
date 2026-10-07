"""
Direct ServiceNow API tools and Milvus vector search tools.

SNOW creds are fetched dynamically from the user's integration config
via authService API (encrypted at rest, decrypted on demand).
Milvus config comes from environment variables.
"""
import json
import logging
import httpx
from typing import List
from langchain_core.tools import tool
from app.config import settings
from app.agent.state import auth_token_var

logger = logging.getLogger(__name__)

# Cache SNOW creds per request to avoid repeated API calls
_snow_creds_cache = {"url": "", "user": "", "password": "", "api_key": ""}


def _get_snow_creds() -> dict:
    """Fetch SNOW credentials from the user's integration config via authService."""
    global _snow_creds_cache
    if _snow_creds_cache.get("url"):
        return _snow_creds_cache

    token = auth_token_var.get("")
    if not token:
        return {}

    try:
        resp = httpx.get(
            f"{settings.auth_service_url}/api/integrations/snow/config",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            config = data.get("config", data)
            _snow_creds_cache = {
                "url": config.get("instance_url", ""),
                "user": config.get("username", ""),
                "password": config.get("password", ""),
                "api_key": config.get("api_key", ""),
            }
            return _snow_creds_cache
    except Exception as e:
        logger.error(f"Failed to fetch SNOW creds: {e}")
    return {}


def _snow_request(method: str, path: str, params: dict = None, json_body: dict = None) -> dict:
    """Make a ServiceNow REST API request using dynamic credentials."""
    creds = _get_snow_creds()
    if not creds.get("url"):
        return {"error": "ServiceNow integration not configured. Add SNOW credentials in Integrations page."}

    url = f"{creds['url']}{path}"
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if creds.get("api_key"):
        headers["x-sn-apikey"] = creds["api_key"]

    auth = (creds["user"], creds["password"]) if creds.get("user") else None

    try:
        if method == "GET":
            resp = httpx.get(url, headers=headers, params=params, auth=auth, timeout=15)
        elif method == "POST":
            resp = httpx.post(url, headers=headers, params=params, json=json_body, auth=auth, timeout=15)
        elif method == "PATCH":
            resp = httpx.patch(url, headers=headers, json=json_body, auth=auth, timeout=15)
        else:
            return {"error": f"Unsupported method: {method}"}

        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        err_detail = ""
        try:
            err_detail = e.response.json().get("error", {}).get("message", "")
        except Exception:
            pass
        return {"error": f"HTTP {e.response.status_code}: {err_detail or str(e)}"}
    except Exception as e:
        return {"error": str(e)}


# ── CMDB Tools ───────────────────────────────────────────────────────────────

@tool
def search_cmdb_ci(query: str, table_name: str = "cmdb_ci_server") -> str:
    """Search ServiceNow CMDB for Configuration Items (CIs). Use for finding servers, applications, or infrastructure components.

    Args:
        query: ServiceNow encoded query string (e.g., "nameLIKEweb" or "ip_addressSTARTSWITH10.0")
        table_name: CMDB table to search (default: cmdb_ci_server)
    """
    result = _snow_request("GET", f"/api/now/table/{table_name}", params={
        "sysparm_query": query,
        "sysparm_limit": 10,
        "sysparm_display_value": "all",
        "sysparm_exclude_reference_link": "true",
    })

    if "error" in result:
        return json.dumps(result)

    records = result.get("result", [])
    if not records:
        return json.dumps({"error": f"No CIs found matching: {query}", "result": []})

    # Validate CIs have names
    valid = []
    for ci in records:
        ci_name = ci.get("name", "")
        if isinstance(ci_name, dict):
            ci_name = ci_name.get("display_value", "")
        if ci_name and ci_name.strip():
            valid.append(ci)

    return json.dumps({"result": valid, "total_found": len(records), "total_valid": len(valid)}, indent=2)


@tool
def add_affected_cis(change_number: str, ci_names: str) -> str:
    """Link Configuration Items to a Change Request by name. CIs are associated via the task_ci table.

    Args:
        change_number: The CHG number (e.g., CHG0001234)
        ci_names: Comma-separated CI names to link (e.g., "web-server-01, db-server-02")
    """
    ci_list = [n.strip() for n in ci_names.split(",") if n.strip()]
    if not ci_list:
        return json.dumps({"status": "skipped", "message": "No CI names provided"})

    results = []
    for ci_name in ci_list:
        resp = _snow_request("POST", "/api/now/table/task_ci",
            params={"sysparm_input_display_value": "true"},
            json_body={"task": change_number, "ci_item": ci_name},
        )
        if "error" in resp:
            results.append(f"Failed: {ci_name} - {resp['error']}")
        else:
            results.append(f"Linked: {ci_name}")

    return json.dumps({"status": "completed", "results": results})


@tool
def add_change_attachment(change_number: str, file_name: str, content: str) -> str:
    """Upload a text document as attachment to a Change Request. Use for CAB documents, implementation plans, etc.

    Args:
        change_number: CHG number or sys_id
        file_name: Name for the attachment file (e.g., "CAB_Doc_CHG001.txt")
        content: Text content of the document
    """
    creds = _get_snow_creds()
    if not creds.get("url"):
        return "ServiceNow integration not configured"

    # Lookup sys_id if needed
    sys_id = change_number
    if not (len(change_number) == 32 and change_number.isalnum()):
        lookup = _snow_request("GET", "/api/now/table/change_request", params={
            "sysparm_query": f"number={change_number}", "sysparm_limit": 1, "sysparm_fields": "sys_id",
        })
        records = lookup.get("result", [])
        if not records:
            return f"Change request {change_number} not found"
        sys_id = records[0]["sys_id"]

    try:
        import mimetypes
        ct = mimetypes.guess_type(file_name)[0] or "text/plain"
        auth = (creds["user"], creds["password"]) if creds.get("user") else None
        headers = {"Accept": "application/json"}
        if creds.get("api_key"):
            headers["x-sn-apikey"] = creds["api_key"]

        resp = httpx.post(
            f"{creds['url']}/api/now/attachment/upload",
            headers=headers, auth=auth, timeout=15,
            data={"table_name": "change_request", "table_sys_id": sys_id},
            files={"uploadFile": (file_name, content.encode(), ct)},
        )
        resp.raise_for_status()
        return f"Attachment '{file_name}' uploaded to {change_number}"
    except Exception as e:
        return f"Upload failed: {e}"


@tool
def check_change_conflicts(change_number: str, ci_sys_id: str, start_date: str, end_date: str) -> str:
    """Check for conflicting change requests on the same CI within a time window.

    Args:
        change_number: The current CHG number (to exclude from results)
        ci_sys_id: sys_id of the Configuration Item
        start_date: Start of change window (YYYY-MM-DD HH:MM:SS)
        end_date: End of change window (YYYY-MM-DD HH:MM:SS)
    """
    query = f"cmdb_ci={ci_sys_id}^stateNOT IN3,4,7^numberNOT LIKE{change_number}^start_date<={end_date}^end_date>={start_date}"
    result = _snow_request("GET", "/api/now/table/change_request", params={
        "sysparm_query": query, "sysparm_display_value": "true",
        "sysparm_fields": "number,short_description,state,start_date,end_date",
    })
    conflicts = result.get("result", [])
    if not conflicts:
        return f"No conflicts found for {change_number}"
    lines = [f"Found {len(conflicts)} conflict(s):"]
    for c in conflicts:
        lines.append(f"  {c.get('number','?')}: {c.get('short_description','')} ({c.get('start_date','')} - {c.get('end_date','')})")
    return "\n".join(lines)


@tool
def update_change_dates(change_number: str, new_start: str, new_end: str) -> str:
    """Reschedule a change request by updating start and end dates.

    Args:
        change_number: CHG number or sys_id
        new_start: New start date (YYYY-MM-DD HH:MM:SS)
        new_end: New end date (YYYY-MM-DD HH:MM:SS)
    """
    # Lookup sys_id
    sys_id = change_number
    if not (len(change_number) == 32 and change_number.isalnum()):
        lookup = _snow_request("GET", "/api/now/table/change_request", params={
            "sysparm_query": f"number={change_number}", "sysparm_limit": 1, "sysparm_fields": "sys_id",
        })
        records = lookup.get("result", [])
        if not records:
            return f"Change {change_number} not found"
        sys_id = records[0]["sys_id"]

    result = _snow_request("PATCH", f"/api/now/table/change_request/{sys_id}", json_body={
        "start_date": new_start, "end_date": new_end,
    })
    if "error" in result:
        return f"Update failed: {result['error']}"
    return f"Updated {change_number}: {new_start} to {new_end}"


# ── Milvus Vector Search Tools ───────────────────────────────────────────────

@tool
def search_similar_incidents(description: str) -> str:
    """Search for similar historical incidents using vector similarity (Milvus). Use before creating incidents to find past resolutions.

    Args:
        description: Description of the current incident to search for similar ones
    """
    return _milvus_search(description, "incident_history")


@tool
def search_similar_change_requests(description: str) -> str:
    """Search for similar historical change requests using vector similarity (Milvus). Use before creating changes to find past templates.

    Args:
        description: Description of the proposed change
    """
    return _milvus_search(description, "change_request_history")


def _milvus_search(query: str, collection_name: str) -> str:
    """Common Milvus vector search implementation."""
    try:
        from pymilvus import connections, Collection, utility
        from sentence_transformers import SentenceTransformer

        host = settings.milvus_host
        port = settings.milvus_port

        connections.connect(alias="default", host=host, port=port)
        if not utility.has_collection(collection_name):
            connections.disconnect("default")
            return f"No {collection_name.replace('_', ' ')} data available"

        collection = Collection(collection_name)
        collection.load()

        model = SentenceTransformer(settings.embedding_model)
        embedding = model.encode([query]).tolist()

        schema = collection.schema
        output_fields = [f.name for f in schema.fields if f.name not in ("embedding", "id")]

        results = collection.search(
            embedding, "embedding",
            {"metric_type": "COSINE", "params": {"nprobe": 10}},
            limit=3,
            output_fields=output_fields,
        )

        connections.disconnect("default")

        if not results[0]:
            return "No similar records found"

        matches = []
        for idx, hit in enumerate(results[0], 1):
            entity = hit.entity
            number = entity.get("number", f"#{idx}")
            parts = [f"Match #{idx}: {number} (similarity: {hit.score:.0%})"]
            for field in output_fields:
                if field == "number":
                    continue
                val = entity.get(field, "")
                if val and str(val).strip() and val != "NA":
                    label = field.replace("_", " ").title()
                    text = str(val)
                    if len(text) > 200:
                        text = text[:200] + "..."
                    parts.append(f"  {label}: {text}")
            matches.append("\n".join(parts))

        return "\n\n".join(matches)

    except ImportError:
        return "Milvus/sentence-transformers not installed. Run: pip install pymilvus sentence-transformers"
    except Exception as e:
        logger.error(f"Milvus search error: {e}")
        return f"Search error: {e}"

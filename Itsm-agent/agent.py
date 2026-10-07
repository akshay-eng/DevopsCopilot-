"""
Simplified ITSM ServiceNow Agent with Wipro AI + SNOW CMDB Integration
- ENABLED: Multi-threading/Async Concurrency for parallel API requests
- FIXED: Ensures tool calls complete before returning final response
- Uses official langchain-wiproai package
- LLM-driven decision making (no regex)
- Fast workflow execution
- **Human-in-the-loop for incident/change creation approval (MANDATORY)**
- Conversational memory support
- **HYBRID: Uses MCP Client for core SNOW tools + Local Python tools for custom logic**
- **NEW: Auto-generates and uploads CAB document on creation via local tool**
- **FIXED: CI name validation to prevent empty display values**
"""

from typing import Dict, List, Optional
from langchain_openai import ChatOpenAI
import nest_asyncio
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage, ToolMessage
from langgraph.graph import MessagesState
from langgraph.prebuilt import create_react_agent
from hypercorn.config import Config
from hypercorn.asyncio import serve
import os
from dotenv import load_dotenv
from langchain_core.tools import tool
from pymilvus import connections, utility, Collection
from sentence_transformers import SentenceTransformer
from langchain_mcp_adapters.client import MultiServerMCPClient
import asyncio
from flask import Flask, request, jsonify
from datetime import datetime, timedelta
from flask_cors import CORS
import base64
import requests
from requests.auth import HTTPBasicAuth
import json
import mimetypes
from langchain_google_genai import ChatGoogleGenerativeAI

# Nest Asyncio is less critical with the new async route approach, but kept for safety
nest_asyncio.apply()
load_dotenv(override=True)

# ============================================================================
# LLM INITIALIZATION
# ============================================================================


# Flask app
app = Flask(__name__)
CORS(app)

# Global state - Session memory
# NOTE: Because we use global variables, we must run in 1 Worker process with Async concurrency.
conversation_memory: Dict[str, List[BaseMessage]] = {}
pending_approval: Dict[str, Dict] = {}
current_attachment = None

# ============================================================================
# Helper Function for Date Parsing
# ============================================================================
def parse_snow_datetime(date_str: str) -> datetime:
    """Handles both ISO and standard date formats from ServiceNow."""
    if not date_str:
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except ValueError:
        try:
            return datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
        except Exception:
            return datetime.utcnow()

# ============================================================================
# UPDATED: CMDB CI SEARCH WITH NAME VALIDATION
# ============================================================================
@tool
def search_cmdb_ci_via_snow_api(query: str, table_name: str = "cmdb_ci_server") -> str:
    """
    Searches the ServiceNow CMDB directly for a Configuration Item (CI) using the REST API.
    All resources are in cmdb_ci_server table (singular).
    """
    SNOW_INSTANCE_URL = os.getenv("SNOW_INSTANCE_URL", "https://blecoe.service-now.com")
    SNOW_USER = os.getenv("SNOW_USER", "vmware")
    SNOW_PASS = os.getenv("SNOW_PASS", ".iZdl4D2c{;e&N^6F3)]5sHs(LNVNGn}Au@$GxB(mrC-^vx5x_DlSe<KquP3uH5pc*gIVRow)Q;%6#:;S>yS=!y69;K[ZZ?=%Is]")

    if not SNOW_INSTANCE_URL or not SNOW_USER or not SNOW_PASS:
        return json.dumps({"error": "ServiceNow credentials not set", "result": []})

    api_url = f"{SNOW_INSTANCE_URL}/api/now/table/{table_name}"

    headers = {
        "Accept": "application/json",
        "x-sn-apikey": "now_1dPp5LxQvAsaaRdQrX-k7H19GMUggHbqz1n7kHnErkhPeX4c0xq9N0kCuCFnuWbIa6dg3CnYll_Ea3YnxE1T5w"
    }
    auth = HTTPBasicAuth(SNOW_USER, SNOW_PASS)
    
    params = {
        "sysparm_query": query,
        "sysparm_limit": 10,
        "sysparm_display_value": "all",
        "sysparm_exclude_reference_link": "true",
    }
    
    print(f"[SNOW CI Search] Querying '{table_name}' with: {query}")
    
    try:
        response = requests.get(api_url, headers=headers, params=params, auth=auth)
        response.raise_for_status()
        
        result = response.json().get('result', [])
        
        if not result:
            return json.dumps({
                "error": f"No records found in '{table_name}' matching: {query}",
                "result": []
            })
        
        # CRITICAL: Validate each CI has a name
        validated_results = []
        warnings = []
        
        for ci in result:
            ci_sys_id = ci.get('sys_id', {})
            if isinstance(ci_sys_id, dict):
                ci_sys_id = ci_sys_id.get('value', '')
            
            ci_name = ci.get('name', '')
            if isinstance(ci_name, dict):
                ci_name = ci_name.get('display_value', '')
            
            # Check if name is empty
            if not ci_name or ci_name.strip() == '':
                warnings.append(f"⚠️ CI {ci_sys_id} has NO NAME field populated in ServiceNow")
                print(f"[SNOW CI Search] WARNING: CI {ci_sys_id} missing name")
                continue
            
            validated_results.append(ci)
            print(f"[SNOW CI Search] ✓ Valid CI: {ci_name} ({ci_sys_id})")
        
        if not validated_results:
            error_msg = f"Found {len(result)} CI(s), but NONE have the 'name' field populated in ServiceNow. "
            error_msg += "Please update the CI records with proper names before creating change requests."
            if warnings:
                error_msg += "\n\n" + "\n".join(warnings)
            
            return json.dumps({
                "error": error_msg,
                "result": [],
                "warnings": warnings
            })
        
        response_data = {
            "result": validated_results,
            "total_found": len(result),
            "total_valid": len(validated_results)
        }
        
        if warnings:
            response_data["warnings"] = warnings
        
        return json.dumps(response_data, indent=2)

    except requests.exceptions.HTTPError as err:
        error_details = response.json().get('error', {}).get('message', 'No error message')
        return json.dumps({
            "error": f"HTTP {response.status_code}: {error_details}",
            "result": []
        })
    except Exception as e:
        return json.dumps({
            "error": f"Unexpected error: {str(e)}",
            "result": []
        })


# ============================================================================
# UPDATED: ADD AFFECTED CIs WITH BETTER VALIDATION
# ============================================================================
@tool
def add_affected_cis(change_number: str, ci_names_list: List[str]) -> str:
    """
    Associates CIs to a Change Request using NAMES to prevent "(empty)" rows.
    """
    import json
    import requests
    from requests.auth import HTTPBasicAuth
    
    SNOW_INSTANCE_URL = os.getenv("SNOW_INSTANCE_URL", "https://blecoe.service-now.com")
    SNOW_USER = os.getenv("SNOW_USER", "vmware")
    SNOW_PASS = os.getenv("SNOW_PASS", ".iZdl4D2c{;e&N^6F3)]5sHs(LNVNGn}Au@$GxB(mrC-^vx5x_DlSe<KquP3uH5pc*gIVRow)Q;%6#:;S>yS=!y69;K[ZZ?=%Is]")
    
    if not SNOW_INSTANCE_URL or not SNOW_USER or not SNOW_PASS:
        return json.dumps({"status": "error", "message": "ServiceNow credentials not set"})

    # Filter out empty names
    valid_names = [name for name in ci_names_list if name and isinstance(name, str) and name.strip()]
    
    if not valid_names:
        return json.dumps({"status": "skipped", "message": "No valid CI names provided to link."})

    auth = HTTPBasicAuth(SNOW_USER, SNOW_PASS)
    api_url = f"{SNOW_INSTANCE_URL}/api/now/table/task_ci"

    # CRITICAL: This tells ServiceNow to interpret input values as "Display Values" (Names)
    params = {"sysparm_input_display_value": "true"}

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-sn-apikey": "now_1dPp5LxQvAsaaRdQrX-k7H19GMUggHbqz1n7kHnErkhPeX4c0xq9N0kCuCFnuWbIa6dg3CnYll_Ea3YnxE1T5w"
    }

    success_count = 0
    failures = []
    
    print(f"[Linker] Linking {len(valid_names)} CIs to {change_number} using Name Lookup...")

    for ci_name in valid_names:
        payload = {
            "task": change_number,  # Send Number (e.g. CHG001), SNOW will resolve to Sys ID
            "ci_item": ci_name      # Send Name (e.g. server1), SNOW will resolve to Sys ID
        }
        
        try:
            response = requests.post(api_url, json=payload, headers=headers, auth=auth, params=params)
            
            if response.status_code == 201:
                success_count += 1
                print(f"[Linker] ✓ Linked: {ci_name}")
            else:
                err_msg = response.json().get('error', {}).get('message', 'Unknown Error')
                failures.append(f"{ci_name}: {err_msg}")
                print(f"[Linker] ✗ Failed: {ci_name} ({err_msg})")
                
        except Exception as e:
            failures.append(f"{ci_name}: {str(e)}")

    result = {
        "status": "completed",
        "linked_count": success_count,
        "message": f"Successfully linked {success_count} CIs by name.",
        "failures": failures
    }
    return json.dumps(result, indent=2)

# ============================================================================
# OTHER TOOLS (unchanged)
# ============================================================================
@tool
def add_change_request_attachment(change_id: str, file_name: str, file_content_str: str) -> str:
    """Generates a text document and uploads it as an attachment to a change request."""
    print(f"[Attach Tool] Uploading '{file_name}' to change: {change_id}")

    SNOW_INSTANCE_URL = os.getenv("SNOW_INSTANCE_URL", "https://blecoe.service-now.com")
    SNOW_USER = os.getenv("SNOW_USER", "vmware")
    SNOW_PASS = os.getenv("SNOW_PASS", ".iZdl4D2c{;e&N^6F3)]5sHs(LNVNGn}Au@$GxB(mrC-^vx5x_DlSe<KquP3uH5pc*gIVRow)Q;%6#:;S>yS=!y69;K[ZZ?=%Is]")

    if not SNOW_INSTANCE_URL or not SNOW_USER or not SNOW_PASS:
        return json.dumps({"error": "ServiceNow credentials not set"})

    try:
        file_content_bytes = file_content_str.encode('utf-8')
        content_type, _ = mimetypes.guess_type(file_name)
        if content_type is None:
            content_type = "text/plain"

        sys_id = ""
        if len(change_id) == 32 and all(c in "0123456789abcdef" for c in change_id.lower()):
            sys_id = change_id
        else:
            print(f"[Attach Tool] Looking up sys_id for: {change_id}")
            lookup_url = f"{SNOW_INSTANCE_URL}/api/now/table/change_request"
            lookup_params = {"sysparm_query": f"number={change_id}", "sysparm_limit": 1, "sysparm_fields": "sys_id"}
            lookup_headers = {
                "Accept": "application/json",
                "x-sn-apikey": "now_1dPp5LxQvAsaaRdQrX-k7H19GMUggHbqz1n7kHnErkhPeX4c0xq9N0kCuCFnuWbIa6dg3CnYll_Ea3YnxE1T5w"
            }
            lookup_auth = HTTPBasicAuth(SNOW_USER, SNOW_PASS)
            
            response = requests.get(lookup_url, headers=lookup_headers, params=lookup_params, auth=lookup_auth)
            response.raise_for_status()
            result = response.json().get('result', [])
            if not result:
                return json.dumps({"error": f"Change request {change_id} not found"})
            sys_id = result[0]['sys_id']
        
        print(f"[Attach Tool] Attaching to sys_id: {sys_id}")

        upload_url = f"{SNOW_INSTANCE_URL}/api/now/attachment/upload"
        headers = {
            "Accept": "application/json",
            "x-sn-apikey": "now_1dPp5LxQvAsaaRdQrX-k7H19GMUggHbqz1n7kHnErkhPeX4c0xq9N0kCuCFnuWbIa6dg3CnYll_Ea3YnxE1T5w"
        }
        auth = HTTPBasicAuth(SNOW_USER, SNOW_PASS)
        
        data = {
            "table_name": "change_request",
            "table_sys_id": sys_id
        }
        
        files = {
            "uploadFile": (file_name, file_content_bytes, content_type)
        }
        
        response = requests.post(upload_url, headers=headers, data=data, files=files, auth=auth)
        response.raise_for_status()
        
        result = response.json()
        print(f"[Attach Tool] ✓ Success: {file_name}")
        return json.dumps(result, indent=2)

    except Exception as e:
        error_message = f"Failed to upload attachment: {str(e)}"
        print(f"[Attach Tool] ✗ Error: {error_message}")
        return json.dumps({"error": error_message})


@tool
def check_change_conflicts_after_creation(change_number: str, ci_sys_id: str, start_date: str, end_date: str) -> str:
    """Checks for conflicting change requests AFTER a change has been created."""
    SNOW_INSTANCE_URL = os.getenv("SNOW_INSTANCE_URL", "https://blecoe.service-now.com")
    SNOW_USER = os.getenv("SNOW_USER", "vmware")
    SNOW_PASS = os.getenv("SNOW_PASS", ".iZdl4D2c{;e&N^6F3)]5sHs(LNVNGn}Au@$GxB(mrC-^vx5x_DlSe<KquP3uH5pc*gIVRow)Q;%6#:;S>yS=!y69;K[ZZ?=%Is]")

    if not SNOW_INSTANCE_URL or not SNOW_USER or not SNOW_PASS:
        return "Error: ServiceNow credentials not set"
    
    if not ci_sys_id or len(ci_sys_id) != 32:
        return f"Error: Invalid ci_sys_id: {ci_sys_id}"

    api_url = f"{SNOW_INSTANCE_URL}/api/now/table/change_request"

    query = (
        f"cmdb_ci={ci_sys_id}"
        f"^stateNOT IN3,4,7"
        f"^numberNOT LIKE{change_number}"
        f"^start_date<={end_date}"
        f"^end_date>={start_date}"
    )

    headers = {
        "Accept": "application/json",
        "x-sn-apikey": "now_1dPp5LxQvAsaaRdQrX-k7H19GMUggHbqz1n7kHnErkhPeX4c0xq9N0kCuCFnuWbIa6dg3CnYll_Ea3YnxE1T5w"
    }
    auth = HTTPBasicAuth(SNOW_USER, SNOW_PASS)
    
    params = {
        "sysparm_query": query,
        "sysparm_display_value": "true",
        "sysparm_fields": "number,short_description,state,start_date,end_date,cmdb_ci,sys_id"
    }
    
    print(f"[Conflict Check] Checking conflicts for {change_number} on CI {ci_sys_id}")
    
    try:
        response = requests.get(api_url, headers=headers, params=params, auth=auth)
        response.raise_for_status()
        
        conflicts = response.json().get('result', [])
        
        if not conflicts:
            print("[Conflict Check] ✓ No conflicts")
            return f"No conflicts found. Change {change_number} has a clear schedule."
        
        print(f"[Conflict Check] ⚠️ Found {len(conflicts)} conflict(s)")
        conflict_list = [f"⚠️ CONFLICTS DETECTED for {change_number}:"]
        conflict_list.append(f"\nYour change window: {start_date} to {end_date}")
        conflict_list.append(f"\nConflicting changes on the same CI:\n")
        
        for idx, conflict in enumerate(conflicts, 1):
            conflict_list.append(
                f"{idx}. Change: {conflict['number']}\n"
                f"   Description: {conflict['short_description']}\n"
                f"   State: {conflict['state']}\n"
                f"   Window: {conflict['start_date']} to {conflict['end_date']}\n"
                f"   sys_id: {conflict['sys_id']}\n"
            )
        return "\n".join(conflict_list)

    except Exception as e:
        print(f"[Conflict Check] ✗ Error: {e}")
        return f"Error checking conflicts: {str(e)}"


@tool
def suggest_alternative_time_slots(ci_sys_id: str, requested_start: str, requested_end: str, duration_hours: int = 2) -> str:
    """Suggests alternative time slots that are free of conflicts for the given CI."""
    SNOW_INSTANCE_URL = os.getenv("SNOW_INSTANCE_URL", "https://blecoe.service-now.com")
    SNOW_USER = os.getenv("SNOW_USER", "vmware")
    SNOW_PASS = os.getenv("SNOW_PASS", ".iZdl4D2c{;e&N^6F3)]5sHs(LNVNGn}Au@$GxB(mrC-^vx5x_DlSe<KquP3uH5pc*gIVRow)Q;%6#:;S>yS=!y69;K[ZZ?=%Is]")
    
    if not SNOW_INSTANCE_URL or not SNOW_USER or not SNOW_PASS:
        return "Error: ServiceNow credentials not set"
    
    try:
        start_dt = parse_snow_datetime(requested_start)
        
        api_url = f"{SNOW_INSTANCE_URL}/api/now/table/change_request"

        search_start = start_dt.strftime("%Y-%m-%d %H:%M:%S")
        search_end = (start_dt + timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")

        query = (
            f"cmdb_ci={ci_sys_id}"
            f"^stateNOT IN3,4,7"
            f"^start_date>={search_start}"
            f"^start_date<={search_end}"
        )

        headers = {
            "Accept": "application/json",
            "x-sn-apikey": "now_1dPp5LxQvAsaaRdQrX-k7H19GMUggHbqz1n7kHnErkhPeX4c0xq9N0kCuCFnuWbIa6dg3CnYll_Ea3YnxE1T5w"
        }
        auth = HTTPBasicAuth(SNOW_USER, SNOW_PASS)
        
        params = {
            "sysparm_query": query,
            "sysparm_display_value": "true",
            "sysparm_fields": "number,start_date,end_date"
        }
        
        response = requests.get(api_url, headers=headers, params=params, auth=auth)
        response.raise_for_status()
        
        existing_changes = response.json().get('result', [])
        
        occupied_slots = []
        for change in existing_changes:
            try:
                occupied_start = parse_snow_datetime(change['start_date'])
                occupied_end = parse_snow_datetime(change['end_date'])
                occupied_slots.append((occupied_start, occupied_end))
            except:
                continue
                
        occupied_slots.sort(key=lambda x: x[0])
        
        suggestions = []
        current_check = start_dt
        
        while current_check < start_dt + timedelta(days=7) and len(suggestions) < 3:
            slot_end = current_check + timedelta(hours=duration_hours)
            
            is_available = True
            for occ_start, occ_end in occupied_slots:
                if current_check < occ_end and slot_end > occ_start:
                    is_available = False
                    break
                        
            if is_available:
                suggestions.append({
                    'start': current_check.strftime("%Y-%m-%d %H:%M:%S"),
                    'end': slot_end.strftime("%Y-%m-%d %H:%M:%S")
                })
                        
            current_check += timedelta(hours=2)
                
        if not suggestions:
            return "No alternative slots found in the next 7 days"
                
        result = ["✅ SUGGESTED ALTERNATIVE TIME SLOTS:\n"]
        for idx, slot in enumerate(suggestions, 1):
            result.append(f"{idx}. {slot['start']} to {slot['end']}")
                
        result.append("\nYou can:")
        result.append("1. Choose one of these alternative slots (e.g., 'use slot 1')")
        result.append("2. Modify the conflicting change(s) manually")
        result.append("3. Request a different time window")
                
        return "\n".join(result)

    except Exception as e:
        print(f"[Alternative Slots] ✗ Error: {e}")
        return f"Error finding alternative slots: {str(e)}"


@tool
def update_change_dates(change_sys_id: str, new_start_date: str, new_end_date: str) -> str:
    """Updates the start_date and end_date of an existing change request."""
    SNOW_INSTANCE_URL = os.getenv("SNOW_INSTANCE_URL", "https://blecoe.service-now.com")
    SNOW_USER = os.getenv("SNOW_USER", "vmware")
    SNOW_PASS = os.getenv("SNOW_PASS", ".iZdl4D2c{;e&N^6F3)]5sHs(LNVNGn}Au@$GxB(mrC-^vx5x_DlSe<KquP3uH5pc*gIVRow)Q;%6#:;S>yS=!y69;K[ZZ?=%Is]")
    
    if not SNOW_INSTANCE_URL or not SNOW_USER or not SNOW_PASS:
        return "Error: ServiceNow credentials not set"
    
    try:
        api_url = f"{SNOW_INSTANCE_URL}/api/now/table/change_request/{change_sys_id}"

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-sn-apikey": "now_1dPp5LxQvAsaaRdQrX-k7H19GMUggHbqz1n7kHnErkhPeX4c0xq9N0kCuCFnuWbIa6dg3CnYll_Ea3YnxE1T5w"
        }
        auth = HTTPBasicAuth(SNOW_USER, SNOW_PASS)
        
        payload = {
            "start_date": new_start_date,
            "end_date": new_end_date
        }
        
        print(f"[Update Change] Updating {change_sys_id}: {new_start_date} - {new_end_date}")
        
        response = requests.patch(api_url, json=payload, headers=headers, auth=auth)
        response.raise_for_status()
        
        result = response.json().get('result', {})
        change_number = result.get('number', 'Unknown')
        
        return f"✅ Successfully updated {change_number}\nNew schedule: {new_start_date} to {new_end_date}"

    except Exception as e:
        print(f"[Update Change] ✗ Error: {e}")
        return f"Error updating change: {str(e)}"


# ============================================================================
# MILVUS RETRIEVAL TOOLS
# ============================================================================
@tool
def search_similar_incidents(description: str) -> str:
    """Search for similar historical incidents in Milvus based on description."""
    MILVUS_HOST = os.getenv('MILVUS_HOST', "172.17.204.5")
    MILVUS_PORT = os.getenv('MILVUS_PORT', "19530")
    COLLECTION_NAME = "incident_history"

    try:
        connections.connect(alias="default", host=MILVUS_HOST, port=MILVUS_PORT)
        if not utility.has_collection(COLLECTION_NAME):
            return "No incident history available"

        collection = Collection(COLLECTION_NAME)
        collection.load()

        model = SentenceTransformer(os.getenv('EMBEDDING_MODEL', "all-MiniLM-L6-v2"))
        query_embedding = model.encode([description]).tolist()

        schema = collection.schema
        output_fields = [field.name for field in schema.fields if field.name not in ["embedding", "id"]]

        results = collection.search(
            query_embedding,
            "embedding",
            {"metric_type": "COSINE", "params": {"nprobe": 10}},
            limit=1,
            output_fields=output_fields
        )

        if not results[0]:
            return "No similar incidents found"

        matches = []
        for idx, hit in enumerate(results[0], 1):
            entity = hit.entity
            incident_number = entity.get('number', f'Incident #{idx}')

            match_parts = [
                f"{'='*70}",
                f"SIMILAR INCIDENT #{idx}: {incident_number}",
                f"Similarity Score: {hit.score:.2%}",
                f"{'='*70}",
                ""
            ]

            for field in output_fields:
                if field == 'number':
                    continue
                
                value = entity.get(field, 'NA')
                field_name = field.replace('_', ' ').title()

                long_text_fields = ['description', 'short_description', 'correlation_display', 
                                    'work_notes', 'comments', 'close_notes', 'resolution_notes']
                
                if field in long_text_fields and value and value != 'NA' and len(str(value)) > 50:
                    match_parts.append(f"\n**{field_name}**:")
                    match_parts.append(f"{value}")
                else:
                    match_parts.append(f"**{field_name}**: {value}")

            matches.append("\n".join(match_parts))

        connections.disconnect("default")
        return "\n\n".join(matches)

    except Exception as e:
        print(f"[Milvus] ✗ Error: {e}")
        return f"Error searching incidents: {str(e)}"


@tool
def search_similar_change_requests(description: str) -> str:
    """Search for similar historical change requests in Milvus."""
    MILVUS_HOST = os.getenv('MILVUS_HOST', "172.17.204.5")
    MILVUS_PORT = os.getenv('MILVUS_PORT', "19530")
    COLLECTION_NAME = "change_request_history"

    try:
        connections.connect(alias='default', host=MILVUS_HOST, port=MILVUS_PORT)
        if not utility.has_collection(COLLECTION_NAME):
            return "No change request history available"

        collection = Collection(COLLECTION_NAME)
        collection.load()

        model = SentenceTransformer(os.getenv('EMBEDDING_MODEL', "all-MiniLM-L6-v2"))
        query_embedding = model.encode([description]).tolist()

        schema = collection.schema
        output_fields = [field.name for field in schema.fields if field.name not in ["embedding", "id"]]

        results = collection.search(
            query_embedding,
            "embedding",
            {"metric_type": "COSINE", "params": {"nprobe": 10}},
            limit=1,
            output_fields=output_fields
        )

        if not results[0]:
            return "No similar change requests found"

        matches = []
        for idx, hit in enumerate(results[0], 1):
            entity = hit.entity
            change_number = entity.get('number', f'Change Request #{idx}')

            match_parts = [
                f"{'='*70}",
                f"SIMILAR CHANGE REQUEST #{idx}: {change_number}",
                f"Similarity Score: {hit.score:.2%}",
                f"{'='*70}",
                ""
            ]

            for field in output_fields:
                if field == 'number':
                    continue
                
                value = entity.get(field, 'NA')
                field_name = field.replace('_', ' ').title()

                long_text_fields = ['description', 'short_description', 'justification', 
                                    'implementation_plan', 'backout_plan', 'test_plan', 
                                    'risk_impact_analysis', 'change_plan', 'cab_required',
                                    'start_date', 'end_date']
                
                if field in long_text_fields and value and value != 'NA' and len(str(value)) > 50:
                    match_parts.append(f"\n**{field_name}**:")
                    match_parts.append(f"{value}")
                else:
                    match_parts.append(f"**{field_name}**: {value}")

            matches.append("\n".join(match_parts))

        connections.disconnect("default")
        return "\n\n".join(matches)

    except Exception as e:
        print(f"[Milvus] ✗ Error: {e}")
        return f"Error searching change requests: {str(e)}"


# ============================================================================
# HELPER FUNCTION TO EXTRACT FINAL AI MESSAGE
# ============================================================================
def extract_final_response(messages: List[BaseMessage]) -> str:
    """Extract the final AI response from the message list."""
    for msg in reversed(messages):
        if isinstance(msg, AIMessage):
            if hasattr(msg, 'tool_calls') and msg.tool_calls:
                continue
            
            content = msg.content
            
            if isinstance(content, str):
                if content and len(content.strip()) > 0:
                    if content.startswith("Called tool:") or content.startswith("\nCalled tool:"):
                        continue
                    return content
            
            elif isinstance(content, list):
                text_parts = []
                for block in content:
                    if isinstance(block, dict):
                        if block.get('type') == 'text':
                            text_parts.append(block.get('text', ''))
                    elif isinstance(block, str):
                        text_parts.append(block)
                
                combined = '\n'.join(text_parts).strip()
                if combined and not combined.startswith("Called tool:"):
                    return combined
    
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and msg.content:
            if isinstance(msg.content, str):
                return msg.content
            elif isinstance(msg.content, list):
                texts = [b.get('text', '') if isinstance(b, dict) else str(b) for b in msg.content]
                return '\n'.join(texts).strip()
    
    return "I processed your request but didn't generate a response. Please try again."


# ============================================================================
# TOOL SCHEMA FIX FOR GEMINI
# ============================================================================
def fix_tool_schema_for_gemini(tools):
    """Convert tool schemas to be compatible with Gemini's strict type requirements"""
    fixed_tools = []
    
    for tool in tools:
        try:
            if hasattr(tool, 'name') and tool.name in [
                'search_similar_incidents', 
                'search_similar_change_requests', 
                'add_change_request_attachment', 
                'check_change_conflicts_after_creation',
                'suggest_alternative_time_slots', 
                'update_change_dates',
                'search_cmdb_ci_via_snow_api',
                'add_affected_cis'
            ]:
                fixed_tools.append(tool)
                continue
            
            tool_schema = None
            if hasattr(tool, 'args_schema') and tool.args_schema:
                try:
                    tool_schema = tool.args_schema.schema() if hasattr(tool.args_schema, 'schema') else None
                except:
                    pass
            
            if not tool_schema or not isinstance(tool_schema, dict):
                fixed_tools.append(tool)
                continue
            
            if "properties" in tool_schema:
                for prop_name, prop_def in tool_schema["properties"].items():
                    if not isinstance(prop_def, dict):
                        continue
                    
                    if "enum" in prop_def and isinstance(prop_def["enum"], list):
                        prop_def["enum"] = [str(e) for e in prop_def["enum"]]
                    
                    if "type" in prop_def:
                        if isinstance(prop_def["type"], list):
                            prop_def["type"] = str(prop_def["type"][0])
                        elif not isinstance(prop_def["type"], str):
                            prop_def["type"] = str(prop_def["type"])
                    
                    for key in ["anyOf", "oneOf", "allOf"]:
                        if key in prop_def and isinstance(prop_def[key], list):
                            for sub_schema in prop_def[key]:
                                if isinstance(sub_schema, dict) and "enum" in sub_schema:
                                    sub_schema["enum"] = [str(e) for e in sub_schema["enum"]]
                    
                    if prop_def.get("type") == "object" and "properties" in prop_def:
                        for nested_prop, nested_def in prop_def["properties"].items():
                            if isinstance(nested_def, dict) and "enum" in nested_def:
                                nested_def["enum"] = [str(e) for e in nested_def["enum"]]
                    
                    if prop_def.get("type") == "array" and "items" in prop_def:
                        items = prop_def["items"]
                        if isinstance(items, dict):
                            if "enum" in items:
                                items["enum"] = [str(e) for e in items["enum"]]
                            if "type" in items and not isinstance(items["type"], str):
                                items["type"] = str(items["type"])
            
            fixed_tools.append(tool)
            
        except Exception as e:
            print(f"[Tool Fix Warning] Error processing tool {getattr(tool, 'name', 'unknown')}: {e}")
            fixed_tools.append(tool)
    
    return fixed_tools


# ============================================================================
# MAIN AGENT
# ============================================================================
async def main_agent(state: MessagesState, session_id: str = "default") -> Dict:

    """Main ITSM agent that handles all requests"""

    llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    api_key=os.getenv("GOOGLE_API_KEY")
)
    # llm=  ChatOpenAI(
    #     model_name="gpt-4-turbo",)

    global pending_approval, current_attachment, conversation_memory

    # System prompt
    system_prompt = """You are a helpful ITSM ServiceNow assistant. Your workflow is strict.

**CRITICAL RULES:**
1.  **NEVER** create a ticket (incident or change) without explicit user confirmation first.
2.  Your job is to first **PROPOSE**, then **WAIT** for a "Yes" or "Create it" confirmation, and only then **CREATE** and perform follow-up actions.
3.  When proposing, you **MUST** show all three sections: Reference, CMDB, and Proposed.
4.  You must remember the **Primary CI's sys_id** (for creation) AND the **Full List of CI Names** (for linking).
5.  **CRITICAL**: All CIs MUST have the 'name' field populated. If the CMDB search returns empty names, STOP and warn the user.

---
**WORKFLOW: STAGE 1 - GATHER & PROPOSE (User wants to create a ticket)**

1.  **User Asks:** "I need to create a change..." or "I have an incident..."
2.  **Your Action:**
    * Call **`search_similar_change_requests`** (for changes) or **`search_similar_incidents`** (for incidents) to get context.
    * Call **`search_cmdb_ci_via_snow_api`** to find **ALL** requested Configuration Items (CIs). Combine queries using `^OR`.
    * **CRITICAL MEMORY STEP:** You must extract and store two things:
        1.  `primary_ci_sys_id`: The sys_id of the **first** CI found (to be used for the `cmdb_ci` field).
        2.  `all_ci_names`: The exact **names** of ALL CIs found (to be used for linking).
        3.  `primary_ci_ip`: The IP address of the first CI.
    * **CRITICAL:** Use the **first CI's Name** as the **PRIMARY CI**.
3.  **Your Response (MUST follow this 3-part format):**

    Based on your request, I found the following context.
    
    **📚 REFERENCE TICKET (Used for Inference):**
    * **Number**: [Field 'number' from Milvus]
    * **Short Description**: [Field 'short_description' from Milvus]
    
    **🖥️ RELATED CMDB CI(s) (Key Info):**
    * **Primary CI (cmdb_ci field)**: [Name of CI 1]
    * **Affected CIs (Additional)**: [Names of other CIs]
    * **IP Address (Primary)**: [IP of CI 1]
    
    **📋 PROPOSED TICKET DETAILS (ALL FIELDS):**
    * **cmdb_ci (Primary)**: [Name of CI 1]
    * **Affected CIs (Additional ONLY)**: [List names of CIs *excluding* the Primary one]
    * **start_date**: [Field 'start_date' from Milvus/user]
    * **end_date**: [Field 'end_date' from Milvus/user]
    * **short_description**: [Field 'short_description' from Milvus] && [Generate description. MANDATORY: Include "Target Host: [primary_ci_name] | IP: [primary_ci_ip]" at the top.]
    * **description**: [Generate description. MANDATORY: Include "Target Host: [primary_ci_name] | IP: [primary_ci_ip]" at the top.]
    * ... [Populate ALL other fields] ...
    
    **❓ CONFIRMATION REQUIRED:**
    Please review the proposed details. Shall I create this ticket?
    
    * "Yes" or "Create it" to proceed
    * "Change [field] to [value]" to modify
    * "Cancel" to cancel
    
    **⏳ I'm waiting for your confirmation.**

---
**WORKFLOW: STAGE 2 - CREATE, ATTACH CIs, UPLOAD DOC, & CHECK (User says "Yes" or "Create it")**

1.  **User Confirms:** "Yes"
2.  **Your Action (Change Request - Step 1: Create):**
    * Call **`create_change_request`** using the **PRIMARY CI** (`primary_ci_sys_id`) for the `cmdb_ci` field.
    * **CRITICAL:** The `description` field MUST include the Hostname (Primary CI Name) and the IP Address retrieved in Stage 1.
    * Get the new change's `number` and `sys_id` from the tool's output.
3.  **Your Action (Change Request - Step 2: Add Affected CIs):**
    * **CRITICAL:** Create a new list called `ADDITIONAL_CI_NAMES`. Take your `all_ci_names` list from Stage 1 and **remove the Primary CI's name**.
    * **CRITICAL:** Call **`add_affected_cis`** using the **Change Number** and **Names**:
        * `change_number`: [The new change number, e.g., CHG012345]
        * `ci_names_list`: [The `ADDITIONAL_CI_NAMES` list]
    * *Note: This tool validates names to prevent "empty" rows. If it fails, it means the name is invalid.*
4.  **Your Action (Change Request - Step 3: Generate & Upload Doc):**
    * **Generate Text:** Generate the text for the CAB document.
    * **Call Upload Tool:** Call **`add_change_request_attachment`**:
        * `change_id`: [The new change number]
        * `file_name`: "CAB_Document_[CHG_NUMBER].txt"
        * `file_content_str`: [The full text of the CAB document]
5.  **Your Action (Change Request - Step 4: Check Conflicts):**
    * Call **`check_change_conflicts_after_creation`** using the **PRIMARY CI sys_id** and the change dates.
6.  **Analyze the Conflict Result:**
    * **If the result starts with "No conflicts found":** Proceed to Step 7 (No Conflict).
    * **If the result starts with "⚠️ CONFLICTS DETECTED":** Call **`suggest_alternative_time_slots`**.
7.  **Your Response (Change Request):**
    * **CRITICAL:** Use the actual count from the `add_affected_cis` tool output (the `linked_count` field) in your response.
    * **If NO conflicts:**
        "Great! The change request [CHG_NUMBER] has been created.
        
        I have successfully attached **[LINKED_CI_COUNT] Affected CI(s)**.
        
        I have also generated and attached the CAB approval document.
        
        [Show the full output from `check_change_conflicts_after_creation`]
        
        It will now be processed by ServiceNow's approval engine."
    * **If conflicts ARE found:**
        "Change request [CHG_NUMBER] was created, I successfully attached **[LINKED_CI_COUNT] Affected CI(s)** and the CAB document. However, I found conflicts:
        
        [Show the full output from `check_change_conflicts_after_creation`]
        
        [Show the full output from `suggest_alternative_time_slots`]
        
        Would you like me to reschedule this change to one of the suggested slots? (e.g., 'Yes, use slot 1')"
8.  **Your Action (Incident):**
    * Call **`create_incident`** with the proposed data.
    * **Your Response (Incident):** "Incident [INC_NUMBER] has been created successfully."

---
**WORKFLOW: STAGE 3 - RESCHEDULE (User says "Yes, use slot 1")**

1.  **User Confirms:** "Yes, use slot 1" or "Reschedule to..."
2.  **Your Action:**
    * Parse the user's request to get the `new_start_date` and `new_end_date` from the suggestion.
    * Call **`update_change_dates`**.
3.  **Your Response:**
    * [Show the full output from the `update_change_dates` tool]
"""

    try:
        async with MultiServerMCPClient({
            "snow": {
                "url": os.getenv('MCP_CLIENT_URL', "http://localhost:8000/sse"),
                "transport": "sse",
            },
        }) as client:
            snow_tools = client.get_tools()
            
            local_tools = [
                search_similar_incidents, 
                search_similar_change_requests,
                add_change_request_attachment,
                search_cmdb_ci_via_snow_api,
                check_change_conflicts_after_creation,
                suggest_alternative_time_slots,
                update_change_dates,
                add_affected_cis
            ]
            
            all_tools = snow_tools + local_tools
            
            # Use LangGraph's prebuilt agent which handles tool execution efficiently
            try:
                all_tools = fix_tool_schema_for_gemini(all_tools)
            except Exception as fix_error:
                print(f"[Agent] Warning: Tool fix failed: {fix_error}")
            
            new_user_message = state['messages'][-1]
            print(f"[Agent] User message: {new_user_message.content}")

            if session_id not in conversation_memory:
                conversation_memory[session_id] = []
            
            previous_history = conversation_memory[session_id]
            
            last_ai_message: Optional[AIMessage] = None
            for msg in reversed(previous_history):
                if isinstance(msg, AIMessage):
                    if not (hasattr(msg, 'tool_calls') and msg.tool_calls):
                        last_ai_message = msg
                        break
            
            history_for_llm = []
            if last_ai_message:
                history_for_llm.append(last_ai_message)

            history_for_llm.append(new_user_message)
            
            full_state = {
                "messages": history_for_llm
            }
            
            agent = create_react_agent(
                llm, 
                all_tools, 
                state_modifier=system_prompt,
            )

            # Await the agent execution - this allows other requests to be processed 
            # while this one waits for LLM responses
            result = await agent.ainvoke(
                full_state,
                config={
                    "recursion_limit": 50, 
                }
            )
            
            conversation_memory[session_id] = result['messages']
            conversation_memory[session_id] = conversation_memory[session_id][-20:]

            return result

    except Exception as e:
        print(f"[Agent] Error: {e}")
        import traceback
        traceback.print_exc()

        return {
            "messages": [
                AIMessage(content=f"I encountered an error: {str(e)}\n\nPlease make sure ServiceNow connections are working properly.")
            ]
        }


# ============================================================================
# FLASK API - ASYNC ENABLED
# ============================================================================
@app.route('/chat', methods=['POST'])
async def chat():  # CHANGED TO ASYNC DEF
    """
    Handles chat requests asynchronously.
    This allows the server to process multiple requests concurrently
    (e.g., waiting for LLM on one request while accepting another).
    """
    global current_attachment

    try:
        if request.is_json:
            data = request.get_json()
            user_message = data.get('message', '')
            session_id = data.get('session_id', 'default')
            uploaded_file = None
        else:
            user_message = request.form.get('message', '')
            session_id = request.form.get('session_id', 'default')
            uploaded_file = request.files.get('file')

        if uploaded_file and uploaded_file.filename:
            file_content = uploaded_file.read()
            if len(file_content) == 0:
                return jsonify({'response': 'File is empty.', 'timestamp': datetime.now().isoformat()})

            current_attachment = {
                "filename": uploaded_file.filename,
                "content": base64.b64encode(file_content).decode('utf-8'),
                "content_type": uploaded_file.content_type or "application/octet-stream"
            }
            user_message += f"\n[File attached: {uploaded_file.filename}]"

        print(f"\n{'='*60}")
        print(f"[Chat] User: {user_message}")
        print(f"[Chat] Session: {session_id}")
        print(f"{'='*60}")

        state = {
            "messages": [HumanMessage(content=user_message)]
        }

        # CRITICAL CHANGE: 
        # Directly await the async agent function.
        # This removes the blocking "loop.run_until_complete" call.
        # Hypercorn will schedule this coroutine and can handle other requests while this awaits.
        try:
            result = await main_agent(state, session_id)
            final_message = extract_final_response(result["messages"])
            print(f"\n[Chat] Final response extracted: {final_message[:200]}...")
            
        except Exception as e:
            print(f"[Chat] Workflow error: {e}")
            import traceback
            traceback.print_exc()
            final_message = f"I encountered an error while processing your request: {str(e)}"
        finally:
            current_attachment = None

        return jsonify({
            'response': final_message,
            'session_id': session_id,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"[Chat] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'response': f"Error: {str(e)}",
            'timestamp': datetime.now().isoformat()
        }), 500


@app.route('/reset', methods=['POST'])
def reset():
    global pending_approval, current_attachment, conversation_memory
    
    data = request.get_json() if request.is_json else {}
    session_id = data.get('session_id', 'default')
    
    if session_id == 'all':
        conversation_memory = {}
        pending_approval = {}
        message = 'All sessions reset successfully'
    else:
        if session_id in conversation_memory:
            del conversation_memory[session_id]
        if session_id in pending_approval:
            del pending_approval[session_id]
        message = f'Session {session_id} reset successfully'
    
    current_attachment = None
    
    return jsonify({
        'message': message,
        'timestamp': datetime.now().isoformat()
    })


@app.route('/sessions', methods=['GET'])
def get_sessions():
    """Get list of active sessions"""
    sessions = []
    for session_id, messages in conversation_memory.items():
        sessions.append({
            'session_id': session_id,
            'message_count': len(messages),
            'last_message': messages[-1].content[:100] if messages else None
        })
    
    return jsonify({
        'sessions': sessions,
        'total_sessions': len(sessions),
        'timestamp': datetime.now().isoformat()
    })


if __name__ == '__main__':
    print("=" * 80)
    print("Starting ITSM Agent (ASYNC ENABLED)")
    print("Parallel requests enabled via AsyncIO.")
    print("=" * 80)
    
    config = Config()
    config.bind = ["0.0.0.0:5019"]
    # We keep workers at 1 because we use global variables (conversation_memory) in memory.
    # Concurrency is handled by AsyncIO, allowing multiple requests to interleave within 1 process.
    config.workers = 1 
    config.keep_alive_timeout = 120
    
    asyncio.run(serve(app, config))
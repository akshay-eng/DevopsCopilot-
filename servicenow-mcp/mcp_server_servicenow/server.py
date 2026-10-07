import os
import json
import asyncio
import logging
import re
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any, Union, Literal, Tuple

import requests
import httpx
from pydantic import BaseModel, Field, field_validator
import mimetypes

from mcp_server_servicenow.nlp import NLPProcessor

from mcp.server.fastmcp import FastMCP, Context
from mcp.server.fastmcp.utilities.logging import get_logger

logger = get_logger(__name__)

# ServiceNow API models
# ServiceNow API models
class IncidentState(str, Enum):
    NEW = "1"
    IN_PROGRESS = "2" 
    ON_HOLD = "3"
    RESOLVED = "6"
    CLOSED = "7"
    CANCELED = "8"

class IncidentPriority(str, Enum):
    CRITICAL = "1"
    HIGH = "2"
    MODERATE = "3"
    LOW = "4"
    PLANNING = "5"

class IncidentUrgency(str, Enum):
    HIGH = "1"
    MEDIUM = "2"
    LOW = "3"

class IncidentImpact(str, Enum):
    HIGH = "1"
    MEDIUM = "2"
    LOW = "3"

class HoldImpact(str, Enum):
    """Enum for hold reasons -
    - awaiting caller code = "1"
    - awaiting change code = "2"
    - awaiting problem code = "3"
    - awaiting vendor code = "4"
    """
    AWAITING_CALLER = "1"
    AWAITING_CHANGE = "2"
    AWAITING_PROBLEM = "3"
    AWAITING_VENDOR = "4"

class ChangeRequestState(str, Enum):
    NEW = "-5"
    ASSESS = "-4"
    AUTHORIZE = "-3"
    SCHEDULED = "-2"
    IMPLEMENT = "-1"
    REVIEW = "0"
    CLOSED = "3"
    CANCELED = "4"

class ChangeRequestType(str, Enum):
    NORMAL = "normal"
    STANDARD = "standard"
    EMERGENCY = "emergency"

class ChangeRequestPriority(str, Enum):
    CRITICAL = "1"
    HIGH = "2"
    MODERATE = "3"
    LOW = "4"

class ChangeRequestRisk(str, Enum):
    HIGH = "High"
    MODERATE = "Moderate"
    LOW = "Low"

class ChangeRequestImpact(str, Enum):
    HIGH = "1"
    MEDIUM = "2"
    LOW = "3"

class ChangeRequestCloseCode(str, Enum):
    SUCCESSFUL = "Successful"
    SUCCESSFUL_WITH_ISSUES = "Successful with issues"
    UNSUCCESSFUL = "Unsuccessful"

# Models for tool parameters
class CreateChangeRequestParams(BaseModel):
    """Parameters for creating a new change request with complete field mapping."""
    short_description: str = Field(..., description="A brief title for the change request")
    description: Optional[str] = Field(None, description="A detailed explanation of the change")
    category: Optional[str] = Field(None, description="Category of the change (e.g., Infrastructure)")
    service: Optional[str] = Field(None, description="Affected service")
    cmdb_ci: Optional[str] = Field(None, description="Configuration item being changed (use the CI name)") 
    justification: Optional[str] = Field(None, description="The reason for the change")
    type: Optional[ChangeRequestType] = Field(None, description="Type of change (normal, standard, emergency)")
    requested_by: Optional[str] = Field(None, description="User who requested the change")
    assignment_group: Optional[str] = Field(None, description="Group assigned to the change")
    assigned_to: Optional[str] = Field(None, description="User assigned to the change")
    priority: Optional[ChangeRequestPriority] = Field(None, description="The priority of the change")
    risk: Optional[ChangeRequestRisk] = Field(None, description="The risk level of the change")
    impact: Optional[ChangeRequestImpact] = Field(None, description="The impact of the change")
    state: Optional[str] = Field(None, description="Initial state (defaults to New)")
    implementation_plan: Optional[str] = Field(None, description="The plan for implementing the change")
    risk_impact_analysis: Optional[str] = Field(None, description="Analysis of risk and impact") 
    backout_plan: Optional[str] = Field(None, description="The plan for backing out the change if it fails")
    test_plan: Optional[str] = Field(None, description="The plan for testing the change")
    start_date: Optional[str] = Field(None, description="Planned start date (YYYY-MM-DD HH:MM:SS)")
    end_date: Optional[str] = Field(None, description="Planned end date (YYYY-MM-DD HH:MM:SS)")
    cab_required: Optional[bool] = Field(None, description="True if a CAB meeting is required for approval")
    cab_date: Optional[str] = Field(None, description="CAB meeting date/time (YYYY-MM-DD HH:MM:SS)")
    cab_delegate: Optional[str] = Field(None, description="CAB delegate or representative")


class UpdateChangeRequestParams(BaseModel):
    """Parameters for updating an existing change request with partial data."""
    change_id: str = Field(..., description="Change request number (e.g., CHG0010078) or sys_id")
    requested_by: Optional[str] = Field(None, description="The user who requested the change")
    category: Optional[str] = Field(None, description="The category of the change")
    service: Optional[str] = Field(None, description="The affected service")
    cmdb_ci: Optional[str] = Field(None, description="The affected configuration item (use the CI name)")
    priority: Optional[str] = Field(None, description="The priority of the change")
    risk: Optional[str] = Field(None, description="The risk level of the change")
    impact: Optional[str] = Field(None, description="The impact of the change")
    type: Optional[str] = Field(None, description="Type of change (Normal, Standard, Emergency)")
    state: Optional[str] = Field(None, description="The current state of the change (e.g., New, Assess, Implement)")
    assignment_group: Optional[str] = Field(None, description="The group assigned to the change")
    assigned_to: Optional[str] = Field(None, description="The user assigned to the change")
    short_description: Optional[str] = Field(None, description="A brief summary of the change")
    description: Optional[str] = Field(None, description="A detailed description of the change")
    justification: Optional[str] = Field(None, description="The reason for the change")
    implementation_plan: Optional[str] = Field(None, description="The plan for implementing the change")
    risk_impact_analysis: Optional[str] = Field(None, description="Analysis of risk and impact")
    backout_plan: Optional[str] = Field(None, description="The plan for backing out the change")
    test_plan: Optional[str] = Field(None, description="The plan for testing the change")
    start_date: Optional[str] = Field(None, description="Planned start date (YYYY-MM-DD HH:MM:SS)")
    end_date: Optional[str] = Field(None, description="Planned end date (YYYY-MM-DD HH:MM:SS)")
    work_notes: Optional[str] = Field(None, description="Internal work notes to add")
    close_code: Optional[str] = Field(None, description="The code for closing the change")
    close_notes: Optional[str] = Field(None, description="Notes for closing the change")
    
    @field_validator('work_notes', 'close_notes')
    @classmethod
    def validate_not_empty(cls, v):
        if v is not None and v.strip() == '':
            raise ValueError("Cannot be an empty string")
        return v

class ResolveIncidentParams(BaseModel):
    """Parameters for resolving an incident."""

    incident_id: str = Field(..., description="Incident ID or sys_id")
    resolution_code: str = Field(..., description="Resolution code for the incident")
    resolution_notes: str = Field(..., description="Resolution notes for the incident")   

class OnholdIncidentParams(BaseModel):
    """Parameters for holding  an incident."""

    incident_id: str = Field(..., description="Incident ID or sys_id")
    on_hold_reason: HoldImpact = Field(None, description="The hold reason  of the incident")
    
    # resolution_code: str = Field(..., description="Resolution code for the incident")
    # resolution_notes: str = Field(..., description="Resolution notes for the incident")   

class IncidentCreate(BaseModel):
    """Model for creating a new incident"""
    short_description: str = Field(..., description="A brief description of the incident")
    description: str = Field(..., description="A detailed description of the incident")
    caller_id: Optional[str] = Field(None, description="The sys_id or name of the caller")
    category: Optional[str] = Field(None, description="The incident category")
    subcategory: Optional[str] = Field(None, description="The incident subcategory")
    urgency: Optional[IncidentUrgency] = Field(IncidentUrgency.MEDIUM, description="The urgency of the incident")
    impact: Optional[IncidentImpact] = Field(IncidentImpact.MEDIUM, description="The impact of the incident")
    assignment_group: Optional[str] = Field(None, description="The sys_id or name of the assignment group")
    assigned_to: Optional[str] = Field(None, description="The sys_id or name of the assignee")

class IncidentUpdate(BaseModel):
    """Model for updating an existing incident with comprehensive field support"""
    # Core incident fields
    short_description: Optional[str] = Field(None, description="A brief description of the incident")
    description: Optional[str] = Field(None, description="A detailed description of the incident")
    caller_id: Optional[str] = Field(None, description="The sys_id or name of the caller")
    category: Optional[str] = Field(None, description="The incident category")
    subcategory: Optional[str] = Field(None, description="The incident subcategory")
    urgency: Optional[IncidentUrgency] = Field(None, description="The urgency of the incident")
    impact: Optional[IncidentImpact] = Field(None, description="The impact of the incident")
    state: Optional[IncidentState] = Field(None, description="The state of the incident")
    priority: Optional[IncidentPriority] = Field(None, description="The priority of the incident")
    severity: Optional[str] = Field(None, description="The severity of the incident")

    # Assignment fields
    assignment_group: Optional[str] = Field(None, description="The sys_id or name of the assignment group")
    assigned_to: Optional[str] = Field(None, description="The sys_id or name of the assignee")
    opened_by: Optional[str] = Field(None, description="The sys_id or name of who opened the incident")
    resolved_by: Optional[str] = Field(None, description="The sys_id or name of who resolved the incident")
    closed_by: Optional[str] = Field(None, description="The sys_id or name of who closed the incident")
    reopened_by: Optional[str] = Field(None, description="The sys_id or name of who reopened the incident")

    # Communication fields
    work_notes: Optional[str] = Field(None, description="Work notes to add to the incident (internal)")
    comments: Optional[str] = Field(None, description="Customer visible comments to add to the incident")
    close_notes: Optional[str] = Field(None, description="Notes for closing the incident")
    close_code: Optional[str] = Field(None, description="The code for closing the incident")

    # Status fields
    active: Optional[str] = Field(None, description="Whether the incident is active (true/false)")
    incident_state: Optional[str] = Field(None, description="The incident state")
    hold_reason: Optional[str] = Field(None, description="The reason for holding the incident")
    escalation: Optional[str] = Field(None, description="The escalation level")

    # SLA fields
    sla_due: Optional[str] = Field(None, description="SLA due date/time")
    made_sla: Optional[str] = Field(None, description="Whether the incident made its SLA (true/false)")

    # Business impact fields
    business_service: Optional[str] = Field(None, description="The affected business service")
    business_impact: Optional[str] = Field(None, description="The business impact")
    business_duration: Optional[str] = Field(None, description="The business duration")
    business_stc: Optional[str] = Field(None, description="The business STC (seconds)")

    # Configuration fields
    cmdb_ci: Optional[str] = Field(None, description="The configuration item")
    company: Optional[str] = Field(None, description="The company affected")
    location: Optional[str] = Field(None, description="The location")

    # Approval fields
    approval: Optional[str] = Field(None, description="The approval status")
    approval_set: Optional[str] = Field(None, description="The approval set")
    approval_history: Optional[str] = Field(None, description="The approval history")
    upon_approval: Optional[str] = Field(None, description="Action upon approval")
    upon_reject: Optional[str] = Field(None, description="Action upon rejection")

    # Parent/child relationships
    parent: Optional[str] = Field(None, description="The parent incident sys_id")
    parent_incident: Optional[str] = Field(None, description="The parent incident")
    child_incidents: Optional[str] = Field(None, description="Number of child incidents")

    # Work tracking fields
    work_start: Optional[str] = Field(None, description="Work start date/time")
    work_end: Optional[str] = Field(None, description="Work end date/time")
    time_worked: Optional[str] = Field(None, description="Time worked on the incident")
    expected_start: Optional[str] = Field(None, description="Expected start date/time")
    due_date: Optional[str] = Field(None, description="Due date")
    activity_due: Optional[str] = Field(None, description="Activity due date/time")

    # Date/time fields
    opened_at: Optional[str] = Field(None, description="When the incident was opened")
    resolved_at: Optional[str] = Field(None, description="When the incident was resolved")
    closed_at: Optional[str] = Field(None, description="When the incident was closed")
    reopened_time: Optional[str] = Field(None, description="When the incident was reopened")

    # Other tracking fields
    reassignment_count: Optional[str] = Field(None, description="Number of reassignments")
    reopen_count: Optional[str] = Field(None, description="Number of times reopened")
    sys_mod_count: Optional[str] = Field(None, description="Number of modifications")

    # Correlation fields
    correlation_id: Optional[str] = Field(None, description="Correlation ID")
    correlation_display: Optional[str] = Field(None, description="Correlation display")

    # Problem/RFC fields
    problem_id: Optional[str] = Field(None, description="Related problem ID")
    rfc: Optional[str] = Field(None, description="Related RFC")

    # Custom/integration fields
    caused_by: Optional[str] = Field(None, description="What caused the incident")
    watch_list: Optional[str] = Field(None, description="Watch list")
    order: Optional[str] = Field(None, description="Order")
    contact_type: Optional[str] = Field(None, description="Contact type")
    notify: Optional[str] = Field(None, description="Notification preference")
    knowledge: Optional[str] = Field(None, description="Knowledge article flag")
    service_offering: Optional[str] = Field(None, description="Service offering")
    follow_up: Optional[str] = Field(None, description="Follow up date/time")
    origin_id: Optional[str] = Field(None, description="Origin ID")
    origin_table: Optional[str] = Field(None, description="Origin table")
    route_reason: Optional[str] = Field(None, description="Route reason")
    contract: Optional[str] = Field(None, description="Related contract")
    user_input: Optional[str] = Field(None, description="User input")
    skills: Optional[str] = Field(None, description="Required skills")
    universal_request: Optional[str] = Field(None, description="Universal request")
    task_effective_number: Optional[str] = Field(None, description="Task effective number")
    group_list: Optional[str] = Field(None, description="Group list")
    additional_assignee_list: Optional[str] = Field(None, description="Additional assignee list")
    work_notes_list: Optional[str] = Field(None, description="Work notes list")
    comments_and_work_notes: Optional[str] = Field(None, description="Comments and work notes")
    calendar_duration: Optional[str] = Field(None, description="Calendar duration")
    calendar_stc: Optional[str] = Field(None, description="Calendar STC (seconds)")
    cause: Optional[str] = Field(None, description="The cause of the incident")
    sys_tags: Optional[str] = Field(None, description="System tags")
    sys_domain: Optional[str] = Field(None, description="System domain")
    sys_domain_path: Optional[str] = Field(None, description="System domain path")

    # Custom fields (prefixed with u_ or x_)
    u_ci_name: Optional[str] = Field(None, description="Custom: CI name")
    u_instance_name: Optional[str] = Field(None, description="Custom: Instance name")
    u_opsramp_incident_id: Optional[str] = Field(None, description="Custom: OpsRamp incident ID")
    u_ip_address: Optional[str] = Field(None, description="Custom: IP address")
    u_database_version: Optional[str] = Field(None, description="Custom: Database version")
    u_channel: Optional[str] = Field(None, description="Custom: Channel")
    u_rpt_datedifference: Optional[str] = Field(None, description="Custom: Report date difference")
    x_nuta2_nutanix_ca_catalog_item: Optional[str] = Field(None, description="Custom: Nutanix catalog item")
    x_datad_datadog_datadog_ticket: Optional[str] = Field(None, description="Custom: Datadog ticket flag")
    x_opra_opsramp_int_opsramp_incident_id: Optional[str] = Field(None, description="Custom: OpsRamp integration incident ID")

    @field_validator('work_notes', 'comments', 'close_notes')
    @classmethod
    def validate_not_empty(cls, v):
        if v is not None and v.strip() == '':
            raise ValueError("Cannot be an empty string")
        return v

    class Config:
        use_enum_values = True
        
class QueryOptions(BaseModel):
    """Options for querying ServiceNow records"""
    limit: int = Field(10, description="Maximum number of records to return", ge=1, le=1000)
    offset: int = Field(0, description="Number of records to skip", ge=0)
    fields: Optional[List[str]] = Field(None, description="List of fields to return")
    query: Optional[str] = Field(None, description="ServiceNow encoded query string")
    order_by: Optional[str] = Field(None, description="Field to order results by")
    order_direction: Optional[Literal["asc", "desc"]] = Field("desc", description="Order direction")

class Authentication:
    """Base class for ServiceNow authentication methods"""
    
    async def get_headers(self) -> Dict[str, str]:
        """Get authentication headers for ServiceNow API requests"""
        raise NotImplementedError("Subclasses must implement this method")

class BasicAuth(Authentication):
    """Basic authentication for ServiceNow"""
    
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        
    async def get_headers(self) -> Dict[str, str]:
        """Get authentication headers for ServiceNow API requests"""
        return {}
    
    def get_auth(self) -> tuple:
        """Get authentication tuple for requests"""
        return (self.username, self.password)

class TokenAuth(Authentication):
    """Token authentication for ServiceNow"""
    
    def __init__(self, token: str):
        self.token = token
        
    async def get_headers(self) -> Dict[str, str]:
        """Get authentication headers for ServiceNow API requests"""
        return {"Authorization": f"Bearer {self.token}"}
    
    def get_auth(self) -> None:
        """Get authentication tuple for requests"""
        return None

class OAuthAuth(Authentication):
    """OAuth authentication for ServiceNow"""

    def __init__(self, client_id: str, client_secret: str, username: str, password: str,
                 instance_url: str, token: Optional[str] = None, refresh_token: Optional[str] = None,
                 token_expiry: Optional[datetime] = None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.username = username
        self.password = password
        self.instance_url = instance_url
        self.token = token
        self.refresh_token = refresh_token
        self.token_expiry = token_expiry

    async def get_headers(self) -> Dict[str, str]:
        """Get authentication headers for ServiceNow API requests"""
        if self.token is None or (self.token_expiry and datetime.now() > self.token_expiry):
            await self.refresh()

        return {"Authorization": f"Bearer {self.token}"}

    def get_auth(self) -> None:
        """Get authentication tuple for requests"""
        return None

    async def refresh(self):
        """Refresh the OAuth token"""
        if self.refresh_token:
            # Try refresh flow first
            data = {
                "grant_type": "refresh_token",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token
            }
        else:
            # Fall back to password flow
            data = {
                "grant_type": "password",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "username": self.username,
                "password": self.password
            }

        token_url = f"{self.instance_url}/oauth_token.do"
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()
            result = response.json()

            self.token = result["access_token"]
            self.refresh_token = result.get("refresh_token")
            expires_in = result.get("expires_in", 1800)  # Default 30 minutes
            self.token_expiry = datetime.now().timestamp() + expires_in

class ApiKeyAuth(Authentication):
    """API Key authentication for ServiceNow"""

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def get_headers(self) -> Dict[str, str]:
        """Get authentication headers for ServiceNow API requests"""
        return {"x-sn-apikey": self.api_key}

    def get_auth(self) -> None:
        """Get authentication tuple for requests"""
        return None

class ServiceNowClient:
    """Client for interacting with ServiceNow API"""
    
    def __init__(self, instance_url: str, auth: Authentication):
        self.instance_url = instance_url.rstrip('/')
        self.auth = auth
        self.client = httpx.AsyncClient()
        
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()
        
    async def request(self, method: str, path: str,
                      params: Optional[Dict[str, Any]] = None,
                      json_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make a request to the ServiceNow API"""
        import base64

        url = f"{self.instance_url}{path}"
        headers = await self.auth.get_headers()
        headers["Accept"] = "application/json"
        # Always include API key for authentication
        headers["x-sn-apikey"] = "now_1dPp5LxQvAsaaRdQrX-k7H19GMUggHbqz1n7kHnErkhPeX4c0xq9N0kCuCFnuWbIa6dg3CnYll_Ea3YnxE1T5w"
        

        # Manually add Basic Auth header along with API key
        if isinstance(self.auth, BasicAuth):
            username, password = self.auth.get_auth()
            credentials = f"{username}:{password}"
            encoded = base64.b64encode(credentials.encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"
            logger.info(f"Using BasicAuth with username: {username}")
            logger.info(f"Authorization header value: Basic {encoded[:20]}...")

        logger.info(f"Request headers: {list(headers.keys())}")
        logger.info(f"x-sn-apikey value: {headers.get('x-sn-apikey', 'NOT SET')[:20]}...")
        logger.info(f"Method: {method}, URL: {url}")
        logger.info(f"JSON data being sent: {json_data}")

        try:
            response = await self.client.request(
                method=method,
                url=url,
                params=params,
                json=json_data,
                headers=headers
            )
            logger.info(f"Response status: {response.status_code}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"ServiceNow API error: {e.response.text}")
            logger.error(f"Request that was sent - URL: {url}")
            logger.error(f"Request headers that were sent: {dict(e.request.headers)}")
            logger.error(f"Request body that was sent: {e.request.content}")
            raise
            
    async def get_record(self, table: str, sys_id: str) -> Dict[str, Any]:
        """Get a record by sys_id"""
        if table == "incident" and sys_id.startswith("INC"):
            # This is an incident number, not a sys_id
            logger.warning(f"Attempted to use get_record with incident number instead of sys_id: {sys_id}")
            logger.warning("Redirecting to get_incident_by_number method")
            result = await self.get_incident_by_number(sys_id)
            if result:
                return {"result": result}
            else:
                raise ValueError(f"Incident not found: {sys_id}")
        return await self.request("GET", f"/api/now/table/{table}/{sys_id}")
        
    async def get_records(self, table: str, options: QueryOptions = None) -> Dict[str, Any]:
        """Get records with query options"""
        if options is None:
            options = QueryOptions()
            
        params = {
            "sysparm_limit": options.limit,
            "sysparm_offset": options.offset
        }
        
        if options.fields:
            params["sysparm_fields"] = ",".join(options.fields)
            
        if options.query:
            params["sysparm_query"] = options.query
            
        if options.order_by:
            direction = "desc" if options.order_direction == "desc" else "asc"
            params["sysparm_order_by"] = f"{options.order_by}^{direction}"
            
        return await self.request("GET", f"/api/now/table/{table}", params=params)
    
    async def create_record(self, table: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new record"""
        return await self.request("POST", f"/api/now/table/{table}", json_data=data)
        
    async def update_record(self, table: str, sys_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing record"""
        return await self.request("PATCH", f"/api/now/table/{table}/{sys_id}", json_data=data)
        
    async def delete_record(self, table: str, sys_id: str) -> Dict[str, Any]:
        """Delete a record"""
        return await self.request("DELETE", f"/api/now/table/{table}/{sys_id}")
        
    async def get_incident_by_number(self, number: str) -> Dict[str, Any]:
        """Get an incident by its number"""
        result = await self.request("GET", f"/api/now/table/incident", 
                                     params={"sysparm_query": f"number={number}", "sysparm_limit": 1})
        if result.get("result") and len(result["result"]) > 0:
            return result["result"][0]
        return None
        
    async def search(self, query: str, table: str = "incident", limit: int = 10) -> Dict[str, Any]:
        """Search for records using text query"""
        return await self.request("GET", f"/api/now/table/{table}", 
                                 params={"sysparm_query": f"123TEXTQUERY321={query}", "sysparm_limit": limit})
                                    
    async def get_available_tables(self) -> List[str]:
        """Get a list of available tables"""
        result = await self.request("GET", "/api/now/table/sys_db_object", 
                                     params={"sysparm_fields": "name,label", "sysparm_limit": 100})
        return result.get("result", [])
        
    async def get_table_schema(self, table: str) -> Dict[str, Any]:
        """Get the schema for a table"""
        result = await self.request("GET", f"/api/now/ui/meta/{table}")
        return result
    
    async def get_change_request_by_number(self, number: str) -> Dict[str, Any]:
        """Get a change request by its number"""
        result = await self.request("GET", f"/api/now/table/change_request", 
                             params={"sysparm_query": f"number={number}", "sysparm_limit": 1})
        if result.get("result") and len(result["result"]) > 0:
            return result["result"][0]
        return None


class ScriptUpdateModel(BaseModel):
    """Model for updating a ServiceNow script"""
    name: str = Field(..., description="The name of the script")
    script: str = Field(..., description="The script content")
    type: str = Field(..., description="The type of script (e.g., sys_script_include)")
    description: Optional[str] = Field(None, description="Description of the script")

class ServiceNowMCP:
    """ServiceNow MCP Server"""
    
    def __init__(self,
                 instance_url: str,
                 auth: Authentication,
                 name: str = "ServiceNow MCP",
                 host: str = "127.0.0.1",
                 port: int = 8000):
        self.client = ServiceNowClient(instance_url, auth)
        self.mcp = FastMCP(name, dependencies=[
            "requests",
            "httpx",
            "pydantic"
        ], host=host, port=port)
        
        # Register resources
        self.mcp.resource("servicenow://incidents")(self.list_incidents)
        self.mcp.resource("servicenow://incidents/{number}")(self.get_incident)
        self.mcp.resource("servicenow://users")(self.list_users)
        self.mcp.resource("servicenow://knowledge")(self.list_knowledge)
        self.mcp.resource("servicenow://tables")(self.get_tables)
        self.mcp.resource("servicenow://tables/{table}")(self.get_table_records)
        self.mcp.resource("servicenow://schema/{table}")(self.get_table_schema)
        # Add these lines after the existing resource registrations
        self.mcp.resource("servicenow://change_requests")(self.list_change_requests)
        self.mcp.resource("servicenow://change_requests/{number}")(self.get_change_request)
        
        # Register tools
        self.mcp.tool(name="create_incident")(self.create_incident)
        self.mcp.tool(name="update_incident")(self.update_incident)
        self.mcp.tool(name="search_records")(self.search_records)
        self.mcp.tool(name="get_record")(self.get_record)
        self.mcp.tool(name="perform_query")(self.perform_query)
        self.mcp.tool(name="add_comment")(self.add_comment)
        self.mcp.tool(name="add_work_notes")(self.add_work_notes)
        self.mcp.tool(name="resolve_incident")(self.resolve_incident)
        self.mcp.tool(name="close_incident")(self.close_incident)
        self.mcp.tool(name="on_hold_incident")(self.on_hold_incident)
        self.mcp.tool(name="cancel_incident")(self.cancel_incident)
       

        # Add these lines after the existing tool registrations
        self.mcp.tool(name="close_incident_self_heal")(self.close_incident_self_heal)
        self.mcp.tool(name="create_change_request")(self.create_change_request)
        self.mcp.tool(name="update_change_field")(self.update_change_field)
        self.mcp.tool(name="move_change_state")(self.move_change_state)
        self.mcp.tool(name="update_change_request")(self.update_change_request)
        self.mcp.tool(name="list_change_requests")(self.list_change_requests)
        self.mcp.tool(name="get_change_request_details")(self.get_change_request_details)
        self.mcp.tool(name="add_change_task")(self.add_change_task)
        self.mcp.tool(name="submit_change_for_approval")(self.submit_change_for_approval)
        self.mcp.tool(name="approve_change")(self.approve_change)
        self.mcp.tool(name="reject_change")(self.reject_change)
        # self.mcp.tool(name="add_change_request_attachment")(self.add_change_request_attachment)


        
        # Register natural language tools
        self.mcp.tool(name="natural_language_search")(self.natural_language_search)
        self.mcp.tool(name="natural_language_update")(self.natural_language_update)
        self.mcp.tool(name="update_script")(self.update_script)
        
        # Register prompts
        self.mcp.prompt(name="analyze_incident")(self.incident_analysis_prompt)
        self.mcp.prompt(name="create_incident_prompt")(self.create_incident_prompt)
    
    async def close(self):
        """Close the ServiceNow client"""
        await self.client.close()
        
    def run(self, transport: str = "stdio"):
        """Run the ServiceNow MCP server"""
        try:
            self.mcp.run(transport=transport)
        finally:
            asyncio.run(self.close())
        
    # Resource handlers
    async def list_incidents(self) -> str:
        """List recent incidents in ServiceNow"""
        options = QueryOptions(limit=10)
        result = await self.client.get_records("incident", options)
        return json.dumps(result, indent=2)
    
    async def resolve_incident(self,
                                 incident_id: str,
                                 resolution_code: str,
                                 resolution_notes: str,
                                 ctx: Context = None) -> str:
        """
        Resolve an incident in ServiceNow
        
        Args:
            incident_id: The incident number (e.g., INC0010015) or sys_id
            resolution_code: The resolution code (e.g., "Solved (Permanently)")
            resolution_notes: Detailed explanation of how the issue was resolved
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response from ServiceNow
        """
        if ctx:
            await ctx.info(f"Resolving incident: {incident_id}")
        
        try:
            # Check if incident_id is a sys_id (32 hex characters) or incident number
            if len(incident_id) == 32 and all(c in "0123456789abcdef" for c in incident_id.lower()):
                # This is likely a sys_id
                sys_id = incident_id
                if ctx:
                    await ctx.info(f"Using sys_id directly: {sys_id}")
            else:
                # This is likely an incident number, get the sys_id
                if ctx:
                    await ctx.info(f"Looking up incident by number: {incident_id}")
                
                incident = await self.client.get_incident_by_number(incident_id)
                if not incident:
                    error_message = f"Incident not found: {incident_id}"
                    if ctx:
                        await ctx.error(error_message)
                    return json.dumps({"error": error_message})
                
                sys_id = incident['sys_id']
                if ctx:
                    await ctx.info(f"Found incident sys_id: {sys_id}")
            
            # Build the update data for resolution
            update_data = {
                "state": 6,  # RESOLVED state
                "resolution_code": resolution_code,
                "close_code": resolution_code,
                "close_notes": resolution_notes,
                "resolved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            if ctx:
                await ctx.info(f"Updating incident with resolution data: {update_data}")
            
            # Update the incident
            result = await self.client.update_record("incident", sys_id, update_data)
            
            if ctx:
                await ctx.info(f"Successfully resolved incident: {incident_id}")
            
            return json.dumps(result, indent=2)
            
        except Exception as e:
            error_message = f"Failed to resolve incident {incident_id}: {str(e)}"
            logger.error(error_message)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})
        
    async def close_incident(self,
                                 incident_id: str,
                                 resolution_code: str,
                                 resolution_notes: str,
                                 ctx: Context = None) -> str:
        """
        Close an incident in ServiceNow
        
        Args:
            incident_id: The incident number (e.g., INC0010015) or sys_id
            resolution_code: The resolution code (e.g., "Solved (Permanently)")
            resolution_notes: Detailed explanation of how the issue was resolved
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response from ServiceNow
        """
        if ctx:
            await ctx.info(f"Resolving incident: {incident_id}")
        
        try:
            # Check if incident_id is a sys_id (32 hex characters) or incident number
            if len(incident_id) == 32 and all(c in "0123456789abcdef" for c in incident_id.lower()):
                # This is likely a sys_id
                sys_id = incident_id
                if ctx:
                    await ctx.info(f"Using sys_id directly: {sys_id}")
            else:
                # This is likely an incident number, get the sys_id
                if ctx:
                    await ctx.info(f"Looking up incident by number: {incident_id}")
                
                incident = await self.client.get_incident_by_number(incident_id)
                if not incident:
                    error_message = f"Incident not found: {incident_id}"
                    if ctx:
                        await ctx.error(error_message)
                    return json.dumps({"error": error_message})
                
                sys_id = incident['sys_id']
                if ctx:
                    await ctx.info(f"Found incident sys_id: {sys_id}")
            
            # Build the update data for closing
            update_data = {
                "state": 7,  # CLOSED state
                "resolution_code": resolution_code,
                "close_code": resolution_code,
                "close_notes": resolution_notes,
                "resolved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            if ctx:
                await ctx.info(f"Updating incident with resolution data: {update_data}")
            
            # Update the incident
            result = await self.client.update_record("incident", sys_id, update_data)
            
            if ctx:
                await ctx.info(f"Successfully resolved incident: {incident_id}")
            
            return json.dumps(result, indent=2)
            
        except Exception as e:
            error_message = f"Failed to resolve incident {incident_id}: {str(e)}"
            logger.error(error_message)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})




        
    async def on_hold_incident(self,
                                 incident_id: str,
                                 on_hold_reason: HoldImpact,
                                 ctx: Context = None) -> str:
        """
        Hold an incident in ServiceNow
        
        Args:
            incident_id: The incident number (e.g., INC0010015) or sys_id
            on_hold_reason: The hold impact code (e.g., "1" ,"2","3","4") 
            
        Returns:
            JSON response from ServiceNow
        """
        if ctx:
            await ctx.info(f"Resolving incident: {incident_id}")
        
        try:
            # Check if incident_id is a sys_id (32 hex characters) or incident number
            if len(incident_id) == 32 and all(c in "0123456789abcdef" for c in incident_id.lower()):
                # This is likely a sys_id
                sys_id = incident_id
                if ctx:
                    await ctx.info(f"Using sys_id directly: {sys_id}")
            else:
                # This is likely an incident number, get the sys_id
                if ctx:
                    await ctx.info(f"Looking up incident by number: {incident_id}")
                
                incident = await self.client.get_incident_by_number(incident_id)
                if not incident:
                    error_message = f"Incident not found: {incident_id}"
                    if ctx:
                        await ctx.error(error_message)
                    return json.dumps({"error": error_message})
                
                sys_id = incident['sys_id']
                if ctx:
                    await ctx.info(f"Found incident sys_id: {sys_id}")
            
            # Build the update data for resolution
            update_data = {
                "state": 3,  # Onhold state
                "hold_reason":on_hold_reason,
                # "close_code": resolution_code,
                # "close_notes": resolution_notes,
                # "resolved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            if ctx:
                await ctx.info(f"Updating incident with resolution data: {update_data}")
            
            # Update the incident
            result = await self.client.update_record("incident", sys_id, update_data)
            
            if ctx:
                await ctx.info(f"Successfully resolved incident: {incident_id}")
            
            return json.dumps(result, indent=2)
            
        except Exception as e:
            error_message = f"Failed to resolve incident {incident_id}: {str(e)}"
            logger.error(error_message)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})  

    
    async def close_incident_self_heal(
    self,
    incident_id: str,
    resolution_notes: Optional[str] = "Resolved by agent",
    resolution_code: Optional[str] = "Agent Assist",
    ctx: Context = None
        ) -> str:
        """
    Closes an incident with 'Closed with ST Self-heal' state.
    Defaults to resolution_code='Agent Assist' and resolution_notes='Resolved by agent'
    if not provided.

    Args:
        incident_id: Incident number (e.g., INC0010015) or sys_id
        resolution_notes: Notes explaining resolution (default: 'Resolved by agent')
        resolution_code: Resolution code (default: 'Agent Assist')
        ctx: Optional context object for progress reporting
        """
        if ctx:
            await ctx.info(f"Closing incident {incident_id} with ST Self-heal state")
    
        try:
            # Resolve incident number to sys_id
            if len(incident_id) == 32 and all(c in "0123456789abcdef" for c in incident_id.lower()):
                sys_id = incident_id
            else:
                incident = await self.client.get_incident_by_number(incident_id)
                if not incident:
                    error_message = f"Incident not found: {incident_id}"
                    if ctx:
                        await ctx.error(error_message)
                    return json.dumps({"error": error_message})
                sys_id = incident["sys_id"]
    
            update_data = {
                "state": "7",                          # Closed state (triggers ST Self-heal workflow)
                # "incident_state": "7",                 # Keep in sync
                "close_code": resolution_code,         # "Agent Assist"
                "close_notes": resolution_notes,       # "Resolved by agent"
                # "resolved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                # "closed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
    
            if ctx:
                await ctx.info(f"Applying closure with code='{resolution_code}' notes='{resolution_notes}'")
    
            result = await self.client.update_record("incident", sys_id, update_data)
    
            if ctx:
                await ctx.info(f"Successfully closed incident {incident_id}")
    
            return json.dumps({
                "message": f"Incident {incident_id} closed with ST Self-heal",
                "resolution_code": resolution_code,
                "resolution_notes": resolution_notes,
                "result": result
            }, indent=2)
    
        except Exception as e:
            error_message = f"Failed to close incident {incident_id}: {str(e)}"
            logger.error(error_message)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})            


    async def cancel_incident(self,
                                 incident_id: str,
                                 resolution_code: str,
                                 resolution_notes: str,
                                 ctx: Context = None) -> str:
        """
        Cancel an incident in ServiceNow
        
        Args:
            incident_id: The incident number (e.g., INC0010015) or sys_id
            resolution_code: The resolution code (e.g., "Solved (Permanently)")
            resolution_notes: Detailed explanation of how the issue was resolved
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response from ServiceNow
        """
        if ctx:
            await ctx.info(f"Resolving incident: {incident_id}")
        
        try:
            # Check if incident_id is a sys_id (32 hex characters) or incident number
            if len(incident_id) == 32 and all(c in "0123456789abcdef" for c in incident_id.lower()):
                # This is likely a sys_id
                sys_id = incident_id
                if ctx:
                    await ctx.info(f"Using sys_id directly: {sys_id}")
            else:
                # This is likely an incident number, get the sys_id
                if ctx:
                    await ctx.info(f"Looking up incident by number: {incident_id}")
                
                incident = await self.client.get_incident_by_number(incident_id)
                if not incident:
                    error_message = f"Incident not found: {incident_id}"
                    if ctx:
                        await ctx.error(error_message)
                    return json.dumps({"error": error_message})
                
                sys_id = incident['sys_id']
                if ctx:
                    await ctx.info(f"Found incident sys_id: {sys_id}")
            
            # Build the update data for cancellation
            update_data = {
                "state": 8,  # Cancel state
                "resolution_code": resolution_code,
                "close_code": resolution_code,
                "close_notes": resolution_notes,
                "resolved_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            if ctx:
                await ctx.info(f"Updating incident with resolution data: {update_data}")
            
            # Update the incident
            result = await self.client.update_record("incident", sys_id, update_data)
            
            if ctx:
                await ctx.info(f"Successfully resolved incident: {incident_id}")
            
            return json.dumps(result, indent=2)
            
        except Exception as e:
            error_message = f"Failed to resolve incident {incident_id}: {str(e)}"
            logger.error(error_message)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})      


    # Resource handlers for change requests
    async def list_change_requests(self) -> str:
        """List recent change requests in ServiceNow"""
        options = QueryOptions(limit=10)
        result = await self.client.get_records("change_request", options)
        return json.dumps(result, indent=2)
    
    async def get_change_request(self, number: str) -> str:
        """Get a specific change request by number"""
        try:
            change_request = await self.client.get_change_request_by_number(number)
            if change_request:
                return json.dumps({"result": change_request}, indent=2)
            else:
                return json.dumps({"error": {"message": "No Record found"}})
        except Exception as e:
            return json.dumps({"error": {"message": str(e)}})
    
    # Tool handlers for change requests

    async def create_change_request(self, params: CreateChangeRequestParams, ctx: Context = None) -> str:
        """Create a new change request in ServiceNow with multiple fields."""
        if ctx:
            await ctx.info(f"Creating change request: {params.short_description}")
        
        try:
            data = params.dict(exclude_none=True)
            
            # --- START FIX: RESOLVE CI NAME TO SYS_ID ---
            # NOTE: This assumed the field name was 'configuration_item'
            ci_value = data.get("configuration_item") 
            if ci_value:
                # Check if it's a name (not a 32-char sys_id)
                is_sys_id = len(ci_value) == 32 and all(c in "0123456789abcdef" for c in ci_value.lower())
                
                if not is_sys_id:
                    if ctx:
                        await ctx.info(f"Resolving CI name '{ci_value}' to sys_id...")
                    
                    # Use list_records (get_records) to find the CI by name
                    # We query 'cmdb_ci' which is the base table for all CIs
                    ci_query_options = QueryOptions(
                        query=f"name={ci_value}",
                        limit=1,
                        fields=["sys_id", "name"]
                    )
                    
                    # Use the client's get_records method
                    ci_result = await self.client.get_records("cmdb_ci", ci_query_options) 
                    
                    if ci_result.get("result") and len(ci_result["result"]) > 0:
                        ci_sys_id = ci_result["result"][0]["sys_id"]
                        data["configuration_item"] = ci_sys_id # Replace name with sys_id
                        if ctx:
                            await ctx.info(f"Found CI sys_id: {ci_sys_id}")
                    else:
                        # CI not found, log a warning and remove it to avoid API error
                        if ctx:
                            await ctx.warn(f"Configuration Item '{ci_value}' not found. Creating change without CI.")
                        del data["configuration_item"]
            # --- END FIX ---

            result = await self.client.create_record("change_request", data)
            
            if ctx:
                # Return the full record, including the CI name and dates it *thinks* it set
                # The agent's confirmation is based on the *input data*, not the final result
                final_result = result.get("result", {})
                
                # Add back the fields the agent *thinks* it set, for a clear confirmation
                final_result['configuration_item_name'] = ci_value # Send back the name for confirmation
                final_result['planned_start_date'] = data.get('planned_start_date')
                final_result['planned_end_date'] = data.get('planned_end_date')

                await ctx.info(f"Created change request: {final_result.get('number')}")
                
            return json.dumps({"result": final_result}, indent=2)
            
        except Exception as e:
            error_message = f"Error creating change request: {str(e)}"
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})

    async def update_change_request(self, params: UpdateChangeRequestParams, ctx: Context = None) -> str:
        """Update fields for an existing change request."""
        if ctx:
            await ctx.info(f"Updating change request: {params.change_id}")
        
        try:
            # Get the sys_id if a change number was provided
            if not (len(params.change_id) == 32 and all(c in "0123456789abcdef" for c in params.change_id.lower())):
                change_request = await self.client.get_change_request_by_number(params.change_id)
                if not change_request:
                    return json.dumps({"error": f"Change request {params.change_id} not found"})
                sys_id = change_request['sys_id']
            else:
                sys_id = params.change_id
            
            data = params.dict(exclude_none=True, exclude={'change_id'})
            result = await self.client.update_record("change_request", sys_id, data)
            
            return json.dumps(result, indent=2)
        except Exception as e:
            error_message = f"Error updating change request: {str(e)}"
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})
        
    async def update_change_field(self, change_id: str, field_name: str, field_value: str, ctx: Context = None) -> str:
        """
        Updates a specific field on a Change Request. 
        Use this to set 'assignment_group', 'close_code', 'close_notes', or other specific fields.
        """
        if ctx:
            await ctx.info(f"Updating field '{field_name}' on change: {change_id}")

        try:
            # Get the sys_id if a change number was provided
            if not (len(change_id) == 32 and all(c in "0123456789abcdef" for c in change_id.lower())):
                change_request = await self.client.get_change_request_by_number(change_id)
                if not change_request:
                    return json.dumps({"error": f"Change request {change_id} not found"})
                sys_id = change_request['sys_id']
            else:
                sys_id = change_id

            # Prepare the payload
            update_data = {field_name: field_value}
            
            # Log the update
            if ctx:
                await ctx.info(f"Setting {field_name} = {field_value}")

            # Execute the update
            result = await self.client.update_record("change_request", sys_id, update_data)
            
            return json.dumps(result, indent=2)

        except Exception as e:
            error_message = f"Error updating field: {str(e)}"
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})


    async def move_change_state(self, change_id: str, target_state: str, ctx: Context = None) -> str:
        """
        Moves a Change Request to a specific state using the correct ServiceNow integer code.
        
        Allowed target_state values:
        - 'Assess' (Moves to -4)
        - 'Authorize' (Moves to -3)
        - 'Scheduled' (Moves to -2)
        - 'Implement' (Moves to -1)
        - 'Review' (Moves to 0)
        - 'Closed' (Moves to 3)
        - 'Canceled' (Moves to 4)
        """
        if ctx:
            await ctx.info(f"Moving change {change_id} to state: {target_state}")

        # MAP READABLE NAMES TO SERVICENOW INTEGERS
        state_map = {
            "Assess": "-4",
            "Authorize": "-3",
            "Scheduled": "-2",
            "Implement": "-1",
            "Review": "0",
            "Closed": "3",
            "Canceled": "4",
            "New": "-5"
        }
        
        # Normalize input (Capitalize first letter)
        target_clean = target_state.capitalize()
        state_value = state_map.get(target_clean)
        
        if not state_value:
            error_msg = f"Invalid state name '{target_state}'. Allowed: Assess, Authorize, Scheduled, Implement, Review, Closed."
            return json.dumps({"error": error_msg})

        # Reuse the update logic logic or call update_record directly
        try:
            # Resolve sys_id
            if not (len(change_id) == 32 and all(c in "0123456789abcdef" for c in change_id.lower())):
                change_request = await self.client.get_change_request_by_number(change_id)
                if not change_request:
                    return json.dumps({"error": f"Change request {change_id} not found"})
                sys_id = change_request['sys_id']
            else:
                sys_id = change_id

            # Update the state
            update_data = {"state": state_value}
            result = await self.client.update_record("change_request", sys_id, update_data)
            
            return json.dumps(result, indent=2)

        except Exception as e:
            return json.dumps({"error": f"Error moving state: {str(e)}"})    

    async def close_change_request(self, change_id: str, close_code: ChangeRequestCloseCode, close_notes: str, ctx: Context = None) -> str:
        """Close a change request with a close code and notes."""
        if ctx:
            await ctx.info(f"Closing change request: {change_id}")
        
        try:
            # Get the sys_id if a change number was provided
            if not (len(change_id) == 32 and all(c in "0123456789abcdef" for c in change_id.lower())):
                change_request = await self.client.get_change_request_by_number(change_id)
                if not change_request:
                    return json.dumps({"error": f"Change request {change_id} not found"})
                sys_id = change_request['sys_id']
            else:
                sys_id = change_id

            update_data = {
                "state": ChangeRequestState.CLOSED,
                "close_code": close_code,
                "close_notes": close_notes,
                "closed_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            
            result = await self.client.update_record("change_request", sys_id, update_data)
            
            return json.dumps(result, indent=2)
        except Exception as e:
            error_message = f"Error closing change request: {str(e)}"
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})

    # --- Other existing methods below ---
    # ... (all your other existing methods like get_incident, list_users, etc.)
    # ...
    # async def add_change_request_attachment(self,
    #                                             change_id: str,
    #                                             file_name: str,
    #                                             file_content: bytes,
    #                                             ctx: Context = None) -> str:
    #     """
    #     Uploads an attachment to a change request in ServiceNow.

    #     Args:
    #         change_id: The change request number (e.g., CHG0010001) or sys_id.
    #         file_name: The name of the file to be uploaded.
    #         file_content: The binary content of the file.
    #         ctx: Optional context object for progress reporting.

    #     Returns:
    #         JSON response from ServiceNow.
    #     """
    #     if ctx:
    #         await ctx.info(f"Uploading attachment '{file_name}' to change request: {change_id}")

    #     try:
    #         # Determine content type from file name
    #         content_type, _ = mimetypes.guess_type(file_name)
    #         if content_type is None:
    #             content_type = "application/octet-stream"

    #         # Check if change_id is a sys_id or change number
    #         if len(change_id) == 32 and all(c in "0123456789abcdef" for c in change_id.lower()):
    #             sys_id = change_id
    #         else:
    #             change_request = await self.client.get_change_request_by_number(change_id)
    #             if not change_request:
    #                 error_message = f"Change request {change_id} not found."
    #                 if ctx:
    #                     await ctx.error(error_message)
    #                 return json.dumps({"error": error_message})
    #             sys_id = change_request['sys_id']

    #         # Use the /upload endpoint and multipart/form-data
    #         url = f"{self.client.instance_url}/api/now/attachment/upload"
            
    #         headers = await self.client.auth.get_headers()
    #         headers["Accept"] = "application/json"
            
    #         if isinstance(self.client.auth, BasicAuth):
    #             auth = self.client.auth.get_auth()
    #         else:
    #             auth = None
            
    #         # Form data with text fields
    #         data = {
    #             "table_name": "change_request",
    #             "table_sys_id": sys_id
    #         }
            
    #         # Files dictionary for multipart upload
    #         files = {
    #             "uploadFile": (file_name, file_content, content_type)
    #         }
            
    #         response = await self.client.client.post(url, headers=headers, data=data, files=files, auth=auth)
    #         response.raise_for_status()
            
    #         result = response.json()
    #         if ctx:
    #             await ctx.info(f"Successfully uploaded attachment: {file_name}")

    #         return json.dumps(result, indent=2)

    #     except Exception as e:
    #         error_message = f"Failed to upload attachment to change request {change_id}: {str(e)}"
    #         logger.error(error_message)
    #         if ctx:
    #             await ctx.error(error_message)
    #         return json.dumps({"error": error_message})

    
    async def get_change_request_details(self, change_id: str, ctx: Context = None) -> str:
        """Get detailed information about a change request"""
        if ctx:
            await ctx.info(f"Getting change request details: {change_id}")
        
        try:
            if len(change_id) == 32:
                result = await self.client.get_record("change_request", change_id)
            else:
                change_request = await self.client.get_change_request_by_number(change_id)
                if change_request:
                    result = {"result": change_request}
                else:
                    return json.dumps({"error": "Change request not found"})
            
            # Get associated tasks
            tasks_result = await self.client.get_records("change_task", 
                                                         QueryOptions(query=f"change_request={result['result']['sys_id']}"))
            
            return json.dumps({
                "change_request": result["result"],
                "tasks": tasks_result.get("result", [])
            }, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    async def add_change_task(self, change_id: str, short_description: str, 
                                 description: Optional[str] = None, assigned_to: Optional[str] = None,
                                 ctx: Context = None) -> str:
        """Add a task to a change request"""
        if ctx:
            await ctx.info(f"Adding task to change request: {change_id}")
        
        try:
            # Get sys_id if needed
            if len(change_id) != 32:
                change_request = await self.client.get_change_request_by_number(change_id)
                if not change_request:
                    return json.dumps({"error": "Change request not found"})
                change_id = change_request['sys_id']
            
            data = {
                "change_request": change_id,
                "short_description": short_description
            }
            
            if description:
                data["description"] = description
            if assigned_to:
                data["assigned_to"] = assigned_to
            
            result = await self.client.create_record("change_task", data)
            return json.dumps(result, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    async def submit_change_for_approval(self, change_id: str, approval_comments: Optional[str] = None,
                                         ctx: Context = None) -> str:
        """Submit a change request for approval"""
        try:
            # Update state to assess
            update_data = {"state": -4}  # ASSESS state
            if approval_comments:
                update_data["work_notes"] = approval_comments
            
            if len(change_id) != 32:
                change_request = await self.client.get_change_request_by_number(change_id)
                if not change_request:
                    return json.dumps({"error": "Change request not found"})
                change_id = change_request['sys_id']
            
            result = await self.client.update_record("change_request", change_id, update_data)
            return json.dumps({"message": "Change request submitted for approval", "result": result}, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    async def approve_change(self, change_id: str, approval_comments: Optional[str] = None,
                             ctx: Context = None) -> str:
        """Approve a change request"""
        try:
            update_data = {"state": -2}  # SCHEDULED state
            if approval_comments:
                update_data["work_notes"] = approval_comments
            
            if len(change_id) != 32:
                change_request = await self.client.get_change_request_by_number(change_id)
                if not change_request:
                    return json.dumps({"error": "Change request not found"})
                change_id = change_request['sys_id']
            
            result = await self.client.update_record("change_request", change_id, update_data)
            return json.dumps({"message": "Change request approved", "result": result}, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    async def reject_change(self, change_id: str, rejection_reason: str, ctx: Context = None) -> str:
        """Reject a change request"""
        try:
            update_data = {
                "state": 4,  # CANCELED state
                "work_notes": f"Change request rejected: {rejection_reason}"
            }
            
            if len(change_id) != 32:
                change_request = await self.client.get_change_request_by_number(change_id)
                if not change_request:
                    return json.dumps({"error": "Change request not found"})
                change_id = change_request['sys_id']
            
            result = await self.client.update_record("change_request", change_id, update_data)
            return json.dumps({"message": "Change request rejected", "result": result}, indent=2)
        except Exception as e:
            return json.dumps({"error": str(e)})
    
    
    async def add_change_request_attachment(self,
                                                change_id: str,
                                                file_name: str,
                                                file_content: bytes,
                                                ctx: Context = None) -> str:
        """

        Uploads an attachment to a change request in ServiceNow.

        Args:
            change_id: The change request number (e.g., CHG0010001) or sys_id.
            file_name: The name of the file to be uploaded.
            file_content: The binary content of the file.
            ctx: Optional context object for progress reporting.

        Returns:
            JSON response from ServiceNow.
        """
        if ctx:
            await ctx.info(f"Uploading attachment '{file_name}' to change request: {change_id}")

        try:
            # Determine content type from file name
            content_type, _ = mimetypes.guess_type(file_name)
            if content_type is None:
                content_type = "application/octet-stream"

            # Check if change_id is a sys_id or change number
            if len(change_id) == 32 and all(c in "0123456789abcdef" for c in change_id.lower()):
                sys_id = change_id
            else:
                change_request = await self.client.get_change_request_by_number(change_id)
                if not change_request:
                    error_message = f"Change request {change_id} not found."
                    if ctx:
                        await ctx.error(error_message)
                    return json.dumps({"error": error_message})
                sys_id = change_request['sys_id']

            # Use the /upload endpoint and multipart/form-data
            url = f"{self.client.instance_url}/api/now/attachment/upload"
            
            headers = await self.client.auth.get_headers()
            headers["Accept"] = "application/json"
            
            if isinstance(self.client.auth, BasicAuth):
                auth = self.client.auth.get_auth()
            else:
                auth = None
            
            # Form data with text fields
            data = {
                "table_name": "change_request",
                "table_sys_id": sys_id
            }
            
            # Files dictionary for multipart upload
            files = {
                "uploadFile": (file_name, file_content, content_type)
            }
            
            response = await self.client.client.post(url, headers=headers, data=data, files=files, auth=auth)
            response.raise_for_status()
            
            result = response.json()
            if ctx:
                await ctx.info(f"Successfully uploaded attachment: {file_name}")

            return json.dumps(result, indent=2)

        except Exception as e:
            error_message = f"Failed to upload attachment to change request {change_id}: {str(e)}"
            logger.error(error_message)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})
    
    
    async def get_incident(self, number: str) -> str:
        """Get a specific incident by number"""
        try:
            # Always use get_incident_by_number to query by incident number, not get_record
            incident = await self.client.get_incident_by_number(number)
            if incident:
                return json.dumps({"result": incident}, indent=2)
            else:
                logger.error(f"No incident found with number: {number}")
                return json.dumps({"error":{"message":"No Record found","detail":"Record doesn't exist or ACL restricts the record retrieval"},"status":"failure"})
        except Exception as e:
            logger.error(f"Error getting incident {number}: {str(e)}")
            return json.dumps({"error":{"message":str(e),"detail":"Error occurred while retrieving the record"},"status":"failure"})
        
    async def list_users(self) -> str:
        """List users in ServiceNow"""
        options = QueryOptions(limit=10)
        result = await self.client.get_records("sys_user", options)
        return json.dumps(result, indent=2)
        
    async def list_knowledge(self) -> str:
        """List knowledge articles in ServiceNow"""
        options = QueryOptions(limit=10)
        result = await self.client.get_records("kb_knowledge", options)
        return json.dumps(result, indent=2)
        
    async def get_tables(self) -> str:
        """Get a list of available tables"""
        result = await self.client.get_available_tables()
        return json.dumps({"result": result}, indent=2)
        
    async def get_table_records(self, table: str) -> str:
        """Get records from a specific table"""
        options = QueryOptions(limit=10)
        result = await self.client.get_records(table, options)
        return json.dumps(result, indent=2)
        
    async def get_table_schema(self, table: str) -> str:
        """Get the schema for a table"""
        result = await self.client.get_table_schema(table)
        return json.dumps(result, indent=2)
    
    # Tool handlers
    async def create_incident(self, 
                              incident,
                              ctx: Context = None) -> str:
        """
        Create a new incident in ServiceNow
        
        Args:
            incident: The incident details to create - can be either an IncidentCreate object,
                      a dictionary containing incident fields, or a string with the description
            ctx: Optional context object for progress reporting
        
        Returns:
            JSON response from ServiceNow
        """
        # Handle different input types
        if isinstance(incident, str):
            # Check if the string is actually JSON
            try:
                parsed = json.loads(incident)
                if isinstance(parsed, dict):
                    incident_data = parsed
                    logger.info(f"Creating incident from JSON string: {parsed.get('short_description', 'No short description')}")
                else:
                    # JSON but not a dict, treat as description
                    short_desc = incident[:50] + ('...' if len(incident) > 50 else '')
                    incident_data = {
                        "short_description": short_desc,
                        "description": incident
                    }
                    logger.info(f"Creating incident from string description: {short_desc}")
            except json.JSONDecodeError:
                # Not JSON, treat as description
                short_desc = incident[:50] + ('...' if len(incident) > 50 else '')
                incident_data = {
                    "short_description": short_desc,
                    "description": incident
                }
                logger.info(f"Creating incident from string description: {short_desc}")
        elif isinstance(incident, dict):
            # Dictionary provided
            incident_data = incident
            logger.info(f"Creating incident from dictionary: {incident.get('short_description', 'No short description')}")
        elif isinstance(incident, IncidentCreate):
            # IncidentCreate model provided
            incident_data = incident.dict(exclude_none=True)
            logger.info(f"Creating incident from IncidentCreate: {incident.short_description}")
        else:
            error_message = f"Invalid incident type: {type(incident)}. Expected IncidentCreate, dict, or str."
            logger.error(error_message)
            return json.dumps({"error": error_message})

        # Validate that required fields are present
        if "short_description" not in incident_data and isinstance(incident, dict):
            if "description" in incident_data:
                # Auto-generate short description from description
                desc = incident_data["description"]
                incident_data["short_description"] = desc[:50] + ('...' if len(desc) > 50 else '')
            else:
                incident_data["short_description"] = "Incident created through API"
        
        if "description" not in incident_data and isinstance(incident, dict):
            if "short_description" in incident_data:
                incident_data["description"] = incident_data["short_description"]
            else:
                incident_data["description"] = "No description provided"

        # Set default values if not provided
        if "caller_id" not in incident_data or not incident_data["caller_id"]:
            incident_data["caller_id"] = "Alikutty"
            if ctx:
                await ctx.info("Using default caller: Alikutty")

        if "assigned_to" not in incident_data or not incident_data["assigned_to"]:
            incident_data["assigned_to"] = "Alikutty"
            if ctx:
                await ctx.info("Using default assigned_to: Alikutty")

        # Note: assignment_group default removed due to ServiceNow business rule restrictions
        # The "vmware" user doesn't have permission to assign to "LinuxL1" group

        # Resolve caller_id (user name to sys_id)
        if "caller_id" in incident_data and incident_data["caller_id"]:
            caller_value = incident_data["caller_id"]
            # Check if it's already a sys_id (32 hex characters)
            if not (len(caller_value) == 32 and all(c in "0123456789abcdef" for c in caller_value.lower())):
                if ctx:
                    await ctx.info(f"Resolving caller '{caller_value}' to sys_id...")
                # Search by name or user_name
                user_query = QueryOptions(
                    query=f"name={caller_value}^ORuser_name={caller_value}",
                    limit=1,
                    fields=["sys_id", "name", "user_name"]
                )
                user_result = await self.client.get_records("sys_user", user_query)
                if user_result.get("result") and len(user_result["result"]) > 0:
                    incident_data["caller_id"] = user_result["result"][0]["sys_id"]
                    if ctx:
                        await ctx.info(f"Found caller sys_id: {incident_data['caller_id']}")
                else:
                    if ctx:
                        await ctx.info(f"Caller '{caller_value}' not found, removing from request")
                    del incident_data["caller_id"]

        # Resolve assigned_to (user name to sys_id)
        if "assigned_to" in incident_data and incident_data["assigned_to"]:
            assignee_value = incident_data["assigned_to"]
            if not (len(assignee_value) == 32 and all(c in "0123456789abcdef" for c in assignee_value.lower())):
                if ctx:
                    await ctx.info(f"Resolving assignee '{assignee_value}' to sys_id...")
                user_query = QueryOptions(
                    query=f"name={assignee_value}^ORuser_name={assignee_value}",
                    limit=1,
                    fields=["sys_id", "name", "user_name"]
                )
                user_result = await self.client.get_records("sys_user", user_query)
                if user_result.get("result") and len(user_result["result"]) > 0:
                    incident_data["assigned_to"] = user_result["result"][0]["sys_id"]
                    if ctx:
                        await ctx.info(f"Found assignee sys_id: {incident_data['assigned_to']}")
                else:
                    if ctx:
                        await ctx.info(f"Assignee '{assignee_value}' not found, removing from request")
                    del incident_data["assigned_to"]

        # Resolve assignment_group (group name to sys_id)
        if "assignment_group" in incident_data and incident_data["assignment_group"]:
            group_value = incident_data["assignment_group"]
            if not (len(group_value) == 32 and all(c in "0123456789abcdef" for c in group_value.lower())):
                if ctx:
                    await ctx.info(f"Resolving assignment group '{group_value}' to sys_id...")
                group_query = QueryOptions(
                    query=f"name={group_value}",
                    limit=1,
                    fields=["sys_id", "name"]
                )
                group_result = await self.client.get_records("sys_user_group", group_query)
                if group_result.get("result") and len(group_result["result"]) > 0:
                    incident_data["assignment_group"] = group_result["result"][0]["sys_id"]
                    if ctx:
                        await ctx.info(f"Found assignment group sys_id: {incident_data['assignment_group']}")
                else:
                    if ctx:
                        await ctx.info(f"Assignment group '{group_value}' not found, removing from request")
                    del incident_data["assignment_group"]

        # Log and create the incident
        if ctx:
            await ctx.info(f"Creating incident: {incident_data.get('short_description', 'No short description')}")
        
        try:
            result = await self.client.create_record("incident", incident_data)
            
            if ctx:
                await ctx.info(f"Created incident: {result['result']['number']}")
                
            return json.dumps(result, indent=2)
        except Exception as e:
            error_message = f"Error creating incident: {str(e)}"
            logger.error(error_message)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})
        
    async def update_incident(self,
                              number: str,
                              updates,
                              ctx: Context = None) -> str:
        """
        Update an existing incident in ServiceNow

        Args:
            number: The incident number (INC0010001) or sys_id
            updates: The fields to update - can be an IncidentUpdate object or a dictionary
            ctx: Optional context object for progress reporting

        Returns:
            JSON response from ServiceNow
        """
        # First, get the sys_id for the incident number
        if ctx:
            await ctx.info(f"Looking up incident: {number}")

        # Check if it's a sys_id or incident number
        if len(number) == 32 and all(c in "0123456789abcdef" for c in number.lower()):
            # This is a sys_id
            sys_id = number
            if ctx:
                await ctx.info(f"Using sys_id directly: {sys_id}")
        else:
            # This is an incident number, look it up
            incident = await self.client.get_incident_by_number(number)

            if not incident:
                error_message = f"Incident {number} not found"
                if ctx:
                    await ctx.error(error_message)
                return json.dumps({"error": error_message})

            sys_id = incident['sys_id']

        # Now update the incident
        if ctx:
            await ctx.info(f"Updating incident: {number}")

        # Handle both IncidentUpdate objects and dictionaries
        if isinstance(updates, dict):
            data = {k: v for k, v in updates.items() if v is not None}
        elif isinstance(updates, IncidentUpdate):
            data = updates.dict(exclude_none=True)
        else:
            error_message = f"Invalid updates type: {type(updates)}. Expected IncidentUpdate or dict."
            logger.error(error_message)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})

        # Resolve caller_id (user name to sys_id)
        if "caller_id" in data and data["caller_id"]:
            caller_value = data["caller_id"]
            if not (len(caller_value) == 32 and all(c in "0123456789abcdef" for c in caller_value.lower())):
                if ctx:
                    await ctx.info(f"Resolving caller '{caller_value}' to sys_id...")
                user_query = QueryOptions(
                    query=f"name={caller_value}^ORuser_name={caller_value}",
                    limit=1,
                    fields=["sys_id", "name", "user_name"]
                )
                user_result = await self.client.get_records("sys_user", user_query)
                if user_result.get("result") and len(user_result["result"]) > 0:
                    data["caller_id"] = user_result["result"][0]["sys_id"]
                else:
                    del data["caller_id"]

        # Resolve assigned_to (user name to sys_id)
        if "assigned_to" in data and data["assigned_to"]:
            assignee_value = data["assigned_to"]
            if not (len(assignee_value) == 32 and all(c in "0123456789abcdef" for c in assignee_value.lower())):
                if ctx:
                    await ctx.info(f"Resolving assignee '{assignee_value}' to sys_id...")
                user_query = QueryOptions(
                    query=f"name={assignee_value}^ORuser_name={assignee_value}",
                    limit=1,
                    fields=["sys_id", "name", "user_name"]
                )
                user_result = await self.client.get_records("sys_user", user_query)
                if user_result.get("result") and len(user_result["result"]) > 0:
                    data["assigned_to"] = user_result["result"][0]["sys_id"]
                else:
                    del data["assigned_to"]

        # Resolve assignment_group (group name to sys_id)
        if "assignment_group" in data and data["assignment_group"]:
            group_value = data["assignment_group"]
            if not (len(group_value) == 32 and all(c in "0123456789abcdef" for c in group_value.lower())):
                if ctx:
                    await ctx.info(f"Resolving assignment group '{group_value}' to sys_id...")
                group_query = QueryOptions(
                    query=f"name={group_value}",
                    limit=1,
                    fields=["sys_id", "name"]
                )
                group_result = await self.client.get_records("sys_user_group", group_query)
                if group_result.get("result") and len(group_result["result"]) > 0:
                    data["assignment_group"] = group_result["result"][0]["sys_id"]
                else:
                    del data["assignment_group"]

        result = await self.client.update_record("incident", sys_id, data)

        return json.dumps(result, indent=2)
        
    async def search_records(self, 
                              query: str, 
                              table: str = "incident",
                              limit: int = 10,
                              ctx: Context = None) -> str:
        """
        Search for records in ServiceNow using text query
        
        Args:
            query: Text to search for
            table: Table to search in
            limit: Maximum number of results to return
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response containing matching records
        """
        if ctx:
            await ctx.info(f"Searching {table} for: {query}")
            
        result = await self.client.search(query, table, limit)
        return json.dumps(result, indent=2)
        
    async def get_record(self,
                          table: str,
                          sys_id: str,
                          ctx: Context = None) -> str:
        """
        Get a specific record by sys_id
        
        Args:
            table: Table to query
            sys_id: System ID of the record
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response containing the record
        """
        if ctx:
            await ctx.info(f"Getting {table} record: {sys_id}")
            
        result = await self.client.get_record(table, sys_id)
        return json.dumps(result, indent=2)
        
    async def perform_query(self,
                            table: str,
                            query: str = "",
                            limit: int = 10,
                            offset: int = 0,
                            fields: Optional[List[str]] = None,
                            ctx: Context = None) -> str:
        """
        Perform a query against ServiceNow
        
        Args:
            table: Table to query
            query: Encoded query string (ServiceNow syntax)
            limit: Maximum number of results to return
            offset: Number of records to skip
            fields: List of fields to return (or all fields if None)
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response containing query results
        """
        if ctx:
            await ctx.info(f"Querying {table} with: {query}")
            
        options = QueryOptions(
            limit=limit,
            offset=offset,
            fields=fields,
            query=query
        )
        
        result = await self.client.get_records(table, options)
        return json.dumps(result, indent=2)
        
    async def add_comment(self,
                          number: str,
                          comment: str,
                          ctx: Context = None) -> str:
        """
        Add a comment to an incident (customer visible)
        
        Args:
            number: Incident number
            comment: Comment to add
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response from ServiceNow
        """
        if ctx:
            await ctx.info(f"Adding comment to incident: {number}")
            
        incident = await self.client.get_incident_by_number(number)
        
        if not incident:
            error_message = f"Incident {number} not found"
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})
            
        sys_id = incident['sys_id']
        
        # Add the comment
        update = {"comments": comment}
        result = await self.client.update_record("incident", sys_id, update)
        
        return json.dumps(result, indent=2)
        
    async def add_work_notes(self,
                             number: str,
                             work_notes: str,
                             ctx: Context = None) -> str:
        """
        Add work notes to an incident (internal)
        
        Args:
            number: Incident number
            work_notes: Work notes to add
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response from ServiceNow
        """
        if ctx:
            await ctx.info(f"Adding work notes to incident: {number}")
            
        incident = await self.client.get_incident_by_number(number)
        
        if not incident:
            error_message = f"Incident {number} not found"
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})
            
        sys_id = incident['sys_id']
        
        # Add the work notes
        update = {"work_notes": work_notes}
        result = await self.client.update_record("incident", sys_id, update)
        
        return json.dumps(result, indent=2)
    
    # Natural language tools
    async def natural_language_search(self,
                                        query: str,
                                        ctx: Context = None) -> str:
        """
        Search for records using natural language
        
        Examples:
        - "find all incidents about SAP"
        - "search for incidents related to email"
        - "show me all incidents with high priority"
        
        Args:
            query: Natural language query
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response containing matching records
        """
        if ctx:
            await ctx.info(f"Processing natural language query: {query}")
            
        # Parse the query
        search_params = NLPProcessor.parse_search_query(query)
        
        if ctx:
            await ctx.info(f"Searching {search_params['table']} with query: {search_params['query']}")
        
        # Perform the search
        options = QueryOptions(
            limit=search_params['limit'],
            query=search_params['query']
        )
        
        result = await self.client.get_records(search_params['table'], options)
        return json.dumps(result, indent=2)
    
    async def natural_language_update(self,
                                        command: str,
                                        ctx: Context = None) -> str:
        """
        Update a record using natural language
        
        Examples:
        - "Update incident INC0010001 saying I'm working on it"
        - "Set incident INC0010002 to in progress"
        - "Close incident INC0010003 with resolution: fixed the issue"
        
        Args:
            command: Natural language update command
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response from ServiceNow
        """
        if ctx:
            await ctx.info(f"Processing natural language update: {command}")
            
        try:
            # Parse the command
            record_number, updates = NLPProcessor.parse_update_command(command)
            
            if ctx:
                await ctx.info(f"Updating {record_number} with: {updates}")
            
            # Get the record
            if record_number.startswith("INC"):
                incident = await self.client.get_incident_by_number(record_number)
                if not incident:
                    error_message = f"Incident {record_number} not found"
                    if ctx:
                        await ctx.error(error_message)
                    return json.dumps({"error": error_message})
                
                sys_id = incident['sys_id']
                table = "incident"
            else:
                # Handle other record types if needed
                error_message = f"Record type not supported: {record_number}"
                if ctx:
                    await ctx.error(error_message)
                return json.dumps({"error": error_message})
            
            # Update the record
            result = await self.client.update_record(table, sys_id, updates)
            return json.dumps(result, indent=2)
            
        except ValueError as e:
            error_message = str(e)
            if ctx:
                await ctx.error(error_message)
            return json.dumps({"error": error_message})
    
    async def update_script(self,
                            script_update: ScriptUpdateModel,
                            ctx: Context = None) -> str:
        """
        Update a ServiceNow script
        
        Args:
            script_update: The script update details
            ctx: Optional context object for progress reporting
            
        Returns:
            JSON response from ServiceNow
        """
        if ctx:
            await ctx.info(f"Updating script: {script_update.name}")
            
        # Search for the script by name
        table = script_update.type
        query = f"name={script_update.name}"
        
        options = QueryOptions(
            limit=1,
            query=query
        )
        
        result = await self.client.get_records(table, options)
        
        if not result.get("result") or len(result["result"]) == 0:
            # Script doesn't exist, create it
            if ctx:
                await ctx.info(f"Script not found, creating new script: {script_update.name}")
                
            data = {
                "name": script_update.name,
                "script": script_update.script
            }
            
            if script_update.description:
                data["description"] = script_update.description
                
            result = await self.client.create_record(table, data)
        else:
            # Script exists, update it
            script = result["result"][0]
            sys_id = script["sys_id"]
            
            if ctx:
                await ctx.info(f"Updating existing script: {script_update.name} ({sys_id})")
                
            data = {
                "script": script_update.script
            }
            
            if script_update.description:
                data["description"] = script_update.description
                
            result = await self.client.update_record(table, sys_id, data)
            
        return json.dumps(result, indent=2)
    
    # Prompt templates
    def incident_analysis_prompt(self, incident_number: str) -> str:
        """Create a prompt to analyze a ServiceNow incident
        
        Args:
            incident_number: The incident number to analyze (e.g., INC0010001)
            
        Returns:
            Prompt text for analyzing the incident
        """
        return f"""
        Please analyze the following ServiceNow incident {incident_number}.
        
        First, call the appropriate tool to fetch the incident details using get_incident.
        
        Then, provide a comprehensive analysis with the following sections:
        
        1. Summary: A brief overview of the incident
        2. Impact Assessment: Analysis of the impact based on the severity, priority, and affected users
        3. Root Cause Analysis: Potential causes based on available information
        4. Resolution Recommendations: Suggested next steps to resolve the incident
        5. SLA Status: Whether the incident is at risk of breaching SLAs
        
        Use a professional and clear tone appropriate for IT service management.
        """
        
    def create_incident_prompt(self) -> str:
        """Create a prompt for incident creation guidance
        
        Returns:
            Prompt text for helping users create an incident
        """
        return """
        I'll help you create a new ServiceNow incident. Please provide the following information:
        
        1. Short Description: A brief title for the incident (required)
        2. Detailed Description: A thorough explanation of the issue (required)
        3. Caller: The person reporting the issue (optional)
        4. Category and Subcategory: The type of issue (optional)
        5. Impact (1-High, 2-Medium, 3-Low): How broadly this affects users (optional)
        6. Urgency (1-High, 2-Medium, 3-Low): How time-sensitive this issue is (optional)
        
        After collecting this information, I'll use the create_incident tool to submit the incident to ServiceNow.
        """


# Factory functions for creating authentication objects
def create_basic_auth(username: str, password: str) -> BasicAuth:
    """Create BasicAuth object for ServiceNow authentication"""
    return BasicAuth(username, password)
    
def create_token_auth(token: str) -> TokenAuth:
    """Create TokenAuth object for ServiceNow authentication"""
    return TokenAuth(token)

def create_oauth_auth(client_id: str, client_secret: str,
                      username: str, password: str,
                      instance_url: str) -> OAuthAuth:
    """Create OAuthAuth object for ServiceNow authentication"""
    return OAuthAuth(client_id, client_secret, username, password, instance_url)

def create_api_key_auth(api_key: str) -> ApiKeyAuth:
    """Create ApiKeyAuth object for ServiceNow authentication"""
    return ApiKeyAuth(api_key)
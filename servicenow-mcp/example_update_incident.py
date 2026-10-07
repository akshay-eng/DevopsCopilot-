#!/usr/bin/env python3
"""
Example script demonstrating how to update all fields in a ServiceNow incident
using the updated MCP server.
"""

import asyncio
import json
from mcp_server_servicenow.server import (
    ServiceNowMCP,
    BasicAuth,
    IncidentUpdate,
    IncidentState,
    IncidentPriority,
    IncidentUrgency,
    IncidentImpact
)

async def main():
    # Initialize the ServiceNow MCP server
    # Replace these with your actual ServiceNow credentials
    instance_url = "https://your-instance.service-now.com"
    username = "your_username"
    password = "your_password"

    auth = BasicAuth(username, password)
    mcp = ServiceNowMCP(instance_url, auth)

    try:
        # Example 1: Update using the IncidentUpdate model with typed fields
        print("Example 1: Updating incident with typed model...")
        update_model = IncidentUpdate(
            short_description="Updated short description",
            description="Updated detailed description",
            state=IncidentState.IN_PROGRESS,
            priority=IncidentPriority.HIGH,
            urgency=IncidentUrgency.HIGH,
            impact=IncidentImpact.HIGH,
            assignment_group="IT Support",
            assigned_to="John Doe",
            work_notes="Updated via MCP server",
            category="Inquiry / Help",
            subcategory="Network",
            escalation="Normal",
            business_service="Email Service",
            company="edoc"
        )

        result1 = await mcp.update_incident("INC1408705", update_model)
        print(json.dumps(json.loads(result1), indent=2))

        # Example 2: Update using a dictionary with all available fields
        print("\nExample 2: Updating incident with dictionary...")
        update_dict = {
            "short_description": "Critical - Host hardware power status",
            "description": "172.17.92.130",
            "state": 2,  # IN_PROGRESS
            "priority": 2,  # HIGH
            "urgency": 1,  # HIGH
            "impact": 1,  # HIGH
            "assignment_group": "WindowsL1",
            "assigned_to": "Priyanka Guptha",
            "category": "Inquiry / Help",
            "subcategory": "Network",
            "work_notes": "Updated work notes",
            "escalation": "Normal",
            "severity": "2 - Medium",
            "business_service": "IT Infrastructure",
            "company": "edoc",
            "notify": "Do Not Notify",
            "contact_type": "Email",
            # Custom fields
            "u_ci_name": "CI-001",
            "u_instance_name": "Prod-Instance-01",
            "u_ip_address": "172.17.92.130",
            "u_channel": "Web",
            # Integration fields
            "x_opra_opsramp_int_opsramp_incident_id": "INC0010043733"
        }

        result2 = await mcp.update_incident("INC1408705", update_dict)
        print(json.dumps(json.loads(result2), indent=2))

        # Example 3: Update multiple fields at once
        print("\nExample 3: Bulk update of various fields...")
        bulk_update = {
            "short_description": "Host hardware power status issue",
            "description": "Critical hardware issue on host 172.17.92.130",
            "state": 2,  # IN_PROGRESS
            "assignment_group": "WindowsL1",
            "assigned_to": "Priyanka Guptha",
            "work_notes": "Investigating the hardware issue",
            "urgency": 1,
            "impact": 2,
            "priority": 2,
            "category": "Inquiry / Help",
            "company": "edoc",
            "location": "Data Center A",
            "business_impact": "High - affects multiple users",
            "escalation": "Normal",
            "notify": "Do Not Notify",
            "u_ip_address": "172.17.92.130",
            "u_ci_name": "Shruti_JumpBox",
            "u_instance_name": "Shruti_JumpBox.sdxtest.local"
        }

        result3 = await mcp.update_incident("INC1408705", bulk_update)
        print(json.dumps(json.loads(result3), indent=2))

        # Example 4: Update using sys_id instead of incident number
        print("\nExample 4: Updating incident using sys_id...")
        sys_id = "00002117c3ef425071fd3e0705013197"  # From your incident object
        update_by_sysid = {
            "work_notes": "Updated via sys_id",
            "state": 2
        }

        result4 = await mcp.update_incident(sys_id, update_by_sysid)
        print(json.dumps(json.loads(result4), indent=2))

    except Exception as e:
        print(f"Error: {e}")
    finally:
        await mcp.close()

if __name__ == "__main__":
    asyncio.run(main())

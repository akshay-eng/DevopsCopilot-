"""
ServiceNow MCP Server CLI

This module provides the command-line interface for the ServiceNow MCP server.
"""

import argparse
import os
import sys
from dotenv import load_dotenv

from mcp_server_servicenow.server import ServiceNowMCP, create_basic_auth

def main():
    """Run the ServiceNow MCP server from the command line"""
    # Load environment variables from .env file if it exists
    load_dotenv()

    parser = argparse.ArgumentParser(description="ServiceNow MCP Server")
    parser.add_argument("--url", help="ServiceNow instance URL", default=os.environ.get("SERVICENOW_INSTANCE_URL"))
    parser.add_argument("--transport", help="Transport protocol (stdio or sse)", default="stdio", choices=["stdio", "sse"])
    
    # Networking options for SSE
    parser.add_argument("--host", help="Host to bind to (default: 0.0.0.0)", default="0.0.0.0")
    # parser.add_argument("--port", help="Port to listen on (default: 8000)", type=int, default=8000)

    # Authentication options
    auth_group = parser.add_argument_group("Authentication")
    auth_group.add_argument("--api-key", help="ServiceNow API key", default=os.environ.get("SERVICENOW_API_KEY"))
    auth_group.add_argument("--username", help="ServiceNow username", default=os.environ.get("SERVICENOW_USERNAME"))
    auth_group.add_argument("--password", help="ServiceNow password", default=os.environ.get("SERVICENOW_PASSWORD"))
    auth_group.add_argument("--token", help="ServiceNow token", default=os.environ.get("SERVICENOW_TOKEN"))
    auth_group.add_argument("--client-id", help="OAuth client ID", default=os.environ.get("SERVICENOW_CLIENT_ID"))
    auth_group.add_argument("--client-secret", help="OAuth client secret", default=os.environ.get("SERVICENOW_CLIENT_SECRET"))

    args = parser.parse_args()

    # Check required parameters
    if not args.url:
        print("Error: ServiceNow instance URL is required")
        sys.exit(1)

    # Authentication logic
    auth = None
    if args.username and args.password:
        auth = create_basic_auth(args.username, args.password)
    elif args.token:
        from mcp_server_servicenow.server import create_token_auth
        auth = create_token_auth(args.token)
    elif args.client_id and args.client_secret and args.username and args.password:
        from mcp_server_servicenow.server import create_oauth_auth
        auth = create_oauth_auth(args.client_id, args.client_secret, args.username, args.password, args.url)
    elif args.api_key:
        from mcp_server_servicenow.server import create_api_key_auth
        auth = create_api_key_auth(args.api_key)
    else:
        print("Error: Authentication credentials required")
        sys.exit(1)
    
    # Create and run the server
    server = ServiceNowMCP(instance_url=args.url, auth=auth, host=args.host)

    # Run the server
    server.run(transport=args.transport)

if __name__ == "__main__":
    main()
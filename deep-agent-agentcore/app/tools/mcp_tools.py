"""
MCP Tool Loader — connects to deployed MCP servers and creates LangChain tools.

Uses a persistent SSE session per MCP server for reliable tool calls.
Each server gets: one SSE reader thread + one session URL for POSTs.
"""
import json
import logging
import threading
import time
import httpx
from langchain_core.tools import StructuredTool
from pydantic import create_model, Field

logger = logging.getLogger(__name__)


class MCPSession:
    """Persistent MCP server session. Handles SSE reading + tool calls."""

    def __init__(self, base_url: str, server_id: str):
        self.base_url = base_url
        self.server_id = server_id
        self.session_url = None
        self.transport = None      # "streamable-http" or "sse" (set on connect)
        self.session_id = None     # streamable-http session id (Mcp-Session-Id)
        self.mcp_url = None        # streamable-http endpoint (base + /mcp)
        self.tools = []
        self._responses = {}
        self._response_event = threading.Event()
        self._request_id = 10  # Start after init IDs
        self._lock = threading.Lock()
        self._sse_thread = None
        self._running = False
        self._post_client = httpx.Client(timeout=30)

    def connect(self) -> bool:
        """Connect via streamable-http first (newer transport); fall back to SSE."""
        # A prior close() may have shut the client down — ensure it's live.
        try:
            if self._post_client.is_closed:
                self._post_client = httpx.Client(timeout=30)
        except Exception:
            self._post_client = httpx.Client(timeout=30)
        if self._connect_streamable_http():
            return True
        return self._connect_sse()

    # ── Streamable-HTTP transport ─────────────────────────────────────────
    def _shttp_post(self, payload: dict, expect_response: bool = True):
        """POST a JSON-RPC message to the streamable-http /mcp endpoint.

        Captures the Mcp-Session-Id from the response and returns the JSON-RPC
        message matching this request's id (or None for notifications)."""
        headers = {"Content-Type": "application/json",
                   "Accept": "application/json, text/event-stream"}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        resp = self._post_client.post(self.mcp_url, json=payload, headers=headers, timeout=35)
        sid = resp.headers.get("mcp-session-id")
        if sid:
            self.session_id = sid
        if not expect_response:
            return None
        return self._parse_shttp_body(resp, payload.get("id"))

    @staticmethod
    def _parse_shttp_body(resp, req_id):
        """Extract the JSON-RPC message matching req_id from an SSE or JSON body."""
        ct = resp.headers.get("content-type", "")
        msgs = []
        if ct.startswith("text/event-stream"):
            for line in resp.text.splitlines():
                if line.startswith("data:"):
                    try:
                        msgs.append(json.loads(line[5:].strip()))
                    except json.JSONDecodeError:
                        pass
        elif ct.startswith("application/json"):
            try:
                j = resp.json()
                msgs = j if isinstance(j, list) else [j]
            except Exception:
                pass
        for m in msgs:
            if isinstance(m, dict) and m.get("id") == req_id:
                return m
        return msgs[0] if msgs else None

    def _connect_streamable_http(self) -> bool:
        """Try the streamable-http transport (POST /mcp). Returns True if connected."""
        try:
            self.mcp_url = f"{self.base_url}/mcp"
            init = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                               "clientInfo": {"name": "holmesgpt", "version": "1.0"}}}
            resp = self._shttp_post(init)
            if not resp or "result" not in resp:
                return False
            # Ack initialization, then discover tools.
            self._shttp_post({"jsonrpc": "2.0", "method": "notifications/initialized"},
                             expect_response=False)
            tl = self._shttp_post({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
            self.tools = (tl or {}).get("result", {}).get("tools", []) if tl else []
            self.transport = "streamable-http"
            self._running = True
            logger.info(f"MCP {self.server_id}: streamable-http connected, {len(self.tools)} tools")
            return True
        except Exception as e:
            logger.info(f"MCP {self.server_id}: streamable-http unavailable ({e})")
            return False

    def _call_tool_shttp(self, name: str, arguments: dict) -> str:
        with self._lock:
            self._request_id += 1
            req_id = self._request_id
        resp = self._shttp_post({"jsonrpc": "2.0", "id": req_id, "method": "tools/call",
                                 "params": {"name": name, "arguments": arguments}})
        if not resp:
            return f"MCP tool {name}: no response"
        if "error" in resp:
            err = resp["error"]
            return f"MCP Error: {err.get('message', err) if isinstance(err, dict) else err}"
        result = resp.get("result", {})
        content = result.get("content", [])
        texts = [c.get("text", "") for c in content if c.get("type") == "text"]
        return "\n".join(texts) if texts else json.dumps(result)

    # ── SSE transport ─────────────────────────────────────────────────────
    def _connect_sse(self) -> bool:
        """Establish SSE connection, initialize, and discover tools."""
        try:
            self.transport = "sse"
            self._running = True
            self._sse_thread = threading.Thread(target=self._sse_reader, daemon=True)
            self._sse_thread.start()

            # Wait for session URL
            for _ in range(50):  # 5 seconds
                if self.session_url:
                    break
                time.sleep(0.1)

            if not self.session_url:
                logger.error(f"MCP {self.server_id}: No session URL received")
                return False

            # Initialize
            time.sleep(0.3)
            self._post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                                   "clientInfo": {"name": "holmesgpt", "version": "1.0"}}})
            time.sleep(0.2)
            self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
            time.sleep(0.2)

            # List tools
            self._post({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})

            # Wait for tools response
            for _ in range(100):  # 10 seconds
                if 2 in self._responses:
                    resp = self._responses[2]
                    self.tools = resp.get("result", {}).get("tools", [])
                    logger.info(f"MCP {self.server_id}: Discovered {len(self.tools)} tools")
                    return True
                time.sleep(0.1)

            logger.error(f"MCP {self.server_id}: tools/list timeout")
            return False

        except Exception as e:
            logger.error(f"MCP {self.server_id} connect failed: {e}")
            return False

    def is_alive(self) -> bool:
        """True if the session is connected (transport-aware)."""
        if self.transport == "streamable-http":
            return self._running and bool(self.session_id)
        return self._running and bool(self.session_url)

    def call_tool(self, name: str, arguments: dict) -> str:
        """Call an MCP tool and return the result. Reconnects if session died."""
        if self.transport == "streamable-http":
            try:
                return self._call_tool_shttp(name, arguments)
            except Exception as e:
                # Session may have expired — re-initialize once and retry.
                if self._connect_streamable_http():
                    try:
                        return self._call_tool_shttp(name, arguments)
                    except Exception as e2:
                        return f"MCP streamable-http call failed: {e2}"
                return f"MCP streamable-http call failed: {e}"

        # ── SSE transport ──
        if not self._running or not self.session_url:
            # Try to reconnect
            self.close()
            if not self.connect():
                return f"MCP session lost, reconnect failed"

        with self._lock:
            self._request_id += 1
            req_id = self._request_id

        self._response_event.clear()
        self._post({"jsonrpc": "2.0", "id": req_id, "method": "tools/call",
                     "params": {"name": name, "arguments": arguments}})

        # Wait for response (up to 30 seconds)
        for _ in range(300):
            if req_id in self._responses:
                resp = self._responses.pop(req_id)
                if "error" in resp:
                    return f"MCP Error: {resp['error'].get('message', resp['error'])}"
                result = resp.get("result", {})
                content = result.get("content", [])
                texts = [c.get("text", "") for c in content if c.get("type") == "text"]
                return "\n".join(texts) if texts else json.dumps(result)
            time.sleep(0.1)

        return f"MCP tool {name} timed out after 30s"

    def _post(self, payload: dict):
        """POST a JSON-RPC message to the session. Retries once on failure."""
        for attempt in range(2):
            try:
                self._post_client.post(self.session_url, json=payload, timeout=10)
                return
            except Exception as e:
                if attempt == 0:
                    import time
                    time.sleep(0.5)
                else:
                    logger.error(f"MCP POST error after retry: {e}")

    def _sse_reader(self):
        """Background thread: reads SSE events from the MCP server."""
        try:
            with httpx.Client(timeout=600) as client:
                with client.stream("GET", f"{self.base_url}/sse", timeout=600) as sse:
                    for line in sse.iter_lines():
                        if not self._running:
                            break
                        if line.startswith("data: ") and "/messages/" in line and not self.session_url:
                            self.session_url = f"{self.base_url}{line[6:].strip()}"
                        elif line.startswith("data: {"):
                            try:
                                data = json.loads(line[6:])
                                if isinstance(data, dict) and "id" in data:
                                    self._responses[data["id"]] = data
                                    self._response_event.set()
                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            if self._running:
                logger.error(f"MCP SSE reader error: {e}")

    def close(self):
        self._running = False
        try:
            self._post_client.close()
        except:
            pass


# Global session cache
_sessions: dict[str, MCPSession] = {}


def _resolve_url(sse_url: str, port: int = 8000) -> str:
    """Resolve K8s DNS to localhost if port-forward is active."""
    if not sse_url:
        return ""
    if ".svc.cluster.local" in sse_url:
        import socket
        from urllib.parse import urlparse
        try:
            parsed = urlparse(sse_url)
            local_port = parsed.port or port
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            if sock.connect_ex(('127.0.0.1', local_port)) == 0:
                sock.close()
                return f"http://localhost:{local_port}"
            sock.close()
        except:
            pass
    return sse_url.replace("/sse", "").rstrip("/")


async def get_mcp_deployments(auth_service_url: str, auth_token: str) -> list:
    """Fetch active MCP deployments."""
    if not auth_token:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{auth_service_url}/api/mcp-catalog/deployments",
                headers={"Authorization": f"Bearer {auth_token}"},
            )
            if resp.status_code != 200:
                return []
            return [d for d in resp.json().get("deployments", [])
                    if d.get("status") == "running" and d.get("sseUrl")]
    except Exception as e:
        logger.error(f"Deployment fetch error: {e}")
        return []


async def load_mcp_tools(auth_service_url: str, auth_token: str) -> tuple:
    """Load LangChain tools from active MCP deployments.
    Returns (tools_list, tools_info_for_ui).
    """
    import asyncio

    deployments = await get_mcp_deployments(auth_service_url, auth_token)
    if not deployments:
        return [], []

    tools = []
    info = []

    for dep in deployments:
        mcp_id = dep.get("mcpServerId", dep.get("name", "unknown"))
        base_url = _resolve_url(dep.get("sseUrl", ""), dep.get("port", 8000))
        display_name = dep.get("name", mcp_id)

        if not base_url:
            continue

        # Reuse existing session or create new one
        if mcp_id in _sessions and _sessions[mcp_id].is_alive():
            session = _sessions[mcp_id]
        else:
            session = MCPSession(base_url, mcp_id)
            connected = await asyncio.get_event_loop().run_in_executor(None, session.connect)
            if not connected:
                info.append({"id": mcp_id, "name": display_name, "sseUrl": dep.get("sseUrl", ""),
                             "toolCount": 0, "tools": [], "status": "error", "error": "Connection failed"})
                continue
            _sessions[mcp_id] = session

        # Create LangChain tools from discovered MCP tools
        for td in session.tools:
            t = _make_langchain_tool(td, session)
            if t:
                tools.append(t)

        info.append({
            "id": mcp_id, "name": display_name, "sseUrl": dep.get("sseUrl", ""),
            "toolCount": len(session.tools),
            "tools": [td["name"] for td in session.tools],
            "status": "connected",
        })

    return tools, info


def _make_langchain_tool(tool_def: dict, session: MCPSession):
    """Create a LangChain StructuredTool from an MCP tool definition."""
    name = tool_def.get("name", "")
    desc = tool_def.get("description", name)[:200]
    schema = tool_def.get("inputSchema", {})

    if not name:
        return None

    def _invoke(**kwargs):
        return session.call_tool(name, kwargs)

    # Build pydantic model from JSON schema
    fields = {}
    props = schema.get("properties", {})
    required = set(schema.get("required", []))

    for pname, pdef in props.items():
        ptype = pdef.get("type", "string")
        py_type = str
        if ptype == "integer":
            py_type = int
        elif ptype == "boolean":
            py_type = bool
        elif ptype == "number":
            py_type = float

        default = ... if pname in required else pdef.get("default", "")
        fields[pname] = (py_type, Field(default=default, description=pdef.get("description", pname)[:100]))

    if not fields:
        fields["input"] = (str, Field(description="Input"))

    InputModel = create_model(f"{name}_Input", **fields)

    return StructuredTool.from_function(
        func=_invoke, name=name, description=desc, args_schema=InputModel,
    )

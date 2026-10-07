"""
API routes for the AgentCore-powered deep agent.

The /chat endpoint integrates AgentCore Memory:
1. Before the LLM call: retrieves memory context (summaries, preferences, knowledge)
2. Injects memory context into the system prompt
3. After the LLM call: stores the conversation in AgentCore Memory
4. Also stores in SQLite for conversation CRUD (list, load, delete)
"""
import json
import re
import logging
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.config import settings
from app.agent.graph import create_agent_graph
from app.agent.model_factory import create_llm
from app.agent.system_prompt import get_system_prompt
from app.agent.alert_prompt import get_alert_system_prompt
from app.agent.ops_prompt import get_ops_system_prompt
from app.agent.state import auth_token_var, cluster_id_var
from app.tools import get_all_tools
from app.store.conversation import ConversationStore
from app.memory.manager import AgentCoreMemoryManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent")
store = ConversationStore(settings.db_path)
memory_manager = AgentCoreMemoryManager(
    memory_id=settings.agentcore_memory_id,
    region=settings.agentcore_memory_region,
)


@router.post("/chat")
async def chat(request: Request):
    """Send a message to the deep agent and stream the response via SSE.
    Integrates AgentCore Memory for context retrieval and storage."""
    body = await request.json()
    message = body.get("message", "")
    conversation_id = body.get("conversationId")
    model_provider = body.get("modelProvider", settings.default_model_provider)
    cluster_id = body.get("clusterId", "")
    user_id = body.get("userId", "anonymous")
    auth_token = body.get("authToken", "")

    if not message.strip():
        return {"error": "Message cannot be empty"}

    # Set context variables so platform tools can access auth + cluster
    auth_token_var.set(auth_token)
    cluster_id_var.set(cluster_id)

    async def event_stream():
        try:
            # Create LLM and tools
            llm = create_llm(model_provider, settings)
            tools = get_all_tools(enable_write=settings.enable_write_tools)
            graph = create_agent_graph(tools, llm)

            # Create or load conversation
            conv_id = conversation_id
            if not conv_id:
                conv_id = await store.create_conversation(
                    user_id=user_id,
                    title=message[:80],
                    model_provider=model_provider,
                    cluster_id=cluster_id,
                )

            # Generate session ID for AgentCore Memory
            session_id = memory_manager.generate_session_id(conv_id)

            # --- AgentCore Memory: Retrieve context ---
            memory_context = await memory_manager.get_memory_context(
                user_id=user_id,
                session_id=session_id,
                query=message,
            )

            # Load conversation history from SQLite
            history_msgs = []
            if conversation_id:
                stored = await store.get_messages(conversation_id)
                for m in stored:
                    if m["role"] == "user":
                        history_msgs.append(HumanMessage(content=m["content"]))
                    elif m["role"] == "assistant":
                        history_msgs.append(AIMessage(content=m["content"]))

            # Build messages with memory-augmented system prompt
            system_prompt = get_system_prompt(cluster_id, memory_context)
            messages = [SystemMessage(content=system_prompt)]
            messages.extend(history_msgs)
            messages.append(HumanMessage(content=message))

            state = {
                "messages": messages,
                "user_id": user_id,
                "cluster_id": cluster_id,
                "model_provider": model_provider,
                "session_id": session_id,
                "memory_context": memory_context,
            }

            # Stream events
            full_response = ""
            tool_calls_log = []

            async for event in graph.astream_events(state, version="v2"):
                kind = event.get("event", "")

                if kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    if chunk and hasattr(chunk, "content") and chunk.content:
                        content = chunk.content
                        # Gemini returns content as list of parts
                        if isinstance(content, list):
                            text_parts = [p.get("text", "") if isinstance(p, dict) else str(p) for p in content]
                            content = "".join(text_parts)
                        if isinstance(content, str) and content:
                            full_response += content
                            yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

                elif kind == "on_tool_start":
                    tool_name = event.get("name", "")
                    tool_input = event.get("data", {}).get("input", {})
                    display_input = {}
                    for k, v in (tool_input if isinstance(tool_input, dict) else {}).items():
                        sv = str(v)
                        display_input[k] = sv[:500] if len(sv) > 500 else sv
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name, 'input': display_input})}\n\n"

                elif kind == "on_tool_end":
                    tool_name = event.get("name", "")
                    output = str(event.get("data", {}).get("output", ""))
                    if len(output) > 3000:
                        output = output[:3000] + "\n... (truncated)"
                    tool_calls_log.append({"tool": tool_name, "output": output[:500]})
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name, 'output': output})}\n\n"

            # Save messages to SQLite
            await store.save_message(conv_id, "user", message)
            await store.save_message(conv_id, "assistant", full_response, tool_calls_log)

            # --- AgentCore Memory: Store conversation ---
            await memory_manager.store_conversation(
                user_id=user_id,
                session_id=session_id,
                user_message=message,
                assistant_response=full_response,
                tool_calls=tool_calls_log,
            )

            yield f"data: {json.dumps({'type': 'done', 'conversationId': conv_id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/conversations")
async def list_conversations(userId: str = "", limit: int = 50):
    """List all conversations for a user."""
    conversations = await store.get_conversations(userId, limit)
    return {"conversations": conversations}


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get all messages in a conversation."""
    messages = await store.get_messages(conversation_id)
    return {"messages": messages, "conversationId": conversation_id}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, userId: str = ""):
    """Delete a conversation."""
    deleted = await store.delete_conversation(conversation_id, userId)
    return {"deleted": deleted}


@router.post("/tools")
async def get_active_tools(request: Request):
    """Return list of active tools available to the agent, including MCP servers."""
    body = await request.json()
    auth_token = body.get("authToken", "")

    from app.tools.mcp_tools import load_mcp_tools

    # Platform tools (always available)
    platform_tools = [
        {"id": "platform", "name": "Platform Tools", "status": "connected",
         "tools": ["list_clusters", "get_alerts", "get_resources", "get_pod_logs",
                    "get_metrics", "get_events", "get_timeline", "get_correlation",
                    "get_network", "get_service_map", "get_integrations"],
         "toolCount": 21},
        {"id": "prometheus", "name": "Prometheus", "status": "connected",
         "tools": ["prometheus_query", "prometheus_query_range"],
         "toolCount": 2},
        {"id": "kubernetes", "name": "Kubernetes CLI", "status": "connected",
         "tools": ["kubectl_get", "kubectl_describe", "kubectl_logs", "kubectl_apply",
                    "kubectl_delete", "kubectl_scale", "kubectl_rollout"],
         "toolCount": 9},
    ]

    # MCP tools (dynamic, based on user's deployments)
    mcp_tools_info = []
    if auth_token:
        _, mcp_tools_info = await load_mcp_tools(settings.auth_service_url, auth_token)

    return {
        "tools": platform_tools + mcp_tools_info,
        "totalCount": sum(t.get("toolCount", 0) for t in platform_tools) + sum(t.get("toolCount", 0) for t in mcp_tools_info),
    }


@router.post("/ops")
async def ops_agent(request: Request):
    """Enterprise AIOps agent with memory, sessions, and full platform tool access.

    Follows enterprise practices: asks before assuming, requires approval for
    write operations, suggests Change Requests for high-risk changes.
    Streams tool calls and responses via SSE.
    """
    body = await request.json()
    message = body.get("message", "")
    conversation_id = body.get("conversationId")
    model_provider = body.get("modelProvider", settings.default_model_provider)
    cluster_id = body.get("clusterId", "")
    user_id = body.get("userId", "anonymous")
    auth_token = body.get("authToken", "")

    if not message.strip():
        return {"error": "Message cannot be empty"}

    # Set context variables so platform tools can access auth + cluster
    auth_token_var.set(auth_token)
    cluster_id_var.set(cluster_id)

    async def event_stream():
        try:
            from langchain_core.messages import ToolMessage as LCToolMessage

            # Create LLM and tools
            llm = create_llm(model_provider, settings)
            tools = get_all_tools(enable_write=settings.enable_write_tools)

            # Initialize MCP sessions (ServiceNow, etc.) for ITSM tools
            if auth_token:
                try:
                    from app.tools.mcp_tools import load_mcp_tools
                    _, mcp_info = await load_mcp_tools(settings.auth_service_url, auth_token)
                    # MCP sessions are now cached — ITSM tools use them directly
                    connected = [m for m in mcp_info if m.get("status") == "connected"]
                    if connected:
                        logger.info(f"MCP connected: {[m['name'] for m in connected]}")
                except Exception as e:
                    logger.warning(f"MCP init failed (ITSM tools will show error): {e}")

            graph = create_agent_graph(tools, llm)

            # Create or load conversation
            conv_id = conversation_id
            if not conv_id:
                conv_id = await store.create_conversation(
                    user_id=user_id,
                    title=message[:80],
                    model_provider=model_provider,
                    cluster_id=cluster_id,
                )

            # Generate session ID for AgentCore Memory
            session_id = memory_manager.generate_session_id(conv_id)

            # --- AgentCore Memory: Retrieve context ---
            memory_context = await memory_manager.get_memory_context(
                user_id=user_id,
                session_id=session_id,
                query=message,
            )

            # Load conversation history from SQLite
            history_msgs = []
            if conversation_id:
                stored = await store.get_messages(conversation_id)
                for m in stored:
                    if m["role"] == "user":
                        history_msgs.append(HumanMessage(content=m["content"]))
                    elif m["role"] == "assistant":
                        history_msgs.append(AIMessage(content=m["content"]))

            # Build messages with ops system prompt + memory
            system_prompt = get_ops_system_prompt(cluster_id, memory_context)
            messages = [SystemMessage(content=system_prompt)]
            messages.extend(history_msgs)
            messages.append(HumanMessage(content=message))

            state = {
                "messages": messages,
                "user_id": user_id,
                "cluster_id": cluster_id,
                "model_provider": model_provider,
                "session_id": session_id,
                "memory_context": memory_context,
                "auth_token": auth_token,
            }

            # Stream tokens + reasoning in real time using LangGraph's dual stream modes:
            #   - "messages": per-token LLM output — content AND our captured `reasoning`
            #   - "updates":  per-node updates — tool_start / tool_end (+ chart injection)
            full_response = ""
            tool_calls_log = []

            async for mode, data in graph.astream(state, stream_mode=["updates", "messages"]):
                if mode == "messages":
                    chunk, meta = data
                    # Only stream the agent LLM node; skip tool-result "messages".
                    if meta.get("langgraph_node") != "agent":
                        continue
                    ak = getattr(chunk, "additional_kwargs", None) or {}
                    reasoning = ak.get("reasoning")
                    if reasoning:
                        yield f"data: {json.dumps({'type': 'reasoning', 'content': reasoning})}\n\n"
                    content = getattr(chunk, "content", "")
                    if isinstance(content, list):
                        content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
                    if content:
                        full_response += content
                        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                    continue

                # mode == "updates"
                for node_name, node_state in data.items():
                    step_messages = node_state.get("messages", [])
                    for msg in step_messages:
                        # AI message with tool calls
                        if hasattr(msg, "tool_calls") and msg.tool_calls:
                            for tc in msg.tool_calls:
                                tool_input = tc.get("args", {})
                                display_input = {}
                                for k, v in tool_input.items():
                                    sv = str(v)
                                    display_input[k] = sv[:500] if len(sv) > 500 else sv
                                yield f"data: {json.dumps({'type': 'tool_start', 'tool': tc['name'], 'input': display_input})}\n\n"

                        # Tool result messages → emit output + optional chart block
                        elif isinstance(msg, LCToolMessage):
                            output = str(msg.content)
                            if len(output) > 3000:
                                output = output[:3000] + "\n... (truncated)"
                            tool_calls_log.append({"tool": msg.name, "output": output[:500]})
                            yield f"data: {json.dumps({'type': 'tool_end', 'tool': msg.name, 'output': output})}\n\n"

                            # Auto-inject chart for prometheus_query_range results
                            if msg.name == "prometheus_query_range" and "__CHART_DATA__:" in output:
                                try:
                                    chart_raw = output.split("__CHART_DATA__:")[1]
                                    chart_data = json.loads(chart_raw)
                                    chart_block = json.dumps({"type": "chart", "title": chart_data.get("query", ""), "duration": chart_data.get("duration", ""), "series": chart_data.get("series", [])})
                                    # Inject as a token so the frontend renders it inline
                                    yield f"data: {json.dumps({'type': 'token', 'content': chr(10) + ':::ui' + chr(10) + chart_block + chr(10) + ':::' + chr(10)})}\n\n"
                                except Exception:
                                    pass


            # Save messages to SQLite
            await store.save_message(conv_id, "user", message)
            await store.save_message(conv_id, "assistant", full_response, tool_calls_log)

            # --- AgentCore Memory: Store conversation ---
            await memory_manager.store_conversation(
                user_id=user_id,
                session_id=session_id,
                user_message=message,
                assistant_response=full_response,
                tool_calls=tool_calls_log,
            )

            yield f"data: {json.dumps({'type': 'done', 'conversationId': conv_id})}\n\n"

        except Exception as e:
            logger.error(f"Ops agent error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/alert-generate")
async def alert_generate(request: Request):
    """Generate a Prometheus alert rule from a natural language description.

    Uses the LangGraph agent with Prometheus tools to verify metrics
    and produce a structured alert rule JSON for user approval.
    Returns SSE stream with tool calls visible, ending with the generated rule.
    """
    body = await request.json()
    prompt = body.get("prompt", "")
    cluster_id = body.get("clusterId", "")
    namespace = body.get("namespace", "all")
    model_provider = body.get("modelProvider", settings.default_model_provider)

    if not prompt.strip():
        return {"error": "Prompt cannot be empty"}

    logger.info(f"[alert-generate] provider={model_provider}, model={settings.bedrock_model}")

    async def event_stream():
        try:
            # Only give the agent Prometheus query tools (read-only)
            from app.tools.prometheus import prometheus_query, prometheus_query_range
            from langchain_core.messages import ToolMessage as LCToolMessage
            tools = [prometheus_query, prometheus_query_range]

            llm = create_llm(model_provider, settings)
            graph = create_agent_graph(tools, llm)

            system_prompt = get_alert_system_prompt(cluster_id, namespace)
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=prompt),
            ]

            state = {
                "messages": messages,
                "user_id": "alert-agent",
                "cluster_id": cluster_id,
                "model_provider": model_provider,
                "session_id": "",
                "memory_context": "",
            }

            # Use ainvoke (Bedrock streaming + tool use has issues with astream_events)
            # but stream tool call events by iterating graph steps
            full_response = ""

            async for step_output in graph.astream(state, stream_mode="updates"):
                for node_name, node_state in step_output.items():
                    step_messages = node_state.get("messages", [])
                    for msg in step_messages:
                        # AI message with tool calls
                        if hasattr(msg, "tool_calls") and msg.tool_calls:
                            for tc in msg.tool_calls:
                                tool_input = tc.get("args", {})
                                display_input = {}
                                for k, v in tool_input.items():
                                    sv = str(v)
                                    display_input[k] = sv[:500] if len(sv) > 500 else sv
                                yield f"data: {json.dumps({'type': 'tool_start', 'tool': tc['name'], 'input': display_input})}\n\n"

                        # Tool result messages
                        elif isinstance(msg, LCToolMessage):
                            output = str(msg.content)
                            if len(output) > 2000:
                                output = output[:2000] + "\n... (truncated)"
                            yield f"data: {json.dumps({'type': 'tool_end', 'tool': msg.name, 'output': output})}\n\n"

                        # Final AI text response — stream in chunks
                        elif hasattr(msg, "content") and msg.content and not getattr(msg, "tool_calls", None):
                            if msg.type == "ai":
                                _raw2 = msg.content
                                if isinstance(_raw2, list):
                                    _raw2 = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in _raw2)
                                full_response = _raw2 if isinstance(_raw2, str) else str(_raw2)
                                import asyncio as _aio2
                                text = full_response
                                i = 0
                                while i < len(text):
                                    chunk_end = i + 1
                                    for j in range(i + 1, min(i + 80, len(text))):
                                        if text[j] in '\n' or (text[j] in '.!?:' and j + 1 < len(text) and text[j + 1] in ' \n'):
                                            chunk_end = j + 1
                                            break
                                    else:
                                        chunk_end = min(i + 40, len(text))
                                        if chunk_end < len(text) and text[chunk_end] not in ' \n\t':
                                            space = text.rfind(' ', i, chunk_end)
                                            if space > i:
                                                chunk_end = space + 1
                                    if chunk_end <= i:
                                        chunk_end = i + 1
                                    yield f"data: {json.dumps({'type': 'token', 'content': text[i:chunk_end]})}\n\n"
                                    i = chunk_end
                                    await _aio2.sleep(0.015)

            # Extract the JSON block from the full response
            generated_rule = None
            json_match = re.search(r"```json\s*(\{.*?\})\s*```", full_response, re.DOTALL)
            if json_match:
                try:
                    generated_rule = json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass

            # Fallback: try to find raw JSON object in response
            if not generated_rule:
                json_match = re.search(r"\{[^{}]*\"alert_name\"[^{}]*\}", full_response, re.DOTALL)
                if json_match:
                    try:
                        generated_rule = json.loads(json_match.group(0))
                    except json.JSONDecodeError:
                        pass

            yield f"data: {json.dumps({'type': 'done', 'generatedRule': generated_rule})}\n\n"

        except Exception as e:
            logger.error(f"Alert generation error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

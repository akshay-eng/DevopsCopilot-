import json
import uuid
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.config import settings
from app.agent.graph import create_agent_graph
from app.agent.model_factory import create_llm
from app.agent.system_prompt import get_system_prompt
from app.tools import get_all_tools
from app.store.conversation import ConversationStore

router = APIRouter(prefix="/api/agent")
store = ConversationStore(settings.db_path)


@router.post("/chat")
async def chat(request: Request):
    """Send a message to the deep agent and stream the response via SSE."""
    body = await request.json()
    message = body.get("message", "")
    conversation_id = body.get("conversationId")
    model_provider = body.get("modelProvider", settings.default_model_provider)
    cluster_id = body.get("clusterId", "")
    user_id = body.get("userId", "anonymous")

    if not message.strip():
        return {"error": "Message cannot be empty"}

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

            # Load history
            history_msgs = []
            if conversation_id:
                stored = await store.get_messages(conversation_id)
                for m in stored:
                    if m["role"] == "user":
                        history_msgs.append(HumanMessage(content=m["content"]))
                    elif m["role"] == "assistant":
                        history_msgs.append(AIMessage(content=m["content"]))

            # Build messages
            messages = [SystemMessage(content=get_system_prompt(cluster_id))]
            messages.extend(history_msgs)
            messages.append(HumanMessage(content=message))

            state = {
                "messages": messages,
                "user_id": user_id,
                "cluster_id": cluster_id,
                "model_provider": model_provider,
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
                        if isinstance(content, str):
                            full_response += content
                            yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"

                elif kind == "on_tool_start":
                    tool_name = event.get("name", "")
                    tool_input = event.get("data", {}).get("input", {})
                    # Truncate large inputs for display
                    display_input = {}
                    for k, v in (tool_input if isinstance(tool_input, dict) else {}).items():
                        sv = str(v)
                        display_input[k] = sv[:500] if len(sv) > 500 else sv
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': tool_name, 'input': display_input})}\n\n"

                elif kind == "on_tool_end":
                    tool_name = event.get("name", "")
                    output = str(event.get("data", {}).get("output", ""))
                    # Truncate large outputs
                    if len(output) > 3000:
                        output = output[:3000] + "\n... (truncated)"
                    tool_calls_log.append({"tool": tool_name, "output": output[:500]})
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': tool_name, 'output': output})}\n\n"

            # Save messages
            await store.save_message(conv_id, "user", message)
            await store.save_message(conv_id, "assistant", full_response, tool_calls_log)

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

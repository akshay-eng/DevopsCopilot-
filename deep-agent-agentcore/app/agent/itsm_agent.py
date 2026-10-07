"""
ITSM Sub-Agent.

A self-contained agent that handles ServiceNow incident and change management.
Called by the ops agent (HolmesGPT) when ITSM actions are needed.

The sub-agent:
1. Receives context from the parent (investigation findings, user request)
2. Loads ONLY ServiceNow MCP tools (not platform tools)
3. Runs the ITSM pipeline (create -> assign -> manage -> close)
4. Returns structured results back to the parent agent
"""
import json
import logging
from langchain_core.messages import SystemMessage, HumanMessage

from app.agent.itsm_prompt import get_itsm_prompt
from app.agent.graph import create_agent_graph
from app.agent.model_factory import create_llm
from app.config import settings

logger = logging.getLogger(__name__)


async def run_itsm_agent(
    mode: str,
    user_message: str,
    context: str = "",
    mcp_tools: list = None,
    model_provider: str = None,
) -> dict:
    """
    Run the ITSM sub-agent.

    Args:
        mode: 'incident' or 'change'
        user_message: The user's request (e.g., "Create an incident for crashing pod X")
        context: Investigation context from HolmesGPT (pod name, namespace, error, etc.)
        mcp_tools: ServiceNow MCP tools (pre-loaded by parent)
        model_provider: LLM provider to use

    Returns:
        dict with:
            - response: The agent's text response
            - tool_calls: List of tool calls made
            - success: Whether the pipeline completed
    """
    if not mcp_tools:
        return {
            "response": "ServiceNow MCP tools are not available. Please deploy the ServiceNow MCP server from the MCP Catalog and ensure it is running.",
            "tool_calls": [],
            "success": False,
        }

    provider = model_provider or settings.default_model_provider
    llm = create_llm(provider, settings)
    graph = create_agent_graph(mcp_tools, llm)

    system_prompt = get_itsm_prompt(mode, context)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]

    state = {
        "messages": messages,
        "user_id": "itsm-agent",
        "cluster_id": "",
        "model_provider": provider,
        "session_id": "",
        "memory_context": "",
        "auth_token": "",
    }

    try:
        result = await graph.ainvoke(state)
        final_messages = result.get("messages", [])

        response_text = ""
        tool_calls_log = []

        for msg in final_messages:
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    tool_calls_log.append({
                        "tool": tc.get("name", ""),
                        "args": {k: str(v)[:200] for k, v in tc.get("args", {}).items()},
                    })
            elif hasattr(msg, "content") and msg.content and msg.type == "ai":
                response_text = msg.content

        return {
            "response": response_text,
            "tool_calls": tool_calls_log,
            "success": True,
        }

    except Exception as e:
        logger.error(f"ITSM agent error: {e}", exc_info=True)
        return {
            "response": f"ITSM agent encountered an error: {str(e)}",
            "tool_calls": [],
            "success": False,
        }

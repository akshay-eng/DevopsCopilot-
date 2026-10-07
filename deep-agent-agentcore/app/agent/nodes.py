from langchain_core.messages import ToolMessage
from app.agent.state import AgentState


def agent_node(state: AgentState, llm_with_tools) -> dict:
    """Call the LLM. It either responds with text or requests tool calls."""
    messages = state["messages"]
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def tool_node(state: AgentState, tools: list) -> dict:
    """Execute tools the agent requested."""
    messages = state["messages"]
    last_message = messages[-1]
    tool_calls = getattr(last_message, "tool_calls", [])

    tool_map = {t.name: t for t in tools}
    tool_messages = []

    for tc in tool_calls:
        tool_name = tc["name"]
        tool_args = tc["args"]

        if tool_name in tool_map:
            try:
                result = tool_map[tool_name].invoke(tool_args)
                tool_messages.append(
                    ToolMessage(content=str(result), tool_call_id=tc["id"], name=tool_name)
                )
            except Exception as e:
                tool_messages.append(
                    ToolMessage(content=f"Error: {str(e)}", tool_call_id=tc["id"], name=tool_name)
                )
        else:
            tool_messages.append(
                ToolMessage(content=f"Unknown tool: {tool_name}", tool_call_id=tc["id"], name=tool_name)
            )

    return {"messages": tool_messages}


def should_continue(state: AgentState) -> str:
    """Route: tool calls → execute. Text only → end."""
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):
        return "tools"
    return "end"

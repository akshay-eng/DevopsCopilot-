from langchain_core.messages import ToolMessage
from app.agent.state import AgentState


def agent_node(state: AgentState, llm_with_tools) -> dict:
    """Main agent reasoning node. Calls the LLM with conversation history and tools."""
    messages = state["messages"]
    response = llm_with_tools.invoke(messages)
    return {"messages": [response]}


def tool_node(state: AgentState, tools: list) -> dict:
    """Execute tools requested by the agent and return results."""
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
                    ToolMessage(
                        content=str(result),
                        tool_call_id=tc["id"],
                        name=tool_name,
                    )
                )
            except Exception as e:
                tool_messages.append(
                    ToolMessage(
                        content=f"ERROR executing {tool_name}: {str(e)}",
                        tool_call_id=tc["id"],
                        name=tool_name,
                    )
                )
        else:
            tool_messages.append(
                ToolMessage(
                    content=f"ERROR: Unknown tool '{tool_name}'",
                    tool_call_id=tc["id"],
                    name=tool_name,
                )
            )

    return {"messages": tool_messages}


def should_continue(state: AgentState) -> str:
    """Route: if the LLM requested tool calls, go to tool_node. Otherwise, end."""
    messages = state["messages"]
    last_message = messages[-1]
    tool_calls = getattr(last_message, "tool_calls", None)

    if tool_calls:
        return "tools"
    return "end"

from langgraph.graph import StateGraph, END
from app.agent.state import AgentState
from app.agent.nodes import agent_node, tool_node, should_continue


def create_agent_graph(tools: list, llm):
    """Create the LangGraph agent workflow.

    The graph follows a ReAct pattern:
    agent (LLM reasoning) -> tools (execute) -> agent -> ... -> end
    """
    llm_with_tools = llm.bind_tools(tools)

    workflow = StateGraph(AgentState)

    workflow.add_node("agent", lambda state: agent_node(state, llm_with_tools))
    workflow.add_node("tools", lambda state: tool_node(state, tools))

    workflow.set_entry_point("agent")

    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "end": END},
    )
    workflow.add_edge("tools", "agent")

    return workflow.compile()

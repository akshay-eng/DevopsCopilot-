from langgraph.graph import StateGraph, END
from app.agent.state import AgentState
from app.agent.nodes import agent_node, tool_node, should_continue


def create_agent_graph(tools: list, llm, max_iterations: int = 6):
    """Create the LangGraph agent workflow.

    ReAct pattern with iteration limit to prevent infinite loops:
    agent (LLM reasoning) -> tools (execute) -> agent -> ... -> end

    Max iterations prevents runaway tool calling.
    """
    llm_with_tools = llm.bind_tools(tools)

    iteration_count = {"count": 0}

    def agent_with_limit(state):
        iteration_count["count"] += 1
        return agent_node(state, llm_with_tools)

    def should_continue_with_limit(state):
        if iteration_count["count"] >= max_iterations:
            return "end"
        return should_continue(state)

    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_with_limit)
    workflow.add_node("tools", lambda state: tool_node(state, tools))
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue_with_limit, {"tools": "tools", "end": END})
    workflow.add_edge("tools", "agent")

    return workflow.compile()

"""
Simple LangGraph Agent Demo for DevOps Copilot Integration

This demonstrates a working LangGraph agent that will show up in your
local DevOps Copilot Analytics dashboard.
"""

import os
from typing import TypedDict, Annotated, Sequence
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END

# Load environment variables
load_dotenv()

# Define tools
@tool
def get_cluster_status(cluster_name: str) -> str:
    """Get the current status of a Kubernetes cluster."""
    return f"Cluster '{cluster_name}' is running with 5 nodes, 42 pods active."

@tool
def analyze_logs(service_name: str) -> str:
    """Analyze logs for a specific service."""
    return f"Analyzed logs for '{service_name}': Found 2 warnings, 0 errors."

# Create tools list
tools = [get_cluster_status, analyze_logs]

# Define state
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "conversation messages"]

# Initialize LLM
llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.7,
    api_key=os.getenv('OPENAI_API_KEY')
).bind_tools(tools)

# Define nodes
def agent_node(state: AgentState) -> AgentState:
    """Agent reasoning node."""
    response = llm.invoke(state["messages"])
    return {"messages": state["messages"] + [response]}

def call_tools(state: AgentState) -> AgentState:
    """Execute tools."""
    last_message = state["messages"][-1]
    tool_messages = []

    for tool_call in last_message.tool_calls:
        for tool in tools:
            if tool.name == tool_call["name"]:
                result = tool.invoke(tool_call["args"])
                tool_messages.append(ToolMessage(
                    content=str(result),
                    tool_call_id=tool_call["id"]
                ))
                break

    return {"messages": state["messages"] + tool_messages}

def should_continue(state: AgentState) -> str:
    """Routing logic."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "continue"
    return "end"

# Build graph
def create_graph():
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", call_tools)
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges("agent", should_continue, {
        "continue": "tools",
        "end": END
    })
    workflow.add_edge("tools", "agent")
    return workflow.compile()

# Run demo
def main():
    print("🚀 LangGraph Agent Demo")
    print("=" * 60)

    agent = create_graph()

    queries = [
        "Check the status of my production-cluster",
        "Analyze the logs for the api-gateway service"
    ]

    for i, query in enumerate(queries, 1):
        print(f"\n{i}. Query: {query}")
        result = agent.invoke({"messages": [HumanMessage(content=query)]})
        print(f"   Response: {result['messages'][-1].content}\n")

    print("=" * 60)
    print("✅ Demo complete!")

if __name__ == "__main__":
    main()

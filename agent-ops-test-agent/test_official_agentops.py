"""
LangGraph Agent with Official AgentOps Cloud Integration

This connects to the official AgentOps service at app.agentops.ai
using your real API key from the AgentOps webapp.

Fixes SSL certificate verification issues.
"""

import os
import ssl
import certifi
from typing import TypedDict, Annotated, Sequence
from dotenv import load_dotenv

# Fix SSL certificate issues BEFORE importing other modules
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

import agentops
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END

load_dotenv()

# Initialize AgentOps with your API key from app.agentops.ai
print("🔧 Initializing AgentOps...")
print(f"API Key: {os.getenv('AGENTOPS_API_KEY')[:20]}...")

agentops.init(
    api_key=os.getenv('AGENTOPS_API_KEY'),
    tags=['langgraph', 'kubernetes', 'devops-copilot'],
    auto_start_session=True
)

print("✅ AgentOps initialized successfully!")

# Define tools
@tool
def get_cluster_status(cluster_name: str) -> str:
    """Get the current status of a Kubernetes cluster"""
    return f"Cluster '{cluster_name}' is healthy: 5 nodes, 42 pods running, CPU: 65%, Memory: 72%"

@tool
def analyze_logs(service_name: str) -> str:
    """Analyze logs for a specific service"""
    return f"Analyzed logs for '{service_name}': 156 entries in last hour, 2 warnings, 0 errors. System is stable."

@tool
def get_pod_metrics(namespace: str) -> str:
    """Get metrics for all pods in a namespace"""
    return f"Namespace '{namespace}': 12 pods active, avg CPU 45%, avg Memory 68%, 0 restarts in 24h"

@tool
def check_deployment_health(deployment_name: str) -> str:
    """Check the health of a specific deployment"""
    return f"Deployment '{deployment_name}': 3/3 replicas ready, last rollout: successful, no errors"

tools = [get_cluster_status, analyze_logs, get_pod_metrics, check_deployment_health]

# LangGraph agent setup
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "conversation messages"]

llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.7,
    api_key=os.getenv('OPENAI_API_KEY')
).bind_tools(tools)

def agent_node(state: AgentState) -> AgentState:
    """Agent reasoning node with LLM"""
    response = llm.invoke(state["messages"])
    return {"messages": state["messages"] + [response]}

def call_tools(state: AgentState) -> AgentState:
    """Execute requested tools"""
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
    """Determine whether to continue or end"""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "continue"
    return "end"

def create_graph():
    """Build the LangGraph workflow"""
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

def main():
    print("\n" + "=" * 80)
    print("🚀 LangGraph Agent with Official AgentOps Cloud Integration")
    print("=" * 80)

    agent = create_graph()

    # Test scenarios simulating DevOps tasks
    scenarios = [
        {
            "query": "Check the status of my production-cluster",
            "description": "Simple cluster health check"
        },
        {
            "query": "Analyze the logs for the api-gateway service and check the deployment health",
            "description": "Multi-tool query - logs + deployment"
        },
        {
            "query": "Get metrics for the backend namespace and tell me if there are any issues",
            "description": "Metrics analysis with reasoning"
        },
        {
            "query": "What's the overall health of my production-cluster? Check both the cluster and the frontend deployment.",
            "description": "Complex query requiring multiple tool calls"
        }
    ]

    for i, scenario in enumerate(scenarios, 1):
        print(f"\n{'─' * 80}")
        print(f"Scenario {i}/4: {scenario['description']}")
        print(f"{'─' * 80}")
        print(f"👤 User: {scenario['query']}")

        try:
            # Run the agent
            result = agent.invoke({"messages": [HumanMessage(content=scenario['query'])]})
            response = result['messages'][-1].content

            print(f"\n🤖 Agent: {response}\n")

            # Record a custom event in AgentOps
            agentops.record(
                agentops.ActionEvent(
                    action_type=f"scenario_{i}",
                    params={
                        "scenario": scenario['description'],
                        "query": scenario['query']
                    }
                )
            )

        except Exception as e:
            print(f"\n❌ Error: {e}\n")
            agentops.record(
                agentops.ErrorEvent(
                    error_type=type(e).__name__,
                    details=str(e)
                )
            )

    print("=" * 80)
    print("✅ Demo Complete!")
    print("=" * 80)
    print("\n📊 Now check your AgentOps dashboard:")
    print("   1. Go to: https://app.agentops.ai/sessions")
    print("   2. Find your latest session (tagged with 'langgraph', 'kubernetes')")
    print("   3. Click to see detailed trace with:")
    print("      • All LLM calls with prompts & responses")
    print("      • Tool executions (get_cluster_status, analyze_logs, etc.)")
    print("      • Token usage and costs")
    print("      • Latency metrics")
    print("      • Full conversation flow")
    print("\n🎯 What to look for in AgentOps:")
    print("   • Session timeline showing each step")
    print("   • LLM token counts (prompt + completion)")
    print("   • Tool call success/failure")
    print("   • Total cost per session")
    print("   • Performance metrics (duration, latency)")
    print("=" * 80)

    # End the AgentOps session
    agentops.end_session(end_state="Success")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        agentops.end_session(end_state="Indeterminate", end_state_reason="User interrupted")
    except Exception as e:
        print(f"\n\n❌ Fatal error: {e}")
        agentops.end_session(end_state="Fail", end_state_reason=str(e))

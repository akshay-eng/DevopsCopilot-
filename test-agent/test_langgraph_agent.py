"""
LangGraph Agent with AgentOps Integration

This agent demonstrates a multi-step workflow using LangGraph with full AgentOps monitoring.
It will show up in your AgentOps dashboard with detailed traces, events, and metrics.

Features demonstrated:
1. Multi-node graph workflow
2. Tool usage with function calling
3. Conditional routing
4. Error handling
5. LLM interactions
6. AgentOps session tracking
"""

import os
from typing import TypedDict, Annotated, Sequence
from dotenv import load_dotenv
import agentops
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END

# Load environment variables
load_dotenv()

# Initialize AgentOps with your project API key
agentops.init(
    api_key=os.getenv('AGENTOPS_API_KEY'),
    tags=['langgraph-demo', 'devops-copilot', 'test-agent'],
    default_tags=['production']
)

# Define tools that the agent can use
@tool
def search_kubernetes_docs(query: str) -> str:
    """Search Kubernetes documentation for information about concepts, commands, or best practices."""
    # Simulated search results
    docs = {
        "pods": "Pods are the smallest deployable units in Kubernetes. They can contain one or more containers.",
        "services": "Services expose pods to network traffic. Types include ClusterIP, NodePort, and LoadBalancer.",
        "deployments": "Deployments provide declarative updates for Pods and ReplicaSets.",
        "ingress": "Ingress manages external access to services, typically HTTP/HTTPS routing.",
    }

    for key, value in docs.items():
        if key in query.lower():
            return f"Found documentation: {value}"

    return "No specific documentation found. Try searching for: pods, services, deployments, or ingress."

@tool
def analyze_cluster_health(cluster_name: str) -> str:
    """Analyze the health status of a Kubernetes cluster."""
    # Simulated cluster health check
    health_data = {
        "cluster": cluster_name,
        "status": "Healthy",
        "nodes": 5,
        "pods_running": 42,
        "pods_pending": 2,
        "cpu_usage": "65%",
        "memory_usage": "72%",
        "warnings": ["2 pods pending due to resource constraints"]
    }

    return f"""Cluster Health Report for '{cluster_name}':
    Status: {health_data['status']}
    Nodes: {health_data['nodes']}
    Pods Running: {health_data['pods_running']}
    Pods Pending: {health_data['pods_pending']}
    CPU Usage: {health_data['cpu_usage']}
    Memory Usage: {health_data['memory_usage']}
    Warnings: {', '.join(health_data['warnings'])}
    """

@tool
def get_deployment_recommendations(issue: str) -> str:
    """Get deployment recommendations based on a specific issue or requirement."""
    recommendations = {
        "scaling": "Consider implementing Horizontal Pod Autoscaler (HPA) based on CPU/Memory metrics.",
        "performance": "Optimize resource requests/limits, enable caching, use readiness/liveness probes.",
        "security": "Enable RBAC, use Network Policies, scan images for vulnerabilities, use secrets management.",
        "reliability": "Implement pod disruption budgets, use multiple replicas, configure health checks."
    }

    for key, value in recommendations.items():
        if key in issue.lower():
            return f"Recommendation: {value}"

    return "For optimal deployment: Use HPA, configure health checks, implement RBAC, and monitor metrics."

# Create tools list
tools = [search_kubernetes_docs, analyze_cluster_health, get_deployment_recommendations]

# Define the agent state
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "The messages in the conversation"]
    next: str

# Initialize the LLM
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.7,
    google_api_key=os.getenv('GOOGLE_API_KEY')
)

# Bind tools to the LLM
llm_with_tools = llm.bind_tools(tools)

# Define the agent node
def agent_node(state: AgentState) -> AgentState:
    """Main agent reasoning node."""
    messages = state["messages"]
    response = llm_with_tools.invoke(messages)
    return {"messages": messages + [response]}

# Define the tool execution node
def call_tools(state: AgentState) -> AgentState:
    """Execute the tools requested by the agent."""
    messages = state["messages"]
    last_message = messages[-1]

    # Get tool calls from the last message
    tool_calls = last_message.tool_calls

    # Execute each tool and collect results
    tool_messages = []
    for tool_call in tool_calls:
        tool_name = tool_call["name"]
        tool_args = tool_call["args"]

        # Find and execute the tool
        for tool in tools:
            if tool.name == tool_name:
                try:
                    result = tool.invoke(tool_args)
                    tool_messages.append(
                        ToolMessage(
                            content=str(result),
                            tool_call_id=tool_call["id"]
                        )
                    )
                except Exception as e:
                    tool_messages.append(
                        ToolMessage(
                            content=f"Error: {str(e)}",
                            tool_call_id=tool_call["id"]
                        )
                    )
                break

    return {"messages": messages + tool_messages}

# Define routing logic
def should_continue(state: AgentState) -> str:
    """Determine if we should continue to tools or end."""
    messages = state["messages"]
    last_message = messages[-1]

    # If there are no tool calls, we're done
    if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
        return "end"

    return "continue"

# Build the graph
def create_agent_graph():
    """Create the LangGraph workflow."""
    workflow = StateGraph(AgentState)

    # Add nodes
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", call_tools)

    # Set entry point
    workflow.set_entry_point("agent")

    # Add conditional edges
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "continue": "tools",
            "end": END
        }
    )

    # Add edge from tools back to agent
    workflow.add_edge("tools", "agent")

    return workflow.compile()

# Main execution function
def run_agent_demo():
    """Run the LangGraph agent with various scenarios."""

    print("🚀 Starting LangGraph Agent with AgentOps Integration")
    print(f"📊 Session will appear in AgentOps dashboard")
    print(f"🔑 Project ID: {os.getenv('AGENTOPS_API_KEY')[:20]}...")
    print("-" * 60)

    # Create the agent graph
    agent = create_agent_graph()

    # Test scenarios to demonstrate different features
    scenarios = [
        {
            "name": "Kubernetes Documentation Search",
            "message": "Can you tell me about Kubernetes pods and how they work?"
        },
        {
            "name": "Cluster Health Analysis",
            "message": "Analyze the health of my production-cluster and provide insights."
        },
        {
            "name": "Complex Query with Multiple Tools",
            "message": "I need to improve the performance of my cluster. First check the health, then give me recommendations for performance optimization."
        },
        {
            "name": "Deployment Recommendations",
            "message": "What are the best practices for security in Kubernetes deployments?"
        }
    ]

    for i, scenario in enumerate(scenarios, 1):
        print(f"\n{'='*60}")
        print(f"Scenario {i}: {scenario['name']}")
        print(f"{'='*60}\n")
        print(f"User: {scenario['message']}\n")

        # Create initial state
        initial_state = {
            "messages": [HumanMessage(content=scenario['message'])]
        }

        try:
            # Run the agent
            result = agent.invoke(initial_state)

            # Get the final response
            final_message = result["messages"][-1]
            if hasattr(final_message, 'content'):
                print(f"Assistant: {final_message.content}\n")
            else:
                print(f"Assistant: {final_message}\n")

            # Record event in AgentOps
            agentops.record(
                agentops.ActionEvent(
                    action_type=f"scenario_{i}",
                    params={
                        "scenario": scenario['name'],
                        "message_count": len(result["messages"])
                    }
                )
            )

        except Exception as e:
            print(f"❌ Error in scenario {i}: {str(e)}")
            agentops.record(
                agentops.ErrorEvent(
                    error_type=type(e).__name__,
                    details=str(e)
                )
            )

    print("\n" + "="*60)
    print("✅ Demo completed! Check your AgentOps dashboard for:")
    print("   - Session traces with all LLM calls")
    print("   - Tool usage statistics")
    print("   - Performance metrics (latency, tokens, cost)")
    print("   - Event timeline")
    print("="*60)

if __name__ == "__main__":
    try:
        run_agent_demo()

        # End the session successfully
        agentops.end_session(end_state="Success")

    except Exception as e:
        print(f"\n❌ Fatal error: {str(e)}")
        agentops.end_session(
            end_state="Fail",
            end_state_reason=str(e)
        )

    print("\n🎉 Session ended. Visit https://app.agentops.ai to view your session!")

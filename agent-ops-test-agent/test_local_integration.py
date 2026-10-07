"""
LangGraph Agent with Direct Integration to Local DevOps Copilot

This sends data directly to your local AgentOps instance running at localhost:8000
so you can see it in your DevOps Copilot web app at localhost:3000
"""

import os
import uuid
import requests
from datetime import datetime
from typing import TypedDict, Annotated, Sequence
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END

load_dotenv()

# Local AgentOps Client for direct API integration
class LocalAgentOpsClient:
    def __init__(self, base_url="http://localhost:8000", api_key=None):
        self.base_url = base_url
        self.api_key = api_key or os.getenv('AGENTOPS_API_KEY')
        self.session_id = None
        self.project_id = os.getenv('AGENTOPS_PROJECT_ID', '00000000-0000-0000-0000-000000000001')
        self.events = []

    def start_session(self, tags=None):
        """Start a new AgentOps session"""
        self.session_id = str(uuid.uuid4())
        self.start_time = datetime.utcnow()

        payload = {
            "session_id": self.session_id,
            "project_id": self.project_id,
            "init_timestamp": self.start_time.isoformat() + 'Z',
            "tags": tags or ["langgraph", "local-test", "devops-copilot"]
        }

        try:
            response = requests.post(
                f"{self.base_url}/api/v1/events",
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            print(f"✅ Session started: {self.session_id}")
            print(f"   View at: http://localhost:3000/ai-workloads/sessions")
            return self.session_id
        except Exception as e:
            print(f"⚠️  Failed to start session: {e}")
            return None

    def record_llm(self, model, messages, response, tokens_used, cost):
        """Record an LLM call"""
        event = {
            "session_id": self.session_id,
            "event_type": "llm",
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "model": model,
            "messages": messages,
            "response": response,
            "tokens": tokens_used,
            "cost": cost
        }
        self.events.append(event)

        try:
            requests.post(
                f"{self.base_url}/api/v1/events",
                json=event,
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
        except Exception as e:
            print(f"⚠️  Failed to record LLM event: {e}")

    def record_tool(self, tool_name, args, result):
        """Record a tool execution"""
        event = {
            "session_id": self.session_id,
            "event_type": "tool",
            "timestamp": datetime.utcnow().isoformat() + 'Z',
            "tool_name": tool_name,
            "params": args,
            "result": result
        }
        self.events.append(event)

        try:
            requests.post(
                f"{self.base_url}/api/v1/events",
                json=event,
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
        except Exception as e:
            print(f"⚠️  Failed to record tool event: {e}")

    def end_session(self, end_state="Success", reason=None):
        """End the AgentOps session"""
        payload = {
            "session_id": self.session_id,
            "end_timestamp": datetime.utcnow().isoformat() + 'Z',
            "end_state": end_state,
            "end_state_reason": reason
        }

        try:
            response = requests.post(
                f"{self.base_url}/api/v1/events",
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            print(f"✅ Session ended: {end_state}")
            print(f"   Total events: {len(self.events)}")
        except Exception as e:
            print(f"⚠️  Failed to end session: {e}")

# Initialize client
agentops_client = LocalAgentOpsClient()

# Define tools
@tool
def get_cluster_status(cluster_name: str) -> str:
    """Get the status of a Kubernetes cluster"""
    result = f"Cluster '{cluster_name}': 5 nodes running, 42 pods active, CPU: 65%, Memory: 72%"
    agentops_client.record_tool("get_cluster_status", {"cluster_name": cluster_name}, result)
    return result

@tool
def analyze_logs(service_name: str) -> str:
    """Analyze logs for a service"""
    result = f"Logs for '{service_name}': 156 entries, 2 warnings, 0 errors in last hour"
    agentops_client.record_tool("analyze_logs", {"service_name": service_name}, result)
    return result

@tool
def get_pod_metrics(namespace: str) -> str:
    """Get metrics for all pods in a namespace"""
    result = f"Namespace '{namespace}': 12 pods, avg CPU 45%, avg Memory 68%, 0 restarts"
    agentops_client.record_tool("get_pod_metrics", {"namespace": namespace}, result)
    return result

tools = [get_cluster_status, analyze_logs, get_pod_metrics]

# LangGraph setup
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "conversation messages"]

llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0.7,
    api_key=os.getenv('OPENAI_API_KEY')
).bind_tools(tools)

def agent_node(state: AgentState) -> AgentState:
    """Agent reasoning node"""
    response = llm.invoke(state["messages"])

    # Record LLM call (simplified)
    agentops_client.record_llm(
        model="gpt-4o-mini",
        messages=[m.content for m in state["messages"] if hasattr(m, 'content')],
        response=response.content if hasattr(response, 'content') else str(response),
        tokens_used=100,  # Simplified - would need to track actual tokens
        cost=0.0001  # Simplified - would calculate based on tokens
    )

    return {"messages": state["messages"] + [response]}

def call_tools(state: AgentState) -> AgentState:
    """Execute tools"""
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
    """Routing logic"""
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
    print("🚀 LangGraph Agent → Local DevOps Copilot Integration")
    print("=" * 70)

    # Start AgentOps session
    agentops_client.start_session(tags=["langgraph", "kubernetes", "demo"])

    agent = create_graph()

    queries = [
        "Check the status of my production-cluster",
        "Analyze logs for the api-gateway service and get metrics for the backend namespace",
        "What's the overall health of my infrastructure?"
    ]

    try:
        for i, query in enumerate(queries, 1):
            print(f"\n{'─' * 70}")
            print(f"Query {i}: {query}")
            print(f"{'─' * 70}")

            result = agent.invoke({"messages": [HumanMessage(content=query)]})
            response = result['messages'][-1].content

            print(f"\n✓ Response: {response[:200]}...")
            print(f"  Events tracked: LLM calls + tool executions")

        # End session successfully
        agentops_client.end_session("Success")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        agentops_client.end_session("Fail", str(e))

    print("\n" + "=" * 70)
    print("✅ Demo complete! Now check your DevOps Copilot dashboard:")
    print("   1. Open: http://localhost:3000")
    print("   2. Go to: AI Workloads → Sessions")
    print("   3. Click on your session to see full trace")
    print("=" * 70)

if __name__ == "__main__":
    main()

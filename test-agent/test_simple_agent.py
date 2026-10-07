#!/usr/bin/env python3
"""
Simple Test Agent with AgentOps Monitoring
This script creates a simple agent without complex LangChain features.
"""

import os
import sys
from dotenv import load_dotenv
import agentops
from langchain_openai import ChatOpenAI
from datetime import datetime

# Load environment variables
load_dotenv()

# Configuration
AGENTOPS_API_KEY = os.getenv('AGENTOPS_API_KEY')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
USER_ID = os.getenv('USER_ID', 'test-user')
AGENTOPS_ENDPOINT = os.getenv('AGENTOPS_ENDPOINT')  # Optional: for local backend

if not AGENTOPS_API_KEY:
    print("❌ Error: AGENTOPS_API_KEY not found in .env file")
    print("Please create a .env file with your AgentOps API key")
    sys.exit(1)

if not OPENAI_API_KEY:
    print("❌ Error: OPENAI_API_KEY not found in .env file")
    print("Please add your OpenAI API key to the .env file")
    sys.exit(1)

# Initialize AgentOps
print("🚀 Initializing AgentOps...")

# Configure for local development
# AgentOps SDK uses 'endpoint' parameter but it needs the base URL, not the full path
if AGENTOPS_ENDPOINT:
    # Extract base URL from endpoint
    base_url = AGENTOPS_ENDPOINT.replace('/api/v1/events', '')
    print(f"📍 Using local AgentOps endpoint: {base_url}")

    agentops.init(
        api_key=AGENTOPS_API_KEY,
        endpoint=base_url,  # Just the base URL
        default_tags=[f"user:{USER_ID}", "environment:test", "simple-agent"],
        auto_start_session=True
    )
else:
    print("📍 Using AgentOps cloud endpoint")
    agentops.init(
        api_key=AGENTOPS_API_KEY,
        default_tags=[f"user:{USER_ID}", "environment:test", "simple-agent"],
        auto_start_session=True
    )

print("✅ AgentOps initialized successfully!")

# Create LLM
llm = ChatOpenAI(
    model="gpt-3.5-turbo",
    temperature=0,
    openai_api_key=OPENAI_API_KEY
)

def run_simple_test():
    """Run simple LLM queries with AgentOps tracking."""

    test_queries = [
        "What is 25 * 4 + 10?",
        "Tell me a fun fact about Python programming.",
        "What is the capital of France?",
        "Explain what machine learning is in one sentence.",
    ]

    print("\n" + "="*60)
    print("🧪 Running Simple Test Queries")
    print("="*60 + "\n")

    for i, query in enumerate(test_queries, 1):
        print(f"\n📝 Query {i}: {query}")
        print("-" * 60)

        try:
            # Start a new session for each query
            session = agentops.start_session(tags=[f"query-{i}", "simple-test"])

            # Call the LLM
            response = llm.invoke(query)

            print(f"\n✅ Response: {response.content}")

            # End session with success
            agentops.end_session("Success")

        except Exception as e:
            print(f"\n❌ Error: {str(e)}")
            # End session with failure
            agentops.end_session("Fail", end_state_reason=str(e))

        print("-" * 60)

    print("\n" + "="*60)
    print("✅ All test queries completed!")
    print("="*60)
    print("\n📊 Check your DevOps Copilot UI to see the traces:")
    print("   http://localhost:3000/dashboard/ai-workloads/traces")
    print("\n💡 Or check AgentOps dashboard:")
    print("   https://app.agentops.ai")
    print("\n")

if __name__ == "__main__":
    try:
        run_simple_test()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        agentops.end_session("Indeterminate")
    except Exception as e:
        print(f"\n\n❌ Fatal error: {str(e)}")
        agentops.end_session("Fail", end_state_reason=str(e))
        raise

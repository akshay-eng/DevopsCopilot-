#!/usr/bin/env python3
"""
Test LangChain Agent with AgentOps Monitoring
This script creates a simple LangChain agent and monitors it with AgentOps.
"""

import os
import sys
from dotenv import load_dotenv
import agentops
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import Tool

# Load environment variables
load_dotenv()

# Configuration
AGENTOPS_API_KEY = os.getenv('AGENTOPS_API_KEY')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
USER_ID = os.getenv('USER_ID', 'test-user')

if not AGENTOPS_API_KEY:
    print("❌ Error: AGENTOPS_API_KEY not found in .env file")
    print("Please create a .env file with your AgentOps API key")
    print("Get your API key from: https://app.agentops.ai/settings/projects")
    sys.exit(1)

if not OPENAI_API_KEY:
    print("❌ Error: OPENAI_API_KEY not found in .env file")
    print("Please add your OpenAI API key to the .env file")
    sys.exit(1)

# Initialize AgentOps
print("🚀 Initializing AgentOps...")
agentops.init(
    api_key=AGENTOPS_API_KEY,
    default_tags=[f"user:{USER_ID}", "environment:test", "framework:langchain"],
    auto_start_session=True
)
print("✅ AgentOps initialized successfully!")

# Define simple tools
def calculator(expression: str) -> str:
    """Evaluates a mathematical expression."""
    try:
        result = eval(expression)
        return f"The result is: {result}"
    except Exception as e:
        return f"Error evaluating expression: {str(e)}"

def get_weather(location: str) -> str:
    """Gets the weather for a location (mock implementation)."""
    return f"The weather in {location} is sunny with a temperature of 72°F"

def get_time() -> str:
    """Gets the current time."""
    from datetime import datetime
    return f"Current time is: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"

# Create tools
tools = [
    Tool(
        name="Calculator",
        func=calculator,
        description="Useful for performing mathematical calculations. Input should be a valid Python expression."
    ),
    Tool(
        name="Weather",
        func=get_weather,
        description="Get the current weather for a location. Input should be a city name."
    ),
    Tool(
        name="Time",
        func=get_time,
        description="Get the current date and time. No input required."
    )
]

# Create LLM
llm = ChatOpenAI(
    model="gpt-3.5-turbo",
    temperature=0,
    openai_api_key=OPENAI_API_KEY
)

# Create prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful AI assistant. Use the available tools to answer questions accurately."),
    MessagesPlaceholder(variable_name="chat_history", optional=True),
    ("human", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

# Create agent
agent = create_tool_calling_agent(llm, tools, prompt)
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=5,
    return_intermediate_steps=True
)

def run_test_queries():
    """Run a series of test queries to generate traces."""
    
    test_queries = [
        "What is 25 * 4 + 10?",
        "What's the weather like in San Francisco?",
        "What time is it right now?",
        "Calculate the square root of 144 and tell me the weather in New York",
    ]
    
    print("\n" + "="*60)
    print("🧪 Running Test Queries")
    print("="*60 + "\n")
    
    for i, query in enumerate(test_queries, 1):
        print(f"\n📝 Query {i}: {query}")
        print("-" * 60)
        
        try:
            # Start a new session for each query
            session = agentops.start_session(tags=[f"query-{i}", "test"])
            
            # Run the agent
            result = agent_executor.invoke({"input": query})
            
            print(f"\n✅ Response: {result['output']}")
            
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
    print("\n📊 Check your AgentOps dashboard to see the traces:")
    print("   https://app.agentops.ai")
    print("\n💡 Or check your DevOps Copilot UI:")
    print("   http://localhost:3000/dashboard/ai-workloads/sessions")
    print("\n")

if __name__ == "__main__":
    try:
        run_test_queries()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        agentops.end_session("Indeterminate")
    except Exception as e:
        print(f"\n\n❌ Fatal error: {str(e)}")
        agentops.end_session("Fail", end_state_reason=str(e))
        raise

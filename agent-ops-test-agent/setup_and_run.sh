#!/bin/bash

echo "🔧 Setting up LangGraph Agent with AgentOps Integration"
echo "======================================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Copy .env.example to .env and add your API keys"
    echo "   Run: cp .env.example .env"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source .venv/bin/activate

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip --quiet

# Install certifi first (for SSL fix)
echo "🔐 Installing SSL certificates..."
pip install --upgrade certifi --quiet

# Install dependencies
echo "📦 Installing dependencies..."
pip install -q \
    agentops \
    langchain \
    langchain-openai \
    langchain-community \
    langgraph \
    python-dotenv

echo ""
echo "✅ Setup complete!"
echo ""
echo "Now you can run:"
echo "  python test_official_agentops.py  # Connect to official AgentOps cloud"
echo "  python test_local_integration.py  # Connect to your local DevOps Copilot"
echo ""
echo "After running, check your data at:"
echo "  Official: https://app.agentops.ai/sessions"
echo "  Local:    http://localhost:3000/ai-workloads/sessions"
echo ""

#!/bin/bash

# AgentOps Integration Setup Script
# This script helps you set up AgentOps integration with DevOps Copilot

set -e

echo "================================================"
echo "  AgentOps Integration Setup"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running from correct directory
if [ ! -f "authService/.env" ]; then
    echo -e "${RED}❌ Error: Please run this script from the DevopsCopilot- root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: AgentOps Account Setup${NC}"
echo "-------------------------------------------"
echo "1. Go to https://app.agentops.ai"
echo "2. Sign up or log in"
echo "3. Navigate to Settings → Projects"
echo "4. Copy your API key"
echo ""
read -p "Press Enter when you have your AgentOps API key..."

echo ""
echo -e "${YELLOW}🔑 Step 2: Configure AgentOps Service Token${NC}"
echo "-------------------------------------------"
read -p "Enter your AgentOps API key: " AGENTOPS_KEY

# Update authService/.env
if grep -q "AGENTOPS_SERVICE_TOKEN=your-agentops-service-token-here" authService/.env; then
    sed -i.bak "s|AGENTOPS_SERVICE_TOKEN=your-agentops-service-token-here|AGENTOPS_SERVICE_TOKEN=$AGENTOPS_KEY|" authService/.env
    echo -e "${GREEN}✅ Updated authService/.env${NC}"
else
    echo -e "${YELLOW}⚠️  AGENTOPS_SERVICE_TOKEN already configured${NC}"
fi

echo ""
echo -e "${YELLOW}🔑 Step 3: Configure Test Agent${NC}"
echo "-------------------------------------------"

# Create test-agent/.env if it doesn't exist
if [ ! -f "test-agent/.env" ]; then
    cp test-agent/.env.example test-agent/.env
    echo -e "${GREEN}✅ Created test-agent/.env${NC}"
fi

# Update test-agent/.env
sed -i.bak "s|AGENTOPS_API_KEY=your-agentops-api-key-here|AGENTOPS_API_KEY=$AGENTOPS_KEY|" test-agent/.env
echo -e "${GREEN}✅ Updated test-agent/.env with AgentOps key${NC}"

echo ""
read -p "Do you have an OpenAI API key? (y/n): " HAS_OPENAI

if [ "$HAS_OPENAI" = "y" ]; then
    read -p "Enter your OpenAI API key: " OPENAI_KEY
    sed -i.bak "s|OPENAI_API_KEY=your-openai-api-key-here|OPENAI_API_KEY=$OPENAI_KEY|" test-agent/.env
    echo -e "${GREEN}✅ Updated test-agent/.env with OpenAI key${NC}"
else
    echo -e "${YELLOW}⚠️  You'll need to add your OpenAI API key to test-agent/.env manually${NC}"
    echo "   Get one from: https://platform.openai.com/api-keys"
fi

echo ""
echo -e "${YELLOW}🐍 Step 4: Setup Python Environment${NC}"
echo "-------------------------------------------"

cd test-agent

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    echo -e "${GREEN}✅ Virtual environment created${NC}"
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo -e "${GREEN}✅ Dependencies installed${NC}"

cd ..

echo ""
echo -e "${YELLOW}🔄 Step 5: Restart Backend Services${NC}"
echo "-------------------------------------------"
echo "Please restart your authService to load new environment variables:"
echo ""
echo "  1. Stop the current authService (Ctrl+C in the terminal)"
echo "  2. Run: cd authService && npm run dev"
echo ""
read -p "Press Enter when authService is restarted..."

echo ""
echo "================================================"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Run the test agent:"
echo "   cd test-agent"
echo "   source venv/bin/activate"
echo "   python test_langchain_agent.py"
echo ""
echo "2. View results in your DevOps Copilot UI:"
echo "   http://localhost:3000/dashboard/ai-workloads/sessions"
echo ""
echo "3. Or check AgentOps dashboard:"
echo "   https://app.agentops.ai"
echo ""

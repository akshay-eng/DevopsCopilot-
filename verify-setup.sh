
#!/bin/bash

# Verification script for local AgentOps setup
# This script checks if all components are configured correctly

set -e

echo "🔍 Verifying Local AgentOps Setup"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
ALL_GOOD=true

# Function to check if a file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✅${NC} Found: $1"
        return 0
    else
        echo -e "${RED}❌${NC} Missing: $1"
        ALL_GOOD=false
        return 1
    fi
}

# Function to check if a directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✅${NC} Found: $1"
        return 0
    else
        echo -e "${RED}❌${NC} Missing: $1"
        ALL_GOOD=false
        return 1
    fi
}

# Function to check if a string exists in a file
check_config() {
    if grep -q "$2" "$1" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $1 contains: $2"
        return 0
    else
        echo -e "${RED}❌${NC} $1 missing: $2"
        ALL_GOOD=false
        return 1
    fi
}

# Function to check if Docker is running
check_docker() {
    if docker info > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} Docker is running"
        return 0
    else
        echo -e "${RED}❌${NC} Docker is not running"
        ALL_GOOD=false
        return 1
    fi
}

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️${NC}  Port $1 is in use"
        return 1
    else
        echo -e "${GREEN}✅${NC} Port $1 is available"
        return 0
    fi
}

echo "1. Checking Docker"
echo "------------------"
check_docker
echo ""

echo "2. Checking Infrastructure Files"
echo "--------------------------------"
check_file "agentops/docker-compose.yml"
check_file "agentops/start-local.sh"
check_file "agentops/app/api/.env"
echo ""

echo "3. Checking AgentOps Backend Configuration"
echo "------------------------------------------"
if check_file "agentops/app/api/.env"; then
    check_config "agentops/app/api/.env" "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agentops"
    check_config "agentops/app/api/.env" "API_PORT=8000"
    check_config "agentops/app/api/.env" "SERVICE_TOKEN=dev-service-token-12345"
fi
check_file "agentops/app/api/pyproject.toml"
check_file "agentops/app/api/run.py"
echo ""

echo "4. Checking AuthService Configuration"
echo "-------------------------------------"
if check_file "authService/.env"; then
    check_config "authService/.env" "AGENTOPS_API_URL=http://localhost:8000"
    check_config "authService/.env" "AGENTOPS_SERVICE_TOKEN=dev-service-token-12345"
fi
echo ""

echo "5. Checking Test Agent Configuration"
echo "------------------------------------"
check_file "test-agent/.env.example"
check_file "test-agent/test_simple_agent.py"
check_dir "test-agent/venv"

if [ -f "test-agent/.env" ]; then
    echo -e "${GREEN}✅${NC} Found: test-agent/.env"

    if check_config "test-agent/.env" "AGENTOPS_ENDPOINT=http://localhost:8000"; then
        echo -e "${GREEN}✅${NC} Test agent configured for local endpoint"
    fi

    if grep -q "AGENTOPS_API_KEY=ao_" "test-agent/.env" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} AGENTOPS_API_KEY is set"
    else
        echo -e "${YELLOW}⚠️${NC}  AGENTOPS_API_KEY needs to be set"
    fi

    if grep -q "OPENAI_API_KEY=sk-" "test-agent/.env" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} OPENAI_API_KEY is set"
    else
        echo -e "${YELLOW}⚠️${NC}  OPENAI_API_KEY needs to be set"
    fi
else
    echo -e "${YELLOW}⚠️${NC}  test-agent/.env not created yet"
    echo -e "${YELLOW}   ${NC} Copy from .env.example and add your API keys"
fi
echo ""

echo "6. Checking Documentation"
echo "------------------------"
check_file "QUICKSTART_LOCAL.md"
check_file "LOCAL_AGENTOPS_SETUP.md"
check_file "README_LOCAL_SETUP.md"
check_file "SETUP_COMPLETE.md"
echo ""

echo "7. Checking Frontend & AuthService"
echo "----------------------------------"
check_dir "frontend/node_modules"
check_dir "authService/node_modules"
echo ""

echo "8. Checking Available Ports"
echo "--------------------------"
check_port 8000  # AgentOps API
check_port 5001  # AuthService
check_port 3000  # Frontend
check_port 5432  # PostgreSQL
check_port 9000  # ClickHouse
check_port 6379  # Redis
echo ""

echo "9. Checking Docker Containers"
echo "----------------------------"
if docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null | grep -q "agentops"; then
    echo -e "${GREEN}✅${NC} AgentOps Docker containers are running:"
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep agentops
else
    echo -e "${YELLOW}⚠️${NC}  AgentOps Docker containers are not running"
    echo -e "${YELLOW}   ${NC} Run: cd agentops && ./start-local.sh"
fi
echo ""

echo "=================================="
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✅ Setup verification complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. If Docker containers aren't running: cd agentops && ./start-local.sh"
    echo "2. Start AgentOps backend: cd agentops/app/api && uv sync && python run.py"
    echo "3. Start AuthService: cd authService && npm start"
    echo "4. Start Frontend: cd frontend && npm start"
    echo "5. Run test: cd test-agent && python test_simple_agent.py"
    echo ""
    echo "Full guide: QUICKSTART_LOCAL.md"
else
    echo -e "${RED}⚠️  Some issues found${NC}"
    echo ""
    echo "Please address the items marked with ❌ above"
    echo "Refer to QUICKSTART_LOCAL.md for detailed setup instructions"
fi
echo "=================================="

#!/bin/bash
# DevOps Copilot Cluster Agent - Local Development Runner

set -e

echo "🚀 Starting DevOps Copilot Cluster Agent (Local Development)"
echo "============================================================"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source venv/bin/activate

# Check if requirements are installed
if ! python -c "import kubernetes" 2>/dev/null; then
    echo "📥 Installing dependencies..."
    pip install -r requirements.txt
    echo "✅ Dependencies installed"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration and run again"
    echo "   nano .env"
    exit 1
fi

# Load environment variables
echo "🔧 Loading environment variables from .env..."
set -a
source .env
set +a

# Validate required variables
if [ -z "$USER_ID" ] || [ -z "$CLUSTER_ID" ] || [ -z "$KAFKA_BOOTSTRAP_SERVERS" ]; then
    echo "❌ Missing required environment variables!"
    echo "Please set USER_ID, CLUSTER_ID, and KAFKA_BOOTSTRAP_SERVERS in .env file"
    exit 1
fi

# Test Kubernetes access
echo "🔍 Testing Kubernetes access..."
if ! kubectl get nodes &>/dev/null; then
    echo "❌ Cannot access Kubernetes cluster!"
    echo "Please check your kubeconfig and cluster access"
    exit 1
fi
echo "✅ Kubernetes access confirmed"

echo ""
echo "Configuration:"
echo "  User ID: $USER_ID"
echo "  Cluster ID: $CLUSTER_ID"
echo "  Cluster Name: $CLUSTER_NAME"
echo "  Kafka: $KAFKA_BOOTSTRAP_SERVERS"
echo "  Log Level: ${LOG_LEVEL:-INFO}"
echo ""

echo "🎯 Starting agent..."
echo "Press Ctrl+C to stop"
echo ""

# Run the agent
python app.py

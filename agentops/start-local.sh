#!/bin/bash

# AgentOps Local Development Startup Script

set -e

echo "🚀 Starting AgentOps Local Development Environment"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Start infrastructure services
echo ""
echo "📦 Starting infrastructure services (PostgreSQL, ClickHouse, Redis)..."
docker-compose up -d

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check PostgreSQL
echo "  Checking PostgreSQL..."
until docker exec agentops-postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "  PostgreSQL is not ready yet, waiting..."
    sleep 2
done
echo "  ✅ PostgreSQL is ready"

# Check Redis
echo "  Checking Redis..."
until docker exec agentops-redis redis-cli ping > /dev/null 2>&1; do
    echo "  Redis is not ready yet, waiting..."
    sleep 2
done
echo "  ✅ Redis is ready"

# Check ClickHouse
echo "  Checking ClickHouse..."
until docker exec agentops-clickhouse clickhouse-client --query "SELECT 1" > /dev/null 2>&1; do
    echo "  ClickHouse is not ready yet, waiting..."
    sleep 2
done
echo "  ✅ ClickHouse is ready"

echo ""
echo "✅ All infrastructure services are ready!"
echo ""
echo "📊 Service URLs:"
echo "  PostgreSQL:  postgresql://postgres:postgres@localhost:5432/agentops"
echo "  ClickHouse:  http://localhost:8123 (HTTP), localhost:9000 (Native)"
echo "  Redis:       redis://localhost:6379"
echo ""
echo "🔧 Next steps:"
echo "  1. Install Python dependencies: cd app/api && pip install -r requirements.txt"
echo "  2. Run database migrations (if any)"
echo "  3. Start AgentOps API: python run.py"
echo ""
echo "To stop services: docker-compose down"
echo "To stop and remove data: docker-compose down -v"
echo ""

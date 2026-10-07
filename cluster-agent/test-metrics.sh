#!/bin/bash
# Quick test script for Prometheus metrics collection

echo "🧪 Testing Prometheus Metrics Collection"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "Please create .env from .env.example"
    exit 1
fi

# Load environment variables
set -a
source .env
set +a

# Check if PROMETHEUS_URL is set
if [ -z "$PROMETHEUS_URL" ]; then
    echo "❌ PROMETHEUS_URL not set in .env!"
    echo ""
    echo "Please add to .env:"
    echo "  PROMETHEUS_URL=http://localhost:9090"
    echo ""
    echo "See SETUP_PROMETHEUS.md for details"
    exit 1
fi

echo "📊 Prometheus URL: $PROMETHEUS_URL"
echo ""

# Test 1: Check Prometheus connectivity
echo "Test 1: Checking Prometheus connectivity..."
response=$(curl -s -o /dev/null -w "%{http_code}" "$PROMETHEUS_URL/api/v1/query?query=up" 2>/dev/null)

if [ "$response" = "200" ]; then
    echo "  ✅ Prometheus is accessible"
else
    echo "  ❌ Cannot connect to Prometheus (HTTP $response)"
    echo ""
    echo "Possible solutions:"
    echo "  1. Check if Prometheus is running:"
    echo "     kubectl get pods -A | grep prometheus"
    echo ""
    echo "  2. Port-forward if using localhost:"
    echo "     kubectl port-forward -n monitoring svc/prometheus-server 9090:9090"
    echo ""
    echo "  3. Update PROMETHEUS_URL in .env"
    exit 1
fi

# Test 2: Check if Prometheus has container metrics
echo ""
echo "Test 2: Checking for container CPU metrics..."
result=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=container_cpu_usage_seconds_total" | grep -o '"result":\[[^]]*\]' | grep -o '\[.*\]')

if [ -n "$result" ] && [ "$result" != "[]" ]; then
    count=$(echo "$result" | grep -o '{' | wc -l)
    echo "  ✅ Found container CPU metrics ($count data points)"
else
    echo "  ⚠️  No container CPU metrics found"
    echo "     This might be normal if no containers are running"
fi

# Test 3: Check for node metrics
echo ""
echo "Test 3: Checking for node metrics..."
result=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=node_cpu_seconds_total" | grep -o '"result":\[[^]]*\]' | grep -o '\[.*\]')

if [ -n "$result" ] && [ "$result" != "[]" ]; then
    count=$(echo "$result" | grep -o '{' | wc -l)
    echo "  ✅ Found node CPU metrics ($count data points)"
else
    echo "  ⚠️  No node CPU metrics found"
    echo "     Check if node-exporter is running:"
    echo "     kubectl get pods -A | grep node-exporter"
fi

# Test 4: Check for kube-state-metrics
echo ""
echo "Test 4: Checking for kube-state-metrics..."
result=$(curl -s "$PROMETHEUS_URL/api/v1/query?query=kube_pod_info" | grep -o '"result":\[[^]]*\]' | grep -o '\[.*\]')

if [ -n "$result" ] && [ "$result" != "[]" ]; then
    count=$(echo "$result" | grep -o '{' | wc -l)
    echo "  ✅ Found kube-state-metrics data ($count pods)"
else
    echo "  ⚠️  No kube-state-metrics data found"
    echo "     Check if kube-state-metrics is running:"
    echo "     kubectl get pods -A | grep kube-state-metrics"
fi

# Test 5: Check Kafka connectivity
echo ""
echo "Test 5: Checking Kafka connectivity..."
echo "  Kafka brokers: $KAFKA_BOOTSTRAP_SERVERS"

# Try to connect to first broker
first_broker=$(echo $KAFKA_BOOTSTRAP_SERVERS | cut -d',' -f1)
broker_host=$(echo $first_broker | cut -d':' -f1)
broker_port=$(echo $first_broker | cut -d':' -f2)

if nc -z -w 5 $broker_host $broker_port 2>/dev/null; then
    echo "  ✅ Kafka broker $first_broker is reachable"
else
    echo "  ❌ Cannot reach Kafka broker $first_broker"
    echo "     Check VPN connection or network access"
fi

# Summary
echo ""
echo "=========================================="
echo "📋 Test Summary"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  Prometheus URL: $PROMETHEUS_URL"
echo "  Kafka Brokers: $KAFKA_BOOTSTRAP_SERVERS"
echo "  Metrics Interval: ${METRICS_INTERVAL}s"
echo "  User ID: $USER_ID"
echo "  Cluster ID: $CLUSTER_ID"
echo ""
echo "Next steps:"
echo "  1. If all tests passed, start the agent:"
echo "     ./run-local.sh"
echo ""
echo "  2. Monitor agent logs for metrics collection:"
echo "     tail -f logs/agent.log"
echo ""
echo "  3. Check Kafka UI for metrics messages:"
echo "     http://192.168.1.243:8082"
echo "     Topic: metrics"
echo ""
echo "  4. View real-time metrics in test client:"
echo "     open ../authService/TEST_WEBSOCKET.html"
echo ""

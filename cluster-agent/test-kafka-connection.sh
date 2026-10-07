#!/bin/bash
# Test Kafka Connectivity from Local Machine

echo "🔍 Testing Kafka Connectivity"
echo "=============================="
echo ""

# Test each broker
BROKERS=(
  "192.168.1.240:9092"
  "192.168.1.245:9093"
  "192.168.1.246:9094"
)

echo "Testing connectivity to each Kafka broker..."
echo ""

for broker in "${BROKERS[@]}"; do
  echo "Testing $broker..."

  # Use timeout and nc (netcat) to test connection
  if timeout 5 bash -c "echo > /dev/tcp/${broker/:/ }" 2>/dev/null; then
    echo "  ✅ $broker is reachable"
  else
    echo "  ❌ $broker is NOT reachable (connection timeout)"
  fi
  echo ""
done

echo ""
echo "📋 Kafka Service Information (from kubectl):"
echo ""

# Get Kafka namespace (try common ones)
KAFKA_NS=$(kubectl get svc -A | grep kafka-broker | head -1 | awk '{print $1}')

if [ -z "$KAFKA_NS" ]; then
  echo "⚠️  Could not find Kafka namespace"
  echo "Listing all services with 'kafka' in the name:"
  kubectl get svc -A | grep kafka
else
  echo "Found Kafka in namespace: $KAFKA_NS"
  echo ""
  kubectl get svc -n $KAFKA_NS | grep kafka
fi

echo ""
echo "💡 Recommendations:"
echo ""

# Check if any broker is reachable
REACHABLE=false
for broker in "${BROKERS[@]}"; do
  if timeout 5 bash -c "echo > /dev/tcp/${broker/:/ }" 2>/dev/null; then
    REACHABLE=true
    echo "✅ At least one broker ($broker) is reachable from your local machine"
    echo "   Update .env with: KAFKA_BOOTSTRAP_SERVERS=$broker"
    break
  fi
done

if [ "$REACHABLE" = false ]; then
  echo "❌ None of the brokers are reachable from your local machine"
  echo ""
  echo "Option 1: Port Forward (Recommended for local testing)"
  echo "  kubectl port-forward -n $KAFKA_NS svc/kafka-broker-1 9092:9092"
  echo "  Then update .env: KAFKA_BOOTSTRAP_SERVERS=localhost:9092"
  echo ""
  echo "Option 2: Check Kafka Listener Configuration"
  echo "  Your Kafka brokers might be configured with internal advertised.listeners"
  echo "  Check: kubectl get cm -n $KAFKA_NS | grep kafka"
  echo ""
  echo "Option 3: Use Kafka REST Proxy"
  echo "  You have kafka-rest-proxy at 192.168.1.242:8082"
  echo "  But the Python agent uses native Kafka protocol, not REST"
fi

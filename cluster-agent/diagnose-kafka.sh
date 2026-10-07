#!/bin/bash
# Diagnose Kafka Broker Configuration

echo "🔍 Kafka Broker Diagnostics"
echo "==========================="
echo ""

# Test network connectivity
echo "1️⃣ Testing Network Connectivity..."
echo ""

BROKERS=(
  "192.168.1.240:9092"
  "192.168.1.245:9093"
  "192.168.1.246:9094"
)

for broker in "${BROKERS[@]}"; do
  host=$(echo $broker | cut -d: -f1)
  port=$(echo $broker | cut -d: -f2)

  echo "Testing $broker..."

  # Ping test
  if ping -c 1 -W 1 $host &>/dev/null; then
    echo "  ✅ Host $host is reachable (ping)"
  else
    echo "  ❌ Host $host is NOT reachable (ping failed)"
  fi

  # Port test
  if nc -z -w 5 $host $port 2>/dev/null; then
    echo "  ✅ Port $port is open on $host"
  else
    echo "  ❌ Port $port is closed or filtered on $host"
  fi

  echo ""
done

echo ""
echo "2️⃣ Checking Kafka Broker Advertised Listeners..."
echo ""

# Find Kafka pods
KAFKA_PODS=$(kubectl get pods -A -l app=kafka -o jsonpath='{range .items[*]}{.metadata.namespace}{"/"}{.metadata.name}{"\n"}{end}' 2>/dev/null)

if [ -z "$KAFKA_PODS" ]; then
  echo "⚠️  Could not find Kafka pods with label app=kafka"
  echo "Trying alternative labels..."

  KAFKA_PODS=$(kubectl get pods -A | grep kafka | grep -v ui | grep -v rest | awk '{print $1"/"$2}')
fi

if [ -n "$KAFKA_PODS" ]; then
  echo "Found Kafka pods:"
  echo "$KAFKA_PODS"
  echo ""

  # Get first pod
  FIRST_POD=$(echo "$KAFKA_PODS" | head -1)
  NAMESPACE=$(echo $FIRST_POD | cut -d/ -f1)
  POD_NAME=$(echo $FIRST_POD | cut -d/ -f2)

  echo "Checking configuration for $POD_NAME in namespace $NAMESPACE..."
  echo ""

  # Check server.properties
  echo "Advertised Listeners:"
  kubectl exec -n $NAMESPACE $POD_NAME -- sh -c "grep -E 'advertised|listeners' /opt/kafka/config/server.properties 2>/dev/null || echo 'Could not read server.properties'"
  echo ""
else
  echo "❌ No Kafka pods found"
  echo ""
fi

echo ""
echo "3️⃣ Testing Kafka Connection with kafkacat (if installed)..."
echo ""

if command -v kafkacat &>/dev/null || command -v kcat &>/dev/null; then
  KAFKACAT_CMD=$(command -v kafkacat || command -v kcat)

  for broker in "${BROKERS[@]}"; do
    echo "Testing metadata from $broker..."
    timeout 10 $KAFKACAT_CMD -L -b $broker 2>&1 | head -20
    echo ""
  done
else
  echo "⚠️  kafkacat not installed. Install with: brew install kafkacat"
  echo ""
fi

echo ""
echo "4️⃣ Recommendations:"
echo ""
echo "Based on your setup:"
echo "  - LoadBalancer IPs: 192.168.1.240, 192.168.1.245, 192.168.1.246"
echo "  - You're on same network via VPN"
echo ""

# Check if ports are open
PORTS_OPEN=0
for broker in "${BROKERS[@]}"; do
  host=$(echo $broker | cut -d: -f1)
  port=$(echo $broker | cut -d: -f2)
  if nc -z -w 5 $host $port 2>/dev/null; then
    PORTS_OPEN=$((PORTS_OPEN + 1))
  fi
done

if [ $PORTS_OPEN -eq 0 ]; then
  echo "❌ All broker ports are closed or filtered"
  echo ""
  echo "Possible causes:"
  echo "  1. Firewall blocking ports 9092-9094"
  echo "  2. Network policy in Kubernetes"
  echo "  3. VPN not routing correctly"
  echo ""
  echo "Try:"
  echo "  telnet 192.168.1.240 9092"
elif [ $PORTS_OPEN -lt 3 ]; then
  echo "⚠️  Only $PORTS_OPEN out of 3 brokers are reachable"
  echo ""
  echo "Try connecting to the working broker(s)"
else
  echo "✅ All broker ports are open"
  echo ""
  echo "The timeout is likely due to Kafka advertised.listeners configuration"
  echo ""
  echo "Kafka brokers are probably advertising internal addresses like:"
  echo "  - kafka-broker-1.default.svc.cluster.local"
  echo "  - 10.43.108.143 (cluster IP)"
  echo ""
  echo "Instead of the LoadBalancer IPs:"
  echo "  - 192.168.1.240"
  echo "  - 192.168.1.245"
  echo "  - 192.168.1.246"
  echo ""
  echo "🔧 Fix: Update Kafka advertised.listeners to use LoadBalancer IPs"
fi

echo ""
echo "5️⃣ Quick Test with Python:"
echo ""

cat > /tmp/test_kafka.py << 'PYEOF'
from confluent_kafka.admin import AdminClient
import sys

brokers = [
    "192.168.1.240:9092",
    "192.168.1.245:9093",
    "192.168.1.246:9094"
]

for broker in brokers:
    print(f"\nTesting {broker}...")
    try:
        admin_client = AdminClient({
            'bootstrap.servers': broker,
            'socket.timeout.ms': 10000,
            'api.version.request': True,
            'broker.address.family': 'v4'
        })

        metadata = admin_client.list_topics(timeout=10)
        print(f"  ✅ Connected successfully!")
        print(f"  Broker metadata: {metadata.brokers}")
        print(f"  Topics: {list(metadata.topics.keys())[:5]}")
    except Exception as e:
        print(f"  ❌ Failed: {e}")
PYEOF

echo "Run this test:"
echo "  source venv/bin/activate"
echo "  python /tmp/test_kafka.py"
echo ""

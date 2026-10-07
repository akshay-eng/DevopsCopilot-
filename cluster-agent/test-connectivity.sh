#!/bin/bash
# Quick connectivity test for Kafka brokers

echo "🔍 Testing Kafka Broker Connectivity"
echo "===================================="
echo ""

BROKERS=(
  "192.168.1.240:9092"
  "192.168.1.245:9093"
  "192.168.1.246:9094"
)

echo "1. Network Reachability Test"
echo "----------------------------"
for broker in "${BROKERS[@]}"; do
  host=$(echo $broker | cut -d: -f1)
  port=$(echo $broker | cut -d: -f2)

  printf "%-25s" "$broker"

  # Test if port is open
  if nc -z -w 2 $host $port 2>/dev/null; then
    echo "✅ REACHABLE"
  else
    echo "❌ NOT REACHABLE"
  fi
done

echo ""
echo "2. Testing with telnet (press Ctrl+C to exit each one)"
echo "------------------------------------------------------"
echo "If connection succeeds, you'll see 'Connected to...'"
echo "If it hangs or times out, the broker is not accessible"
echo ""

for broker in "${BROKERS[@]}"; do
  host=$(echo $broker | cut -d: -f1)
  port=$(echo $broker | cut -d: -f2)

  echo "Testing $broker (timeout 5s)..."
  timeout 5 telnet $host $port 2>&1 | grep -E "Connected|refused|timeout" || echo "Timeout or connection failed"
  echo ""
done

echo ""
echo "3. Summary"
echo "----------"
echo "If all brokers show '✅ REACHABLE', the network is fine."
echo "The timeout in the agent is likely due to Kafka advertised.listeners."
echo ""
echo "Next steps:"
echo "  1. Run: ./diagnose-kafka.sh (detailed diagnostics)"
echo "  2. Check Kafka broker configuration for advertised.listeners"
echo "  3. Try running the agent with updated .env (all brokers listed)"

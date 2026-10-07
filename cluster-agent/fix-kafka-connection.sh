#!/bin/bash
# Quick fix for Kafka connection issue

echo "🔧 Fixing Kafka Connection"
echo "=========================="
echo ""

# Backup current .env
cp .env .env.backup
echo "✅ Backed up .env to .env.backup"

# Update KAFKA_BOOTSTRAP_SERVERS to localhost
sed -i '' 's/KAFKA_BOOTSTRAP_SERVERS=192.168.1.240:9092/KAFKA_BOOTSTRAP_SERVERS=localhost:9092/' .env
sed -i '' 's/KAFKA_BOOTSTRAP_SERVERS=192.168.1.245:9093/KAFKA_BOOTSTRAP_SERVERS=localhost:9092/' .env
sed -i '' 's/KAFKA_BOOTSTRAP_SERVERS=192.168.1.246:9094/KAFKA_BOOTSTRAP_SERVERS=localhost:9092/' .env

echo "✅ Updated .env: KAFKA_BOOTSTRAP_SERVERS=localhost:9092"
echo ""

echo "📋 Now you need to port-forward Kafka in another terminal:"
echo ""
echo "   # Find Kafka namespace"
echo "   kubectl get svc -A | grep kafka-broker"
echo ""
echo "   # Port forward (replace <namespace> with actual namespace)"
echo "   kubectl port-forward -n <namespace> svc/kafka-broker-1 9092:9092"
echo ""
echo "   Keep that terminal open!"
echo ""

echo "🚀 Then run the agent:"
echo "   ./run-local.sh"

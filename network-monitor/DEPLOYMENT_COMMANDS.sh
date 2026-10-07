#!/bin/bash
# Network Monitor - Complete Deployment Commands
# Copy and paste these commands to deploy

set -e

echo "🚀 Network Monitor Deployment"
echo "================================"
echo ""

# Variables - UPDATE THESE
CLUSTER_NODE="192.168.1.5"
SSH_USER="root"  # Change to your SSH user

echo "Configuration:"
echo "  Cluster Node: $CLUSTER_NODE"
echo "  SSH User: $SSH_USER"
echo ""

# Step 1: Verify Docker image
echo "Step 1: Checking Docker image..."
if docker images | grep -q "network-monitor.*latest"; then
    echo "✅ Docker image found"
else
    echo "❌ Docker image not found!"
    echo "Please build it first:"
    echo "  cd /Users/akshay/Documents/DevopsCopilot-/network-monitor"
    echo "  docker build --platform linux/amd64 -t network-monitor:latest ."
    exit 1
fi

# Step 2: Save Docker image
echo ""
echo "Step 2: Saving Docker image..."
docker save network-monitor:latest -o /tmp/network-monitor.tar
echo "✅ Image saved to /tmp/network-monitor.tar"

# Step 3: Copy to cluster
echo ""
echo "Step 3: Copying image to cluster..."
echo "You may be prompted for SSH password..."
scp /tmp/network-monitor.tar ${SSH_USER}@${CLUSTER_NODE}:/tmp/
echo "✅ Image copied to cluster"

# Step 4: Import to K3s
echo ""
echo "Step 4: Importing to K3s..."
ssh ${SSH_USER}@${CLUSTER_NODE} 'k3s ctr images import /tmp/network-monitor.tar && rm /tmp/network-monitor.tar'
echo "✅ Image imported"

# Step 5: Deploy to Kubernetes
echo ""
echo "Step 5: Deploying to Kubernetes..."
kubectl apply -f deployments/daemonset.yaml
echo "✅ DaemonSet deployed"

# Step 6: Wait and check status
echo ""
echo "Step 6: Checking deployment status..."
sleep 5
kubectl get pods -n network-monitor

echo ""
echo "================================"
echo "✅ Deployment Complete!"
echo ""
echo "Next Steps:"
echo ""
echo "1. View logs:"
echo "   kubectl logs -n network-monitor -l app=network-monitor -f"
echo ""
echo "2. Check Kafka events:"
echo "   kubectl exec -it -n kafka kafka-broker-1-0 -- kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic network-events --from-beginning"
echo ""
echo "3. Query Neo4j (in another terminal):"
echo "   kubectl port-forward svc/neo4j 7474:7474 7687:7687"
echo "   Open: http://localhost:7474"
echo "   Login: neo4j / changeme"
echo ""
echo "4. Generate test traffic:"
echo "   kubectl run nginx --image=nginx --port=80"
echo "   kubectl expose pod nginx --port=80"
echo "   kubectl run -it --rm curl --image=curlimages/curl --restart=Never -- sh -c 'while true; do curl -s http://nginx; sleep 1; done'"
echo ""

# Cleanup
rm /tmp/network-monitor.tar

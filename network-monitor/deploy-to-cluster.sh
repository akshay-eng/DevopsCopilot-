#!/bin/bash

# Deploy Network Monitor to K3s Cluster
# This script handles image transfer and deployment

set -e

CLUSTER_NODE="192.168.1.5"
CLUSTER_USER="root"  # Change if different
IMAGE_NAME="network-monitor:latest"

echo "=== Network Monitor Deployment Script ==="
echo ""

# Step 1: Check if Docker image exists
echo "Checking if Docker image exists..."
if ! docker images | grep -q "network-monitor.*latest"; then
    echo "ERROR: Docker image 'network-monitor:latest' not found!"
    echo "Please build it first: docker build --platform linux/amd64 -t network-monitor:latest ."
    exit 1
fi
echo "✓ Docker image found"

# Step 2: Save image to tar
echo ""
echo "Saving Docker image to tar file..."
docker save network-monitor:latest -o /tmp/network-monitor.tar
echo "✓ Image saved to /tmp/network-monitor.tar"

# Step 3: Copy to cluster node
echo ""
echo "Copying image to cluster node ${CLUSTER_NODE}..."
echo "You may be prompted for the SSH password..."
scp /tmp/network-monitor.tar ${CLUSTER_USER}@${CLUSTER_NODE}:/tmp/
echo "✓ Image copied to cluster"

# Step 4: Import image on cluster node
echo ""
echo "Importing image to K3s..."
ssh ${CLUSTER_USER}@${CLUSTER_NODE} "k3s ctr images import /tmp/network-monitor.tar && rm /tmp/network-monitor.tar"
echo "✓ Image imported to K3s"

# Step 5: Deploy to Kubernetes
echo ""
echo "Deploying to Kubernetes..."
kubectl apply -f deployments/daemonset.yaml
echo "✓ DaemonSet deployed"

# Step 6: Wait for pods
echo ""
echo "Waiting for pods to start..."
sleep 5
kubectl get pods -n network-monitor

# Step 7: Show logs
echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "Check status:"
echo "  kubectl get pods -n network-monitor"
echo ""
echo "View logs:"
echo "  kubectl logs -n network-monitor -l app=network-monitor -f"
echo ""
echo "Test Kafka events:"
echo "  kubectl exec -it -n kafka kafka-broker-1-0 -- kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic network-events --from-beginning"
echo ""

# Cleanup
rm /tmp/network-monitor.tar

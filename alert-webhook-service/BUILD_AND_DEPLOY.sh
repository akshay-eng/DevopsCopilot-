#!/bin/bash

# Build and Deploy Alert Webhook Service
# This script builds the Docker image for AMD64 and deploys to Kubernetes

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Building Alert Webhook Service"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Navigate to service directory
cd "$(dirname "$0")"

# Step 1: Build for AMD64 (your cluster architecture)
echo ""
echo "📦 Step 1: Building Docker image for AMD64..."
docker buildx build \
  --platform linux/amd64 \
  -t alert-webhook-service:latest \
  --load \
  .

echo "✅ Image built successfully"

# Step 2: Save image to tar (for transferring to cluster)
echo ""
echo "💾 Step 2: Saving image to tar file..."
docker save alert-webhook-service:latest -o alert-webhook-service.tar
echo "✅ Image saved to alert-webhook-service.tar"

# Step 3: Load image into cluster
echo ""
echo "📥 Step 3: Loading image into cluster..."

# Check if using minikube or remote cluster
if command -v minikube &> /dev/null && minikube status &> /dev/null; then
    echo "   Using minikube..."
    minikube image load alert-webhook-service:latest
    echo "✅ Image loaded into minikube"
elif command -v kind &> /dev/null && kind get clusters &> /dev/null; then
    echo "   Using kind..."
    kind load docker-image alert-webhook-service:latest
    echo "✅ Image loaded into kind"
else
    echo "⚠️  Remote cluster detected"
    echo "   Please manually load the image:"
    echo "   1. Transfer alert-webhook-service.tar to cluster node"
    echo "   2. Run: docker load -i alert-webhook-service.tar"
    echo ""
    read -p "   Press Enter once image is loaded on cluster..."
fi

# Step 4: Update ConfigMap (check MongoDB and Kafka service names)
echo ""
echo "⚙️  Step 4: Checking configuration..."
echo "   Review k8s/configmap.yaml and update if needed:"
echo "   - MONGO_URI (currently: mongodb://mongodb:27017/devopscopilot)"
echo "   - KAFKA_BROKERS (currently: kafka:9092)"
echo ""
read -p "   Press Enter to continue with deployment (or Ctrl+C to cancel)..."

# Step 5: Deploy to Kubernetes
echo ""
echo "🚢 Step 5: Deploying to Kubernetes..."

kubectl apply -f k8s/configmap.yaml
echo "✅ ConfigMap applied"

kubectl apply -f k8s/deployment.yaml
echo "✅ Deployment applied"

kubectl apply -f k8s/service.yaml
echo "✅ Service applied"

# Step 6: Wait for pods to be ready
echo ""
echo "⏳ Step 6: Waiting for pods to be ready..."
kubectl wait --for=condition=ready pod -l app=alert-webhook-service --timeout=120s

# Step 7: Verify deployment
echo ""
echo "🔍 Step 7: Verifying deployment..."
echo ""
kubectl get pods -l app=alert-webhook-service

# Step 8: Check logs
echo ""
echo "📋 Checking logs..."
POD=$(kubectl get pod -l app=alert-webhook-service -o jsonpath='{.items[0].metadata.name}')
kubectl logs $POD --tail=20

# Step 9: Test health endpoint
echo ""
echo "🏥 Step 9: Testing health endpoint..."
kubectl exec -it $POD -- wget -qO- http://localhost:8080/health/detailed | python3 -m json.tool 2>/dev/null || \
kubectl exec -it $POD -- wget -qO- http://localhost:8080/health/detailed

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "1. Update cluster_id in k8s/test-alert-rule.yaml with your cluster ID"
echo "2. Apply AlertManager config: kubectl apply -f k8s/alertmanager-config.yaml"
echo "3. Restart AlertManager: kubectl rollout restart statefulset -n monitoring alertmanager-kube-prometheus-stack-alertmanager"
echo "4. Apply test alert: kubectl apply -f k8s/test-alert-rule.yaml"
echo "5. Watch logs: kubectl logs -l app=alert-webhook-service -f"
echo ""

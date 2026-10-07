#!/bin/bash

# Build and Deploy Correlation Engine
# Usage: ./build-and-deploy.sh [--push]

set -e

echo "=================================================="
echo "  Building Correlation Engine"
echo "=================================================="

# Configuration
IMAGE_NAME="correlation-engine"
IMAGE_TAG="latest"
REGISTRY=""  # Set to your registry, e.g., "docker.io/username"

# Parse arguments
PUSH_IMAGE=false
if [[ "$1" == "--push" ]]; then
    PUSH_IMAGE=true
    if [[ -z "$REGISTRY" ]]; then
        echo "❌ Error: REGISTRY not set. Please set REGISTRY variable in this script."
        exit 1
    fi
fi

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully: ${IMAGE_NAME}:${IMAGE_TAG}"
else
    echo "❌ Docker build failed"
    exit 1
fi

# Tag and push if requested
if [ "$PUSH_IMAGE" = true ]; then
    echo ""
    echo "📤 Pushing to registry: ${REGISTRY}"

    docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}
    docker push ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}

    if [ $? -eq 0 ]; then
        echo "✅ Image pushed successfully"
    else
        echo "❌ Push failed"
        exit 1
    fi

    # Update deployment with registry image
    sed -i.bak "s|image: ${IMAGE_NAME}:${IMAGE_TAG}|image: ${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}|g" k8s/deployment.yaml
    sed -i.bak "s|imagePullPolicy: Never|imagePullPolicy: Always|g" k8s/deployment.yaml
    rm k8s/deployment.yaml.bak
fi

echo ""
echo "=================================================="
echo "  Deploying to Kubernetes"
echo "=================================================="

# Apply Kubernetes manifests
echo "📦 Applying Kubernetes manifests..."
kubectl apply -f k8s/deployment.yaml

if [ $? -eq 0 ]; then
    echo "✅ Kubernetes manifests applied"
else
    echo "❌ Kubernetes deployment failed"
    exit 1
fi

echo ""
echo "Waiting for pod to be ready..."
kubectl wait --for=condition=ready pod -l app=correlation-engine --timeout=120s

if [ $? -eq 0 ]; then
    echo "✅ Pod is ready"
else
    echo "⚠️  Pod not ready yet. Check with: kubectl get pods -l app=correlation-engine"
fi

echo ""
echo "=================================================="
echo "  Deployment Summary"
echo "=================================================="

# Get pod status
echo ""
echo "📊 Pod Status:"
kubectl get pods -l app=correlation-engine

# Get service status
echo ""
echo "🔗 Services:"
kubectl get svc -l app=correlation-engine

echo ""
echo "📋 Logs (last 20 lines):"
kubectl logs -l app=correlation-engine --tail=20

echo ""
echo "=================================================="
echo "✅ Deployment Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Check logs: kubectl logs -l app=correlation-engine -f"
echo "2. Port forward API: kubectl port-forward svc/correlation-engine 9000:9000"
echo "3. Test API: curl http://localhost:9000/api/health"
echo "4. Get LoadBalancer IP: kubectl get svc correlation-engine-lb"
echo ""

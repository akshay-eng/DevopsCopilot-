#!/bin/bash
# Deploy alert-webhook-service to K3s cluster in 'alerts' namespace

set -e

echo "🚀 Deploying alert-webhook-service to alerts namespace..."

# Apply manifests in order
kubectl apply -f 00-namespace.yaml
echo "✅ Namespace created"

kubectl apply -f 01-configmap.yaml
echo "✅ ConfigMap created"

kubectl apply -f 02-deployment.yaml
echo "✅ Deployment created"

kubectl apply -f 03-service.yaml
echo "✅ Service created"

echo ""
echo "📊 Checking deployment status..."
kubectl -n alerts get all

echo ""
echo "🔍 Checking pod logs (waiting for pods to start)..."
sleep 5
kubectl -n alerts logs -l app=alert-webhook-service --tail=20 || echo "Pods not ready yet"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Configure AlertManager to send webhooks to: http://alert-webhook-service.alerts.svc.cluster.local:8080/webhook/alerts"
echo "2. Test with: kubectl -n alerts port-forward svc/alert-webhook-service 8080:8080"
echo "3. Health check: curl http://localhost:8080/health/detailed"

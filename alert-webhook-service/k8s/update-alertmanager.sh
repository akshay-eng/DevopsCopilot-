#!/bin/bash
# Update AlertManager configuration to send alerts to DevOps Copilot

set -e

CONFIG_FILE="/Users/akshay/Documents/DevopsCopilot-/alert-webhook-service/k8s/alertmanager-config-updated.yaml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Config file not found: $CONFIG_FILE"
    exit 1
fi

echo "📝 Updating AlertManager configuration..."

# Create secret with updated config
kubectl create secret generic alertmanager-prometheus-kube-prometheus-alertmanager \
  --from-file=alertmanager.yaml="$CONFIG_FILE" \
  --namespace=monitoring \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secret updated"

# Restart AlertManager pods to pick up new config
echo "🔄 Restarting AlertManager..."
kubectl rollout restart statefulset/alertmanager-prometheus-kube-prometheus-alertmanager -n monitoring

# Wait for rollout
kubectl rollout status statefulset/alertmanager-prometheus-kube-prometheus-alertmanager -n monitoring

echo ""
echo "✅ AlertManager configuration updated successfully!"
echo ""
echo "Next steps:"
echo "1. Check AlertManager UI to verify webhook is configured"
echo "2. Wait for alerts to fire and check Timeline"
echo "3. Monitor alert-webhook-service logs:"
echo "   kubectl -n alerts logs -l app=alert-webhook-service -f"

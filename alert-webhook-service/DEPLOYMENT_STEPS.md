# Quick Deployment Steps

Follow these steps to deploy the AlertManager webhook service to your Kubernetes cluster.

## Prerequisites Checklist

- [ ] Kubernetes cluster is running
- [ ] kubectl is configured and can access the cluster
- [ ] MongoDB is deployed in the cluster (service name: `mongodb`)
- [ ] Kafka is deployed in the cluster (service name: `kafka`)
- [ ] kube-prometheus-stack is installed (AlertManager running)
- [ ] Docker is installed on your local machine

## Step-by-Step Deployment

### 1. Build and Load Docker Image

```bash
# Navigate to the service directory
cd /Users/akshay/Documents/DevopsCopilot-/alert-webhook-service

# Build the Docker image
docker build -t alert-webhook-service:latest .

# Load image into minikube (if using minikube)
minikube image load alert-webhook-service:latest

# OR push to registry if using remote cluster
# docker tag alert-webhook-service:latest your-registry/alert-webhook-service:latest
# docker push your-registry/alert-webhook-service:latest
```

### 2. Update Configuration (if needed)

Edit `k8s/configmap.yaml` if your MongoDB or Kafka service names are different:

```bash
nano k8s/configmap.yaml
# Update MONGO_URI and KAFKA_BROKERS if needed
```

### 3. Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=alert-webhook-service --timeout=60s
```

### 4. Verify Deployment

```bash
# Check pod status
kubectl get pods -l app=alert-webhook-service

# Check logs
kubectl logs -l app=alert-webhook-service -f

# You should see:
# ✅ MongoDB connected successfully
# ✅ Kafka producer connected
# ✅ Alert processor initialized
# 🚀 AlertManager Webhook Service Started
```

### 5. Test Health Endpoint

```bash
# Get pod name
POD=$(kubectl get pod -l app=alert-webhook-service -o jsonpath='{.items[0].metadata.name}')

# Test basic health
kubectl exec -it $POD -- wget -qO- http://localhost:8080/health

# Test detailed health
kubectl exec -it $POD -- wget -qO- http://localhost:8080/health/detailed
```

Expected response:
```json
{
  "service": "alert-webhook-service",
  "status": "ok",
  "components": {
    "mongodb": "connected",
    "kafka": "connected",
    "alertProcessor": "initialized"
  }
}
```

### 6. Configure AlertManager

```bash
# Update cluster_id in test alert rule (IMPORTANT!)
# Edit k8s/test-alert-rule.yaml and replace with your actual cluster ID from MongoDB
nano k8s/test-alert-rule.yaml

# Apply AlertManager configuration
kubectl apply -f k8s/alertmanager-config.yaml

# Restart AlertManager to pick up new config
kubectl rollout restart statefulset -n monitoring alertmanager-kube-prometheus-stack-alertmanager

# Wait for AlertManager to restart
kubectl rollout status statefulset -n monitoring alertmanager-kube-prometheus-stack-alertmanager
```

### 7. Test Webhook Connection from AlertManager

```bash
# Get AlertManager pod name
AM_POD=$(kubectl get pod -n monitoring -l app.kubernetes.io/name=alertmanager -o jsonpath='{.items[0].metadata.name}')

# Test connectivity from AlertManager to webhook service
kubectl exec -it -n monitoring $AM_POD -- wget -qO- http://alert-webhook-service.default.svc.cluster.local:8080/health

# Should return: {"status":"ok","service":"alert-webhook-service",...}
```

### 8. Deploy Test Alert Rule

```bash
# Apply test alert rule (will fire immediately)
kubectl apply -f k8s/test-alert-rule.yaml

# Watch webhook service logs for alerts
kubectl logs -l app=alert-webhook-service -f

# You should see:
# 📢 ALERTMANAGER WEBHOOK RECEIVED
# 📊 Alert count: 1
# 🔔 Processing alert: DevOpsCopilotTest (firing)
# 📤 Sending to Kafka topic 'alerts'
# ✅ Alert sent to Kafka
```

### 9. Verify Alerts in Kafka

```bash
# Check Kafka topic for alerts
kubectl exec -it kafka-0 -- kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic alerts \
  --from-beginning

# Press Ctrl+C to exit after seeing alerts
```

### 10. Check Backend Receives Alerts

```bash
# Check authService logs (should receive from Kafka)
kubectl logs -l app=authservice -f

# OR if authService is running locally
# Check the local logs for Kafka consumer messages
```

## Troubleshooting

### Webhook service not starting

```bash
# Check pod events
kubectl describe pod -l app=alert-webhook-service

# Common issues:
# - Image not found: Make sure you loaded the image into minikube/cluster
# - CrashLoopBackOff: Check logs for MongoDB/Kafka connection errors
```

### AlertManager not sending alerts

```bash
# Check AlertManager config
kubectl get configmap -n monitoring alertmanager-config -o yaml

# Check AlertManager logs
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager -f

# Check if test alert is firing
kubectl get prometheusrule -n monitoring devopscopilot-test-alerts -o yaml
```

### Alerts not reaching Kafka

```bash
# Check webhook service logs
kubectl logs -l app=alert-webhook-service -f

# Check detailed health
POD=$(kubectl get pod -l app=alert-webhook-service -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $POD -- wget -qO- http://localhost:8080/health/detailed

# Verify Kafka is accessible
kubectl exec -it $POD -- wget -qO- http://kafka:9092
```

### No clusters found for alert

```bash
# The webhook enriches alerts with user/cluster data from MongoDB
# If you see "No clusters found", it means the cluster_id in the alert doesn't match MongoDB

# Check your cluster ID in MongoDB
kubectl exec -it mongodb-0 -- mongosh devopscopilot --eval "db.clusters.find({}, {_id:1, name:1, status:1})"

# Copy the _id value and update k8s/test-alert-rule.yaml with correct cluster_id
```

## Clean Up (Optional)

To remove the deployment:

```bash
kubectl delete -f k8s/deployment.yaml
kubectl delete -f k8s/service.yaml
kubectl delete -f k8s/configmap.yaml
kubectl delete -f k8s/test-alert-rule.yaml
```

To restore AlertManager config:

```bash
# Remove the webhook config and apply your original AlertManager config
kubectl delete -f k8s/alertmanager-config.yaml
```

## Next Steps

Once alerts are flowing to Kafka:

1. The authService Kafka consumer will receive them
2. Alerts will be sent to frontend via Socket.IO
3. Users will see real-time alerts in the dashboard

## Support

For issues or questions:
- Check logs: `kubectl logs -l app=alert-webhook-service -f`
- Check health: See step 5 above
- Review README.md for detailed documentation

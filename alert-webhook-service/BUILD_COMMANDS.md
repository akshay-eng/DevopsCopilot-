# Build and Deploy Commands

## Option 1: Automated Script (Recommended)

```bash
cd /Users/akshay/Documents/DevopsCopilot-/alert-webhook-service
./BUILD_AND_DEPLOY.sh
```

## Option 2: Manual Steps

### Step 1: Build Docker Image for AMD64

Since your Mac is ARM64 but the cluster is AMD64, you need to build for the correct platform:

```bash
cd /Users/akshay/Documents/DevopsCopilot-/alert-webhook-service

# Build for AMD64 platform
docker buildx build \
  --platform linux/amd64 \
  -t alert-webhook-service:latest \
  --load \
  .
```

**Note**: If `buildx` fails, enable it first:
```bash
docker buildx create --use
docker buildx inspect --bootstrap
```

### Step 2: Load Image into Cluster

#### If using Minikube:
```bash
minikube image load alert-webhook-service:latest
```

#### If using Kind:
```bash
kind load docker-image alert-webhook-service:latest
```

#### If using remote cluster:
```bash
# Save image to tar
docker save alert-webhook-service:latest -o alert-webhook-service.tar

# Transfer to cluster node (replace with your node IP)
scp alert-webhook-service.tar user@cluster-node:/tmp/

# SSH to node and load
ssh user@cluster-node
docker load -i /tmp/alert-webhook-service.tar
```

### Step 3: Update Configuration (if needed)

```bash
# Edit ConfigMap if your service names are different
nano k8s/configmap.yaml

# Check your actual service names
kubectl get svc | grep -E "mongodb|kafka"
```

### Step 4: Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=alert-webhook-service --timeout=120s
```

### Step 5: Verify Deployment

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

### Step 6: Test Health Endpoint

```bash
# Get pod name
POD=$(kubectl get pod -l app=alert-webhook-service -o jsonpath='{.items[0].metadata.name}')

# Test health
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

### Step 7: Configure AlertManager

```bash
# First, get your cluster ID from MongoDB
kubectl get pods | grep mongodb
kubectl exec -it mongodb-0 -- mongosh devopscopilot --eval "db.clusters.find({}, {_id:1, name:1, status:1}).pretty()"

# Copy the _id value and update test alert rule
nano k8s/test-alert-rule.yaml
# Replace cluster_id: '694b9246e231c5c0be4d8f33' with your actual cluster ID

# Apply AlertManager configuration
kubectl apply -f k8s/alertmanager-config.yaml

# Restart AlertManager
kubectl rollout restart statefulset -n monitoring alertmanager-kube-prometheus-stack-alertmanager

# Wait for restart
kubectl rollout status statefulset -n monitoring alertmanager-kube-prometheus-stack-alertmanager
```

### Step 8: Test Alert Flow

```bash
# Apply test alert rule
kubectl apply -f k8s/test-alert-rule.yaml

# Watch webhook service logs (in one terminal)
kubectl logs -l app=alert-webhook-service -f

# Watch AlertManager logs (in another terminal)
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager -f

# Within 30 seconds, you should see:
# - AlertManager sending webhook
# - Webhook service receiving alert
# - Alert being sent to Kafka
```

### Step 9: Verify in Kafka

```bash
# Check Kafka topic
kubectl exec -it kafka-0 -- kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic alerts \
  --from-beginning

# Press Ctrl+C after seeing alerts
```

## Troubleshooting

### Image Build Fails

```bash
# If buildx not available, use regular build with QEMU
docker run --privileged --rm tonistiigi/binfmt --install all
docker build --platform linux/amd64 -t alert-webhook-service:latest .
```

### Pod CrashLoopBackOff

```bash
# Check logs
kubectl logs -l app=alert-webhook-service

# Common issues:
# 1. MongoDB not accessible - check MONGO_URI in configmap
# 2. Kafka not accessible - check KAFKA_BROKERS in configmap
# 3. Image not loaded - verify with: kubectl describe pod <pod-name>
```

### MongoDB Connection Error

```bash
# Verify MongoDB is running
kubectl get pods | grep mongodb

# Test connectivity from webhook pod
POD=$(kubectl get pod -l app=alert-webhook-service -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $POD -- wget -qO- http://mongodb:27017

# Check ConfigMap
kubectl get configmap alert-webhook-config -o yaml
```

### Kafka Connection Error

```bash
# Verify Kafka is running
kubectl get pods | grep kafka

# Test connectivity
POD=$(kubectl get pod -l app=alert-webhook-service -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $POD -- nc -zv kafka 9092
```

### AlertManager Not Sending Alerts

```bash
# Verify webhook service is reachable from AlertManager namespace
kubectl exec -it -n monitoring alertmanager-kube-prometheus-stack-alertmanager-0 -- \
  wget -qO- http://alert-webhook-service.default.svc.cluster.local:8080/health

# Check AlertManager config
kubectl get configmap -n monitoring alertmanager-config -o yaml

# Check AlertManager logs for webhook errors
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager | grep -i webhook
```

## Clean Up

To remove the deployment:

```bash
kubectl delete -f k8s/deployment.yaml
kubectl delete -f k8s/service.yaml
kubectl delete -f k8s/configmap.yaml
kubectl delete -f k8s/test-alert-rule.yaml
kubectl delete -f k8s/alertmanager-config.yaml
```

## Updating the Service

After making code changes:

```bash
# Rebuild image
docker buildx build --platform linux/amd64 -t alert-webhook-service:latest --load .

# Reload into cluster
minikube image load alert-webhook-service:latest  # or kind load

# Restart deployment
kubectl rollout restart deployment alert-webhook-service

# Watch rollout
kubectl rollout status deployment alert-webhook-service
```

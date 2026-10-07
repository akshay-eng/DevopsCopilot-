# AlertManager Webhook Service

Standalone microservice that receives alerts from AlertManager, enriches them with user metadata, and sends them to Kafka for multi-tenant alert handling.

## Architecture

```
Prometheus → AlertManager → Alert Webhook Service → Kafka → Backend → Socket.IO → User
                              (runs in cluster)
```

## Why In-Cluster Deployment?

This service runs **inside the Kubernetes cluster** to solve the network connectivity issue:

- **Problem**: AlertManager running in a pod cannot reach services on external laptops/machines due to Kubernetes network isolation
- **Solution**: Deploy the webhook service as a pod in the same cluster, allowing in-cluster communication
- **Benefits**:
  - No network routing issues
  - No need for LoadBalancer or NodePort for webhook
  - Secure in-cluster communication
  - Access to MongoDB and Kafka within the cluster

## Features

- Receives AlertManager webhooks via HTTP POST
- Enriches alerts with user/cluster metadata from MongoDB
- Sends enriched alerts to Kafka partitioned by userId
- Supports multiple cluster identification strategies:
  - Direct cluster_id label
  - Instance/node matching
  - Cluster name matching
  - Fallback to all connected clusters
- Health check endpoints for Kubernetes probes
- Graceful shutdown handling

## Prerequisites

- Kubernetes cluster with kube-prometheus-stack installed
- MongoDB running in cluster
- Kafka running in cluster
- Docker for building the image

## Deployment Guide

### Step 1: Build Docker Image

```bash
cd alert-webhook-service

# Build the Docker image
docker build -t alert-webhook-service:latest .

# If using minikube, load into minikube
minikube image load alert-webhook-service:latest

# If using a remote registry, tag and push
# docker tag alert-webhook-service:latest your-registry/alert-webhook-service:latest
# docker push your-registry/alert-webhook-service:latest
```

### Step 2: Update ConfigMap (if needed)

Edit `k8s/configmap.yaml` to match your environment:

```yaml
data:
  MONGO_URI: "mongodb://mongodb:27017/devopscopilot"  # Update if different
  KAFKA_BROKERS: "kafka:9092"                         # Update if different
  KAFKA_ALERTS_TOPIC: "alerts"
```

### Step 3: Deploy to Kubernetes

```bash
# Apply ConfigMap
kubectl apply -f k8s/configmap.yaml

# Deploy the service
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml

# Verify deployment
kubectl get pods -l app=alert-webhook-service
kubectl logs -l app=alert-webhook-service -f
```

### Step 4: Configure AlertManager

```bash
# Apply the AlertManager configuration
kubectl apply -f k8s/alertmanager-config.yaml

# Restart AlertManager to pick up new config
kubectl rollout restart statefulset -n monitoring alertmanager-kube-prometheus-stack-alertmanager
```

### Step 5: Test with Test Alert Rule

```bash
# Apply test alert rule
kubectl apply -f k8s/test-alert-rule.yaml

# Watch AlertManager logs
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager -f

# Watch webhook service logs
kubectl logs -l app=alert-webhook-service -f

# Check Kafka topic for alerts
kubectl exec -it kafka-0 -- kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic alerts \
  --from-beginning
```

## Health Checks

The service provides two health check endpoints:

### Basic Health Check
```bash
kubectl exec -it <pod-name> -- wget -qO- http://localhost:8080/health
```

Response:
```json
{
  "status": "ok",
  "service": "alert-webhook-service",
  "timestamp": "2024-01-01T10:00:00.000Z"
}
```

### Detailed Health Check
```bash
kubectl exec -it <pod-name> -- wget -qO- http://localhost:8080/health/detailed
```

Response:
```json
{
  "service": "alert-webhook-service",
  "status": "ok",
  "timestamp": "2024-01-01T10:00:00.000Z",
  "components": {
    "mongodb": "connected",
    "kafka": "connected",
    "alertProcessor": "initialized"
  }
}
```

## Cluster Identification Strategies

The service supports multiple ways to identify which cluster an alert belongs to:

### 1. Direct Cluster ID (Recommended)

Add `cluster_id` label to your Prometheus external labels:

```yaml
# In Prometheus configuration
global:
  external_labels:
    cluster_id: '694b9246e231c5c0be4d8f33'
```

### 2. Instance Matching

Service will try to match alert `instance` label with cluster metadata.

### 3. Cluster Name

If your alert has a `cluster` label, it will match against cluster name in MongoDB.

### 4. Fallback to All Clusters

If no identifier is found, the alert is sent to all connected clusters.

## Troubleshooting

### Webhook Not Receiving Alerts

1. Check AlertManager config:
```bash
kubectl get configmap -n monitoring alertmanager-config -o yaml
```

2. Verify AlertManager can reach webhook service:
```bash
# Get a shell in AlertManager pod
kubectl exec -it -n monitoring alertmanager-kube-prometheus-stack-alertmanager-0 -- sh

# Test connectivity
wget -qO- http://alert-webhook-service.default.svc.cluster.local:8080/health
```

3. Check AlertManager logs:
```bash
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager -f
```

### Alerts Not Reaching Kafka

1. Check webhook service logs:
```bash
kubectl logs -l app=alert-webhook-service -f
```

2. Verify Kafka connectivity:
```bash
# Get pod name
POD=$(kubectl get pod -l app=alert-webhook-service -o jsonpath='{.items[0].metadata.name}')

# Check detailed health
kubectl exec -it $POD -- wget -qO- http://localhost:8080/health/detailed
```

3. Check MongoDB connection:
```bash
kubectl logs -l app=alert-webhook-service | grep -i mongo
```

### No Clusters Found for Alert

This means the service couldn't map the alert to any cluster in MongoDB. Check:

1. Cluster exists in MongoDB and has `status: 'connected'`
2. Alert has proper cluster identification labels
3. Check webhook logs for cluster query details

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/devopscopilot` |
| `KAFKA_BROKERS` | Comma-separated Kafka brokers | `localhost:9092` |
| `KAFKA_CLIENT_ID` | Kafka client identifier | `alert-webhook-service` |
| `KAFKA_ALERTS_TOPIC` | Kafka topic for alerts | `alerts` |
| `PORT` | HTTP server port | `8080` |
| `NODE_ENV` | Environment mode | `production` |

## Alert Enrichment

The service enriches each alert with:

```json
{
  "userId": "...",
  "clusterId": "...",
  "clusterName": "...",
  "alertId": "...",
  "status": "firing|resolved",
  "severity": "info|warning|critical",
  "alertname": "...",
  "labels": { ... },
  "annotations": { ... },
  "startsAt": "...",
  "endsAt": "...",
  "generatorURL": "...",
  "externalURL": "...",
  "groupKey": "...",
  "groupLabels": { ... },
  "receivedAt": "...",
  "source": "alertmanager"
}
```

## Kafka Partitioning

Alerts are partitioned by `userId` to ensure:
- Ordered delivery per user
- Even distribution across partitions
- Easy user-specific consumption

## Scaling

The deployment is configured with 2 replicas by default. To scale:

```bash
kubectl scale deployment alert-webhook-service --replicas=3
```

## Monitoring

Monitor the service using:

1. **Logs**:
```bash
kubectl logs -l app=alert-webhook-service -f
```

2. **Pod Status**:
```bash
kubectl get pods -l app=alert-webhook-service -w
```

3. **Health Checks**:
```bash
kubectl get pods -l app=alert-webhook-service -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}'
```

## Development

For local development:

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with local MongoDB and Kafka URLs
nano .env

# Run locally
npm run dev
```

## License

MIT

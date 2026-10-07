# Alert Webhook Service - Deployment Instructions

## Overview
This guide walks you through deploying the alert-webhook-service to your K3s cluster so that Prometheus alerts flow to your DevOps Copilot Timeline.

## Architecture
```
Prometheus Alerts → AlertManager → alert-webhook-service → Kafka → authService → Frontend Timeline
```

---

## Step 1: Deploy the Service

SSH to your K3s cluster node (192.168.1.5) and run:

```bash
# Clone or copy the k8s manifests to the cluster
cd /path/to/alert-webhook-service/k8s

# Option A: Use the deployment script
./deploy.sh

# Option B: Apply manifests manually
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-configmap.yaml
kubectl apply -f 02-deployment.yaml
kubectl apply -f 03-service.yaml
```

### Verify Deployment

```bash
# Check all resources
kubectl -n alerts get all

# Expected output:
# NAME                                          READY   STATUS    RESTARTS   AGE
# pod/alert-webhook-service-xxxxxxxxx-xxxxx     1/1     Running   0          30s
# pod/alert-webhook-service-xxxxxxxxx-xxxxx     1/1     Running   0          30s
#
# NAME                            TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
# service/alert-webhook-service   ClusterIP   10.43.x.x       <none>        8080/TCP   30s
#
# NAME                                    READY   UP-TO-DATE   AVAILABLE   AGE
# deployment.apps/alert-webhook-service   2/2     2            2           30s
```

### Check Service Health

```bash
# View pod logs
kubectl -n alerts logs -l app=alert-webhook-service --tail=50

# Port-forward to test locally
kubectl -n alerts port-forward svc/alert-webhook-service 8080:8080

# In another terminal, test the health endpoint
curl http://localhost:8080/health/detailed

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-...",
  "version": "1.0.0",
  "components": {
    "mongodb": { "status": "connected", "database": "devopscopilot" },
    "kafka": { "status": "connected", "brokers": ["192.168.1.5:30092", ...] },
    "alertProcessor": { "status": "ready" }
  }
}
```

---

## Step 2: Configure AlertManager

Update AlertManager to send webhooks to the service:

```bash
# Apply the updated AlertManager config
kubectl apply -f 04-alertmanager-config.yaml

# Restart AlertManager to pick up the new config
kubectl -n monitoring rollout restart deployment/alertmanager
# OR if using StatefulSet:
kubectl -n monitoring rollout restart statefulset/alertmanager

# Wait for restart
kubectl -n monitoring rollout status deployment/alertmanager
```

### Verify AlertManager Configuration

```bash
# Check AlertManager config
kubectl -n monitoring get configmap alertmanager-config -o yaml

# Verify the webhook URL points to:
# http://alert-webhook-service.alerts.svc.cluster.local:8080/webhook/alerts
```

---

## Step 3: Test Alert Flow

### Option A: Create a Test Alert Rule

```bash
# Apply a test alert rule that fires immediately
kubectl apply -f test-alert-rule.yaml

# Wait 30 seconds for Prometheus to evaluate
sleep 30

# Check if alert fired in AlertManager UI
# http://192.168.1.5:<alertmanager-nodeport>
```

### Option B: Manually Trigger Pod Crash

```bash
# Create a pod that crashes
kubectl run crashloop-test --image=busybox --restart=Always -- sh -c "exit 1"

# Wait for KubePodCrashLooping alert to fire (1-2 minutes)

# Check alert webhook logs
kubectl -n alerts logs -l app=alert-webhook-service --tail=20 | grep "Received alertmanager webhook"
```

### Verify in Frontend Timeline

1. Open DevOps Copilot UI: http://localhost:3000
2. Navigate to **Timeline** page
3. You should see alerts appear in real-time

---

## Step 4: Monitor the Pipeline

### Check Each Component

```bash
# 1. AlertManager (should show webhook active)
kubectl -n monitoring logs -l app.kubernetes.io/name=alertmanager --tail=50

# Look for: "Successfully sent notification"

# 2. Alert Webhook Service (should receive alerts)
kubectl -n alerts logs -l app=alert-webhook-service --tail=50 -f

# Look for:
# "Received alertmanager webhook"
# "Sending alert to Kafka: <alertname>"
# "✅ Processed N alerts from Alertmanager"

# 3. Kafka (on authService side - should consume alerts)
cd /Users/akshay/Documents/DevopsCopilot-/authService
npm start  # Watch console for "Processing ALERT message"

# 4. Frontend (should show alerts in Timeline)
# Open browser dev tools → Console
# Look for Socket.IO alert events
```

---

## Troubleshooting

### Service won't start

```bash
# Check pod events
kubectl -n alerts describe pod -l app=alert-webhook-service

# Common issues:
# - Image pull errors: Check image name in deployment.yaml
# - ConfigMap not found: Verify configmap was created
# - MongoDB connection: Check MONGO_URI in configmap
# - Kafka connection: Check KAFKA_BROKERS in configmap
```

### Alerts not reaching service

```bash
# 1. Verify AlertManager config
kubectl -n monitoring get configmap alertmanager-config -o yaml | grep alert-webhook-service

# 2. Check if AlertManager can reach service
kubectl -n monitoring run curl-test --image=curlimages/curl:latest --rm -it --restart=Never -- \
  curl -v http://alert-webhook-service.alerts.svc.cluster.local:8080/health

# 3. Check AlertManager logs for webhook errors
kubectl -n monitoring logs -l app.kubernetes.io/name=alertmanager --tail=100 | grep -i error
```

### Alerts not appearing in Timeline

```bash
# 1. Check if alerts reach Kafka
# On authService machine:
cd /Users/akshay/Documents/DevopsCopilot-/authService
node -e "
const {Kafka} = require('kafkajs');
const kafka = new Kafka({brokers: ['192.168.1.5:30092','192.168.1.5:30093','192.168.1.5:30094']});
const consumer = kafka.consumer({groupId: 'test-consumer'});
consumer.connect().then(() => {
  consumer.subscribe({topic: 'alerts', fromBeginning: true});
  consumer.run({eachMessage: async ({message}) => {
    console.log('Alert:', message.value.toString());
  }});
});
"

# 2. Check MongoDB for saved alerts
mongosh mongodb://adminuser:password123@192.168.1.5:32001/admin
> use devopscopilot
> db.alert_history.find().sort({receivedAt: -1}).limit(5).pretty()

# 3. Check authService Kafka consumer
cd /Users/akshay/Documents/DevopsCopilot-/authService
npm start  # Should show "Kafka consumer connected to alerts topic"
```

---

## Configuration Reference

### Environment Variables (in ConfigMap)

| Variable | Value | Purpose |
|----------|-------|---------|
| `MONGO_URI` | `mongodb://adminuser:password123@192.168.1.5:32001/admin` | MongoDB connection for cluster lookups |
| `KAFKA_BROKERS` | `192.168.1.5:30092,192.168.1.5:30093,192.168.1.5:30094` | Kafka brokers for alert publishing |
| `KAFKA_ALERTS_TOPIC` | `alerts` | Kafka topic name |
| `PORT` | `8080` | HTTP server port |

### Service Endpoints

- **Health Check**: `GET /health`
- **Detailed Health**: `GET /health/detailed`
- **Webhook Receiver**: `POST /webhook/alerts`

### AlertManager Webhook URL

```
http://alert-webhook-service.alerts.svc.cluster.local:8080/webhook/alerts
```

---

## Next Steps

Once alerts are flowing to the Timeline:

1. **Create Alert Rules** - Add Prometheus alert rules for your specific use cases
2. **Customize Severity** - Adjust alert severities in Prometheus rules
3. **Configure Routing** - Use AlertManager routing to filter alerts by namespace/severity
4. **Monitor Performance** - Check alert-webhook-service metrics at `/metrics` endpoint

---

## Uninstall

To remove the service:

```bash
kubectl delete namespace alerts
# This removes: namespace, deployment, service, configmap

# Revert AlertManager config to previous version
# (or remove the devopscopilot-webhook receiver)
```

---

## Support

If you encounter issues:
1. Check pod logs: `kubectl -n alerts logs -l app=alert-webhook-service`
2. Verify connectivity: MongoDB, Kafka, AlertManager
3. Test webhook manually:
   ```bash
   kubectl -n alerts port-forward svc/alert-webhook-service 8080:8080
   curl -X POST http://localhost:8080/webhook/alerts -H "Content-Type: application/json" -d '{
     "alerts": [{
       "status": "firing",
       "labels": {"alertname": "TestAlert", "severity": "warning", "cluster_id": "YOUR_CLUSTER_ID"},
       "annotations": {"summary": "Test alert from curl"},
       "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
     }]
   }'
   ```

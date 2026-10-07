# Alert Webhook Service - Deployment Success! ✅

## Services Status

### 1. MongoDB
- **Type**: Deployed in Kubernetes cluster
- **LoadBalancer IP**: `192.168.1.251:27017`
- **Credentials**: `adminuser:password123`
- **Database**: `admin`
- **Status**: ✅ Running and accessible

### 2. Alert Webhook Service
- **Deployment**: 2 replicas running in Kubernetes
- **Status**: ✅ Both pods Ready (1/1)
- **Service Type**: ClusterIP
- **Cluster URL**: `http://alert-webhook-service.default.svc.cluster.local:8080`
- **MongoDB Connection**: ✅ Connected
- **Kafka Connection**: ✅ Connected

### 3. AuthService (Laptop)
- **MongoDB Updated**: ✅ Now using cluster MongoDB at `192.168.1.251:27017`
- **Location**: `/Users/akshay/Documents/DevopsCopilot-/authService/.env`

## Next Steps

### 1. Configure AlertManager

Apply the AlertManager configuration to send alerts to the webhook:

```bash
kubectl apply -f /Users/akshay/Documents/DevopsCopilot-/alert-webhook-service/k8s/alertmanager-config.yaml
```

**Important**: The webhook URL in the config is:
```yaml
url: 'http://alert-webhook-service.default.svc.cluster.local:8080/webhook/alerts'
```

### 2. Restart AlertManager

```bash
kubectl rollout restart statefulset -n monitoring alertmanager-kube-prometheus-stack-alertmanager

# Wait for restart
kubectl rollout status statefulset -n monitoring alertmanager-kube-prometheus-stack-alertmanager
```

### 3. Get Your Cluster ID from MongoDB

Before testing, you need to get a cluster ID from MongoDB to use in the test alert:

```bash
# Connect to MongoDB
mongosh "mongodb://adminuser:password123@192.168.1.251:27017/admin"

# In MongoDB shell, switch to devopscopilot database
use devopscopilot

# Get clusters
db.clusters.find({}, {_id: 1, name: 1, userId: 1}).pretty()

# Copy the _id value
```

**OR** if you don't have any clusters yet, create one:

```bash
# In MongoDB shell
use devopscopilot

# Create a test cluster
db.clusters.insertOne({
  name: "test-cluster",
  userId: ObjectId(),  // Will generate a new user ID
  status: "connected",
  createdAt: new Date(),
  updatedAt: new Date()
})

# Get the inserted cluster ID
db.clusters.find({name: "test-cluster"})
```

### 4. Update Test Alert Rule

Edit the test alert rule with your actual cluster ID:

```bash
nano /Users/akshay/Documents/DevopsCopilot-/alert-webhook-service/k8s/test-alert-rule.yaml

# Replace the cluster_id value with your actual cluster ID from MongoDB
# cluster_id: 'YOUR_CLUSTER_ID_HERE'
```

### 5. Deploy Test Alert

```bash
kubectl apply -f /Users/akshay/Documents/DevopsCopilot-/alert-webhook-service/k8s/test-alert-rule.yaml
```

### 6. Watch Logs

**Terminal 1** - Watch webhook service logs:
```bash
kubectl logs -l app=alert-webhook-service -f
```

You should see:
```
📢 ALERTMANAGER WEBHOOK RECEIVED
📊 Alert count: 1
🔔 Processing alert: DevOpsCopilotTest (firing)
✅ Found 1 cluster(s) for alert
📤 Sending to Kafka topic 'alerts'
✅ Alert sent to Kafka
```

**Terminal 2** - Watch AlertManager logs:
```bash
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager -f
```

**Terminal 3** - Watch Kafka topic:
```bash
kubectl exec -it kafka-broker-1-0 -n kafka -- kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic alerts \
  --from-beginning
```

### 7. Verify in AuthService

If your authService is running and consuming from Kafka, it should receive the alert and emit via Socket.IO to the frontend.

Restart authService to pick up new MongoDB connection:
```bash
cd /Users/akshay/Documents/DevopsCopilot-/authService
# Stop current authService if running
# Then start it
npm start
```

## Architecture Flow

```
Prometheus (in cluster)
    ↓
AlertManager (in cluster)
    ↓ HTTP POST
Alert Webhook Service (in cluster) ← reads MongoDB, writes to Kafka
    ↓
Kafka (in cluster)
    ↓
AuthService (laptop) ← consumes from Kafka
    ↓ Socket.IO
Frontend (browser)
```

## Service URLs Summary

| Service | Location | URL/IP |
|---------|----------|--------|
| MongoDB | Kubernetes (LoadBalancer) | `192.168.1.251:27017` |
| Kafka Brokers | Kubernetes (LoadBalancer) | `192.168.1.240:9092`, `192.168.1.245:9093`, `192.168.1.246:9094` |
| Alert Webhook | Kubernetes (ClusterIP) | `http://alert-webhook-service.default.svc.cluster.local:8080` |
| AlertManager | Kubernetes (LoadBalancer) | Check with `kubectl get svc -n monitoring` |
| AuthService | Laptop | `http://localhost:5001` |

## Troubleshooting

### Webhook not receiving alerts

1. Check AlertManager can reach webhook:
```bash
kubectl exec -it -n monitoring alertmanager-kube-prometheus-stack-alertmanager-0 -- \
  wget -qO- http://alert-webhook-service.default.svc.cluster.local:8080/health
```

2. Check AlertManager logs for webhook errors:
```bash
kubectl logs -n monitoring -l app.kubernetes.io/name=alertmanager | grep -i webhook
```

### No clusters found for alert

- Check MongoDB has cluster documents:
```bash
mongosh "mongodb://adminuser:password123@192.168.1.251:27017/admin" \
  --eval "use devopscopilot; db.clusters.find().pretty()"
```

- Ensure test alert has correct cluster_id label

### Alerts not reaching Kafka

- Check webhook logs: `kubectl logs -l app=alert-webhook-service -f`
- Verify Kafka connectivity from webhook pod

## Complete Deployment Checklist

- [x] MongoDB deployed in cluster with LoadBalancer
- [x] Alert webhook service deployed (2 replicas)
- [x] Alert webhook connected to MongoDB ✅
- [x] Alert webhook connected to Kafka ✅
- [x] AuthService .env updated with new MongoDB
- [ ] AlertManager configured with webhook URL
- [ ] Test alert rule created with correct cluster_id
- [ ] Verified alerts flow from AlertManager → Kafka → AuthService

## Files Modified

1. `/Users/akshay/Documents/DevopsCopilot-/authService/.env`
   - Updated `MONGO_DB_URI` to use cluster MongoDB

2. `/Users/akshay/Documents/DevopsCopilot-/alert-webhook-service/k8s/configmap.yaml`
   - Updated `MONGO_URI` with credentials

## What's Working

✅ MongoDB running in cluster and accessible
✅ Alert webhook service deployed with 2 replicas
✅ MongoDB connection established
✅ Kafka connection established
✅ Health checks passing
✅ Service ready to receive webhooks from AlertManager

## What's Next

🔲 Configure AlertManager webhook
🔲 Create cluster in MongoDB (if not exists)
🔲 Deploy test alert rule
🔲 Verify end-to-end alert flow
🔲 Restart authService with new MongoDB connection
🔲 Test alerts appear in frontend

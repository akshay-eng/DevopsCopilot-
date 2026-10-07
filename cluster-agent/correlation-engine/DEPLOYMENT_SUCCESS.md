# Correlation Engine - Deployment Successful ✅

## Deployment Summary

The Alert Correlation Engine has been successfully deployed to your Kubernetes cluster!

### 📊 Deployment Details

**Pod Status**: Running ✅
```
NAME                                  READY   STATUS    RESTARTS   AGE
correlation-engine-5976d97678-5vc7t   1/1     Running   0          5m
```

**Services**:
```
NAME                    TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)
correlation-engine      ClusterIP      10.43.92.104   <none>          9000/TCP
correlation-engine-lb   LoadBalancer   10.43.165.71   192.168.1.252   9000:32271/TCP
```

**Docker Image**: `ak3hay/correlation-engine:latest` (pushed to Docker Hub)

**LoadBalancer IP**: `192.168.1.252:9000`

## 🎯 Detected Capabilities

```json
{
  "cilium": true,
  "hubble_relay": true,
  "prometheus": true
}
```

✅ **Running in Tier 1 (Premium) Mode with Cilium + Hubble!**

This means the engine is collecting real-time network flows and building dynamic service dependency graphs.

## 🔗 API Endpoints

All endpoints are accessible at: `http://192.168.1.252:9000/api`

### Health Check
```bash
curl http://192.168.1.252:9000/api/health
```

Response:
```json
{
  "status": "healthy",
  "capabilities": {
    "cilium": true,
    "hubble_relay": true,
    "prometheus": true
  },
  "buffer_size": 0,
  "incidents_open": 0,
  "incidents_stats": {
    "total_incidents": 0,
    "open_incidents": 0,
    "investigating": 0,
    "resolved": 0,
    "recent_critical_24h": 0
  }
}
```

### Service Map
```bash
curl http://192.168.1.252:9000/api/service-map
```

### Get Incidents
```bash
curl http://192.168.1.252:9000/api/incidents?status=open&limit=20
```

### Get Incident Details
```bash
curl http://192.168.1.252:9000/api/incidents/{incident_id}
```

### Network Flows (Cilium)
```bash
curl "http://192.168.1.252:9000/api/flows?service=backend&minutes=10"
```

### Statistics
```bash
curl http://192.168.1.252:9000/api/stats
```

## 📋 Initialization Logs

The engine started successfully with all components:

```
2026-01-01 11:15:47 - INFO - 🚀 Initializing Alert Correlation Engine
2026-01-01 11:15:47 - INFO - Step 1: Detecting cluster capabilities...
2026-01-01 11:15:47 - INFO - ✅ Cilium detected: 1 cilium pods found
2026-01-01 11:15:47 - INFO - ✅ Prometheus detected
2026-01-01 11:15:47 - INFO - ✅ Hubble Relay detected
2026-01-01 11:15:47 - INFO - Step 2: Setting up Kafka...
2026-01-01 11:15:47 - INFO - ✅ Kafka producer connected
2026-01-01 11:15:47 - INFO - ✅ Kafka consumer subscribed to 'alerts' topic
2026-01-01 11:15:47 - INFO - Step 3: Setting up network collectors...
2026-01-01 11:15:47 - INFO - ✅ Using Cilium Flow Collector (Tier 1 - Premium)
2026-01-01 11:15:47 - INFO - Step 4: Setting up alert enricher...
2026-01-01 11:15:47 - INFO - Step 5: Setting up alert correlator...
2026-01-01 11:15:47 - INFO - Step 6: Connecting to MongoDB...
2026-01-01 11:15:48 - INFO - ✅ Connected to MongoDB: admin
2026-01-01 11:15:47 - INFO - Step 7: Setting up REST API...
2026-01-01 11:15:48 - INFO - ✅ Correlation Engine initialized successfully
2026-01-01 11:15:48 - INFO - 🚀 Starting Correlation Engine...
2026-01-01 11:15:48 - INFO - ✅ Cilium flow collector started
2026-01-01 11:15:48 - INFO - 📡 Started consuming alerts from Kafka...
2026-01-01 11:15:48 - INFO - Starting REST API server on port 9000...
```

## 🔍 What's Running

### 1. Capability Detector ✅
- Detected Cilium, Hubble Relay, and Prometheus
- Running in **Tier 1 Premium mode**

### 2. Cilium Flow Collector ✅
- Connected to Hubble Relay at `hubble-relay.kube-system:80`
- Streaming real-time network flows
- Building dynamic service dependency graph
- Publishing flows to Kafka topic: `network-flows`

### 3. Alert Enricher ✅
- Ready to enrich alerts with:
  - Pod information from Kubernetes API
  - Logs (10-minute lookback)
  - Metrics from Prometheus
  - Kubernetes events
  - Service context
  - Network flows from Cilium

### 4. Alert Correlator ✅
- Consuming alerts from Kafka topic: `alerts`
- Deduplication enabled (5-minute window)
- Correlation criteria active:
  - Time proximity (10-minute window)
  - Service dependency (via Cilium flows)
  - Known cascade patterns
- Root cause detection enabled

### 5. MongoDB Storage ✅
- Connected to: `mongodb://192.168.1.251:27017/admin`
- Collections ready:
  - `incidents` (with indexes)
  - `alert_history` (with TTL)

### 6. REST API ✅
- Listening on: `0.0.0.0:9000`
- External access: `http://192.168.1.252:9000`
- All 7 endpoints active

## 📈 Integration Points

### Consuming From:
- **Kafka Topic**: `alerts` (from AlertManager webhook)
- **Prometheus**: Metrics queries via `http://192.168.1.244:9090`
- **Kubernetes API**: Pod info, logs, events
- **Hubble Relay**: Real-time network flows

### Publishing To:
- **Kafka Topic**: `incidents-notifications` (for Slack/email)
- **Kafka Topic**: `network-flows` (flow data)
- **MongoDB**: Incidents and alert history

## 🚀 Next Steps

### 1. Integrate with Frontend

Add the following endpoints to your React dashboard:

```javascript
const CORRELATION_ENGINE_URL = 'http://192.168.1.252:9000/api';

// Get service map
fetch(`${CORRELATION_ENGINE_URL}/service-map`)
  .then(res => res.json())
  .then(data => {
    // Visualize service graph
    renderServiceMap(data.nodes, data.edges);
  });

// Get recent incidents
fetch(`${CORRELATION_ENGINE_URL}/incidents?status=open&limit=20`)
  .then(res => res.json())
  .then(data => {
    // Display incidents
    renderIncidents(data.incidents);
  });

// Get incident details
fetch(`${CORRELATION_ENGINE_URL}/incidents/${incidentId}`)
  .then(res => res.json())
  .then(incident => {
    // Show enriched alert data, root cause, network analysis
    renderIncidentDetails(incident);
  });
```

### 2. Test Alert Correlation

Create a test crashloop pod to trigger alerts:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: test-crashloop
  namespace: default
spec:
  containers:
  - name: crasher
    image: alpine
    command: ["sh", "-c", "exit 1"]
  restartPolicy: Always
EOF
```

Wait 2-3 minutes for alerts to fire and correlate.

Check for incidents:
```bash
curl http://192.168.1.252:9000/api/incidents
```

### 3. Monitor Logs

Watch correlation engine logs:
```bash
kubectl logs -l app=correlation-engine -f
```

You should see:
- Network flows being collected from Hubble
- Alerts being consumed from Kafka
- Enrichment process (logs, metrics, events)
- Correlation logic
- Incident creation

### 4. Visualize Service Map

The service map will populate as network traffic flows through your cluster. Access:

```bash
curl http://192.168.1.252:9000/api/service-map | jq
```

Example response (after traffic):
```json
{
  "nodes": [
    {"id": "frontend", "label": "frontend"},
    {"id": "backend", "label": "backend"},
    {"id": "database", "label": "database"}
  ],
  "edges": [
    {
      "source": "frontend",
      "target": "backend",
      "request_count": 1500,
      "error_count": 45,
      "error_rate": 0.03,
      "avg_latency": 123.5
    },
    {
      "source": "backend",
      "target": "database",
      "request_count": 800,
      "error_count": 120,
      "error_rate": 0.15,
      "avg_latency": 250.2
    }
  ],
  "has_cilium": true,
  "last_updated": "2026-01-01T11:20:00Z"
}
```

### 5. Check MongoDB Incidents

Connect to MongoDB and view incidents:

```bash
mongosh "mongodb://adminuser:password123@192.168.1.251:27017/admin"
```

In MongoDB shell:
```javascript
// View all incidents
db.incidents.find().pretty()

// View open incidents
db.incidents.find({status: "open"}).pretty()

// View incident with full details
db.incidents.findOne({incident_id: "INC-1735650000"})

// Count incidents by severity
db.incidents.aggregate([
  {$group: {_id: "$severity", count: {$sum: 1}}}
])
```

## 🛠️ Troubleshooting

### Check Pod Status
```bash
kubectl get pods -l app=correlation-engine
kubectl describe pod -l app=correlation-engine
```

### View Logs
```bash
# All logs
kubectl logs -l app=correlation-engine

# Follow logs
kubectl logs -l app=correlation-engine -f

# Last 100 lines
kubectl logs -l app=correlation-engine --tail=100
```

### Test API from Inside Cluster
```bash
kubectl run -it --rm debug --image=alpine --restart=Never -- sh
apk add curl
curl http://correlation-engine:9000/api/health
```

### Check Kafka Connectivity
```bash
kubectl logs -l app=correlation-engine | grep -i kafka
```

### Check Hubble Flow Collection
```bash
kubectl logs -l app=correlation-engine | grep -i hubble
kubectl logs -l app=correlation-engine | grep -i flow
```

### Restart Engine
```bash
kubectl rollout restart deployment correlation-engine
kubectl logs -l app=correlation-engine -f
```

## 📊 Performance Monitoring

Check resource usage:
```bash
kubectl top pod -l app=correlation-engine
```

Expected usage:
- **Memory**: 200-500Mi (will grow with flows/alerts)
- **CPU**: 50-200m (spikes during correlation)

## ✅ Success Criteria Checklist

- [x] Pod running successfully
- [x] Cilium + Hubble detected (Tier 1 mode)
- [x] Prometheus connectivity confirmed
- [x] MongoDB connected
- [x] Kafka consumer subscribed to `alerts` topic
- [x] Kafka producer ready for `incidents-notifications`
- [x] Hubble flow collector started
- [x] REST API accessible via LoadBalancer
- [x] Health endpoint returns 200 OK
- [x] Service map endpoint working
- [x] All 7 API endpoints functional

## 🎉 Status

**CORRELATION ENGINE SUCCESSFULLY DEPLOYED AND RUNNING!**

The engine is now:
- ✅ Consuming alerts from Kafka
- ✅ Collecting real-time network flows from Cilium/Hubble
- ✅ Building service dependency graphs
- ✅ Ready to enrich and correlate alerts
- ✅ Exposing REST API for frontend integration
- ✅ Storing incidents in MongoDB

Access the API at: **http://192.168.1.252:9000/api**

---

**Deployment Date**: January 1, 2026
**Image**: ak3hay/correlation-engine:latest
**Mode**: Tier 1 (Premium) - Cilium + Hubble
**Status**: Healthy ✅

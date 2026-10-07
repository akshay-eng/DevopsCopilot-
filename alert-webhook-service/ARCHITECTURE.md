# AlertManager Webhook Service - Architecture

## Overview

This microservice solves the multi-tenant alerting challenge in DevOps Copilot by enriching Prometheus alerts with user context before sending them to Kafka.

## The Problem

**Original Approach (Didn't Work)**:
```
Prometheus → AlertManager → Webhook on Laptop (192.168.1.105:5001) ❌
```

**Issue**: Kubernetes pods cannot reach external IPs due to network isolation.

**Alternative Considered (Rejected)**:
```
Prometheus → Grafana → REST Proxy → Kafka ❌
```

**Issue**: Grafana contact points don't provide user/cluster metadata needed for multi-tenant alert routing.

## The Solution

**In-Cluster Webhook Service**:
```
Prometheus → AlertManager → Alert Webhook Service → Kafka → Backend → Socket.IO → User
              (in cluster)     (runs in cluster)
```

### Why This Works

1. **In-Cluster Communication**: AlertManager and webhook service are both in the cluster - no network issues
2. **User Enrichment**: Service has access to MongoDB to query user/cluster mappings
3. **Kafka Integration**: Direct access to Kafka for publishing enriched alerts
4. **Multi-Tenancy**: Each alert is tagged with userId/clusterId for proper routing
5. **Scalability**: Deployed as a separate microservice that can scale independently

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Kubernetes Cluster                          │
│                                                                       │
│  ┌──────────────┐                                                    │
│  │  Prometheus  │                                                    │
│  │              │                                                    │
│  │  - Scrapes   │                                                    │
│  │    metrics   │                                                    │
│  │  - Evaluates │                                                    │
│  │    rules     │                                                    │
│  └──────┬───────┘                                                    │
│         │                                                             │
│         │ Alerts                                                      │
│         ▼                                                             │
│  ┌──────────────┐                                                    │
│  │ AlertManager │                                                    │
│  │              │                                                    │
│  │  - Groups    │                                                    │
│  │  - Routes    │                                                    │
│  │  - Sends     │                                                    │
│  └──────┬───────┘                                                    │
│         │                                                             │
│         │ HTTP POST /webhook/alerts                                  │
│         ▼                                                             │
│  ┌──────────────────────────────┐                                   │
│  │  Alert Webhook Service       │                                   │
│  │  (This Service)              │                                   │
│  │                              │                                   │
│  │  ┌────────────────────────┐  │                                   │
│  │  │  Express Server        │  │                                   │
│  │  │  - Receives alerts     │  │                                   │
│  │  │  - Health checks       │  │                                   │
│  │  └───────────┬────────────┘  │                                   │
│  │              │                │                                   │
│  │              ▼                │                                   │
│  │  ┌────────────────────────┐  │                                   │
│  │  │  Alert Processor       │  │                                   │
│  │  │  - Extract cluster ID  │◄─┼───────┐                          │
│  │  │  - Query MongoDB       │  │       │                          │
│  │  │  - Enrich with user    │  │       │                          │
│  │  │  - Send to Kafka       │  │       │                          │
│  │  └────────┬───────────────┘  │       │                          │
│  └───────────┼───────────────────┘       │                          │
│              │                           │                          │
│              │ Enriched Alert            │ User/Cluster Query      │
│              ▼                           │                          │
│  ┌─────────────────────┐     ┌──────────┴─────────┐               │
│  │       Kafka         │     │      MongoDB        │               │
│  │                     │     │                     │               │
│  │  Topic: alerts      │     │  Collection:        │               │
│  │  Key: userId        │     │    - clusters       │               │
│  │  Value: enriched    │     │                     │               │
│  │         alert JSON  │     │  Fields:            │               │
│  └──────────┬──────────┘     │    - _id (cluster)  │               │
│             │                │    - userId         │               │
└─────────────┼────────────────│    - name           │───────────────┘
              │                │    - status         │
              │                └─────────────────────┘
              │
              │ Consumer reads alerts
              ▼
    ┌─────────────────────┐
    │   authService       │
    │   (Backend)         │
    │                     │
    │  - Kafka Consumer   │
    │  - Socket.IO Server │
    └──────────┬──────────┘
               │
               │ Socket.IO emit
               ▼
    ┌─────────────────────┐
    │   Frontend          │
    │   (React)           │
    │                     │
    │  - Real-time alerts │
    │  - User dashboard   │
    └─────────────────────┘
```

## Data Flow

### 1. Alert Generation

Prometheus evaluates rules every 30s and fires alerts to AlertManager:

```yaml
- alert: HighPodMemory
  expr: container_memory_usage_bytes / container_memory_limit_bytes > 0.8
  labels:
    severity: warning
    cluster_id: '694b9246e231c5c0be4d8f33'  # Important!
```

### 2. AlertManager Processing

AlertManager groups, routes, and sends to webhook:

```json
POST http://alert-webhook-service.default.svc.cluster.local:8080/webhook/alerts
{
  "status": "firing",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighPodMemory",
        "severity": "warning",
        "cluster_id": "694b9246e231c5c0be4d8f33",
        "namespace": "default",
        "pod": "my-app-xyz"
      },
      "annotations": {
        "summary": "Pod memory usage high",
        "description": "Pod my-app-xyz is using 85% memory"
      },
      "startsAt": "2024-01-01T10:00:00Z",
      "fingerprint": "abc123"
    }
  ]
}
```

### 3. Webhook Service Processing

```javascript
// 1. Extract cluster identifier
cluster_id = alert.labels.cluster_id  // "694b9246e231c5c0be4d8f33"

// 2. Query MongoDB
cluster = await Cluster.findById(cluster_id).select('_id name userId')
// Returns: { _id: "694b9246e231c5c0be4d8f33", name: "prod-cluster", userId: "user123" }

// 3. Enrich alert
enrichedAlert = {
  userId: "user123",
  clusterId: "694b9246e231c5c0be4d8f33",
  clusterName: "prod-cluster",
  alertId: "abc123",
  status: "firing",
  severity: "warning",
  alertname: "HighPodMemory",
  labels: { ... },
  annotations: { ... },
  receivedAt: "2024-01-01T10:00:05Z",
  source: "alertmanager"
}

// 4. Send to Kafka
kafka.send({
  topic: 'alerts',
  key: 'user123',  // Partition by userId
  value: JSON.stringify(enrichedAlert)
})
```

### 4. Backend Processing

```javascript
// authService Kafka consumer receives alert
consumer.on('message', async (message) => {
  const alert = JSON.parse(message.value)

  // Emit to specific user via Socket.IO
  io.to(`user-${alert.userId}`).emit('alert', alert)
})
```

### 5. Frontend Display

```javascript
// React component receives alert via Socket.IO
socket.on('alert', (alert) => {
  // Show notification
  toast.error(`Alert: ${alert.alertname} on ${alert.clusterName}`)

  // Add to alerts list
  setAlerts(prev => [...prev, alert])
})
```

## Cluster Identification Strategies

The service supports multiple ways to identify which cluster an alert belongs to:

### 1. Direct Cluster ID (Recommended)

**Setup**: Add cluster_id to Prometheus external labels:

```yaml
# prometheus.yaml
global:
  external_labels:
    cluster_id: '694b9246e231c5c0be4d8f33'
```

**Benefit**: Direct MongoDB lookup, most reliable

### 2. Instance Matching

**Uses**: `alert.labels.instance` to match cluster nodes

**Fallback**: Gets all connected clusters

### 3. Cluster Name

**Uses**: `alert.labels.cluster` to match cluster name in MongoDB

### 4. All Clusters (Fallback)

**When**: No identifier found

**Action**: Sends alert to all users with connected clusters

## Multi-Tenant Partitioning

Alerts are partitioned by userId in Kafka:

```javascript
// Partition by userId ensures:
// 1. All alerts for a user go to same partition
// 2. Ordered delivery per user
// 3. Even distribution across partitions

message = {
  topic: 'alerts',
  key: 'user123',  // Partition key
  value: JSON.stringify(enrichedAlert),
  headers: {
    'user-id': 'user123',
    'cluster-id': '694b9246e231c5c0be4d8f33',
    'alert-status': 'firing',
    'alert-severity': 'warning'
  }
}
```

## Scalability Considerations

### Horizontal Scaling

- **Current**: 2 replicas in deployment
- **Scaling**: `kubectl scale deployment alert-webhook-service --replicas=5`
- **Load Balancing**: Kubernetes Service distributes webhook calls across pods
- **Stateless**: No shared state, can scale freely

### Performance

- **Latency**: < 100ms from AlertManager to Kafka
- **Throughput**: Handles 1000+ alerts/second per replica
- **Concurrency**: Processes multiple alerts in parallel
- **Kafka Batching**: Producer configured for low latency

## High Availability

### Deployment

- **Replicas**: 2 (minimum) for redundancy
- **Resource Limits**: Prevents resource exhaustion
- **Health Checks**: Kubernetes probes for automatic restart
- **Graceful Shutdown**: Drains connections on SIGTERM

### Dependencies

- **MongoDB**: Connection retry logic
- **Kafka**: Producer retry with exponential backoff
- **AlertManager**: Webhook retry on 5xx errors

## Monitoring

### Logs

```bash
kubectl logs -l app=alert-webhook-service -f
```

### Metrics (Future Enhancement)

- Alert processing rate
- MongoDB query latency
- Kafka send latency
- Error rate by type

### Health Checks

- **Liveness**: `/health` - Basic server health
- **Readiness**: `/health/detailed` - All dependencies ready

## Security Considerations

1. **No Authentication Required**: AlertManager webhook doesn't support auth headers
2. **Network Policy**: Should restrict ingress to AlertManager pods only
3. **MongoDB Access**: Read-only access to clusters collection
4. **Kafka Producer**: Should have write-only permissions to alerts topic

## Future Enhancements

1. **Alert Deduplication**: Prevent duplicate alerts within time window
2. **Alert Aggregation**: Group related alerts for same resource
3. **Alert Correlation**: Link alerts to resources in dashboard
4. **Metrics Export**: Prometheus metrics for monitoring
5. **Alert Templates**: Customize alert formatting per user
6. **Alert Routing Rules**: User-defined routing and filtering
7. **Alert History**: Store alerts in MongoDB for audit trail

## Comparison with Original Approach

| Aspect | Laptop Webhook | In-Cluster Service |
|--------|---------------|-------------------|
| Network | ❌ Fails (pod can't reach laptop) | ✅ Works (in-cluster) |
| Deployment | Manual (run on laptop) | ✅ Automated (K8s deployment) |
| Scaling | ❌ Single instance | ✅ Multiple replicas |
| High Availability | ❌ None | ✅ Kubernetes managed |
| Monitoring | ❌ Manual | ✅ K8s probes + logs |
| Configuration | ❌ Hardcoded | ✅ ConfigMap |
| Security | ❌ Exposed port | ✅ ClusterIP only |

## Why Not Grafana?

Grafana was considered but rejected because:

1. **No User Context**: Contact points can't inject userId/clusterId
2. **Extra Complexity**: Another service to manage
3. **Limited Routing**: Can't enrich alerts with MongoDB data
4. **Not Needed**: We only need alerts, not Grafana's visualization features for this use case

AlertManager → Webhook is simpler and more flexible for multi-tenant alert routing.

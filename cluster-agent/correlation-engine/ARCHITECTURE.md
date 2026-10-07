

# Correlation Engine Architecture

## Overview

The Alert Correlation Engine is a sophisticated system that processes Kubernetes alerts through multiple stages of enrichment and correlation to create actionable incidents.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CORRELATION ENGINE                                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  1. CAPABILITY DETECTOR                                        │ │
│  │  ───────────────────────                                       │ │
│  │  - Auto-detects Cilium, Hubble, Prometheus                     │ │
│  │  - Determines Tier 1 (Cilium) vs Tier 2 (Simple) mode        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  2. NETWORK DATA COLLECTORS                                    │ │
│  │  ─────────────────────────                                     │ │
│  │                                                                │ │
│  │  ┌─────────────────────────────────────────┐                  │ │
│  │  │ Tier 1: Cilium Flow Collector           │                  │ │
│  │  │ ──────────────────────────────           │                  │ │
│  │  │ • Connects to Hubble Relay via gRPC     │                  │ │
│  │  │ • Streams real-time network flows        │                  │ │
│  │  │ • Tracks: HTTP requests, status codes,   │                  │ │
│  │  │   latencies, error rates                 │                  │ │
│  │  │ • Builds dynamic service dependency graph│                  │ │
│  │  │ • 10-minute flow buffer                  │                  │ │
│  │  │ • Publishes to Kafka: network-flows      │                  │ │
│  │  └─────────────────────────────────────────┘                  │ │
│  │                      OR                                        │ │
│  │  ┌─────────────────────────────────────────┐                  │ │
│  │  │ Tier 2: Simple Service Graph Builder    │                  │ │
│  │  │ ─────────────────────────────────────    │                  │ │
│  │  │ • Parses pod environment variables       │                  │ │
│  │  │ • Analyzes ConfigMaps for service URLs   │                  │ │
│  │  │ • Maps pods to services via selectors    │                  │ │
│  │  │ • Parses NetworkPolicies                 │                  │ │
│  │  │ • Refreshes every 5 minutes              │                  │ │
│  │  └─────────────────────────────────────────┘                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  3. ALERT ENRICHER                                             │ │
│  │  ─────────────────                                             │ │
│  │                                                                │ │
│  │  For each alert, enriches with:                               │ │
│  │                                                                │ │
│  │  📦 Pod Information (Kubernetes API)                           │ │
│  │     • Pod status, restart count, node                         │ │
│  │     • Container states, exit codes                            │ │
│  │     • Resource requests/limits                                │ │
│  │                                                                │ │
│  │  📝 Logs (10 min lookback)                                     │ │
│  │     • Error/warning pattern matching                          │ │
│  │     • Last 100 lines, first/last errors                       │ │
│  │     • Error/warning counts                                    │ │
│  │                                                                │ │
│  │  📊 Metrics (Prometheus, 10 min lookback)                      │ │
│  │     • CPU: current, max, avg, spike detection                 │ │
│  │     • Memory: GB usage, OOM risk                              │ │
│  │     • Network: I/O rates                                      │ │
│  │     • Timelines for trending                                  │ │
│  │                                                                │ │
│  │  📅 Events (Kubernetes, 30 min lookback)                       │ │
│  │     • Warning events, BackOff, etc.                           │ │
│  │     • Event counts and timestamps                             │ │
│  │                                                                │ │
│  │  🔗 Service Context                                            │ │
│  │     • Service name, type, endpoints                           │ │
│  │     • Label selectors                                         │ │
│  │                                                                │ │
│  │  🌐 Network Flows (if Cilium available)                        │ │
│  │     • Last 20 flows involving the pod                         │ │
│  │     • Request counts, error rates                             │ │
│  │     • Status code distribution                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  4. ALERT CORRELATOR                                           │ │
│  │  ──────────────────                                            │ │
│  │                                                                │ │
│  │  Step 1: Deduplication (5-minute window)                      │ │
│  │  ─────────────────────────────────────                        │ │
│  │  • Create signature: pod + alert + namespace + cluster        │ │
│  │  • Skip if seen within 5 minutes                              │ │
│  │                                                                │ │
│  │  Step 2: Add to Buffer (10-minute sliding window)             │ │
│  │  ───────────────────────────────────────────                  │ │
│  │  • Maintain recent alerts                                     │ │
│  │  • Remove alerts older than 10 minutes                        │ │
│  │                                                                │ │
│  │  Step 3: Find Correlated Alerts                               │ │
│  │  ──────────────────────────                                   │ │
│  │  Correlate if 2+ criteria match:                              │ │
│  │                                                                │ │
│  │  ✓ Time Proximity: Within 10-minute window                    │ │
│  │  ✓ Same Namespace & Cluster                                   │ │
│  │  ✓ Service Dependency:                                        │ │
│  │    - Cilium: Actual network traffic between services          │ │
│  │    - Simple: Connected in dependency graph                    │ │
│  │  ✓ Alert Pattern: Match cascade patterns                      │ │
│  │                                                                │ │
│  │  Known Patterns:                                              │ │
│  │  • database_cascade: DB → HighError → Unavailable            │ │
│  │  • memory_cascade: OOM → CrashLoop → BackOff                 │ │
│  │  • kafka_cascade: Lag → CrashLoop → ReplicaMismatch          │ │
│  │                                                                │ │
│  │  Step 4: Determine Root Cause                                 │ │
│  │  ────────────────────────                                     │ │
│  │  Priority-based (highest = root cause):                       │ │
│  │  10: PodOOMKilled                                             │ │
│  │   9: DatabaseConnectionFailed, KafkaLag                       │ │
│  │   8: DiskPressure, NodeNotReady                               │ │
│  │   5: KubePodCrashLooping                                      │ │
│  │   2: HighErrorRate                                            │ │
│  │                                                                │ │
│  │  Plus evidence from:                                          │ │
│  │  • Error counts in logs                                       │ │
│  │  • CPU/Memory spikes                                          │ │
│  │  • Network error rates (if Cilium)                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  5. INCIDENT CREATOR                                           │ │
│  │  ──────────────────                                            │ │
│  │                                                                │ │
│  │  Creates incident with:                                       │ │
│  │  • incident_id, timestamps, status                            │ │
│  │  • severity (highest from alerts)                             │ │
│  │  • cluster_id, namespace                                      │ │
│  │  • affected_services list                                     │ │
│  │  • root_cause with evidence                                   │ │
│  │  • all enriched alerts                                        │ │
│  │  • correlation_reason (human-readable)                        │ │
│  │  • time_span (first to last alert)                            │ │
│  │  • network_analysis (if Cilium):                              │ │
│  │    - Service graph snapshot                                   │ │
│  │    - Flow diagram with error rates                            │ │
│  │    - Error propagation path                                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  6. INCIDENT STORE (MongoDB)                                   │ │
│  │  ──────────────────────                                        │ │
│  │                                                                │ │
│  │  Deduplication:                                               │ │
│  │  • Check for existing incident (same services, 15 min window) │ │
│  │  • If exists: UPDATE (increment count, append alerts)         │ │
│  │  • If new: CREATE                                             │ │
│  │                                                                │ │
│  │  Collections:                                                 │ │
│  │  • incidents: All correlated incidents                        │ │
│  │  • alert_history: 1% sample + all critical/warning            │ │
│  │    (TTL: 90 days)                                             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  7. REST API (Flask, Port 9000)                                │ │
│  │  ─────────────────────────────                                 │ │
│  │                                                                │ │
│  │  Endpoints:                                                   │ │
│  │  • GET /api/health                                            │ │
│  │  • GET /api/service-map                                       │ │
│  │  • GET /api/incidents?status=open&limit=20                    │ │
│  │  • GET /api/incidents/{id}                                    │ │
│  │  • PUT /api/incidents/{id}/status                             │ │
│  │  • GET /api/flows?service=backend&minutes=10                  │ │
│  │  • GET /api/stats                                             │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Alert Ingestion

```
Prometheus → AlertManager → Webhook → Kafka (alerts topic)
                                          │
                                          ▼
                              Correlation Engine (Consumer)
```

### 2. Processing Pipeline

```
1. Consume Alert from Kafka
    ↓
2. Enrich Alert
    ├─ Pod Info (K8s API)
    ├─ Logs (K8s API)
    ├─ Metrics (Prometheus)
    ├─ Events (K8s API)
    ├─ Service Context (K8s API)
    └─ Network Flows (Hubble/Graph)
    ↓
3. Check Deduplication
    ├─ Duplicate? → Skip
    └─ New? → Continue
    ↓
4. Add to Buffer
    ↓
5. Find Correlated Alerts
    ├─ Time proximity?
    ├─ Service dependency?
    ├─ Alert pattern match?
    └─ 2+ matches? → Continue
    ↓
6. Create Incident
    ├─ Determine root cause
    ├─ Collect evidence
    ├─ Generate correlation reason
    └─ Add network analysis (if Cilium)
    ↓
7. Save to MongoDB
    ├─ Check for existing incident
    ├─ Update if exists
    └─ Create if new
    ↓
8. Publish to Kafka (incidents-notifications)
```

## Network Data Collection

### Tier 1: Cilium Flow Collector

**When Active**: Cilium + Hubble Relay detected

**Data Source**: Hubble Relay (real-time gRPC stream)

**Flow Structure**:
```json
{
  "timestamp": "2025-01-01T10:00:00Z",
  "source": {
    "service": "frontend",
    "pod": "frontend-abc123",
    "namespace": "default",
    "ip": "10.42.0.10"
  },
  "destination": {
    "service": "backend",
    "pod": "backend-xyz789",
    "namespace": "default",
    "ip": "10.42.0.20"
  },
  "http": {
    "method": "GET",
    "url": "/api/users",
    "status_code": 500,
    "protocol": "HTTP/1.1"
  },
  "latency_ms": 150,
  "bytes_sent": 1024,
  "bytes_received": 2048
}
```

**Service Graph**:
```python
{
  'frontend': {
    'downstream': ['backend', 'redis'],
    'upstream': ['nginx-ingress'],
    'request_count': {'backend': 1500, 'redis': 300},
    'error_count': {'backend': 450, 'redis': 0},
    'avg_latencies': {'backend': 123.5, 'redis': 5.2}
  }
}
```

**Capabilities**:
- ✅ Real-time network visibility
- ✅ HTTP-level metrics
- ✅ Actual traffic patterns
- ✅ Error propagation tracking
- ✅ Latency analysis

### Tier 2: Simple Service Graph Builder

**When Active**: Cilium NOT detected

**Data Sources**:
1. Pod environment variables (`*_SERVICE_HOST`)
2. ConfigMaps (service URL references)
3. Service selectors (pod-to-service mapping)
4. NetworkPolicies (allowed connections)

**Service Graph**:
```python
{
  'frontend': {
    'downstream': ['backend'],  # Inferred from env vars
    'upstream': ['nginx'],      # Inferred from network policies
    'last_updated': '2025-01-01T10:00:00Z'
  }
}
```

**Capabilities**:
- ✅ Static service dependencies
- ✅ ConfigMap-based references
- ✅ NetworkPolicy analysis
- ❌ No real-time traffic data
- ❌ No HTTP-level metrics

## Correlation Examples

### Example 1: Database Cascade

**Scenario**: Database becomes unresponsive

```
Timeline:
10:00:00 - DatabaseConnectionFailed (postgres-xyz)
10:01:30 - HighErrorRate (backend)
10:03:00 - ServiceUnavailable (frontend)

Correlation:
✓ Time: Within 3 minutes
✓ Service Dependency: frontend → backend → database
✓ Pattern Match: database_cascade

Result:
Incident created with:
- Root Cause: DatabaseConnectionFailed (priority 9)
- Evidence: "Connection pool exhausted"
- Affected Services: [database, backend, frontend]
```

### Example 2: Memory Cascade

**Scenario**: Pod runs out of memory

```
Timeline:
10:00:00 - PodOOMKilled (worker-abc123)
10:00:15 - KubePodCrashLooping (worker-abc123)
10:01:00 - CrashLoopBackOff (worker-abc123)

Correlation:
✓ Time: Within 1 minute
✓ Same Pod: worker-abc123
✓ Pattern Match: memory_cascade

Result:
Incident created with:
- Root Cause: PodOOMKilled (priority 10 - highest)
- Evidence: "Memory at 1.8GB (OOM risk)", "98% of limit"
- Affected Services: [worker]
```

## MongoDB Operations

### Incident Deduplication

```javascript
// Query for existing incident
db.incidents.findOne({
  affected_services: { $all: ['backend', 'database'] },
  status: { $in: ['open', 'investigating'] },
  created_at: { $gte: new Date(Date.now() - 15*60*1000) }
})

// If found: UPDATE
db.incidents.updateOne(
  { _id: existingId },
  {
    $inc: { alert_count: 1 },
    $push: { alerts: newAlert },
    $set: {
      updated_at: new Date(),
      'time_span.last_alert': newTime
    }
  }
)

// If not found: CREATE
db.incidents.insertOne({
  incident_id: 'INC-1735650000',
  created_at: new Date(),
  status: 'open',
  ...
})
```

### Indexes for Performance

```javascript
// Status queries
db.incidents.createIndex({ status: 1 })

// Time-based queries
db.incidents.createIndex({ created_at: -1 })

// Service-based queries
db.incidents.createIndex({ affected_services: 1 })

// Compound for common queries
db.incidents.createIndex({
  affected_services: 1,
  status: 1,
  created_at: -1
})
```

## Performance Characteristics

### Memory Usage

| Component | Memory | Notes |
|-----------|--------|-------|
| Flow Buffer | ~100KB | 150 flows @ ~700 bytes each |
| Alert Buffer | ~5MB | 50 alerts with enrichment |
| Service Graph | ~1MB | 100 services with relationships |
| **Total** | **512Mi-1Gi** | Recommended allocation |

### CPU Usage

| Operation | Time | Frequency |
|-----------|------|-----------|
| Alert Enrichment | ~50ms | Per alert |
| Flow Processing | ~10ms | Per flow |
| Correlation | ~100ms | Per alert |
| Service Graph Rebuild | ~2s | Every 5 minutes |

### Network Traffic

| Source | Bandwidth | Notes |
|--------|-----------|-------|
| Hubble Flows | ~10KB/s | 100 flows/sec @ 100 bytes |
| Kafka Consumer | ~5KB/s | 10 alerts/min @ 500 bytes |
| Kafka Producer | ~2KB/s | Incidents + flows |
| Kubernetes API | ~1KB/s | Periodic queries |
| Prometheus API | ~5KB/s | Metric queries |

## Scalability Considerations

### Single Instance Limits

- **Alerts**: ~500 alerts/min
- **Flows** (Cilium): ~1000 flows/sec
- **Incidents**: ~50 incidents/hour

### Horizontal Scaling

Currently **NOT** horizontally scalable due to:
- In-memory buffers (flow, alert)
- Kafka consumer group (single partition)

**Future**: Could implement:
- Redis for shared buffers
- Partitioned Kafka topics
- Distributed correlation

## Security

### RBAC Permissions

The engine requires:
- `get`, `list`, `watch` on pods, services, events
- `get` on pod logs
- Read-only access to cluster resources

### Secrets

- MongoDB credentials (via ConfigMap - should be Secret)
- Kafka credentials (if SASL enabled)

## Monitoring

### Health Checks

```bash
# Liveness probe
GET /api/health

# Expected response
{
  "status": "healthy",
  "capabilities": {...},
  "buffer_size": 150,
  "incidents_open": 2
}
```

### Metrics to Monitor

- Alert processing rate
- Correlation rate (% of alerts correlated)
- Buffer sizes
- Kafka consumer lag
- MongoDB connection pool
- API response times

## Future Enhancements

1. **Machine Learning**
   - Anomaly detection in metrics
   - Pattern learning from historical incidents
   - Predictive alerting

2. **Advanced Correlation**
   - Cross-cluster correlation
   - Time-series analysis
   - Seasonality detection

3. **Integration**
   - Slack notifications
   - PagerDuty integration
   - Jira ticket creation

4. **UI/UX**
   - Real-time incident dashboard
   - Service map visualization
   - Flow diagram rendering

5. **Performance**
   - Distributed correlation
   - Redis-backed buffers
   - Horizontal scaling support

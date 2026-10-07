# Alert Correlation Engine for Kubernetes

A sophisticated alert correlation engine that enriches Kubernetes alerts with logs, metrics, events, and network flow data, then correlates related alerts into actionable incidents.

## Features

### 🎯 Core Capabilities

- **Auto-Detection**: Automatically detects available observability tools (Cilium, Prometheus, Hubble)
- **Dual-Tier Network Collection**:
  - **Tier 1 (Premium)**: Cilium + Hubble Relay for real-time network flows and service dependencies
  - **Tier 2 (Fallback)**: Python-based service graph builder from Kubernetes metadata
- **Rich Alert Enrichment**: Logs, metrics, events, pod info, service context, and network flows
- **Intelligent Correlation**: Time-based, service dependency, and pattern matching
- **Root Cause Analysis**: Priority-based root cause detection with evidence
- **Incident Management**: MongoDB-based incident storage with deduplication
- **REST API**: Full API for frontend integration
- **Kafka Integration**: Consumes alerts, publishes incidents

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                     │
│                                                          │
│  ┌────────────────┐                                     │
│  │  AlertManager  │                                     │
│  └────────┬───────┘                                     │
│           │                                              │
│           ▼                                              │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │ Alert Webhook    │────────▶│  Kafka: alerts   │     │
│  │ Service          │         └─────────┬────────┘     │
│  └──────────────────┘                   │              │
│                                          │              │
│                                          ▼              │
│  ┌───────────────────────────────────────────────────┐ │
│  │         🧠 CORRELATION ENGINE                     │ │
│  │                                                    │ │
│  │  1️⃣ Capability Detection                         │ │
│  │     ├─ Cilium/Hubble Check                       │ │
│  │     └─ Prometheus Check                          │ │
│  │                                                    │ │
│  │  2️⃣ Network Data Collection                      │ │
│  │     ├─ Tier 1: Cilium Flow Collector             │ │
│  │     │   └─ Real-time flows from Hubble           │ │
│  │     └─ Tier 2: Simple Service Graph              │ │
│  │         └─ K8s metadata analysis                 │ │
│  │                                                    │ │
│  │  3️⃣ Alert Enrichment                             │ │
│  │     ├─ Pod Information (K8s API)                 │ │
│  │     ├─ Logs (10min lookback)                     │ │
│  │     ├─ Metrics (Prometheus)                      │ │
│  │     ├─ Events (30min lookback)                   │ │
│  │     ├─ Service Context                           │ │
│  │     └─ Network Flows (if Cilium)                 │ │
│  │                                                    │ │
│  │  4️⃣ Alert Correlation                            │ │
│  │     ├─ Deduplication (5min window)               │ │
│  │     ├─ Time Proximity (10min window)             │ │
│  │     ├─ Service Dependency                        │ │
│  │     └─ Pattern Matching                          │ │
│  │                                                    │ │
│  │  5️⃣ Incident Creation                            │ │
│  │     ├─ Root Cause Detection                      │ │
│  │     ├─ Evidence Collection                       │ │
│  │     └─ Network Analysis (if Cilium)              │ │
│  │                                                    │ │
│  └─────┬──────────────────────────┬─────────────────┘ │
│        │                          │                    │
│        ▼                          ▼                    │
│  ┌──────────┐            ┌──────────────┐            │
│  │ MongoDB  │            │ Kafka:       │            │
│  │incidents │            │incidents-    │            │
│  │          │            │notifications │            │
│  └──────────┘            └──────────────┘            │
│                                                        │
│  ┌──────────────────┐                                │
│  │   REST API       │                                │
│  │   Port: 9000     │                                │
│  └──────────────────┘                                │
│                                                        │
└────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Kubernetes cluster
- MongoDB (accessible from cluster)
- Kafka (accessible from cluster)
- Prometheus
- (Optional) Cilium + Hubble Relay for enhanced network visibility

### Installation

1. **Build Docker Image**

```bash
cd correlation-engine
docker build -t correlation-engine:latest .
```

2. **Update Configuration**

Edit `k8s/deployment.yaml` and update:
- `KAFKA_BOOTSTRAP_SERVERS`
- `MONGO_DB_URI`
- `PROMETHEUS_URL`
- `CLUSTER_ID`

3. **Deploy to Kubernetes**

```bash
kubectl apply -f k8s/deployment.yaml
```

4. **Verify Deployment**

```bash
# Check pods
kubectl get pods -l app=correlation-engine

# Check logs
kubectl logs -l app=correlation-engine -f

# Test API
kubectl port-forward svc/correlation-engine 9000:9000
curl http://localhost:9000/api/health
```

## API Endpoints

### Health Check
```bash
GET /api/health

Response:
{
  "status": "healthy",
  "capabilities": {
    "cilium": true,
    "prometheus": true,
    "hubble_relay": true
  },
  "buffer_size": 150,
  "incidents_open": 2,
  "incidents_stats": {...}
}
```

### Service Map
```bash
GET /api/service-map

Response:
{
  "nodes": [
    {"id": "frontend", "label": "frontend"},
    {"id": "backend", "label": "backend"}
  ],
  "edges": [
    {
      "source": "frontend",
      "target": "backend",
      "request_count": 150,
      "error_count": 45,
      "error_rate": 0.30,
      "avg_latency": 123.5
    }
  ],
  "has_cilium": true,
  "last_updated": "2025-01-01T10:00:00Z"
}
```

### Get Incidents
```bash
GET /api/incidents?status=open&limit=20

Response:
{
  "incidents": [
    {
      "incident_id": "INC-1735650000",
      "created_at": "2025-01-01T10:00:00Z",
      "status": "open",
      "severity": "critical",
      "affected_services": ["database", "backend"],
      "root_cause": {
        "service": "database",
        "alert": "DatabaseConnectionFailed",
        "pod": "postgres-xyz",
        "reason": "Connection pool exhausted",
        "evidence": [...]
      },
      "alert_count": 3,
      "correlation_reason": "..."
    }
  ],
  "total": 1
}
```

### Get Incident Details
```bash
GET /api/incidents/{incident_id}

Response:
{
  "incident": {
    "incident_id": "INC-1735650000",
    "alerts": [...],  # Full enriched alerts
    "network_analysis": {...},
    "time_span": {...}
  }
}
```

### Update Incident Status
```bash
PUT /api/incidents/{incident_id}/status
Content-Type: application/json

{
  "status": "investigating"
}
```

### Get Network Flows (Cilium Only)
```bash
GET /api/flows?service=backend&minutes=10

Response:
{
  "flows": [
    {
      "timestamp": "2025-01-01T10:00:00Z",
      "source": {...},
      "destination": {...},
      "http": {
        "method": "GET",
        "url": "/api/users",
        "status_code": 500
      },
      "latency_ms": 150
    }
  ],
  "total": 150,
  "has_cilium": true
}
```

## How It Works

### 1. Capability Detection

On startup, the engine automatically detects:
- ✅ Cilium pods in `kube-system` namespace
- ✅ Hubble Relay service
- ✅ Prometheus service

Based on detection:
- **Cilium Available** → Use Tier 1 (real-time network flows)
- **No Cilium** → Use Tier 2 (metadata-based service graph)

### 2. Network Data Collection

#### Tier 1: Cilium Flow Collector
- Connects to Hubble Relay via gRPC
- Streams real-time network flows
- Builds dynamic service dependency graph
- Tracks request counts, error rates, latencies
- 10-minute flow buffer for correlation

#### Tier 2: Simple Service Graph
- Parses pod environment variables for service references
- Analyzes ConfigMaps for service URLs
- Maps pods to services via selectors
- Parses NetworkPolicies for allowed connections
- Refreshes every 5 minutes

### 3. Alert Enrichment

For each incoming alert, enriches with:

**Pod Information**:
```python
{
  'pod_name': 'backend-xyz789',
  'status': 'CrashLoopBackOff',
  'restart_count': 5,
  'containers': [{...}],
  'resources': {...}
}
```

**Logs** (10 minutes before error):
```python
{
  'errors': [...],
  'warnings': [...],
  'error_count': 23,
  'last_100_lines': [...]
}
```

**Metrics** from Prometheus:
```python
{
  'cpu': {
    'current': 0.45,
    'max': 0.89,
    'spike_detected': True
  },
  'memory': {...}
}
```

**Events** (30 minutes lookback):
```python
{
  'events': [{
    'type': 'Warning',
    'reason': 'BackOff',
    'message': 'Back-off restarting failed container'
  }]
}
```

**Network Flows** (if Cilium):
```python
{
  'flows_before_error': [...],
  'flow_analysis': {
    'total_requests': 150,
    'error_count': 45,
    'error_rate': 0.30
  }
}
```

### 4. Alert Correlation

Alerts are correlated if they match **2 or more** of these criteria:

1. **Time Proximity**: Within 10-minute window
2. **Same Namespace & Cluster**: Same context
3. **Service Dependency**:
   - Cilium: Services have actual network traffic
   - Python: Services connected in dependency graph
4. **Alert Pattern**: Match known cascade patterns

### 5. Incident Creation

When alerts correlate:
- Determines root cause by priority
- Collects evidence from logs/metrics/flows
- Generates correlation reason
- Creates/updates incident in MongoDB
- Publishes to Kafka for notifications

## Known Cascade Patterns

```python
cascade_patterns = {
    'database_cascade': [
        'DatabaseConnectionFailed',
        'HighErrorRate',
        'ServiceUnavailable'
    ],
    'memory_cascade': [
        'PodOOMKilled',
        'KubePodCrashLooping',
        'CrashLoopBackOff'
    ],
    'kafka_cascade': [
        'KafkaConsumerLagIncreasing',
        'KubePodCrashLooping',
        'KubeDeploymentReplicasMismatch'
    ],
    'disk_pressure_cascade': [
        'DiskPressure',
        'NodeNotReady',
        'KubePodCrashLooping'
    ]
}
```

## Root Cause Priority

```python
root_cause_priority = {
    'PodOOMKilled': 10,                      # Highest
    'DatabaseConnectionFailed': 9,
    'KafkaConsumerLagIncreasing': 9,
    'DiskPressure': 8,
    'NodeNotReady': 8,
    'HighCPUUsage': 7,
    'HighMemoryUsage': 7,
    'KubePodCrashLooping': 5,
    'KubeDeploymentReplicasMismatch': 3,
    'HighErrorRate': 2,
    'ServiceUnavailable': 1                  # Lowest
}
```

## MongoDB Schema

### Collection: `incidents`

```javascript
{
  _id: ObjectId,
  incident_id: "INC-1735650000",
  created_at: ISODate,
  updated_at: ISODate,
  status: "open|investigating|resolved",
  severity: "critical|warning|info",
  cluster_id: String,
  cluster_name: String,
  namespace: String,
  affected_services: [String],
  root_cause: {
    service: String,
    alert: String,
    pod: String,
    reason: String,
    evidence: [String]
  },
  alert_count: Number,
  alerts: [Object],  // Full enriched alerts
  correlation_reason: String,
  network_analysis: Object,  // If Cilium
  time_span: {
    first_alert: ISODate,
    last_alert: ISODate,
    duration_seconds: Number
  }
}
```

**Indexes**:
- `status`
- `created_at`
- `affected_services`
- `cluster_id`
- Compound: `(affected_services, status, created_at)`

### Collection: `alert_history`

- Samples 1% of alerts
- Saves all critical/warning alerts
- TTL index: 90 days

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka brokers | Required |
| `MONGO_DB_URI` | MongoDB connection URI | Required |
| `PROMETHEUS_URL` | Prometheus API URL | Required |
| `CLUSTER_ID` | Cluster identifier | Required |

## Troubleshooting

### Engine Not Detecting Cilium

```bash
# Check Cilium pods
kubectl get pods -n kube-system -l k8s-app=cilium

# Check Hubble Relay service
kubectl get svc -n kube-system hubble-relay

# View engine logs
kubectl logs -l app=correlation-engine
```

### No Network Flows

```bash
# Test Hubble CLI
hubble observe --server <hubble-relay-url>

# Check if Hubble is accessible
kubectl port-forward -n kube-system svc/hubble-relay 4245:80
hubble observe --server localhost:4245
```

### Alerts Not Being Correlated

```bash
# Check alert buffer
curl http://<engine-ip>:9000/api/health

# Check service map
curl http://<engine-ip>:9000/api/service-map

# View correlation logs
kubectl logs -l app=correlation-engine | grep -i correlation
```

### API Not Responding

```bash
# Check pod status
kubectl get pods -l app=correlation-engine

# Check logs
kubectl logs -l app=correlation-engine

# Port forward and test
kubectl port-forward svc/correlation-engine 9000:9000
curl http://localhost:9000/api/health
```

## Performance Tuning

### Memory Usage

- Flow buffer: ~150 flows = ~100KB
- Alert buffer: ~50 alerts with enrichment = ~5MB
- Service graph: ~100 services = ~1MB

**Recommended**: 512Mi-1Gi memory

### CPU Usage

- Alert processing: ~50ms per alert
- Flow processing: ~10ms per flow
- Correlation: ~100ms per correlation

**Recommended**: 250m-1000m CPU

## Development

### Local Testing

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export KAFKA_BOOTSTRAP_SERVERS="localhost:9092"
export MONGO_DB_URI="mongodb://localhost:27017/admin"
export PROMETHEUS_URL="http://localhost:9090"
export CLUSTER_ID="test-cluster"

# Run engine
python engine.py
```

### Running Tests

```bash
# TODO: Add tests
pytest tests/
```

## License

MIT License

## Contributing

Contributions welcome! Please open an issue or PR.

## Support

For issues or questions:
- GitHub Issues: [Your Repo]
- Slack: [Your Slack Channel]
- Email: support@yourcompany.com

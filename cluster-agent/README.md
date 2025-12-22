# DevOps Copilot - Kubernetes Cluster Agent

## Overview

The Cluster Agent is a lightweight Python application that runs inside user Kubernetes clusters to monitor resources, collect metrics, and forward data to the DevOps Copilot SaaS platform via Kafka.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     User's Kubernetes Cluster                    │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Prometheus  │    │   Grafana    │    │     Loki     │      │
│  │              │◄───┤              │───►│              │      │
│  └──────────────┘    └──────┬───────┘    └──────────────┘      │
│                              │                                   │
│                              │ Alerts                            │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │          Alertmanager                                 │      │
│  │  Contact Point: Kafka REST Proxy (topic: alerts)     │      │
│  └──────────────────────────┬───────────────────────────┘      │
│                              │                                   │
│  ┌──────────────────────────┼───────────────────────────┐      │
│  │    DevOps Copilot Agent  │                           │      │
│  │                           │                           │      │
│  │  ┌─────────────────┐     │                           │      │
│  │  │ K8s API Watch   │     │                           │      │
│  │  │ (ServiceAccount)│     │                           │      │
│  │  └────────┬────────┘     │                           │      │
│  │           │              │                           │      │
│  │  ┌────────▼──────────────▼───────────┐              │      │
│  │  │   Kafka Producer                  │              │      │
│  │  │   (Multi-tenant headers)          │              │      │
│  │  └────────┬──────────────────────────┘              │      │
│  └───────────┼──────────────────────────────────────────┘      │
│              │                                                  │
└──────────────┼──────────────────────────────────────────────────┘
               │
               │ TLS/SASL
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DevOps Copilot SaaS Platform                   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Kafka Cluster                          │   │
│  │                                                            │   │
│  │  Topics:                                                   │   │
│  │  - alerts         (from Alertmanager)                     │   │
│  │  - k8s-events     (cluster events)                        │   │
│  │  - resources      (pods, deployments, etc.)               │   │
│  │  - metrics        (resource usage)                        │   │
│  │  - logs           (pod logs)                              │   │
│  │  - heartbeats     (agent health)                          │   │
│  │                                                            │   │
│  │  Message Headers:                                          │   │
│  │  - user_id                                                 │   │
│  │  - cluster_id                                              │   │
│  │  - cluster_name                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Backend API (Node.js)                        │   │
│  │  - Kafka Consumer (filters by user_id)                    │   │
│  │  - MongoDB (stores user-specific data)                    │   │
│  │  - WebSocket (real-time updates)                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Frontend Dashboard                       │   │
│  │  - Shows only authenticated user's data                   │   │
│  │  - Real-time alerts and metrics                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

## Features

### 1. Kubernetes Resource Monitoring
- Watches Pods, Deployments, StatefulSets, DaemonSets, Services, Nodes
- Sends resource events to Kafka (topic: `resources`)
- Auto-discovery of new resources

### 2. Event Streaming
- Watches Kubernetes events
- Sends to Kafka (topic: `k8s-events`)
- Includes warnings, errors, and normal events

### 3. Metrics Collection
- Collects resource usage (CPU, Memory) from Metrics Server
- Sends to Kafka (topic: `metrics`)
- Periodic polling (configurable interval)

### 4. Alert Forwarding
- Receives alerts from Alertmanager via webhook
- Forwards to Kafka (topic: `alerts`)
- Enriches alerts with cluster context

### 5. Heartbeat & Health
- Sends periodic heartbeats to Kafka (topic: `heartbeats`)
- Reports agent health and connectivity status
- Enables connectivity check during onboarding

### 6. Multi-Tenancy
- All messages tagged with `user_id` and `cluster_id`
- Backend filters data by authenticated user
- Complete data isolation between users

## Components

### Agent Application (Python/Flask)
- **Kubernetes Watcher**: Watches K8s resources using service account
- **Kafka Producer**: Sends data to Kafka with user context
- **Metrics Collector**: Polls metrics from Prometheus/Metrics Server
- **Health Endpoint**: `/health` for readiness/liveness probes
- **Webhook Receiver**: `/webhook/alerts` for Alertmanager

### Monitoring Stack (Deployed via Helm)
- **Prometheus**: Metrics collection and storage
- **Grafana**: Visualization and dashboards
- **Loki**: Log aggregation
- **Alertmanager**: Alert routing to Kafka
- **Metrics Server**: Resource metrics (if not present)

## Deployment

### Via Helm Chart (User Onboarding)

```bash
helm install devopscopilot-agent devopscopilot/cluster-agent \
  --set config.userId=<USER_ID> \
  --set config.clusterId=<CLUSTER_ID> \
  --set config.clusterName=<CLUSTER_NAME> \
  --set config.kafkaBootstrapServers=<KAFKA_URL> \
  --set config.kafkaUsername=<USERNAME> \
  --set config.kafkaPassword=<PASSWORD> \
  --namespace devopscopilot \
  --create-namespace
```

### What Gets Installed

1. **Namespace**: `devopscopilot`
2. **ServiceAccount**: `devopscopilot-agent` (with RBAC)
3. **Agent Deployment**: Python agent pod
4. **Monitoring Stack**: Prometheus, Grafana, Loki, Alertmanager
5. **ConfigMaps**: Configuration for all components
6. **Secrets**: Kafka credentials, Grafana admin password

## RBAC Permissions

The agent needs these permissions:

```yaml
- apiGroups: [""]
  resources: ["pods", "services", "nodes", "events", "namespaces"]
  verbs: ["get", "list", "watch"]

- apiGroups: ["apps"]
  resources: ["deployments", "statefulsets", "daemonsets", "replicasets"]
  verbs: ["get", "list", "watch"]

- apiGroups: ["metrics.k8s.io"]
  resources: ["pods", "nodes"]
  verbs: ["get", "list"]
```

## Data Flow

### 1. Resource Events
```json
{
  "userId": "60a7f8d3b4e1a2c3d4e5f6g7",
  "clusterId": "60a7f8d3b4e1a2c3d4e5f6g7-production-cluster",
  "clusterName": "production-cluster",
  "eventType": "resource_update",
  "resourceType": "pod",
  "namespace": "default",
  "name": "nginx-deployment-abc123",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "status": "Running",
    "restarts": 0,
    "node": "node-1",
    "age": "2h"
  }
}
```

### 2. Alerts
```json
{
  "userId": "60a7f8d3b4e1a2c3d4e5f6g7",
  "clusterId": "60a7f8d3b4e1a2c3d4e5f6g7-production-cluster",
  "clusterName": "production-cluster",
  "eventType": "alert",
  "severity": "critical",
  "alertname": "PodCrashLooping",
  "namespace": "default",
  "pod": "api-server-xyz",
  "timestamp": "2025-01-15T10:30:00Z",
  "summary": "Pod api-server-xyz is crash looping",
  "description": "Pod has restarted 5 times in the last 10 minutes"
}
```

### 3. Metrics
```json
{
  "userId": "60a7f8d3b4e1a2c3d4e5f6g7",
  "clusterId": "60a7f8d3b4e1a2c3d4e5f6g7-production-cluster",
  "clusterName": "production-cluster",
  "eventType": "metrics",
  "resourceType": "pod",
  "namespace": "default",
  "name": "nginx-deployment-abc123",
  "timestamp": "2025-01-15T10:30:00Z",
  "metrics": {
    "cpu": "250m",
    "memory": "512Mi",
    "cpuPercent": 25,
    "memoryPercent": 50
  }
}
```

## Security

### 1. Service Account
- Agent uses Kubernetes ServiceAccount (no kubeconfig needed)
- RBAC limits permissions to read-only + metrics
- Cannot modify cluster resources

### 2. Kafka Authentication
- TLS encryption for data in transit
- SASL authentication (username/password or certificates)
- Credentials stored in Kubernetes Secret

### 3. Network Policies
- Agent can only communicate with:
  - Kubernetes API server
  - Kafka cluster (external)
  - Local monitoring stack

### 4. Data Isolation
- All messages tagged with `user_id`
- Backend filters by authenticated user
- No cross-user data access

## Configuration

### Environment Variables

```yaml
KAFKA_BOOTSTRAP_SERVERS: "kafka.devopscopilot.io:9093"
KAFKA_SECURITY_PROTOCOL: "SASL_SSL"
KAFKA_SASL_MECHANISM: "PLAIN"
KAFKA_USERNAME: "agent-user"
KAFKA_PASSWORD: "<from-secret>"

USER_ID: "60a7f8d3b4e1a2c3d4e5f6g7"
CLUSTER_ID: "60a7f8d3b4e1a2c3d4e5f6g7-production-cluster"
CLUSTER_NAME: "production-cluster"

WATCH_INTERVAL: "30" # seconds
HEARTBEAT_INTERVAL: "60" # seconds
METRICS_INTERVAL: "120" # seconds

LOG_LEVEL: "INFO"
```

## Health Checks

### Liveness Probe
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 30
```

### Readiness Probe
```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
```

## Monitoring the Agent

The agent exposes metrics at `/metrics` (Prometheus format):

- `agent_kafka_messages_sent_total`
- `agent_kafka_messages_failed_total`
- `agent_k8s_watch_errors_total`
- `agent_resources_watched_total`
- `agent_last_heartbeat_timestamp`

## Troubleshooting

### Agent not connecting to Kafka
```bash
kubectl logs -n devopscopilot -l app=devopscopilot-agent
```

### Check RBAC permissions
```bash
kubectl auth can-i list pods --as=system:serviceaccount:devopscopilot:devopscopilot-agent
```

### Test connectivity from onboarding
The onboarding flow checks connectivity by:
1. Agent sends heartbeat to Kafka
2. Backend polls for heartbeat with matching `user_id` and `cluster_id`
3. If heartbeat received within 30 seconds → Connected ✅

## Development

### Run locally (requires kubeconfig)
```bash
cd cluster-agent
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export KUBECONFIG=~/.kube/config
export USER_ID=test-user
export CLUSTER_ID=test-cluster
export CLUSTER_NAME=local-test
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092

python app.py
```

### Build Docker image
```bash
docker build -t devopscopilot/cluster-agent:latest .
```

## Next Steps

1. **Backend Kafka Consumer** - Process messages by user_id
2. **WebSocket Updates** - Real-time dashboard updates
3. **Alert Rules** - Pre-configured Prometheus alert rules
4. **Grafana Dashboards** - Pre-configured cluster monitoring dashboards
5. **Log Forwarding** - Stream pod logs to Loki → Kafka

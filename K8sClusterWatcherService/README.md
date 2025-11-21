# K8s Cluster Watcher Agent

A lightweight Python agent that runs in your Kubernetes cluster to collect metrics, watch resources, and stream data to the DevOps Copilot SaaS backend.

## Overview

This agent runs as a pod in your Kubernetes cluster and provides:

- **Resource Watching**: Monitors pods, services, deployments, nodes, namespaces, and other K8s resources
- **Metrics Collection**: Collects metrics from Prometheus
- **Alert Watching**: Monitors alerts from Prometheus/Grafana
- **Event Streaming**: Streams K8s events to backend
- **API Server**: Receives commands from SaaS backend for queries and operations

## Architecture

```
┌─────────────────────────────────────────────────┐
│         Your Kubernetes Cluster                 │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │  DevOps Copilot Agent                  │    │
│  │                                          │    │
│  │  • K8s Resource Watcher                │    │
│  │  • Prometheus Metrics Collector        │    │
│  │  • Kafka Producer                      │    │
│  │  • Flask API Server                    │    │
│  └────────────────────────────────────────┘    │
│         │                           ▲           │
│         │ Watch K8s API             │           │
│         │ Query Prometheus          │ Commands  │
│         ▼                           │           │
│  ┌──────────────┐  ┌──────────────┐│           │
│  │ Kubernetes   │  │ Prometheus   ││           │
│  │ API Server   │  │ + Grafana    ││           │
│  └──────────────┘  └──────────────┘│           │
└─────────────────────────────────────┼───────────┘
                                      │
                        Kafka/HTTPS   │
                                      │
                                      ▼
                        ┌──────────────────────────┐
                        │   DevOps Copilot SaaS    │
                        │   Backend                │
                        └──────────────────────────┘
```

## Features

### Resource Watching
- Watches K8s resources in real-time using the Watch API
- Detects changes (ADDED, MODIFIED, DELETED)
- Automatically generates alerts for pod failures, deployment issues, node problems
- Streams resource data to backend via Kafka

### Metrics Collection
- Collects cluster-wide metrics from Prometheus
- Gathers pod-level metrics (CPU, memory, network)
- Collects node-level metrics (CPU, memory, disk)
- Configurable scrape interval

### Alert Watching
- Monitors firing alerts from Prometheus
- Enriches alerts with cluster context
- Streams to backend for correlation and analysis

### API Server
- Flask-based REST API for receiving commands
- Endpoints for querying pods, services, nodes
- Execute Prometheus queries
- Create Prometheus alert rules
- Get pod logs
- Restart/scale deployments

## Installation

### Prerequisites

- Kubernetes cluster (1.20+)
- Prometheus installed in cluster
- kubectl configured
- Helm 3+ (for Helm installation)

### Quick Install with kubectl

1. Create namespace:
```bash
kubectl apply -f k8s/namespace.yaml
```

2. Create service account and RBAC:
```bash
kubectl apply -f k8s/serviceaccount.yaml
```

3. Create secrets (replace with your actual values):
```bash
kubectl create secret generic devops-copilot-agent-secrets \
  --from-literal=AGENT_ID=<your-agent-id> \
  --from-literal=USER_ID=<your-user-id> \
  --from-literal=API_KEY=<your-api-key> \
  --from-literal=KAFKA_SASL_USERNAME=<kafka-username> \
  --from-literal=KAFKA_SASL_PASSWORD=<kafka-password> \
  -n devops-copilot
```

4. Create ConfigMap (customize as needed):
```bash
kubectl apply -f k8s/configmap.yaml
```

5. Deploy the agent:
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

6. Verify installation:
```bash
kubectl get pods -n devops-copilot
kubectl logs -n devops-copilot -l app=devops-copilot-agent
```

### Install with Helm

Coming soon...

## Configuration

All configuration is done via environment variables. See [.env.example](.env.example) for full list.

### Required Configuration

- `AGENT_ID`: Unique agent identifier (provided by SaaS platform)
- `USER_ID`: User identifier
- `API_KEY`: Authentication key for backend
- `BACKEND_URL`: SaaS backend URL
- `KAFKA_BOOTSTRAP_SERVERS`: Kafka broker addresses
- `KAFKA_SASL_USERNAME`: Kafka authentication username
- `KAFKA_SASL_PASSWORD`: Kafka authentication password

### Optional Configuration

- `CLUSTER_NAME`: Human-readable cluster name
- `PROMETHEUS_URL`: Prometheus server URL (default: http://prometheus:9090)
- `PROMETHEUS_SCRAPE_INTERVAL`: Metrics collection interval in seconds (default: 30)
- `WATCH_RESOURCES`: Comma-separated list of resources to watch
- `ENABLE_METRICS_COLLECTION`: Enable/disable metrics collection
- `ENABLE_EVENT_WATCHING`: Enable/disable event watching
- `LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)

## Development

### Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Create `.env` file from template:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run the agent:
```bash
python agent.py
```

### Build Docker Image

```bash
docker build -t devopscopilot/k8s-watcher-agent:latest .
```

### Testing

```bash
# Run tests (coming soon)
pytest tests/
```

## API Endpoints

The agent exposes the following REST endpoints:

### Health Check
```
GET /health
```

### Agent Info
```
GET /info
Headers: X-API-Key: <api-key>
```

### Query Pods
```
POST /query/pods
Headers: X-API-Key: <api-key>
Body: {
  "namespace": "default",
  "label_selector": "app=myapp"
}
```

### Query Services
```
POST /query/services
Headers: X-API-Key: <api-key>
Body: {
  "namespace": "default"
}
```

### Query Nodes
```
GET /query/nodes
Headers: X-API-Key: <api-key>
```

### Execute Prometheus Query
```
POST /execute/prometheus-query
Headers: X-API-Key: <api-key>
Body: {
  "query": "sum(rate(container_cpu_usage_seconds_total[5m]))"
}
```

### Get Pod Logs
```
POST /execute/pod-logs
Headers: X-API-Key: <api-key>
Body: {
  "namespace": "default",
  "pod_name": "my-pod",
  "container": "my-container",
  "tail_lines": 100
}
```

### Restart Deployment
```
POST /execute/restart-deployment
Headers: X-API-Key: <api-key>
Body: {
  "namespace": "default",
  "deployment_name": "my-deployment"
}
```

### Scale Deployment
```
POST /execute/scale-deployment
Headers: X-API-Key: <api-key>
Body: {
  "namespace": "default",
  "deployment_name": "my-deployment",
  "replicas": 3
}
```

## Security

### RBAC Permissions

The agent requires the following permissions:

- **Read-only access** to most K8s resources (pods, services, nodes, etc.)
- **Patch access** to deployments (for restart/scale operations)
- **Create/Update access** to PrometheusRules (for alert creation)

All permissions are scoped via ClusterRole. See [k8s/serviceaccount.yaml](k8s/serviceaccount.yaml) for details.

### Authentication

- Agent authenticates to backend using API key in `X-API-Key` header
- All API endpoints (except `/health`) require authentication
- ServiceAccount token is used for K8s API access

### Network Security

- Agent only makes outbound connections to:
  - Kubernetes API server (in-cluster)
  - Prometheus (in-cluster)
  - Kafka brokers (SaaS backend)
  - Backend API (SaaS backend)
- No inbound connections required (except for API server on port 8080)

## Monitoring

The agent exposes metrics on port 8080 for Prometheus scraping:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"
  prometheus.io/path: "/metrics"
```

## Troubleshooting

### Agent not starting

Check logs:
```bash
kubectl logs -n devops-copilot -l app=devops-copilot-agent
```

Common issues:
- Missing required environment variables
- Invalid API key
- Cannot connect to Kafka
- Cannot connect to Kubernetes API

### Not receiving data in backend

1. Check agent is running:
```bash
kubectl get pods -n devops-copilot
```

2. Check Kafka connectivity:
```bash
kubectl logs -n devops-copilot -l app=devops-copilot-agent | grep kafka
```

3. Verify heartbeat is being sent:
```bash
kubectl logs -n devops-copilot -l app=devops-copilot-agent | grep heartbeat
```

### High resource usage

Adjust resource limits in deployment.yaml and reduce collection frequency:
- Increase `PROMETHEUS_SCRAPE_INTERVAL`
- Reduce `WATCH_RESOURCES` list
- Disable unused features via feature flags

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/devopscopilot/agent
- Email: support@devopscopilot.com

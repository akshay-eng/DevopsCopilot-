# KubeAI Manifests

Kubernetes deployment manifests for the full KubeAI stack. Apply these to your cluster to run all infrastructure components (Kafka, MongoDB, cluster agent, network monitor, alert webhook, Prometheus).

---

## Repository Structure

```
KubeAI-Manifests/
├── kafka/                        # Kafka 3-broker cluster + Zookeeper
│   ├── zookeeper.yaml
│   ├── kafka-broker1.yaml
│   ├── kafka-broker2.yaml
│   ├── kafka-broker3.yaml
│   ├── kafka-ui.yaml             # Kafka UI (optional)
│   └── kafka-rest-proxy.yaml     # REST proxy (optional)
├── kubernetes-mongodb/           # MongoDB with persistent volume
│   ├── mongodb-pv.yaml
│   ├── mongodb-pvc.yaml
│   ├── mongodb-secrets.yaml
│   ├── mongodb-deployment-fixed.yaml
│   └── mongodb-nodeport-svc.yaml
├── cluster-agent/k8s/            # In-cluster K8s watcher agent
│   └── deployment.yaml           # Namespace, SA, RBAC, ConfigMap, Secret, Deployment
├── network-monitor/deployments/  # eBPF network monitor DaemonSet
│   └── daemonset.yaml
├── alert-webhook-service/k8s/    # Alertmanager webhook receiver
│   ├── 00-namespace.yaml
│   ├── 01-configmap.yaml
│   ├── 02-deployment.yaml
│   ├── 03-service.yaml
│   └── 05-rbac.yaml
├── k8s-configs/                  # Prometheus Helm values + misc configs
│   ├── prometheus-values.yaml    # kube-prometheus-stack Helm values
│   └── authservice-deployment.yaml
└── loki_grafana_prom_setup/      # Optional Loki + Grafana setup
    ├── prometheus/
    ├── loki/
    └── grafana/
```

---

## Prerequisites

- `kubectl` configured to reach your cluster
- `helm` v3.x (for Prometheus)
- Cluster with at least 3 nodes (for Kafka broker anti-affinity) or adjust replicas

---

## Deployment Order

Apply in this order to satisfy dependencies.

### 1. MongoDB

```bash
kubectl apply -f kubernetes-mongodb/mongodb-pv.yaml
kubectl apply -f kubernetes-mongodb/mongodb-pvc.yaml
kubectl apply -f kubernetes-mongodb/mongodb-secrets.yaml
kubectl apply -f kubernetes-mongodb/mongodb-deployment-fixed.yaml
kubectl apply -f kubernetes-mongodb/mongodb-nodeport-svc.yaml

# Verify
kubectl get pods -l app=mongodb
```

MongoDB is exposed on NodePort `32001` and internally at `mongo-nodeport-svc.default.svc.cluster.local:27017`.

Default credentials (from `mongodb-secrets.yaml`):
- Username: `adminuser`
- Password: `password123`
- Auth DB: `admin`

### 2. Kafka

```bash
kubectl create namespace kafka
kubectl apply -f kafka/zookeeper.yaml
kubectl apply -f kafka/kafka-broker1.yaml
kubectl apply -f kafka/kafka-broker2.yaml
kubectl apply -f kafka/kafka-broker3.yaml

# Verify all brokers are running
kubectl get pods -n kafka

# Optional UIs
kubectl apply -f kafka/kafka-ui.yaml
```

Kafka brokers are accessible inside the cluster at:
- `kafka-broker-1.kafka.svc.cluster.local:29092`
- `kafka-broker-2.kafka.svc.cluster.local:29093`
- `kafka-broker-3.kafka.svc.cluster.local:29094`

And externally (NodePort):
- `<node-ip>:30092`, `<node-ip>:30093`, `<node-ip>:30094`

### 3. Prometheus (kube-prometheus-stack)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

kubectl create namespace monitoring

helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --values k8s-configs/prometheus-values.yaml
```

This installs:
- Prometheus StatefulSet (NodePort `32738`)
- kube-state-metrics
- node-exporter DaemonSet (on all nodes)
- Prometheus Operator

Verify:
```bash
kubectl get pods -n monitoring
```

### 4. Cluster Agent

Edit `cluster-agent/k8s/deployment.yaml` and update:

```yaml
# In the Secret (cluster-agent-secrets):
USER_ID: "<your-mongodb-user-id>"        # from MongoDB users collection
CLUSTER_ID: "<your-mongodb-cluster-id>"  # from MongoDB clusters collection

# In the ConfigMap (cluster-agent-config):
BACKEND_URL: "http://<your-backend-ip>:5001"
```

Then apply:

```bash
kubectl apply -f cluster-agent/k8s/deployment.yaml

# Verify
kubectl get pods -n devopscopilot
kubectl logs -n devopscopilot -l app=devopscopilot-cluster-agent
```

The agent will:
- Watch all K8s resources and stream to Kafka
- Query Prometheus every 120s and stream metrics to Kafka
- Register with the backend via `BACKEND_URL/api/clusters/agent-checkin`

### 5. Network Monitor

Edit `network-monitor/deployments/daemonset.yaml` and update:

```yaml
# In the ConfigMap:
USER_ID: "<your-mongodb-user-id>"
CLUSTER_ID: "<your-mongodb-cluster-id>"
```

Then apply:

```bash
kubectl apply -f network-monitor/deployments/daemonset.yaml

# Verify (one pod per node)
kubectl get pods -n network-monitor
```

> Note: Requires `privileged: true` and capabilities `SYS_ADMIN`, `NET_ADMIN`, `BPF` for eBPF programs.

### 6. Alert Webhook Service

Edit `alert-webhook-service/k8s/01-configmap.yaml` and update Kafka/MongoDB URIs if needed.

```bash
kubectl apply -f alert-webhook-service/k8s/00-namespace.yaml
kubectl apply -f alert-webhook-service/k8s/05-rbac.yaml
kubectl apply -f alert-webhook-service/k8s/01-configmap.yaml
kubectl apply -f alert-webhook-service/k8s/02-deployment.yaml
kubectl apply -f alert-webhook-service/k8s/03-service.yaml

# Verify
kubectl get pods -n alerts
```

Configure Alertmanager to send webhooks to:
`http://alert-webhook-service.alerts.svc.cluster.local:8080/webhook/alerts`

---

## Kafka Topics

The following topics are auto-created by the cluster agent on first message. You can pre-create them for better retention control:

```bash
kubectl exec -n kafka <kafka-pod> -- kafka-topics.sh \
  --bootstrap-server localhost:29092 \
  --create --topic resources --partitions 3 --replication-factor 2

# Repeat for: metrics, k8s-events, changes, alerts, network-events, logs, heartbeats
```

---

## Configuration Reference

### Cluster Agent ConfigMap

| Key | Description | Default |
|-----|-------------|---------|
| `KAFKA_BOOTSTRAP_SERVERS` | Internal Kafka broker list | — |
| `PROMETHEUS_URL` | Prometheus URL (NodePort or internal) | `http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090` |
| `BACKEND_URL` | AuthService URL for agent check-in | — |
| `CLUSTER_NAME` | Display name for this cluster | — |
| `METRICS_INTERVAL` | Seconds between Prometheus scrapes | `120` |
| `WATCH_INTERVAL` | K8s watch stream timeout | `30` |
| `HEARTBEAT_INTERVAL` | Seconds between heartbeats | `60` |

### Alert Webhook ConfigMap

| Key | Description |
|-----|-------------|
| `MONGO_URI` | MongoDB connection string |
| `KAFKA_BROKERS` | Kafka broker list |
| `KAFKA_ALERTS_TOPIC` | Topic for alerts (default: `alerts`) |
| `PROMETHEUS_URL` | Prometheus for alert enrichment |

---

## Verifying the Full Stack

After all components are deployed:

```bash
# Check all namespaces
kubectl get pods --all-namespaces | grep -E "devopscopilot|kafka|monitoring|alerts|network-monitor"

# Check Kafka topic lag (should be near 0 for all topics)
kubectl exec -n kafka <kafka-pod> -- kafka-consumer-groups.sh \
  --bootstrap-server localhost:29092 \
  --describe --group devopscopilot-realtime-v3

# Check cluster agent logs
kubectl logs -n devopscopilot -l app=devopscopilot-cluster-agent --tail=50

# Check Prometheus targets
curl http://<node-ip>:32738/api/v1/targets | jq '.data.activeTargets | length'
```

---

## Networking Notes

- All components communicate inside the cluster via K8s DNS
- Kafka is exposed externally on NodePorts 30092–30094 (for the AuthService running outside the cluster)
- Prometheus is exposed on NodePort 32738 (used by cluster agent config `PROMETHEUS_URL`)
- MongoDB is exposed on NodePort 32001

To run the AuthService on an external machine, set `KAFKA_BOOTSTRAP_SERVERS` to `<node-ip>:30092,<node-ip>:30093,<node-ip>:30094` in the AuthService `.env`.

---

## Source Code

The application source code lives in [KubeAI](https://github.com/akshay-eng/KubeAI).

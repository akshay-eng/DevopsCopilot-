# DevOps Copilot / KubeAI — Cluster Agent Helm Chart

A **lightweight** Helm chart that installs the DevOps Copilot cluster agent on a
target cluster, plus an **optional** minimal monitoring stack. No Prometheus
Operator, no CRDs, no Grafana — only what the agent needs to work.

## What it installs

| Component | Always? | Footprint (requests) | Purpose |
|-----------|---------|----------------------|---------|
| Cluster agent (Deployment) | ✅ | 100m CPU / 256Mi | Watches K8s resources, polls metrics, publishes to Kafka |
| RBAC (ClusterRole/Binding, SA) | ✅ | — | Read-only access to cluster resources |
| Prometheus (Deployment) | optional | 100m / 256Mi | Scrapes metrics; agent + backend query it |
| kube-state-metrics (Deployment) | optional | 10m / 32Mi | `kube_*` metrics (deployments, restarts, pod info) |
| node-exporter (DaemonSet) | optional | 10m / 24Mi per node | `node_*` metrics (CPU, mem, disk, net, load) |

Container metrics (`container_*`) come from each kubelet's built-in cAdvisor — no
extra pod needed. **Total control-plane overhead with monitoring on: ~0.5 vCPU / ~600Mi**
plus a tiny node-exporter per node.

## Quick start

```bash
# Agent only (point it at an external Prometheus):
helm upgrade --install dcp ./helm/devopscopilot -n devopscopilot --create-namespace \
  --set config.kafkaBootstrapServers="broker1:9092,broker2:9092" \
  --set config.backendUrl="http://<backend-host>:5001" \
  --set config.prometheusUrl="http://<prometheus-host>:9090" \
  --set secret.userId="<mongo-user-id>" \
  --set secret.clusterId="<mongo-cluster-id>"

# Agent + bundled monitoring stack (agent auto-targets the bundled Prometheus):
helm upgrade --install dcp ./helm/devopscopilot -n devopscopilot --create-namespace \
  --set config.kafkaBootstrapServers="broker1:9092" \
  --set config.backendUrl="http://<backend-host>:5001" \
  --set secret.userId="<id>" --set secret.clusterId="<id>" \
  --set monitoring.enabled=true
```

## Agent delivery modes

- **`agent.mode=image`** (default) — uses a prebuilt image. Lightest at runtime.
  Build & push once:
  ```bash
  ./helm/devopscopilot/build-and-push.sh ak3hay/devopscopilot-cluster-agent latest
  ```
- **`agent.mode=bundled`** — ships the agent source in a ConfigMap and `pip install`s
  deps in an init container at startup. **No image build / no registry needed.**
  ```bash
  helm upgrade --install dcp ./helm/devopscopilot -n devopscopilot --create-namespace \
    --set agent.mode=bundled --set monitoring.enabled=true ...
  ```

## Keeping it small

- Monitoring is **off by default** — enable only if the cluster has no Prometheus.
- Prometheus uses `emptyDir` + `12h` retention by default (set
  `monitoring.prometheus.persistence.enabled=true` for a PVC).
- `monitoring.prometheus.trimMetrics=true` keeps only the `container_*` series the
  app actually queries, shrinking the TSDB.
- Grafana and Alertmanager are intentionally **not** included.

## Common values

| Key | Default | Notes |
|-----|---------|-------|
| `agent.mode` | `image` | `image` or `bundled` |
| `agent.image.repository` | `ak3hay/devopscopilot-cluster-agent` | your registry/repo |
| `config.kafkaBootstrapServers` | `""` | **required** |
| `config.backendUrl` | `""` | **required** |
| `config.prometheusUrl` | `""` | auto-set to bundled Prometheus if `monitoring.enabled` |
| `secret.userId` / `secret.clusterId` | `""` | **required** (from onboarding) |
| `secret.existingSecret` | `""` | use a pre-created secret instead |
| `monitoring.enabled` | `false` | install Prometheus + exporters |
| `monitoring.prometheus.retention` | `12h` | TSDB retention |
| `monitoring.prometheus.service.type` | `ClusterIP` | set `NodePort` + `nodePort` to expose |

## Uninstall

```bash
helm uninstall dcp -n devopscopilot
```

# KubeAI — AI-Powered Kubernetes Operations Platform

KubeAI is a real-time Kubernetes observability and AIOps platform. It monitors your cluster via an in-cluster agent, streams events through Kafka, and surfaces them in a React dashboard with live alerts, metrics charts, pod logs, network topology, and an AI assistant.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                       │
│                                                                 │
│  ┌─────────────────┐   ┌──────────────────┐   ┌─────────────┐  │
│  │  Cluster Agent  │   │  Network Monitor │   │  Prometheus │  │
│  │  (Python/Flask) │   │  (eBPF DaemonSet)│   │  + kube-    │  │
│  │                 │   │                  │   │  state-     │  │
│  │ • Watches pods/ │   │ • L4/L7 traffic  │   │  metrics    │  │
│  │   deployments/  │   │ • Service graph  │   │             │  │
│  │   events        │   │ • eBPF probes    │   └──────┬──────┘  │
│  │ • Collects      │   │                  │          │          │
│  │   Prometheus    │   └────────┬─────────┘          │          │
│  │   metrics       │            │                    │          │
│  └────────┬────────┘            │          ┌─────────┘          │
│           │                     │          │  (query)            │
│           └──────────┬──────────┘          │                    │
│                      │ Kafka (3-broker)     │                    │
│                      │                      │                    │
│   Topics: resources, metrics, k8s-events,  │                    │
│           changes, alerts, network-events,  │                    │
│           logs, heartbeats                  │                    │
└──────────────────────┼──────────────────────┼────────────────────┘
                       │                      │
              ┌────────▼──────────────────────▼────────┐
              │           AuthService (Node.js)         │
              │                                         │
              │  • REST API (Express)                   │
              │  • Kafka consumer (KafkaJS)             │
              │  • Socket.IO real-time broadcast        │
              │  • Prometheus proxy (/api/metrics/pod)  │
              │  • MongoDB persistence                  │
              │  • JWT authentication                   │
              │  • Alert enrichment & correlation       │
              └────────────────┬────────────────────────┘
                               │ HTTP + WebSocket
              ┌────────────────▼────────────────────────┐
              │           React Frontend                 │
              │                                         │
              │  • Redux store (resources, metrics,      │
              │    alerts, changes)                     │
              │  • Socket.IO client                     │
              │  • Live CPU/Memory charts               │
              │  • Pod logs viewer                      │
              │  • Network dependency graph             │
              │  • Alert timeline & correlation         │
              │  • HolmesGPT AI assistant               │
              └─────────────────────────────────────────┘
```

### Components

| Component | Language | Role |
|-----------|----------|------|
| `cluster-agent` | Python (Flask) | In-cluster K8s watcher + Prometheus metrics collector |
| `network-monitor` | Go (eBPF) | DaemonSet capturing L4/L7 network flows |
| `alert-webhook-service` | Node.js | Receives Alertmanager webhooks, enriches and publishes alerts |
| `authService` | Node.js (Express) | Backend API, Kafka consumer, Socket.IO, JWT auth |
| `frontend` | React (Redux, Recharts) | Dashboard UI |
| Kafka | Apache Kafka (3-broker) | Event bus between agent and backend |
| MongoDB | MongoDB | Persistence for users, alerts, clusters, network traffic |
| Prometheus + kube-prometheus-stack | Prometheus | Metrics scraping (cAdvisor, kube-state-metrics, node-exporter) |

---

## Data Flow

1. **Cluster Agent** watches all K8s resources (pods, deployments, events, configmaps, secrets, statefulsets, daemonsets) and publishes to Kafka topics: `resources`, `k8s-events`, `changes`, `heartbeats`, `metrics`
2. **Cluster Agent** queries Prometheus every 120 s and publishes CPU/memory/network/disk metrics to Kafka `metrics` topic
3. **Network Monitor** (eBPF) captures TCP/HTTP flows on each node and publishes to Kafka `network-events`
4. **Alert Webhook Service** receives Alertmanager POST webhooks, enriches them with Prometheus data, and publishes to Kafka `alerts`
5. **AuthService** Kafka consumer routes each topic to its handler:
   - `resources` → Socket.IO `resource-update`
   - `metrics` → Socket.IO `metrics-update` → Redux `metricsSlice.timeSeries`
   - `alerts` → MongoDB + Socket.IO `alert`
   - `changes` → MongoDB `K8sChange` + Socket.IO `k8s-change`
   - `network-events` → MongoDB `NetworkTraffic` + Socket.IO `network-traffic`
6. **Frontend** receives Socket.IO events → Redux store → live charts, logs, alert timeline

---

## Prerequisites

- Node.js 18+
- npm 9+
- A running Kubernetes cluster (kubeconfig configured)
- Kafka (can use the provided K8s manifests)
- MongoDB (can use the provided K8s manifests)
- kubectl configured to reach your cluster

---

## Quick Start (Local Development)

### 1. Clone the repo

```bash
git clone https://github.com/akshay-eng/KubeAI.git
cd KubeAI
```

### 2. Configure AuthService

```bash
cd authService
cp .env.example .env   # edit with your values
```

Required `.env` values:

```env
PORT=5001
NODE_ENV=development
MONGO_URI=mongodb://<user>:<pass>@<host>:27017/admin
JWT_SECRET=<your-secret>
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
KAFKA_BOOTSTRAP_SERVERS=<kafka-host>:9092
PROMETHEUS_URL=http://<prometheus-host>:9090
FROM_EMAIL=noreply@yourdomain.com
RESEND_API_KEY=<resend-api-key>
```

### 3. Start AuthService

```bash
cd authService
npm install
node server.js
# Runs on http://localhost:5001
```

### 4. Start Frontend

```bash
cd frontend
npm install
npm start
# Opens http://localhost:3000
```

### 5. Deploy In-Cluster Components

Apply the manifests from [KubeAI-Manifests](https://github.com/akshay-eng/KubeAI-Manisfests) to your cluster — see that repo's README for step-by-step instructions.

---

## Environment Variables Reference

### AuthService (`authService/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default: 5001) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `KAFKA_BOOTSTRAP_SERVERS` | Comma-separated Kafka broker addresses |
| `PROMETHEUS_URL` | Prometheus base URL for metrics proxy |
| `FROM_EMAIL` | Sender address for email verification |
| `RESEND_API_KEY` | Resend.com API key for transactional email |

### Cluster Agent (K8s ConfigMap / environment)

| Variable | Description |
|----------|-------------|
| `KAFKA_BOOTSTRAP_SERVERS` | Internal Kafka broker DNS |
| `PROMETHEUS_URL` | Prometheus URL (NodePort or internal DNS) |
| `BACKEND_URL` | AuthService URL for agent check-in |
| `USER_ID` | MongoDB user ID for the cluster owner |
| `CLUSTER_ID` | MongoDB cluster document ID |
| `METRICS_INTERVAL` | Prometheus scrape interval in seconds (default: 120) |
| `WATCH_INTERVAL` | K8s watch timeout in seconds (default: 30) |

---

## Project Structure

```
KubeAI/
├── authService/          # Node.js backend (API + Kafka consumer + Socket.IO)
│   ├── api/              # Express route handlers
│   ├── kafka/            # Kafka consumer (consumer.js)
│   ├── middleware/       # Auth, validation
│   ├── models/           # Mongoose schemas
│   ├── services/         # kubernetesService.js (kubectl proxy)
│   └── server.js         # Entry point
├── frontend/             # React dashboard
│   ├── src/
│   │   ├── components/   # Page and UI components
│   │   ├── redux/        # Redux store, slices (resources, metrics, alerts)
│   │   ├── services/     # API client functions
│   │   └── context/      # Theme context
├── cluster-agent/        # Python Flask in-cluster watcher
│   ├── app.py            # Main agent (watchers + Kafka producer)
│   └── prometheus_collector.py
├── network-monitor/      # Go eBPF network monitor
│   ├── cmd/              # Main entry point
│   ├── pkg/              # BPF programs, Kafka producer
│   └── bpf/              # eBPF C programs
└── alert-webhook-service/ # Node.js Alertmanager webhook receiver
    ├── server.js
    └── services/
```

---

## Key Features

- **Live resource view** — pods, deployments, services, configmaps across all namespaces
- **Real-time metrics** — CPU, memory, network, disk charts (Prometheus → Kafka → Socket.IO → Redux)
- **Pod logs** — fetch last N lines directly via K8s API
- **Alert timeline** — Alertmanager alerts with automatic root-cause correlation to recent K8s changes
- **Network topology** — eBPF-captured L4/L7 service dependency graph
- **Change tracker** — diffs for deployments, configmaps, secrets with image-change detection
- **HolmesGPT** — AI assistant for cluster troubleshooting

---

## License

MIT

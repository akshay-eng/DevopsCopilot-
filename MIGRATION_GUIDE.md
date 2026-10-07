# DevOps Copilot — Project Overview & Migration Guide

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Services & Components](#2-services--components)
3. [Infrastructure Dependencies](#3-infrastructure-dependencies)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [Port Map](#5-port-map)
6. [Data Stores & Schemas](#6-data-stores--schemas)
7. [Kafka Topics](#7-kafka-topics)
8. [Docker Compose Files](#8-docker-compose-files)
9. [Kubernetes Manifests](#9-kubernetes-manifests)
10. [Step-by-Step Migration Checklist](#10-step-by-step-migration-checklist)

---

## 1. Architecture Overview

```
                          ┌─────────────────────────────────────────┐
                          │           Kubernetes (K3s)               │
                          │  192.168.1.5                             │
                          │                                          │
                          │  ┌──────────┐  ┌─────────────────────┐  │
                          │  │  Kafka   │  │   Alert Webhook Svc │  │
                          │  │ :30092-4 │  │   (Node.js) :8080   │  │
                          │  └────┬─────┘  └──────────┬──────────┘  │
                          │       │                    │             │
                          │  ┌────┴───────────────────┴──┐          │
                          │  │     Cluster Agent (Python) │          │
                          │  │     Flask :8080            │          │
                          │  └────────────────────────────┘          │
                          │  ┌───────────────────────────────┐        │
                          │  │ Prometheus :32738 / MongoDB   │        │
                          │  │ :32001                        │        │
                          │  └───────────────────────────────┘        │
                          └─────────────────────────────────────────┘
                                           │  Kafka, REST, WS
                          ┌────────────────▼──────────────────────────┐
                          │          AuthService (Node.js) :5001       │
                          │  Express + Socket.io + KafkaJS             │
                          │  Reads: MongoDB, ClickHouse, Kafka         │
                          └────────────────┬──────────────────────────┘
                                           │  HTTP/WebSocket
         ┌──────────────────┬──────────────▼───────────────────────────────┐
         │                  │                                               │
         ▼                  ▼                                               ▼
  Frontend (React)   Deep Agent (Python)                        Correlation Engine (Python)
  :3000              FastAPI :5005                               Flask :5005
                     LangChain/LangGraph                        scikit-learn, networkx
                     Anthropic + OpenAI

Other Services (run locally / as needed):
  - AgentOps Backend (FastAPI) :8000     ← agent telemetry
  - ITSM Agent (Python Flask)            ← ServiceNow integration
  - ServiceNow MCP Server (Python)       ← MCP protocol
  - Kubernetes MCP Server (Go)           ← MCP protocol
  - Network Monitor (Go/eBPF DaemonSet)  ← TCP packet capture
  - Milvus Vector DB (Docker Compose)    ← semantic search
```

**Data Flow:**
1. Kubernetes → Cluster Agent watches pods/events/metrics
2. Cluster Agent → Kafka topics (alerts, k8s-events, metrics, logs, changes)
3. AlertManager → Alert Webhook Service → Kafka (`alerts`, `alert-enrichments`)
4. AuthService consumes Kafka → stores in MongoDB, streams via WebSocket
5. Frontend subscribes to WebSocket for real-time dashboard
6. Deep Agent / Correlation Engine query MongoDB/Prometheus on demand

---

## 2. Services & Components

### 2.1 Frontend
| Item | Value |
|------|-------|
| Path | `frontend/` |
| Language | JavaScript / React 19 |
| Framework | React Router 7, Redux Toolkit, TanStack Query |
| Build | `npm run build` |
| Dev server | `npm start` → port **3000** |
| Docker base | `node:20` (multi-stage) |
| Key .env | `REACT_APP_API_URL`, `REACT_APP_FRONTEND_URL` |

Notable libraries: Socket.io-client, Recharts, Three.js, Monaco Editor, Framer Motion.

---

### 2.2 AuthService
| Item | Value |
|------|-------|
| Path | `authService/` |
| Language | Node.js / Express 4.18 |
| Entry point | `server.js` |
| Port | **5001** |
| Docker base | `node:20-alpine` |
| Key dependencies | mongoose, socket.io, kafkajs, @kubernetes/client-node, @clickhouse/client, pg, bcryptjs, jsonwebtoken, resend, aws-sdk |

**API route groups:**
- `/api/auth` — register, login, JWT refresh
- `/api/cluster` — cluster CRUD + agent install scripts
- `/api/onboarding` — guided setup
- `/api/resources` — K8s resource proxy
- `/api/integrations` — 3rd-party integrations (ServiceNow, AWS, etc.)
- `/api/alerts` — alert read/acknowledge
- `/api/agentops` — AgentOps projects/sessions
- `/api/network` — network events/connections
- `/api/mcp-catalog` — MCP server registry
- `/api/timeline` — change timeline
- `/api/agent` — AI agent management
- `/api/correlation` — alert correlation proxy
- `/api/pipeline` — pipeline management

**WebSocket (Socket.io):** streams alerts, logs, resource changes to the frontend in real time.

---

### 2.3 Cluster Agent
| Item | Value |
|------|-------|
| Path | `cluster-agent/` |
| Language | Python 3.11 / Flask 3.0 |
| Entry point | `app.py` |
| Port | **8080** |
| Docker base | `python:3.11-slim` |
| Key dependencies | kubernetes, confluent-kafka, flask, prometheus-client, requests |

Deploys inside the K3s cluster. Watches pods/deployments/events and periodically publishes to Kafka. Contains `PrometheusCollector` for metric scraping, and an in-memory generation tracker for diff-based change detection.

---

### 2.4 Deep Agent
| Item | Value |
|------|-------|
| Path | `deep-agent/` |
| Language | Python / FastAPI |
| Entry point | `app/main.py` |
| Port | **5005** |
| Key dependencies | langchain, langchain-anthropic, langchain-openai, langgraph |

AI-powered cluster troubleshooting agent. Calls Prometheus and the AuthService for context, then uses LLM (Claude or GPT-4o) to diagnose issues.

---

### 2.5 Correlation Engine
| Item | Value |
|------|-------|
| Path | `correlation-engine/` |
| Language | Python / Flask 3.1 |
| Entry point | `app.py` |
| Port | **5005** |
| Key dependencies | pymongo, numpy, scikit-learn, networkx, gunicorn |

Performs ML-based alert clustering, anomaly detection, and graph-based root-cause analysis. Fetches alerts from MongoDB / AuthService on demand.

---

### 2.6 Alert Webhook Service
| Item | Value |
|------|-------|
| Path | `alert-webhook-service/` |
| Language | Node.js / Express 4.18 |
| Entry point | `server.js` |
| Port | **8080** |
| Docker base | `node:18-alpine` |
| K8s namespace | `alerts` |
| Replicas | 2 |

Receives Alertmanager webhooks, enriches alerts with K8s and Prometheus context, then produces to Kafka `alerts` and `alert-enrichments` topics.

---

### 2.7 Network Monitor
| Item | Value |
|------|-------|
| Path | `network-monitor/` |
| Language | Go + eBPF (C) |
| Entry point | `cmd/main.go` |
| K8s type | DaemonSet (privileged) |
| Key files | `bpf/packet_capture.bpf.c`, `deployments/daemonset.yaml` |

TC hooks capture TCP traffic at kernel level; filters HTTP flows; sends events to Kafka `network-events` topic. Requires a Linux kernel with eBPF support (≥ 5.4).

---

### 2.8 AgentOps Backend
| Item | Value |
|------|-------|
| Path | `agentops/` |
| Language | Python / FastAPI |
| Entry point | `run.py` |
| Port | **8000** |
| Start script | `agentops/start-local.sh` |
| Compose file | `docker-compose.agentops.yml` |

Receives OTEL traces from SDKs, stores them in ClickHouse; manages projects/sessions in PostgreSQL. Acts as an OpenTelemetry-compatible observability backend.

---

### 2.9 ITSM Agent
| Item | Value |
|------|-------|
| Path | `Itsm-agent/` |
| Language | Python / Flask |
| Entry point | `agent.py` |
| Key dependencies | flask, langchain, langchain-google-genai, pymilvus, sentence-transformers |

Handles incident and change management via ServiceNow. Uses Milvus for vector similarity search over historical incidents.

---

### 2.10 ServiceNow MCP Server
| Item | Value |
|------|-------|
| Path | `servicenow-mcp/` |
| Language | Python 3.8+ |
| Entry point | `servicenow-mcp.py` |
| Package | `mcp_server_servicenow` |
| Key dependencies | mcp≥1.0, httpx, pydantic |

Exposes ServiceNow operations as MCP tools for Claude/other LLM agents.

---

### 2.11 Kubernetes MCP Server
| Item | Value |
|------|-------|
| Path | `kubernetes-mcp-server/` |
| Language | Go |
| Entry point | `cmd/main.go` |
| CI/CD | GitHub Actions (`.github/workflows/`) |
| Helm chart | `charts/` |

Exposes Kubernetes cluster operations as MCP tools. Published to Quay (`quay.io/containers/kubernetes_mcp_server`) and GHCR.

---

## 3. Infrastructure Dependencies

### 3.1 Kafka
- **Cluster:** 3 brokers running in K3s
- **NodePort addresses:** `192.168.1.5:30092`, `:30093`, `:30094`
- **Internal addresses:** `kafka-broker-X.kafka.svc.cluster.local:29092-29094`
- **Protocol:** PLAINTEXT (dev) / SASL_PLAIN (admin/Kafka@123)
- **Manifests:** `Kafka/kafka-broker1.yaml`, `kafka-broker2.yaml`, `kafka-broker3.yaml`
- **Supporting:** Zookeeper, Kafka REST Proxy, Kafka UI

### 3.2 MongoDB
- **Running in:** K3s via StatefulSet
- **NodePort:** `192.168.1.5:32001`
- **Connection string:** `mongodb://adminuser:password123@<HOST>:32001/devopscopilot?authSource=admin`
- **Manifests:** `kubernetes-mongodb/`

### 3.3 PostgreSQL (AgentOps)
- **Running via:** Docker Compose (`docker-compose.agentops.yml`)
- **Host port:** `5433` (container: 5432)
- **Database:** `agentops`
- **Credentials:** `agentops / agentops_secret`

### 3.4 ClickHouse
- **Running via:** Docker Compose (`opentelemetry-collector-clickhouse-1`)
- **Port:** `8123` (HTTP), `9000` (native)
- **Credentials:** `default / password`
- **Database/table:** `otel_2.otel_traces`
- **Used by:** AuthService (`@clickhouse/client`) for AgentOps trace queries

### 3.5 Milvus Vector DB
- **Compose file:** `docker-compose.yml`
- **Port:** `19530` (data), `9091` (metrics)
- **Dependencies:** etcd (`:2379`), MinIO (`:9000`/`:9001`)

### 3.6 Prometheus
- **Running in:** K3s (kube-prometheus-stack)
- **NodePort:** `192.168.1.5:32738`

### 3.7 OTEL Collector
- **Running via:** `docker-compose.agentops.yml`
- **OTLP HTTP port:** `4318`
- **Routes:** SDK traces → ClickHouse

### 3.8 AlertManager
- **Running in:** K3s (part of kube-prometheus-stack)
- **Webhook target:** `http://<HOST>:5001/api/webhook/alerts`
- **Config:** `alertmanager-local-config.yaml`, `k8s-configs/alertmanager-config.yaml`

---

## 4. Environment Variables Reference

### AuthService (`authService/.env`)
```env
PORT=5001
NODE_ENV=development

# MongoDB
MONGO_DB_URI=mongodb://adminuser:password123@<MONGO_HOST>:32001/devopscopilot?authSource=admin

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
JWT_EXPIRES_IN=24h
INTEGRATION_ENCRYPTION_KEY=<32-byte-hex-key>

# Kafka
KAFKA_BOOTSTRAP_SERVERS=<KAFKA_HOST>:30092,<KAFKA_HOST>:30093,<KAFKA_HOST>:30094
KAFKA_LOG_CONSUMER_GROUP=devopscopilot-logs-v1

# External services
PROMETHEUS_URL=http://<PROMETHEUS_HOST>:32738
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourdomain.com
FRONTEND_URL=http://localhost:3000

# AgentOps
AGENTOPS_API_URL=http://localhost:8000
AGENTOPS_SERVICE_TOKEN=dev-service-token-12345
AGENTOPS_DB_HOST=localhost
AGENTOPS_DB_PORT=5433
AGENTOPS_DB_NAME=agentops
AGENTOPS_DB_USER=agentops
AGENTOPS_DB_PASSWORD=agentops_secret

# ClickHouse
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=password
CLICKHOUSE_DATABASE=otel_2
```

### Frontend (`frontend/.env`)
```env
REACT_APP_API_URL=http://<AUTHSERVICE_HOST>:5001
REACT_APP_FRONTEND_URL=http://localhost:3000
```

### Cluster Agent (`cluster-agent/.env`)
```env
USER_ID=<MONGODB_USER_ID>
CLUSTER_ID=<MONGODB_CLUSTER_ID>
CLUSTER_NAME=<YOUR_CLUSTER_NAME>
KAFKA_BOOTSTRAP_SERVERS=<KAFKA_HOST>:30092,<KAFKA_HOST>:30093,<KAFKA_HOST>:30094
PROMETHEUS_URL=http://<PROMETHEUS_HOST>:32738
WATCH_INTERVAL=30
HEARTBEAT_INTERVAL=60
METRICS_INTERVAL=120
LOG_LEVEL=INFO
```

### Deep Agent (`deep-agent/.env`)
```env
DEFAULT_MODEL_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514
OPENAI_MODEL=gpt-4o
PROMETHEUS_URL=http://<PROMETHEUS_HOST>:32738
AUTH_SERVICE_URL=http://localhost:5001
ENABLE_WRITE_TOOLS=true
```

### Correlation Engine (`correlation-engine/.env`)
```env
PORT=5005
MONGO_DB_URI=mongodb://adminuser:password123@<MONGO_HOST>:32001/devopscopilot?authSource=admin
PROMETHEUS_URL=http://<PROMETHEUS_HOST>:32738
AUTH_SERVICE_URL=http://localhost:5001
ANOMALY_BASELINE_HOURS=24
CLUSTER_TIME_WINDOW_MINUTES=5
```

### Alert Webhook Service (K8s ConfigMap)
```env
MONGO_URI=mongodb://adminuser:password123@<MONGO_HOST>:32001/admin
KAFKA_BROKERS=<KAFKA_HOST>:30092,<KAFKA_HOST>:30093,<KAFKA_HOST>:30094
KAFKA_CLIENT_ID=alert-webhook-service
KAFKA_ALERTS_TOPIC=alerts
KAFKA_ENRICHMENTS_TOPIC=alert-enrichments
PROMETHEUS_URL=http://prometheus-kube-prometheus-prometheus.default.svc:9090
PORT=8080
NODE_ENV=production
```

### AgentOps Backend (`docker-compose.agentops.yml`)
```env
DATABASE_URL=postgresql://agentops:agentops_secret@agentops-postgres:5432/agentops
JWT_SECRET_KEY=<secret>
AUTH_COOKIE_SECRET=<secret>
CORS_ORIGINS=http://localhost:3000,http://localhost:5000
```

---

## 5. Port Map

| Service | Port | Notes |
|---------|------|-------|
| Frontend (dev) | 3000 | React dev server |
| AuthService | 5001 | HTTP + Socket.io WS |
| Deep Agent | 5005 | FastAPI |
| Correlation Engine | 5005 | Flask (same port — don't run both at once) |
| AgentOps API | 8000 | FastAPI |
| Cluster Agent | 8080 | Flask |
| Alert Webhook | 8080 | Express (in K8s, not local) |
| OTEL Collector (OTLP) | 4318 | HTTP protobuf |
| MongoDB (NodePort) | 32001 | K3s NodePort |
| Prometheus (NodePort) | 32738 | K3s NodePort |
| Kafka broker 1 (NodePort) | 30092 | K3s NodePort |
| Kafka broker 2 (NodePort) | 30093 | K3s NodePort |
| Kafka broker 3 (NodePort) | 30094 | K3s NodePort |
| PostgreSQL (AgentOps) | 5433 | Docker host-mapped |
| ClickHouse HTTP | 8123 | Docker |
| Milvus | 19530 | Docker |
| MinIO data | 9000 | Docker |
| MinIO console | 9001 | Docker |
| etcd | 2379 | Docker |

---

## 6. Data Stores & Schemas

### MongoDB (`devopscopilot` database)
- **users** — registered users
- **clusters** — registered K8s clusters (stores `USER_ID`, `CLUSTER_ID`)
- **alerts** — alert history
- **resources** — K8s resource snapshots
- **integrations** — 3rd-party integration credentials (AES-256-GCM encrypted)
- **timelines** — change events with before/after diffs
- **agents** — AI agent definitions
- **mcpcatalogs** — MCP server registry
- **pipelines** — CI/CD pipeline records

### PostgreSQL (`agentops` database)
- **projects** — AgentOps projects with UUID API keys (no `created_at` column)
- **sessions** — agent session records

### ClickHouse (`otel_2.otel_traces`)
Column highlights:
- `TraceId`, `SpanId`, `ParentSpanId`
- `SpanName` — e.g. `default.session`, `openai.chat.completion`, `tool_call.*`
- `ResourceAttributes` — map including `agentops.project.id`
- `SpanAttributes` — map including `gen_ai.usage.*`, `agentops.session.end_state`

---

## 7. Kafka Topics

| Topic | Producer | Consumer(s) | Content |
|-------|----------|-------------|---------|
| `alerts` | Cluster Agent, Alert Webhook Svc | AuthService | Prometheus/K8s alerts |
| `alert-enrichments` | Alert Webhook Svc | AuthService | Enriched alert context |
| `k8s-events` | Cluster Agent | AuthService | Kubernetes events |
| `resources` | Cluster Agent | AuthService | K8s resource state |
| `metrics` | Cluster Agent | AuthService | Prometheus metrics |
| `heartbeats` | Cluster Agent | AuthService | Agent health pings |
| `logs` | Cluster Agent | AuthService | Pod log lines |
| `changes` | Cluster Agent | AuthService | Resource change diffs |
| `network-events` | Network Monitor | AuthService | TCP/HTTP flow events |

**Consumer groups:**
- `devopscopilot-realtime-v3` — main consumer (everything except network)
- `devopscopilot-network-v1` — dedicated network-events consumer
- `devopscopilot-alert-consumer` — alert consumer

> **Important:** KafkaJS multi-topic consumers can starve high-volume topics. The `network-events` consumer uses a **separate KafkaJS instance** with a different `clientId` (`devopscopilot-net-consumer`) to prevent starvation.

---

## 8. Docker Compose Files

### `docker-compose.yml` — Milvus Stack
Starts: **etcd** (`:2379`), **MinIO** (`:9000/:9001`), **Milvus standalone** (`:19530/:9091`)

```bash
docker compose up -d
```

### `docker-compose.agentops.yml` — AgentOps Stack
Starts: **agentops-postgres** (`:5433`), **OTEL Collector** (`:4318`), **AgentOps API** (`:8000`)

```bash
docker compose -f docker-compose.agentops.yml up -d
```

---

## 9. Kubernetes Manifests

### `k8s-configs/`
| File | Purpose |
|------|---------|
| `authservice-deployment.yaml` | AuthService Deployment + Service |
| `alertmanager-config.yaml` | AlertManager ConfigMap (namespace: monitoring) |

### `alert-webhook-service/k8s/`
| File | Purpose |
|------|---------|
| `00-namespace.yaml` | `alerts` namespace |
| `01-configmap.yaml` | Service env config |
| `02-deployment.yaml` | 2-replica Deployment |
| `03-service.yaml` | ClusterIP :8080 |
| `04-alertmanager-config.yaml` | Webhook receiver config |
| `05-rbac.yaml` | ServiceAccount + RBAC |
| `mongodb-deployment.yaml` | MongoDB StatefulSet |
| `custom-crashloop-alert.yaml` | CrashLoopBackOff PrometheusRule |

### `Kafka/`
- `kafka-broker1.yaml`, `kafka-broker2.yaml`, `kafka-broker3.yaml` — broker StatefulSets
- `zookeeper.yaml` — Zookeeper
- `kafka-rest-proxy.yaml` — REST Proxy
- `kafka-ui.yaml` — Kafka UI

### `kubernetes-mongodb/`
- `mongodb-deployment-fixed.yaml`, `mongodb-pv.yaml`, `mongodb-pvc.yaml`
- `mongodb-secrets.yaml`, `mongodb-nodeport-svc.yaml`

### `network-monitor/deployments/`
- `daemonset.yaml` — privileged DaemonSet with eBPF capabilities

---

## 10. Step-by-Step Migration Checklist

### Phase 1: Prerequisites on New Host

- [ ] Linux kernel ≥ 5.4 (for eBPF network monitor)
- [ ] Docker + Docker Compose installed
- [ ] kubectl + helm installed
- [ ] A Kubernetes cluster (K3s recommended: `curl -sfL https://get.k3s.io | sh -`)
- [ ] Node.js 20, Python 3.11, Go 1.22 installed (for local dev without Docker)
- [ ] Note the new host's IP address — replace `192.168.1.5` everywhere

---

### Phase 2: Update IP/Hostname References

Search and replace `192.168.1.5` with the new host IP across:

```bash
grep -r "192.168.1.5" . --include="*.js" --include="*.py" --include="*.yaml" --include="*.yml" --include="*.env" --include="*.json" -l
```

Key files to update:
- `authService/.env` — `MONGO_DB_URI`, `KAFKA_BOOTSTRAP_SERVERS`, `PROMETHEUS_URL`
- `cluster-agent/.env` — `KAFKA_BOOTSTRAP_SERVERS`, `PROMETHEUS_URL`
- `correlation-engine/.env` — `MONGO_DB_URI`, `PROMETHEUS_URL`
- `deep-agent/.env` — `PROMETHEUS_URL`
- `alert-webhook-service/k8s/01-configmap.yaml` — `MONGO_URI`, `KAFKA_BROKERS`
- `k8s-configs/alertmanager-config.yaml` — webhook URL
- `alertmanager-local-config.yaml` — webhook URL

---

### Phase 3: Start Infrastructure (Docker Compose)

```bash
# 1. Milvus stack (needed only if using ITSM agent's vector search)
docker compose up -d

# 2. AgentOps stack (needed if using AgentOps features)
docker compose -f docker-compose.agentops.yml up -d

# Verify all containers are healthy
docker compose ps
docker compose -f docker-compose.agentops.yml ps
```

Wait for PostgreSQL to be ready before continuing.

---

### Phase 4: Deploy Kubernetes Infrastructure

```bash
# MongoDB
kubectl apply -f kubernetes-mongodb/mongodb-pv.yaml
kubectl apply -f kubernetes-mongodb/mongodb-pvc.yaml
kubectl apply -f kubernetes-mongodb/mongodb-secrets.yaml
kubectl apply -f kubernetes-mongodb/mongodb-deployment-fixed.yaml
kubectl apply -f kubernetes-mongodb/mongodb-nodeport-svc.yaml

# Kafka (in order)
kubectl apply -f Kafka/zookeeper.yaml
kubectl wait --for=condition=ready pod -l app=zookeeper --timeout=120s
kubectl apply -f Kafka/kafka-broker1.yaml
kubectl apply -f Kafka/kafka-broker2.yaml
kubectl apply -f Kafka/kafka-broker3.yaml
kubectl wait --for=condition=ready pod -l app=kafka --timeout=120s

# Verify NodePorts are reachable from host
nc -zv <NEW_HOST_IP> 30092
```

---

### Phase 5: Create Kafka Topics

```bash
# Exec into any Kafka broker pod
kubectl exec -it <kafka-broker-pod> -- bash

# Create required topics
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic alerts --partitions 3 --replication-factor 2
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic alert-enrichments --partitions 3 --replication-factor 2
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic k8s-events --partitions 3 --replication-factor 2
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic resources --partitions 3 --replication-factor 2
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic metrics --partitions 3 --replication-factor 2
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic heartbeats --partitions 1 --replication-factor 1
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic logs --partitions 3 --replication-factor 2
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic changes --partitions 3 --replication-factor 2
kafka-topics.sh --bootstrap-server localhost:9092 --create --topic network-events --partitions 3 --replication-factor 2
```

---

### Phase 6: Start Backend Services

```bash
# AuthService
cd authService
cp .env.example .env   # edit with new IPs and secrets
npm install
npm start

# Correlation Engine (optional — only if using alert correlation)
cd correlation-engine
pip install -r requirements.txt
python app.py

# Deep Agent (optional — only if using AI troubleshooting)
cd deep-agent
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 5005
```

---

### Phase 7: Deploy Cluster Agent to K8s

The cluster agent runs **inside** the Kubernetes cluster.

```bash
# Update cluster-agent/.env with new values (or build a new ConfigMap/Secret)
# Then deploy via the provided script or manually:
cd cluster-agent
# Update CLUSTER_ID and USER_ID to match your new MongoDB records
# (Create a cluster in the UI first to get the CLUSTER_ID)

docker build -t <your-registry>/cluster-agent:latest .
docker push <your-registry>/cluster-agent:latest

# Deploy (update image in the deploy script first)
./deploy.sh
```

---

### Phase 8: Deploy Alert Webhook Service

```bash
kubectl apply -f alert-webhook-service/k8s/00-namespace.yaml
kubectl apply -f alert-webhook-service/k8s/01-configmap.yaml   # ← edit IPs first
kubectl apply -f alert-webhook-service/k8s/05-rbac.yaml
kubectl apply -f alert-webhook-service/k8s/02-deployment.yaml
kubectl apply -f alert-webhook-service/k8s/03-service.yaml
```

---

### Phase 9: Configure AlertManager

```bash
# Update the webhook URL in alertmanager-local-config.yaml
# Then apply to the monitoring namespace
kubectl apply -f k8s-configs/alertmanager-config.yaml
```

---

### Phase 10: Start Frontend

```bash
cd frontend
cp .env.example .env   # set REACT_APP_API_URL=http://<AUTHSERVICE_HOST>:5001
npm install
npm start           # dev
# OR
npm run build       # production build → serve dist/ with nginx/caddy
```

---

### Phase 11: Register Your Cluster in the UI

1. Open `http://localhost:3000`, register/login
2. Go to **Clusters** → **Add Cluster**
3. Copy the generated install script (it contains the correct `USER_ID` and `CLUSTER_ID`)
4. Run the install script on any machine with `kubectl` access to the target cluster
   (or set `CLUSTER_ID` manually in `cluster-agent/.env`)

---

### Phase 12: Verify Everything

```bash
# Auth service health
curl http://localhost:5001/health

# Kafka connectivity (from cluster-agent pod)
./cluster-agent/test-kafka-connection.sh

# Prometheus scrape
curl http://<NEW_HOST_IP>:32738/api/v1/targets

# MongoDB connection
mongosh "mongodb://adminuser:password123@<NEW_HOST_IP>:32001/devopscopilot?authSource=admin" --eval "db.stats()"

# AgentOps API
curl http://localhost:8000/health
```

---

### Secrets Checklist

Before going live, rotate these values:

- [ ] `JWT_SECRET` — generate with `openssl rand -hex 64`
- [ ] `JWT_REFRESH_SECRET` — same
- [ ] `INTEGRATION_ENCRYPTION_KEY` — 32-byte hex (`openssl rand -hex 32`)
- [ ] `MONGO_DB_URI` — change `password123`
- [ ] `AGENTOPS_DB_PASSWORD` — change from `agentops_secret`
- [ ] `KAFKA_PASSWORD` — change from `Kafka@123`
- [ ] `RESEND_API_KEY` — replace with production key
- [ ] `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — add production keys
- [ ] `CLICKHOUSE_PASSWORD` — change from `password`

---

### Known Gotchas

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Network events not appearing | `CLUSTER_ID` in `cluster-agent/.env` doesn't match the cluster selected in the UI | Set the env var to the correct `_id` from MongoDB `clusters` collection |
| Kafka consumer starvation | Single KafkaJS instance on `network-events` + other topics | `authService` uses separate instances for `network-events` — do not merge them |
| TC filter error on redeploy | Old TC filter from previous network-monitor pod is still attached | `FilterDel` is called on startup; check kernel logs if still failing |
| eBPF compilation fails | `bpf.c` needs compile-time constants for helper args | Do not change buffer read sizes to variables |
| AgentOps auth fails | SDK sends `ao_` prefixed keys; AgentOps Postgres expects UUID format | API key in `projects` table must be a plain UUID |
| OTEL traces not arriving | `JWT_SECRET` in OTEL Collector config doesn't match AgentOps API | Set the same value in both configs |
| MongoDB auth error | `authSource=admin` required in connection string | Always include `?authSource=admin` |
| Shell sleep fractional seconds | Darwin `sleep` requires integer seconds | Use `sleep 1` not `sleep 0.5` |

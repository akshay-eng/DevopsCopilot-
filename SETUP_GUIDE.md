# DevOps Copilot - Complete Setup Guide

This guide walks you through setting up the entire DevOps Copilot platform.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Your SaaS Server (Stallion)                   │
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Frontend   │    │   Backend    │    │    Kafka     │      │
│  │   (React)    │◄───┤ (Node/Express)◄───┤   Cluster    │      │
│  │              │    │   + MongoDB  │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│                              ▲                    ▲              │
└──────────────────────────────┼────────────────────┼──────────────┘
                               │                    │
                               │ API               │ Kafka Protocol
                               │                    │ (Port 9092)
                               │                    │
┌──────────────────────────────┼────────────────────┼──────────────┐
│                 User's Kubernetes Cluster          │              │
│                                                    │              │
│  ┌───────────────────────────────────────────────┼──────┐       │
│  │         DevOps Copilot Helm Chart              │      │       │
│  │                                                 │      │       │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────▼────┐ │       │
│  │  │ Prometheus  │  │  Grafana    │  │  Python      │ │       │
│  │  │             │  │             │  │  Agent       │─┼───┐   │
│  │  └─────────────┘  └─────────────┘  │              │ │   │   │
│  │                                     │  • Watches   │ │   │   │
│  │  ┌─────────────┐                   │  • Collects  │ │   │   │
│  │  │    Loki     │                   │  • Streams   │ │   │   │
│  │  │             │                   └──────────────┘ │   │   │
│  │  └─────────────┘                                    │   │   │
│  └───────────────────────────────────────────────────── │   │   │
│                                                          │   │   │
│  K8s API Server ◄────────────────────────────────────────   │   │
└─────────────────────────────────────────────────────────────┼───┘
                                                              │
                                          Streams data to Kafka
```

---

## Part 1: Kafka Setup (SaaS Server - Stallion)

### 1.1 Verify Kafka is Running

```bash
ssh akshay@stallion
cd ~/infra-assets
docker ps | grep broker
```

### 1.2 Configure Kafka for External Access

**Current Issue**: Your Kafka is only accessible via `localhost:9092`. Agents in user clusters can't connect.

**Solution**: Expose Kafka with public IP/domain

Edit your `docker-compose.yml` (or create if using standalone):

```yaml
broker:
  image: confluentinc/cp-server:7.3.0
  environment:
    # ... existing config ...

    # ADD THESE LINES:
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://broker:29092,PLAINTEXT_HOST://stallion:9092
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
    KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
```

**Restart Kafka**:
```bash
docker-compose down && docker-compose up -d
```

### 1.3 Create Required Topics

```bash
# Create all topics
for topic in alerts metrics k8s-events logs resources heartbeats; do
  docker exec -it broker kafka-topics \
    --bootstrap-server localhost:9092 \
    --create \
    --topic $topic \
    --partitions 3 \
    --replication-factor 1 \
    --if-not-exists
done

# Verify
docker exec -it broker kafka-topics --bootstrap-server localhost:9092 --list
```

### 1.4 Test External Connectivity

From your local machine:
```bash
# Install kafkacat/kcat
brew install kcat  # macOS
# or: apt install kafkacat  # Linux

# Test connection (replace with your stallion IP/domain)
echo "test" | kcat -P -b stallion:9092 -t test-topic

# If it works, Kafka is properly exposed
```

---

## Part 2: Backend Setup (SaaS Server)

### 2.1 Install MongoDB

```bash
# On stallion server
docker run -d \
  --name mongo \
  -p 27017:27017 \
  -v mongo_data:/data/db \
  --restart unless-stopped \
  mongo:7
```

### 2.2 Setup Backend

```bash
# On stallion
cd /path/to/DevopsCopilot-/backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

**Edit `.env`**:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/devops-copilot
JWT_SECRET=generate-strong-secret-here
KAFKA_BROKERS=localhost:9092
KAFKA_SECURITY_PROTOCOL=PLAINTEXT
FRONTEND_URL=http://your-frontend-url
ENABLE_WEBSOCKET=true
ENABLE_KAFKA_CONSUMER=true
```

### 2.3 Start Backend

```bash
# Development
npm run dev

# Production (recommended)
npm install -g pm2
pm2 start src/server.js --name devops-copilot-backend
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

### 2.4 Verify Backend

```bash
curl http://localhost:5000/health
# Should return: {"status":"healthy",...}
```

---

## Part 3: Frontend Setup (SaaS Server)

### 3.1 Build Frontend

```bash
cd /path/to/DevopsCopilot-/frontend

# Install dependencies
npm install

# Update API URL in .env or config
# Create .env file
cat > .env << EOF
REACT_APP_API_URL=http://your-backend-ip:5000
REACT_APP_WS_URL=http://your-backend-ip:5000
EOF

# Build for production
npm run build
```

### 3.2 Serve Frontend

**Option A: Using nginx**
```bash
# Install nginx
sudo apt install nginx

# Copy build to nginx
sudo cp -r build/* /var/www/html/

# Restart nginx
sudo systemctl restart nginx
```

**Option B: Using serve**
```bash
npm install -g serve
serve -s build -p 3000
```

---

## Part 4: Grafana Configuration

### 4.1 Access Grafana

Navigate to: `http://grafana.stallion-ai.in`

### 4.2 Create API Key for Agent

1. Go to **Administration** → **Service accounts**
2. Click **Add service account**:
   - Name: `devops-copilot-agent`
   - Role: `Editor`
3. Click **Add token**:
   - Name: `agent-token`
   - Expiration: No expiration
4. **Copy the token** - this is your `GRAFANA_API_KEY`

### 4.3 Configure Loki Data Source (If Not Already Done)

1. Go to **Connections** → **Data sources**
2. Add **Loki**:
   - URL: `http://loki-gateway.monitoring.svc.cluster.local`
   - (This will be created when user installs the Helm chart)

---

## Part 5: User Cluster Setup (What Your Users Will Do)

### 5.1 User Registers on Your Platform

User creates account on your frontend → Verifies email → Logs in

### 5.2 User Adds Cluster

User clicks "Add Cluster" and fills form:
- **Cluster Name**: production-k8s
- **Cluster Type**: kubernetes
- **Environment**: production

### 5.3 Backend Generates Credentials

Your backend API (`POST /api/clusters/register`) returns:

```json
{
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "apiKey": "generated-api-key-123",
  "userId": "user-id-456",
  "helmCommand": "helm install devops-copilot..."
}
```

### 5.4 User Runs Helm Command

User copies and runs the Helm command in their cluster:

```bash
helm repo add devops-copilot https://charts.devopscopilot.com
helm repo update

helm install devops-copilot devops-copilot/stack \
  --namespace devops-copilot \
  --create-namespace \
  --set agent.agentId=550e8400-e29b-41d4-a716-446655440000 \
  --set agent.userId=user-id-456 \
  --set agent.apiKey=generated-api-key-123 \
  --set agent.clusterName=production-k8s \
  --set agent.backendUrl=http://stallion:5000 \
  --set kafka.bootstrapServers=stallion:9092 \
  --set kafka.securityProtocol=PLAINTEXT
```

This installs:
- Prometheus
- Grafana
- Loki
- Python Agent

### 5.5 Agent Starts Streaming Data

The agent:
1. Connects to cluster's Kubernetes API
2. Connects to cluster's Prometheus
3. Connects to your Kafka on stallion:9092
4. Starts streaming alerts, metrics, events, resources

---

## Part 6: Verification & Testing

### 6.1 Check Kafka Messages

On stallion server:
```bash
# Monitor alerts topic
docker exec -it broker kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic alerts \
  --from-beginning

# You should see messages coming from the agent
```

### 6.2 Check Backend Logs

```bash
# If using PM2
pm2 logs devops-copilot-backend

# You should see:
# "Kafka consumer started"
# "Processing message from topic alerts"
# "Alert processed: PodFailure"
```

### 6.3 Check MongoDB

```bash
mongosh mongodb://localhost:27017/devops-copilot

# Check collections
show collections

# Check alerts
db.alerts.find().pretty()

# Check clusters
db.clusters.find().pretty()
```

### 6.4 Check Frontend

Open frontend → Go to "Managed Alerts" → You should see alerts from the user's cluster

---

## Environment Variables Summary

### Backend (.env)

```env
# Required
MONGODB_URI=mongodb://localhost:27017/devops-copilot
JWT_SECRET=your-secret
KAFKA_BROKERS=stallion:9092  # or localhost:9092 if backend on same server

# Kafka Auth (PLAINTEXT for now, add SASL later)
KAFKA_SECURITY_PROTOCOL=PLAINTEXT

# Features
ENABLE_WEBSOCKET=true
ENABLE_KAFKA_CONSUMER=true

# Frontend URL
FRONTEND_URL=http://your-frontend-domain
```

### Agent (.env in user's cluster - set via Helm)

```env
AGENT_ID=<generated-by-backend>
USER_ID=<from-mongodb>
API_KEY=<generated-by-backend>
CLUSTER_NAME=<user-provided>
BACKEND_URL=http://stallion:5000
KAFKA_BOOTSTRAP_SERVERS=stallion:9092
KAFKA_SECURITY_PROTOCOL=PLAINTEXT
PROMETHEUS_URL=http://prometheus-server:9090  # in-cluster
GRAFANA_URL=http://grafana:3000  # in-cluster
LOKI_URL=http://loki-gateway:3100  # in-cluster
```

---

## FAQ

### Q: Do I need Kafka REST Proxy?

**A: No.** The Python agent uses native Kafka protocol (binary, port 9092). REST Proxy is only needed if you want to send data via HTTP webhooks from services that can't use native Kafka clients.

### Q: Where should alerts be processed?

**A: On your SaaS backend.** The agent just watches and streams. Your backend (Kafka consumers) processes, correlates, enriches alerts before storing in MongoDB.

### Q: How does the agent access the cluster without kubeconfig?

**A: ServiceAccount token.** The agent runs as a Pod in the user's cluster with a ServiceAccount that has RBAC permissions. It uses the mounted token at `/var/run/secrets/kubernetes.io/serviceaccount/token`.

### Q: How to secure Kafka?

**A: Add SASL authentication:**
1. Configure Kafka with SASL_PLAINTEXT or SASL_SSL
2. Generate credentials per user
3. Update agent config with SASL credentials

---

## Next Steps

1. **Create Helm Chart**: Package Prometheus + Grafana + Loki + Agent
2. **Add Authentication**: Implement JWT authentication in backend
3. **Frontend Integration**: Connect React frontend to backend API and WebSocket
4. **Add More Routes**: Alerts, metrics, events, resources API endpoints
5. **Set up CI/CD**: Automate deployments
6. **Add Monitoring**: Monitor your own backend with Prometheus/Grafana

---

## Troubleshooting

### Kafka Connection Refused

**Problem**: Agent can't connect to Kafka

**Solutions**:
1. Verify Kafka is listening on public IP: `netstat -tlnp | grep 9092`
2. Check firewall allows port 9092
3. Verify `KAFKA_ADVERTISED_LISTENERS` is set correctly

### No Messages in Kafka

**Problem**: Kafka topics are empty

**Solutions**:
1. Check agent logs: `kubectl logs -n devops-copilot -l app=devops-copilot-agent`
2. Verify agent can reach Kafka: `kubectl exec -it <agent-pod> -- nc -zv stallion 9092`
3. Check agent API key is valid

### Backend Not Processing Messages

**Problem**: Messages in Kafka but not in MongoDB

**Solutions**:
1. Check backend logs for errors
2. Verify `ENABLE_KAFKA_CONSUMER=true`
3. Check MongoDB connection
4. Verify cluster exists in database with matching `agentId`

---

## Support

For questions or issues:
- GitHub Issues
- Email: support@devopscopilot.com
- Slack: #devops-copilot

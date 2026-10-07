# Quick Start Guide

Get the Network Monitor running in 5 minutes!

## Prerequisites

- Kubernetes cluster (minikube, kind, EKS, GKE, AKS)
- kubectl configured
- Docker installed

## Option 1: Deploy with Pre-built Steps

### Step 1: Install Strimzi Kafka Operator

```bash
kubectl create namespace kafka
kubectl create -f 'https://strimzi.io/install/latest?namespace=kafka' -n kafka
kubectl wait --for=condition=ready pod -l name=strimzi-cluster-operator -n kafka --timeout=300s
```

### Step 2: Deploy Kafka

```bash
kubectl apply -f - <<EOF
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: kafka
  namespace: kafka
spec:
  kafka:
    version: 3.6.0
    replicas: 1
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
    storage:
      type: ephemeral
  zookeeper:
    replicas: 1
    storage:
      type: ephemeral
EOF

# Wait for Kafka to be ready
kubectl wait kafka/kafka --for=condition=Ready --timeout=300s -n kafka
```

### Step 3: Deploy Neo4j

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: neo4j
  namespace: default
spec:
  ports:
  - port: 7687
    name: bolt
  - port: 7474
    name: http
  selector:
    app: neo4j
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: neo4j
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: neo4j
  template:
    metadata:
      labels:
        app: neo4j
    spec:
      containers:
      - name: neo4j
        image: neo4j:5.15
        env:
        - name: NEO4J_AUTH
          value: neo4j/changeme
        ports:
        - containerPort: 7687
        - containerPort: 7474
EOF

# Wait for Neo4j to be ready
kubectl wait --for=condition=ready pod -l app=neo4j --timeout=300s
```

### Step 4: Build Network Monitor

```bash
cd network-monitor

# Build Docker image
docker build -t network-monitor:latest .

# If using kind, load image
kind load docker-image network-monitor:latest

# If using minikube
minikube image load network-monitor:latest

# If using remote cluster, push to registry
# docker tag network-monitor:latest your-registry/network-monitor:latest
# docker push your-registry/network-monitor:latest
# Update image in deployments/daemonset.yaml
```

### Step 5: Update Configuration

Edit the ConfigMap in `deployments/daemonset.yaml`:

```yaml
data:
  KAFKA_BROKERS: "kafka-kafka-bootstrap.kafka.svc.cluster.local:9092"
  NEO4J_URI: "bolt://neo4j.default.svc.cluster.local:7687"
  NEO4J_USER: "neo4j"
```

### Step 6: Deploy Network Monitor

```bash
kubectl apply -f deployments/daemonset.yaml

# Check status
kubectl get pods -n network-monitor -w

# View logs
kubectl logs -n network-monitor -l app=network-monitor -f
```

## Option 2: One-Command Deploy (with script)

```bash
cd network-monitor

# Deploy everything
./scripts/deploy.sh --deploy-deps --logs

# Or build and deploy
./scripts/deploy.sh --skip-push --deploy-deps
```

## Verify Installation

### 1. Check Pods

```bash
# All pods should be Running
kubectl get pods -n network-monitor
kubectl get pods -n kafka
kubectl get pods -l app=neo4j
```

### 2. Generate Test Traffic

```bash
# Deploy test applications
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
---
apiVersion: v1
kind: Service
metadata:
  name: test-app
spec:
  selector:
    app: test-app
  ports:
  - port: 80
EOF

# Generate traffic
kubectl run -it --rm load-generator --image=busybox --restart=Never -- sh -c \
  'while true; do wget -q -O- http://test-app; sleep 1; done'
```

### 3. Check Kafka Events

```bash
kubectl exec -it kafka-kafka-0 -n kafka -- \
  /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic network-events \
  --from-beginning
```

You should see JSON events like:

```json
{
  "ts": "2025-01-17T10:30:45.123Z",
  "src": {"ip":"10.244.0.5","pod":"test-app-abc","ns":"default","svc":"test-app"},
  "dst": {"ip":"10.244.0.6","pod":"test-app-xyz","ns":"default","svc":"test-app"},
  "http": {
    "method": "GET",
    "path": "/",
    "status": 200,
    "latency_ms": 12
  }
}
```

### 4. Check Neo4j Graph

```bash
# Port-forward Neo4j browser
kubectl port-forward svc/neo4j 7474:7474 7687:7687

# Open browser: http://localhost:7474
# Login: neo4j / changeme

# Run query:
MATCH (a:Service)-[r:CALLS]->(b:Service)
RETURN a.name, b.name, r.request_count
```

## Troubleshooting

### No Events in Kafka

```bash
# Check network-monitor logs
kubectl logs -n network-monitor -l app=network-monitor

# Common issues:
# 1. Kafka connection failed
kubectl exec -it kafka-kafka-0 -n kafka -- \
  /opt/kafka/bin/kafka-topics.sh --list --bootstrap-server localhost:9092

# 2. eBPF not loading (check kernel version)
kubectl exec -it -n network-monitor <pod-name> -- cat /proc/version

# 3. Permissions (should be privileged)
kubectl get pod -n network-monitor <pod-name> -o yaml | grep privileged
```

### No Data in Neo4j

```bash
# Check Neo4j is accessible
kubectl exec -it neo4j-0 -- cypher-shell -u neo4j -p changeme "MATCH (n) RETURN count(n)"

# Check network-monitor can connect
kubectl logs -n network-monitor -l app=network-monitor | grep -i neo4j
```

### High Memory/CPU Usage

```bash
# Check resources
kubectl top pods -n network-monitor

# If too high, reduce buffer sizes:
# Edit bpf/packet_capture.bpf.c and reduce MAX_PAYLOAD_SIZE
# Rebuild and redeploy
```

## Clean Up

```bash
# Remove network monitor
kubectl delete -f deployments/daemonset.yaml

# Remove dependencies
kubectl delete -f deployments/neo4j-example.yaml
kubectl delete -f deployments/kafka-example.yaml

# Remove Strimzi operator
kubectl delete -f 'https://strimzi.io/install/latest?namespace=kafka'
kubectl delete namespace kafka
```

## Next Steps

1. **Explore Service Graph**: See [docs/neo4j-queries.md](docs/neo4j-queries.md) for useful queries
2. **Custom Dashboards**: Build Grafana dashboards using Neo4j data
3. **Alerting**: Set up alerts on high error rates or latencies
4. **Production Deployment**: See [README.md](README.md) for production best practices
5. **Development**: See [DEVELOPMENT.md](DEVELOPMENT.md) for local development setup

## Support

- Issues: [GitHub Issues](https://github.com/your-repo/network-monitor/issues)
- Docs: [README.md](README.md)
- Neo4j Queries: [docs/neo4j-queries.md](docs/neo4j-queries.md)

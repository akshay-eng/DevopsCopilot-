# Network Monitor - Deployment Guide

## ✅ What's Been Built

A production-ready Kubernetes network monitoring agent with:

1. **eBPF Programs** (`bpf/packet_capture.bpf.c`)
   - TC hooks for packet capture
   - SSL uprobes for TLS decryption

2. **Go Application** (`cmd/main.go` + `pkg/`)
   - HTTP parser
   - Kubernetes metadata enrichment
   - Kafka event export
   - Neo4j service dependency graph

3. **Kubernetes Deployment** (`deployments/daemonset.yaml`)
   - DaemonSet (runs on every node)
   - RBAC permissions
   - ConfigMap and Secrets

## 🎯 Your Environment

Based on your cluster:
- **Kafka**: `kafka` namespace, LoadBalancer IPs
  - Broker 1: 192.168.1.249:9092
  - Broker 2: 192.168.1.245:9093
  - Broker 3: 192.168.1.246:9094

- **Neo4j**: `default` namespace
  - ClusterIP: 10.43.47.95:7687

- **Cluster**: 46 pods detected

## 🚀 Deployment Steps

### Step 1: Update Configuration

The DaemonSet is already configured for your Kafka brokers. Update Neo4j password if needed:

```bash
kubectl edit secret network-monitor-secrets -n network-monitor
# Change NEO4J_PASSWORD from "changeme" to your password
```

### Step 2: Build Docker Image

Since local Go build works but Docker build is slow, you have two options:

**Option A: Wait for Docker build to complete**
```bash
cd /Users/akshay/Documents/DevopsCopilot-/network-monitor
docker build --platform linux/amd64 -t network-monitor:latest .
```

**Option B: Use a simpler Dockerfile (faster)**
```bash
# Create simplified Dockerfile.simple
cat > Dockerfile.simple <<'EOF'
FROM golang:1.21
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o network-monitor ./cmd/main.go
CMD ["/app/network-monitor"]
EOF

# Build
docker build -f Dockerfile.simple -t network-monitor:latest .
```

### Step 3: Load Image to Cluster

**For K3s:**
```bash
docker save network-monitor:latest | sudo k3s ctr images import -
```

**For kind:**
```bash
kind load docker-image network-monitor:latest
```

**For remote registry:**
```bash
docker tag network-monitor:latest your-registry/network-monitor:latest
docker push your-registry/network-monitor:latest
# Update image in deployments/daemonset.yaml
```

### Step 4: Deploy

```bash
kubectl apply -f deployments/daemonset.yaml
```

### Step 5: Verify

```bash
# Check DaemonSet
kubectl get daemonset -n network-monitor

# Check pods
kubectl get pods -n network-monitor

# Check logs
kubectl logs -n network-monitor -l app=network-monitor -f
```

## 🧪 Testing

### Test 1: Check Kafka Events

```bash
kubectl exec -it -n kafka kafka-broker-1-0 -- \
  kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic network-events \
  --from-beginning
```

Expected output:
```json
{
  "ts": "2026-01-17T10:30:45.123Z",
  "src": {"ip":"10.42.x.x","pod":"pod-name","ns":"namespace","svc":"service"},
  "dst": {"ip":"10.42.x.x","pod":"pod-name","ns":"namespace","svc":"service"},
  "http": {
    "method": "GET",
    "path": "/api/endpoint",
    "status": 200,
    "latency_ms": 15
  }
}
```

### Test 2: Query Neo4j Graph

```bash
# Port-forward Neo4j
kubectl port-forward svc/neo4j 7474:7474 7687:7687

# Open browser: http://localhost:7474
# Login: neo4j / changeme

# Run Cypher query:
MATCH (a:Service)-[r:CALLS]->(b:Service)
RETURN
  a.namespace AS src_ns,
  a.name AS src_svc,
  b.namespace AS dst_ns,
  b.name AS dst_svc,
  r.request_count AS requests,
  r.error_rate AS errors,
  r.p99_latency AS p99_ms,
  r.avg_latency AS avg_ms
ORDER BY r.request_count DESC
```

### Test 3: Generate Traffic

```bash
# Deploy test app
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: httpbin
        image: kennethreitz/httpbin
        ports:
        - containerPort: 80
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
kubectl run -it --rm curl --image=curlimages/curl --restart=Never -- \
  sh -c 'while true; do curl -s http://test-app/get; sleep 1; done'
```

## 🔧 Troubleshooting

### No Events in Kafka

```bash
# Check monitor logs
kubectl logs -n network-monitor -l app=network-monitor --tail=100

# Common issues:
# 1. eBPF not loading - check kernel version
kubectl exec -it -n network-monitor <pod-name> -- cat /proc/version

# 2. Kafka connection failed
kubectl exec -it -n network-monitor <pod-name> -- \
  nc -zv kafka-broker-1.kafka.svc.cluster.local 9092
```

### No Data in Neo4j

```bash
# Check if Neo4j is accessible
kubectl exec -it neo4j-<pod-id> -- \
  cypher-shell -u neo4j -p changeme "MATCH (n) RETURN count(n)"

# Check monitor can connect
kubectl logs -n network-monitor -l app=network-monitor | grep -i neo4j
```

### High Memory Usage

```bash
# Check resource usage
kubectl top pods -n network-monitor

# If too high, reduce buffer sizes in daemonset.yaml:
resources:
  limits:
    memory: 200Mi  # Increase from 100Mi
    cpu: 300m      # Increase from 200m
```

## 📊 Monitoring

### View Service Graph

1. Port-forward Neo4j: `kubectl port-forward svc/neo4j 7474:7474 7687:7687`
2. Open http://localhost:7474
3. Login with neo4j / changeme
4. Run queries from `docs/neo4j-queries.md`

### View Metrics (Future)

Add Prometheus metrics endpoint:
```yaml
- name: METRICS_PORT
  value: "8080"
```

Then scrape from `http://network-monitor-metrics.network-monitor.svc:8080/metrics`

## 🔄 Updates

To update the monitor:

```bash
# Rebuild
docker build -t network-monitor:latest .

# Reload to cluster
docker save network-monitor:latest | sudo k3s ctr images import -

# Restart DaemonSet
kubectl rollout restart daemonset/network-monitor -n network-monitor
```

## 🧹 Cleanup

```bash
# Remove network monitor
kubectl delete -f deployments/daemonset.yaml

# Remove test apps
kubectl delete deployment test-app
kubectl delete service test-app
```

## ⚠️ Known Limitations

1. **eBPF Kernel Requirements**: Kernel 4.18+ with BTF support
2. **SSL Decryption**: Only works with OpenSSL (not BoringSSL, GnuTLS)
3. **HTTP/2 & HTTP/3**: Not supported (only HTTP/1.x)
4. **Performance**: High-traffic clusters may need sampling

## 📚 Documentation

- [README.md](README.md) - Complete documentation
- [QUICKSTART.md](QUICKSTART.md) - 5-minute setup
- [DEVELOPMENT.md](DEVELOPMENT.md) - Local development
- [docs/neo4j-queries.md](docs/neo4j-queries.md) - Cypher query examples
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Architecture details

## 🆘 Support

For issues:
1. Check logs: `kubectl logs -n network-monitor -l app=network-monitor`
2. Verify connectivity: Run tests in this guide
3. Review [DEVELOPMENT.md](DEVELOPMENT.md) for debugging tips

---

**Status**: ✅ Ready to deploy once Docker image is built

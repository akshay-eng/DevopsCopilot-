# Development Guide

## Prerequisites

### System Requirements

- Linux kernel 4.18+ with BTF support
- Ubuntu 20.04+ or equivalent
- Root/sudo access for eBPF operations

### Tools

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
    clang \
    llvm \
    libbpf-dev \
    linux-headers-$(uname -r) \
    bpftool \
    golang-1.21 \
    make \
    git

# Verify kernel BTF support
ls -la /sys/kernel/btf/vmlinux
```

## Local Development

### 1. Clone and Setup

```bash
git clone <repo>
cd network-monitor

# Download Go dependencies
go mod download
```

### 2. Build eBPF Programs

```bash
# Generate vmlinux.h (if needed)
sudo bpftool btf dump file /sys/kernel/btf/vmlinux format c > bpf/vmlinux.h

# Compile eBPF
make bpf

# Verify
llvm-objdump -S bpf/packet_capture.bpf.o
```

### 3. Build Go Binary

```bash
make go

# Output: bin/network-monitor
```

### 4. Run Locally

You need a Kubernetes cluster (minikube, kind, or remote cluster):

```bash
# Start minikube with enough resources
minikube start --cpus=4 --memory=8192 --driver=docker

# Deploy dependencies
kubectl apply -f deployments/kafka-example.yaml
kubectl apply -f deployments/neo4j-example.yaml

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app=kafka --timeout=300s
kubectl wait --for=condition=ready pod -l app=neo4j --timeout=300s

# Port forward Kafka and Neo4j
kubectl port-forward svc/kafka 9092:9092 &
kubectl port-forward svc/neo4j 7687:7687 7474:7474 &

# Run network monitor (requires root for eBPF)
sudo -E bin/network-monitor \
    -bpf-object=bpf/packet_capture.bpf.o \
    -libssl=/usr/lib/x86_64-linux-gnu/libssl.so.3 \
    -kubeconfig=$HOME/.kube/config \
    -kafka-brokers=localhost:9092 \
    -neo4j-uri=bolt://localhost:7687 \
    -neo4j-user=neo4j \
    -neo4j-password=changeme
```

## Testing

### Unit Tests

```bash
go test -v ./pkg/...
```

### Integration Tests

```bash
# Deploy test application
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: nginx
        image: nginx:alpine
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  selector:
    app: frontend
  ports:
  - port: 80
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
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
  name: backend
spec:
  selector:
    app: backend
  ports:
  - port: 80
EOF

# Generate traffic
kubectl run -it --rm curl --image=curlimages/curl --restart=Never -- \
    sh -c 'while true; do curl -s http://frontend/; curl -s http://backend/get; sleep 1; done'

# Check Kafka for events
kubectl exec -it kafka-0 -- kafka-console-consumer.sh \
    --bootstrap-server localhost:9092 \
    --topic network-events \
    --from-beginning

# Check Neo4j for graph
kubectl exec -it neo4j-0 -- cypher-shell -u neo4j -p changeme \
    "MATCH (a:Service)-[r:CALLS]->(b:Service) RETURN a.name, b.name, r.request_count"
```

### eBPF Debugging

```bash
# Check loaded programs
sudo bpftool prog list

# Check maps
sudo bpftool map list

# Dump map contents
sudo bpftool map dump id <MAP_ID>

# Trace eBPF events
sudo bpftool prog tracelog
```

## Common Issues

### eBPF Load Failures

```bash
# Check kernel version
uname -r  # Must be 4.18+

# Check BTF
ls /sys/kernel/btf/vmlinux

# Check BPF filesystem
mount | grep bpf

# Enable if not mounted
sudo mount -t bpf bpf /sys/fs/bpf
```

### SSL Uprobes Not Attaching

```bash
# Find libssl location
find /usr -name "libssl.so*" 2>/dev/null

# Common locations:
# Ubuntu: /usr/lib/x86_64-linux-gnu/libssl.so.3
# CentOS: /usr/lib64/libssl.so.3
# Alpine: /usr/lib/libssl.so.3

# Check symbols
nm -D /usr/lib/x86_64-linux-gnu/libssl.so.3 | grep SSL_read
```

### Permission Errors

```bash
# Ensure running as root
sudo id

# Check capabilities
sudo getcap bin/network-monitor

# Add capabilities
sudo setcap cap_sys_admin,cap_net_admin,cap_bpf+eip bin/network-monitor
```

## Performance Profiling

### Go Profiling

```bash
# Add pprof endpoint to main.go
import _ "net/http/pprof"

go func() {
    log.Println(http.ListenAndServe("localhost:6060", nil))
}()

# Profile CPU
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30

# Profile memory
go tool pprof http://localhost:6060/debug/pprof/heap
```

### eBPF Performance

```bash
# Monitor eBPF overhead
sudo perf stat -e bpf:* sleep 10

# Check dropped events
sudo bpftool prog show | grep dropped
```

## Code Structure

```
network-monitor/
├── bpf/                    # eBPF programs
│   ├── packet_capture.bpf.c  # TC hooks and SSL uprobes
│   └── vmlinux.h              # Kernel type definitions
├── cmd/
│   └── main.go                # Main entry point
├── pkg/
│   ├── ebpf/                  # eBPF loader
│   │   └── loader.go
│   ├── http/                  # HTTP parser
│   │   └── parser.go
│   ├── k8s/                   # Kubernetes cache
│   │   └── cache.go
│   ├── kafka/                 # Kafka producer
│   │   └── producer.go
│   └── graph/                 # Service graph
│       └── service_graph.go
├── deployments/               # Kubernetes manifests
│   ├── daemonset.yaml
│   ├── kafka-example.yaml
│   └── neo4j-example.yaml
└── scripts/                   # Build/deploy scripts
    ├── build.sh
    └── deploy.sh
```

## Release Process

```bash
# 1. Update version
export VERSION="v1.0.0"

# 2. Build and tag
make docker
docker tag network-monitor:latest network-monitor:${VERSION}

# 3. Push to registry
docker push network-monitor:${VERSION}
docker push network-monitor:latest

# 4. Create git tag
git tag -a ${VERSION} -m "Release ${VERSION}"
git push origin ${VERSION}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `make test`
5. Build: `make build`
6. Test locally
7. Submit PR

## Resources

- [eBPF Documentation](https://ebpf.io/docs/)
- [Cilium eBPF Library](https://github.com/cilium/ebpf)
- [BPF CO-RE](https://nakryiko.com/posts/bpf-portability-and-co-re/)
- [Kubernetes Client-Go](https://github.com/kubernetes/client-go)

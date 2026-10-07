# Quick Deployment Guide

## Prerequisites
✅ Docker image built: `network-monitor:latest`
✅ SSH access to cluster node: `192.168.1.5`
✅ kubectl configured

## Deploy in 3 Commands

### 1. Save Docker Image
```bash
docker save network-monitor:latest -o /tmp/network-monitor.tar
```

### 2. Copy & Import to Cluster
```bash
# Copy to cluster (replace 'root' with your SSH user)
scp /tmp/network-monitor.tar root@192.168.1.5:/tmp/

# SSH and import
ssh root@192.168.1.5 'k3s ctr images import /tmp/network-monitor.tar && rm /tmp/network-monitor.tar'
```

### 3. Deploy to Kubernetes
```bash
kubectl apply -f deployments/daemonset.yaml
```

## Verify Deployment

```bash
# Check pods
kubectl get pods -n network-monitor

# View logs
kubectl logs -n network-monitor -l app=network-monitor -f
```

Expected log output:
```
Starting Network Monitor...
K8s cache synced: XX pods
K8s cache started
Kafka producer connected to [...], topic: network-events
Neo4j connected!
Attached TC to interface eth0
Started reading eBPF events
```

## Test It Works

### 1. Check Kafka Events
```bash
kubectl exec -it -n kafka kafka-broker-1-0 -- \
  kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic network-events \
  --from-beginning
```

### 2. Query Neo4j Graph
```bash
# Port-forward
kubectl port-forward svc/neo4j 7474:7474 7687:7687

# Open http://localhost:7474
# Login: neo4j / changeme
# Query:
MATCH (a:Service)-[r:CALLS]->(b:Service)
RETURN a.name, b.name, r.request_count
ORDER BY r.request_count DESC
```

### 3. Generate Test Traffic
```bash
# Deploy test app
kubectl run nginx --image=nginx --port=80
kubectl expose pod nginx --port=80

# Generate traffic
kubectl run -it --rm curl --image=curlimages/curl --restart=Never -- \
  sh -c 'while true; do curl -s http://nginx; sleep 1; done'
```

You should see:
- ✅ Events in Kafka topic
- ✅ Service relationships in Neo4j
- ✅ HTTP requests captured with full headers/body

## Troubleshooting

### Issue: Pods not starting
```bash
kubectl describe pod -n network-monitor <pod-name>
kubectl logs -n network-monitor <pod-name>
```

### Issue: eBPF not loading
```bash
# Check kernel version (needs 4.18+)
kubectl exec -it -n network-monitor <pod-name> -- cat /proc/version

# Check if BTF is available
kubectl exec -it -n network-monitor <pod-name> -- ls /sys/kernel/btf/
```

### Issue: No events in Kafka
```bash
# Check if Kafka is accessible from pod
kubectl exec -it -n network-monitor <pod-name> -- \
  nc -zv kafka-broker-1.kafka.svc.cluster.local 9092
```

## Cleanup
```bash
kubectl delete -f deployments/daemonset.yaml
```

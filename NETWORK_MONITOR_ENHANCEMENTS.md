# Network Monitor Enhancements - Kubeshark-Level Detail Capture

## Summary
Enhanced the existing eBPF network-monitor to capture full HTTP request/response details similar to Kubeshark, without needing external tools.

## Changes Made

### 1. Backend (network-monitor Go code)

#### File: `pkg/http/parser.go`
**Enhancements:**
- ✅ Increased body capture size: **10KB → 100KB**
- ✅ Added `BodyTruncated bool` field - indicates when body was cut off at 100KB limit
- ✅ Added `BodySize int` field - shows original Content-Length from HTTP headers
- ✅ Smart Content-Length parsing - detects incomplete bodies from TCP reassembly

**Before:**
```go
const MaxBodySize = 10 * 1024 // 10KB
type HTTPRequest struct {
    Body string `json:"body,omitempty"`
}
```

**After:**
```go
const MaxBodySize = 100 * 1024 // 100KB
type HTTPRequest struct {
    Body          string `json:"body,omitempty"`
    BodyTruncated bool   `json:"bodyTruncated,omitempty"`
    BodySize      int    `json:"bodySize,omitempty"`
}
```

#### File: `pkg/kafka/producer.go`
**Enhancements:**
- ✅ Updated `HTTPData` struct to include new fields
- ✅ All body metadata flows through Kafka → authService → Frontend

#### File: `cmd/main.go`
**Enhancements:**
- ✅ Pass `BodyTruncated` and `BodySize` to Kafka events
- ✅ Applies to both TC hook captures and SSL uprobe captures

### 2. Frontend (React UI)

#### File: `frontend/src/components/ServiceDependency.js`
**Enhancements:**

**Enhanced CodeBlock Component:**
- ✅ Automatic JSON formatting and validation
- ✅ "Copy to clipboard" button for easy copying
- ✅ Truncation warning banner when body exceeds 100KB
- ✅ Shows original body size when truncated
- ✅ Line count indicator for JSON bodies

**Enhanced KeyValueTable Component (Headers):**
- ✅ Search/filter headers when more than 5 exist
- ✅ Copy individual header values with one click
- ✅ Better layout for long header values

**Example UI Output:**
```
⚠️ Body truncated at 100KB. Original size: 245KB

{
  "user": {
    "id": 123,
    "name": "John Doe"
  }
}

[Copy Button]

✓ Valid JSON (15 lines)
```

## What You Now Capture

### ✅ Already Working (captured before enhancements):
1. HTTP Method (GET, POST, PUT, DELETE, etc.)
2. Path and Query Parameters
3. HTTP Status Code
4. All HTTP Headers
5. Request/Response Body (up to 10KB before, 100KB now)
6. Latency (request → response time)
7. Source/Destination IPs and Ports
8. K8s metadata (pod, namespace, service, labels)

### ✅ New with Enhancements:
1. **Larger body capture**: 10x increase (10KB → 100KB)
2. **Truncation awareness**: UI shows when body is incomplete
3. **Better UX**: JSON formatting, copy buttons, header search
4. **Body size tracking**: Know the full payload size even when truncated

## Deployment

### Build Command:
```bash
cd network-monitor
docker build -t network-monitor:enhanced .
```

### Deploy to K3s:
```bash
# Tag for local registry (if using one)
docker tag network-monitor:enhanced localhost:5000/network-monitor:enhanced
docker push localhost:5000/network-monitor:enhanced

# Or save/load to cluster directly
docker save network-monitor:enhanced | ssh user@cluster-node 'k3s ctr images import -'

# Update DaemonSet
kubectl set image daemonset/network-monitor network-monitor=network-monitor:enhanced -n network-monitor

# Restart pods
kubectl rollout restart daemonset/network-monitor -n network-monitor
```

## What's Still the Same

The hybrid architecture remains:
- **Lightweight events** → Kafka (for real-time streaming in UI)
- **Network-monitor** uses eBPF TC hooks + SSL uprobes
- **authService** consumes Kafka and emits Socket.IO events
- **Frontend** displays real-time traffic with enhanced detail panels

## Comparison to Kubeshark

| Feature | network-monitor (enhanced) | Kubeshark |
|---------|---------------------------|-----------|
| HTTP body capture | ✅ 100KB | ✅ Unlimited |
| Headers | ✅ All | ✅ All |
| Query params | ✅ Yes | ✅ Yes |
| JSON formatting | ✅ Yes | ✅ Yes |
| Protocol dissection | ⚠️ HTTP only | ✅ gRPC, GraphQL, Redis, Kafka |
| TLS/SSL | ✅ SSL uprobes | ✅ eBPF uprobes |
| Integration effort | ✅ Already integrated! | ❌ Complex WebSocket API |
| Resource usage | ✅ Lightweight | ⚠️ Heavy (own control plane) |
| Deployment | ✅ Single DaemonSet | ❌ Multiple components |

## Future Enhancements (Optional)

If you need even more detail:

1. **Unlimited body capture**: Store large bodies in ClickHouse instead of Kafka
2. **gRPC dissection**: Add protobuf parsing
3. **GraphQL parsing**: Extract query/mutation details
4. **Redis protocol**: Parse Redis commands
5. **Request/Response matching**: Better correlation for latency
6. **Full PCAP storage**: Store raw packets for forensics

## Testing

1. **Deploy the enhanced network-monitor** (build running now)
2. **Generate test traffic** in your cluster:
   ```bash
   kubectl run curl --image=curlimages/curl -it --rm -- \
     curl -X POST http://your-service:8080/api/test \
     -H "Content-Type: application/json" \
     -d '{"large":"payload with lots of data..."}'
   ```
3. **Check the UI**: Click on a traffic event → Request tab
4. **Verify**: You should see full headers, body, and truncation warnings if applicable

## Notes

- eBPF has inherent limitations on packet reassembly
- Very large requests (>100KB) will be truncated with clear indication
- For unlimited capture, consider the optional ClickHouse storage enhancement
- Current solution is optimized for real-time monitoring, not forensic packet analysis

## Support

If you need help:
- Check logs: `kubectl logs -n network-monitor -l app=network-monitor`
- Verify Kafka events: Use kafka-console-consumer to inspect raw messages
- Frontend console: Check for body/header data in Redux state

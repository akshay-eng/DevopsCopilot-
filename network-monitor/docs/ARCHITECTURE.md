# Network Monitor Architecture

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Kubernetes Cluster                                 │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                         Worker Node 1                                 │ │
│  │                                                                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │ │
│  │  │   Pod A     │  │   Pod B     │  │   Pod C     │                  │ │
│  │  │  (Frontend) │  │  (Backend)  │  │  (Database) │                  │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │ │
│  │         │                │                │                          │ │
│  │         └────────────────┼────────────────┘                          │ │
│  │                          │                                            │ │
│  │                   ┌──────▼──────┐                                     │ │
│  │                   │   Kernel    │                                     │ │
│  │                   │  Network    │                                     │ │
│  │                   │   Stack     │                                     │ │
│  │                   └──────┬──────┘                                     │ │
│  │                          │                                            │ │
│  │              ┌───────────▼───────────┐                                │ │
│  │              │  eBPF TC Hook         │◀─── Captures all packets      │ │
│  │              │  (Ingress/Egress)     │                                │ │
│  │              └───────────┬───────────┘                                │ │
│  │                          │                                            │ │
│  │              ┌───────────▼───────────┐                                │ │
│  │              │  eBPF SSL Uprobes     │◀─── Captures decrypted TLS    │ │
│  │              │  (OpenSSL hooks)      │                                │ │
│  │              └───────────┬───────────┘                                │ │
│  │                          │                                            │ │
│  │              ┌───────────▼───────────┐                                │ │
│  │              │   Ringbuffer Maps     │                                │ │
│  │              │  (Kernel→Userspace)   │                                │ │
│  │              └───────────┬───────────┘                                │ │
│  │                          │                                            │ │
│  │         ┌────────────────▼─────────────────┐                          │ │
│  │         │   Network Monitor DaemonSet Pod  │                          │ │
│  │         │                                   │                          │ │
│  │         │  ┌───────────────────────────┐   │                          │ │
│  │         │  │   eBPF Loader (Go)        │   │                          │ │
│  │         │  │  - Read ringbuffer        │   │                          │ │
│  │         │  │  - Parse events           │   │                          │ │
│  │         │  └───────────┬───────────────┘   │                          │ │
│  │         │              │                    │                          │ │
│  │         │  ┌───────────▼───────────────┐   │                          │ │
│  │         │  │   TCP Stream Reassembly   │   │                          │ │
│  │         │  │  - Track connections      │   │                          │ │
│  │         │  │  - Buffer fragments       │   │                          │ │
│  │         │  └───────────┬───────────────┘   │                          │ │
│  │         │              │                    │                          │ │
│  │         │  ┌───────────▼───────────────┐   │                          │ │
│  │         │  │   HTTP Parser             │   │                          │ │
│  │         │  │  - Parse requests         │   │                          │ │
│  │         │  │  - Parse responses        │   │                          │ │
│  │         │  │  - Extract headers/body   │   │                          │ │
│  │         │  └───────────┬───────────────┘   │                          │ │
│  │         │              │                    │                          │ │
│  │         │  ┌───────────▼───────────────┐   │                          │ │
│  │         │  │   K8s Metadata Cache      │   │                          │ │
│  │         │  │  - IP → Pod mapping       │   │                          │ │
│  │         │  │  - Service discovery      │   │                          │ │
│  │         │  │  - Label enrichment       │   │                          │ │
│  │         │  └───────────┬───────────────┘   │                          │ │
│  │         │              │                    │                          │ │
│  │         │      ┌───────┴────────┐           │                          │ │
│  │         │      │                │           │                          │ │
│  │         │  ┌───▼──────┐   ┌────▼────────┐  │                          │ │
│  │         │  │  Kafka   │   │  Neo4j      │  │                          │ │
│  │         │  │ Producer │   │  Updater    │  │                          │ │
│  │         │  └────┬─────┘   └────┬────────┘  │                          │ │
│  │         └───────┼──────────────┼───────────┘                          │ │
│  │                 │              │                                       │ │
│  └─────────────────┼──────────────┼───────────────────────────────────┘ │
│                    │              │                                       │
│  ┌─────────────────▼───────┐  ┌──▼────────────────────┐                 │
│  │   Kafka Cluster          │  │   Neo4j Database      │                 │
│  │  ┌─────────────────────┐ │  │  ┌─────────────────┐ │                 │
│  │  │ network-events      │ │  │  │  Service Graph  │ │                 │
│  │  │ Topic               │ │  │  │  (Cypher)       │ │                 │
│  │  └─────────────────────┘ │  │  └─────────────────┘ │                 │
│  └──────────────────────────┘  └───────────────────────┘                 │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. eBPF Programs (Kernel Space)

#### TC Hook (`capture_packets`)
```
Purpose: Capture raw network packets at kernel level
Location: Attached to network interfaces (eth0, etc.)
Trigger: Every packet ingress/egress
Processing:
  1. Parse Ethernet header
  2. Parse IP header (extract src/dst IP)
  3. Parse TCP header (extract src/dst port)
  4. Filter HTTP/HTTPS ports (80, 443, 8080, 8443)
  5. Copy payload to event structure
  6. Submit to ringbuffer
```

#### SSL Uprobes (`ssl_read_enter`, `ssl_read_exit`, `ssl_write`)
```
Purpose: Capture decrypted TLS data
Location: Attached to OpenSSL library functions
Trigger: SSL_read/SSL_write calls
Processing:
  1. Capture function arguments (SSL*, buffer, length)
  2. Read decrypted data from userspace buffer
  3. Copy data to event structure
  4. Submit to ringbuffer
```

### 2. Network Monitor Agent (User Space)

#### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Network Monitor Agent                        │
│                                                                  │
│  1. Event Collection                                             │
│     ┌────────────────┐         ┌────────────────┐               │
│     │ Packet Events  │         │  SSL Events    │               │
│     │  Ringbuffer    │         │  Ringbuffer    │               │
│     └────────┬───────┘         └────────┬───────┘               │
│              │                          │                        │
│              └──────────┬───────────────┘                        │
│                         │                                        │
│  2. Stream Reassembly   ▼                                        │
│     ┌──────────────────────────────────┐                        │
│     │  TCP Stream Map                  │                        │
│     │  Key: src_ip:src_port→dst_ip:dst│                        │
│     │  Value: {                         │                        │
│     │    request_buffer: []byte         │                        │
│     │    response_buffer: []byte        │                        │
│     │    request_ts: timestamp          │                        │
│     │  }                                │                        │
│     └──────────────┬───────────────────┘                        │
│                    │                                             │
│  3. HTTP Parsing   ▼                                             │
│     ┌──────────────────────────────────┐                        │
│     │  Parse HTTP                       │                        │
│     │  - Method, Path, Query            │                        │
│     │  - Headers                        │                        │
│     │  - Body (10KB max)                │                        │
│     │  - Status Code                    │                        │
│     │  - Calculate Latency              │                        │
│     └──────────────┬───────────────────┘                        │
│                    │                                             │
│  4. Enrichment     ▼                                             │
│     ┌──────────────────────────────────┐                        │
│     │  K8s Metadata Lookup              │                        │
│     │  IP → {                           │                        │
│     │    pod: "frontend-abc",           │                        │
│     │    namespace: "prod",             │                        │
│     │    service: "frontend",           │                        │
│     │    labels: {...}                  │                        │
│     │  }                                │                        │
│     └──────────────┬───────────────────┘                        │
│                    │                                             │
│  5. Export         ├──────────────────┐                         │
│                    │                  │                         │
│     ┌──────────────▼─────┐  ┌─────────▼────────┐               │
│     │  Kafka Producer     │  │ Neo4j Updater    │               │
│     │  - Async send       │  │ - Aggregate      │               │
│     │  - Compression      │  │ - Calculate p99  │               │
│     │  - Batching         │  │ - MERGE nodes    │               │
│     └─────────────────────┘  └──────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

### 3. Data Structures

#### PacketEvent (eBPF → Go)
```c
struct packet_event {
    __u32 src_ip;         // Source IP address
    __u32 dst_ip;         // Destination IP address
    __u16 src_port;       // Source port
    __u16 dst_port;       // Destination port
    __u16 len;            // Payload length
    __u8 flags;           // TCP flags
    __u64 ts;             // Timestamp (nanoseconds)
    char data[2048];      // Payload data
};
```

#### HTTPRequest (Go)
```go
type HTTPRequest struct {
    Method      string            // GET, POST, etc.
    Path        string            // /api/users
    Query       map[string]string // {id: "123"}
    Headers     map[string]string // {Content-Type: "..."}
    Body        string            // Request/response body
    Status      int               // HTTP status code (responses only)
    LatencyMs   int64             // Request→Response latency
    IsRequest   bool              // true=request, false=response
    Timestamp   time.Time         // Event timestamp
}
```

#### NetworkEvent (Kafka)
```go
type NetworkEvent struct {
    Timestamp time.Time
    Src       *EndpointMeta {
        IP        string
        Pod       string
        Namespace string
        Service   string
        Labels    map[string]string
    }
    Dst       *EndpointMeta { ... }
    HTTP      *HTTPData {
        Method    string
        Path      string
        Query     map[string]string
        Headers   map[string]string
        Body      string
        Status    int
        LatencyMs int64
    }
}
```

#### Neo4j Graph Model
```
Nodes:
  (:Service {
    name: string,
    namespace: string
  })

Relationships:
  (:Service)-[:CALLS {
    request_count: int,
    error_rate: float,
    p99_latency: int,
    avg_latency: float,
    last_updated: datetime
  }]->(:Service)
```

### 4. Concurrency Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Goroutine                            │
│  - Initialize components                                     │
│  - Setup signal handlers                                     │
│  - Wait for shutdown                                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┼────────────┬───────────────┐
         │            │            │               │
    ┌────▼────┐  ┌───▼────┐  ┌────▼────┐   ┌─────▼─────┐
    │ Packet  │  │  SSL   │  │  K8s    │   │ Neo4j     │
    │ Reader  │  │ Reader │  │ Syncer  │   │ Exporter  │
    │Goroutine│  │Goroutine│ │Goroutine│  │ Goroutine │
    └────┬────┘  └───┬────┘  └────┬────┘   └─────┬─────┘
         │           │            │               │
         └───────────┴────────────┴───────────────┘
                     │
                ┌────▼────┐
                │ Stream  │
                │ Cleanup │
                │Goroutine│
                └─────────┘

Synchronization:
  - Stream map: sync.RWMutex
  - K8s cache: sync.RWMutex
  - Graph edges: sync.RWMutex
  - Kafka producer: Channel-based (async)
```

### 5. Performance Optimizations

#### Memory Management
```
1. Ringbuffer (kernel):
   - Fixed size: 256MB per buffer
   - Circular, overwrite old events if full

2. TCP Stream Map (Go):
   - Cleanup goroutine runs every 30s
   - Remove streams inactive for >2 minutes
   - Limits memory growth

3. Latency Window (Graph):
   - Keep last 1000 latencies per edge
   - Sliding window for P99 calculation
   - Prevents unbounded growth
```

#### CPU Optimization
```
1. eBPF Filtering:
   - Filter in kernel (port-based)
   - Only HTTP/HTTPS traffic forwarded
   - Reduces userspace processing

2. Batching:
   - Kafka: 100 messages or 100ms
   - Neo4j: Aggregate for 10s before flush
   - Reduces syscalls and network I/O

3. Async Processing:
   - Kafka producer: Non-blocking
   - Neo4j updates: Background goroutine
   - HTTP parsing: Event-driven
```

## Deployment Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                           │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              network-monitor Namespace                  │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │         DaemonSet (network-monitor)              │   │   │
│  │  │  Runs on EVERY node                              │   │   │
│  │  │                                                   │   │   │
│  │  │  Node 1: [Monitor Pod]                           │   │   │
│  │  │  Node 2: [Monitor Pod]                           │   │   │
│  │  │  Node 3: [Monitor Pod]                           │   │   │
│  │  │  ...                                              │   │   │
│  │  │                                                   │   │   │
│  │  │  Privileges:                                      │   │   │
│  │  │  - privileged: true                               │   │   │
│  │  │  - hostNetwork: true                              │   │   │
│  │  │  - hostPID: true                                  │   │   │
│  │  │  - capabilities: [SYS_ADMIN, NET_ADMIN, BPF]     │   │   │
│  │  │                                                   │   │   │
│  │  │  Resources:                                       │   │   │
│  │  │  - memory: 100Mi limit                            │   │   │
│  │  │  - cpu: 200m limit                                │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │         ServiceAccount                           │   │   │
│  │  │  - Name: network-monitor                         │   │   │
│  │  │  - ClusterRole: list pods/services               │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              kafka Namespace                          │   │
│  │  ┌─────────────────────────────────────────────┐     │   │
│  │  │  Kafka Cluster (Strimzi)                     │     │   │
│  │  │  - Broker 1, 2, 3                            │     │   │
│  │  │  - Topic: network-events (10 partitions)     │     │   │
│  │  └─────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              default Namespace                        │   │
│  │  ┌─────────────────────────────────────────────┐     │   │
│  │  │  Neo4j Database                              │     │   │
│  │  │  - Deployment (1 replica)                    │     │   │
│  │  │  - Service: bolt://neo4j:7687                │     │   │
│  │  └─────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Security Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Security Layers                          │
│                                                             │
│  1. Kubernetes RBAC                                         │
│     ┌──────────────────────────────────────────────┐       │
│     │  ServiceAccount: network-monitor             │       │
│     │  ClusterRole: Read-only                       │       │
│     │  - Resources: pods, services                  │       │
│     │  - Verbs: get, list, watch                    │       │
│     └──────────────────────────────────────────────┘       │
│                                                             │
│  2. Pod Security                                            │
│     ┌──────────────────────────────────────────────┐       │
│     │  - privileged: true (required for eBPF)       │       │
│     │  - readOnlyRootFilesystem: false              │       │
│     │  - runAsNonRoot: false (must be root)         │       │
│     │  - capabilities: [SYS_ADMIN, NET_ADMIN, BPF]  │       │
│     └──────────────────────────────────────────────┘       │
│                                                             │
│  3. Network Policies (Optional)                             │
│     ┌──────────────────────────────────────────────┐       │
│     │  Egress:                                      │       │
│     │  - Allow: Kafka (port 9092)                   │       │
│     │  - Allow: Neo4j (port 7687)                   │       │
│     │  - Allow: K8s API (port 443)                  │       │
│     │  - Deny: All other egress                     │       │
│     └──────────────────────────────────────────────┘       │
│                                                             │
│  4. Data Encryption                                         │
│     ┌──────────────────────────────────────────────┐       │
│     │  - Kafka: TLS optional                        │       │
│     │  - Neo4j: Bolt+TLS optional                   │       │
│     │  - Captured data: Plaintext in memory         │       │
│     └──────────────────────────────────────────────┘       │
│                                                             │
│  5. Data Retention                                          │
│     ┌──────────────────────────────────────────────┐       │
│     │  - Kafka: 24 hours (configurable)             │       │
│     │  - Neo4j: Manual cleanup or TTL               │       │
│     │  - Memory: 2 minute stream timeout            │       │
│     └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Failure Modes & Recovery

```
┌───────────────────────────────────────────────────────────────┐
│                    Failure Scenarios                           │
│                                                                │
│  1. eBPF Load Failure                                          │
│     Cause: Kernel incompatibility, missing BTF                 │
│     Impact: Pod fails to start                                 │
│     Recovery: Check kernel version, verify BTF support         │
│                                                                │
│  2. Kafka Connection Failure                                   │
│     Cause: Kafka down, network partition                       │
│     Impact: Events buffered, potential memory growth           │
│     Recovery: Producer retries, backpressure handling          │
│                                                                │
│  3. Neo4j Connection Failure                                   │
│     Cause: Neo4j down, auth failure                            │
│     Impact: Graph updates lost                                 │
│     Recovery: Logged errors, continues event capture           │
│                                                                │
│  4. K8s API Unavailable                                        │
│     Cause: API server restart, network issue                   │
│     Impact: Cannot enrich new pods                             │
│     Recovery: Cache retains old mappings, retries sync         │
│                                                                │
│  5. Memory Exhaustion                                          │
│     Cause: High traffic, large payloads                        │
│     Impact: OOMKilled by Kubernetes                            │
│     Recovery: DaemonSet restarts pod, consider sampling        │
│                                                                │
│  6. Ringbuffer Overflow                                        │
│     Cause: Userspace processing too slow                       │
│     Impact: Events dropped                                     │
│     Recovery: Logged, increase ringbuf size or filter more     │
└────────────────────────────────────────────────────────────────┘
```

## Monitoring & Observability

```
┌──────────────────────────────────────────────────────────────┐
│                    Observability Stack                        │
│                                                               │
│  Metrics (Future: Prometheus)                                 │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  - ebpf_events_total                                 │     │
│  │  - http_requests_parsed_total                        │     │
│  │  - kafka_events_sent_total                           │     │
│  │  - kafka_errors_total                                │     │
│  │  - neo4j_updates_total                               │     │
│  │  - tcp_streams_active                                │     │
│  │  - memory_usage_bytes                                │     │
│  │  - cpu_usage_seconds                                 │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  Logs (stdout/stderr)                                         │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  - Structured JSON logs                              │     │
│  │  - Log levels: DEBUG, INFO, WARN, ERROR              │     │
│  │  - Captured via Fluentd/Filebeat                     │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  Traces (Future: OpenTelemetry)                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  - Request → Response correlation                    │     │
│  │  - Distributed tracing spans                         │     │
│  └─────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
```

---

This architecture provides a complete, production-ready solution for Kubernetes network monitoring with full observability of HTTP/HTTPS traffic, service dependencies, and performance metrics.

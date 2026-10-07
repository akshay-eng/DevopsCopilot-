# Neo4j Service Graph Queries

This document contains useful Cypher queries for analyzing the service dependency graph.

## Basic Queries

### View All Services

```cypher
MATCH (s:Service)
RETURN s.namespace, s.name
ORDER BY s.namespace, s.name
```

### View All Relationships

```cypher
MATCH (a:Service)-[r:CALLS]->(b:Service)
RETURN
    a.namespace + '/' + a.name AS source,
    b.namespace + '/' + b.name AS target,
    r.request_count AS requests,
    r.error_rate AS error_rate,
    r.p99_latency AS p99_ms,
    r.avg_latency AS avg_ms
ORDER BY r.request_count DESC
```

### Visualize Full Graph

```cypher
MATCH p=(a:Service)-[r:CALLS]->(b:Service)
RETURN p
```

## Health Monitoring

### High Error Rate Services

```cypher
// Services with >5% error rate
MATCH (a:Service)-[r:CALLS]->(b:Service)
WHERE r.error_rate > 0.05
RETURN
    a.name AS caller,
    b.name AS callee,
    r.error_rate AS error_rate,
    r.request_count AS requests
ORDER BY r.error_rate DESC
```

### Slow Dependencies

```cypher
// Dependencies with P99 latency > 1 second
MATCH (a:Service)-[r:CALLS]->(b:Service)
WHERE r.p99_latency > 1000
RETURN
    a.name AS caller,
    b.name AS callee,
    r.p99_latency AS p99_ms,
    r.avg_latency AS avg_ms
ORDER BY r.p99_latency DESC
```

### Most Active Services

```cypher
// Services with most outgoing requests
MATCH (a:Service)-[r:CALLS]->()
RETURN
    a.namespace AS namespace,
    a.name AS service,
    SUM(r.request_count) AS total_requests
ORDER BY total_requests DESC
LIMIT 10
```

### Most Depended Upon Services

```cypher
// Services with most incoming requests
MATCH ()-[r:CALLS]->(b:Service)
RETURN
    b.namespace AS namespace,
    b.name AS service,
    SUM(r.request_count) AS total_requests,
    COUNT(DISTINCT r) AS num_callers
ORDER BY total_requests DESC
LIMIT 10
```

## Topology Analysis

### Service Dependencies (Direct)

```cypher
// All services that Service A depends on
MATCH (a:Service {name: 'frontend'})-[r:CALLS]->(b:Service)
RETURN b.name, r.request_count
ORDER BY r.request_count DESC
```

### Service Dependents (Who Calls This Service)

```cypher
// All services that call Service B
MATCH (a:Service)-[r:CALLS]->(b:Service {name: 'backend'})
RETURN a.name, r.request_count
ORDER BY r.request_count DESC
```

### Transitive Dependencies

```cypher
// All services reachable from frontend (up to 5 hops)
MATCH p=(a:Service {name: 'frontend'})-[r:CALLS*1..5]->(b:Service)
RETURN DISTINCT b.name, LENGTH(p) AS hops
ORDER BY hops, b.name
```

### Critical Path Analysis

```cypher
// Find longest latency path from frontend
MATCH p=(a:Service {name: 'frontend'})-[r:CALLS*1..5]->(b:Service)
WITH p, REDUCE(latency = 0, rel IN relationships(p) | latency + rel.p99_latency) AS total_latency
RETURN
    [node IN nodes(p) | node.name] AS path,
    total_latency AS total_p99_latency_ms
ORDER BY total_latency DESC
LIMIT 10
```

### Circular Dependencies

```cypher
// Find circular dependencies (cycles)
MATCH p=(a:Service)-[r:CALLS*2..5]->(a)
RETURN [node IN nodes(p) | node.name] AS cycle
```

## Namespace Analysis

### Cross-Namespace Communication

```cypher
// Services calling across namespaces
MATCH (a:Service)-[r:CALLS]->(b:Service)
WHERE a.namespace <> b.namespace
RETURN
    a.namespace AS source_ns,
    a.name AS source_svc,
    b.namespace AS target_ns,
    b.name AS target_svc,
    r.request_count AS requests
ORDER BY r.request_count DESC
```

### Namespace Isolation Score

```cypher
// Measure how isolated each namespace is
MATCH (a:Service)-[r:CALLS]->(b:Service)
WITH a.namespace AS ns,
     COUNT(CASE WHEN a.namespace = b.namespace THEN 1 END) AS internal,
     COUNT(CASE WHEN a.namespace <> b.namespace THEN 1 END) AS external
RETURN
    ns,
    internal,
    external,
    toFloat(internal) / (internal + external) AS isolation_score
ORDER BY isolation_score DESC
```

### Services Per Namespace

```cypher
MATCH (s:Service)
RETURN s.namespace, COUNT(s) AS service_count
ORDER BY service_count DESC
```

## Performance Metrics

### Average Latency by Service

```cypher
MATCH ()-[r:CALLS]->(b:Service)
RETURN
    b.namespace AS namespace,
    b.name AS service,
    AVG(r.avg_latency) AS avg_latency_ms,
    AVG(r.p99_latency) AS avg_p99_latency_ms
ORDER BY avg_latency_ms DESC
```

### Request Volume Over Time

```cypher
// Assuming last_updated field exists
MATCH (a:Service)-[r:CALLS]->(b:Service)
WHERE r.last_updated > datetime() - duration('PT1H')
RETURN
    a.name AS source,
    b.name AS target,
    r.request_count AS requests
ORDER BY r.request_count DESC
LIMIT 20
```

### SLA Compliance

```cypher
// Services meeting 99.9% availability (< 0.1% error rate)
MATCH (a:Service)-[r:CALLS]->(b:Service)
WHERE r.error_rate < 0.001 AND r.request_count > 100
RETURN
    b.namespace AS namespace,
    b.name AS service,
    r.error_rate AS error_rate,
    r.request_count AS requests
ORDER BY b.name
```

## Graph Algorithms

### PageRank (Most Important Services)

```cypher
// Requires GDS plugin
CALL gds.pageRank.stream({
    nodeProjection: 'Service',
    relationshipProjection: 'CALLS'
})
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).name AS service, score
ORDER BY score DESC
LIMIT 10
```

### Community Detection

```cypher
// Find service clusters
CALL gds.louvain.stream({
    nodeProjection: 'Service',
    relationshipProjection: 'CALLS'
})
YIELD nodeId, communityId
RETURN communityId, COLLECT(gds.util.asNode(nodeId).name) AS services
ORDER BY SIZE(services) DESC
```

### Shortest Path

```cypher
// Shortest path between two services
MATCH p=shortestPath(
    (a:Service {name: 'frontend'})-[r:CALLS*]->(b:Service {name: 'database'})
)
RETURN [node IN nodes(p) | node.name] AS path, LENGTH(p) AS hops
```

## Maintenance Queries

### Delete Old Relationships

```cypher
// Delete relationships not updated in last 24 hours
MATCH ()-[r:CALLS]->()
WHERE r.last_updated < datetime() - duration('P1D')
DELETE r
```

### Reset Metrics

```cypher
// Reset all metrics to zero
MATCH ()-[r:CALLS]->()
SET r.request_count = 0,
    r.error_rate = 0,
    r.p99_latency = 0,
    r.avg_latency = 0
```

### Clear Graph

```cypher
// Delete all nodes and relationships
MATCH (n)
DETACH DELETE n
```

## Dashboard Queries

### Service Health Dashboard

```cypher
MATCH (s:Service)
OPTIONAL MATCH (s)-[out:CALLS]->()
OPTIONAL MATCH ()-[in:CALLS]->(s)
RETURN
    s.name AS service,
    s.namespace AS namespace,
    COUNT(DISTINCT out) AS outgoing_deps,
    COUNT(DISTINCT in) AS incoming_deps,
    AVG(out.avg_latency) AS avg_outgoing_latency,
    AVG(out.error_rate) AS avg_error_rate,
    SUM(out.request_count) AS total_requests
ORDER BY total_requests DESC
```

### Namespace Overview

```cypher
MATCH (s:Service)
OPTIONAL MATCH (s)-[r:CALLS]->()
WITH s.namespace AS namespace,
     COUNT(DISTINCT s) AS services,
     SUM(r.request_count) AS requests,
     AVG(r.error_rate) AS avg_error_rate,
     AVG(r.avg_latency) AS avg_latency
RETURN
    namespace,
    services,
    requests,
    avg_error_rate,
    avg_latency
ORDER BY requests DESC
```

## Export Data

### Export to JSON

```cypher
// Export graph structure
MATCH (a:Service)-[r:CALLS]->(b:Service)
RETURN {
    source: {namespace: a.namespace, name: a.name},
    target: {namespace: b.namespace, name: b.name},
    metrics: {
        requests: r.request_count,
        error_rate: r.error_rate,
        p99_latency: r.p99_latency,
        avg_latency: r.avg_latency
    }
} AS edge
```

### Export Metrics

```cypher
// Export for external monitoring
MATCH (a:Service)-[r:CALLS]->(b:Service)
RETURN
    a.namespace AS src_ns,
    a.name AS src_svc,
    b.namespace AS dst_ns,
    b.name AS dst_svc,
    r.request_count,
    r.error_rate,
    r.p99_latency,
    r.avg_latency,
    r.last_updated
```

## Advanced Analysis

### Service Blast Radius

```cypher
// If this service fails, what else is affected?
MATCH (failed:Service {name: 'payment-service'})<-[r:CALLS*1..3]-(dependent:Service)
RETURN DISTINCT
    dependent.name AS affected_service,
    dependent.namespace AS namespace,
    LENGTH(r) AS distance
ORDER BY distance, affected_service
```

### Traffic Patterns

```cypher
// Identify hub services (high fan-out and fan-in)
MATCH (s:Service)
OPTIONAL MATCH (s)-[out:CALLS]->()
OPTIONAL MATCH ()-[in:CALLS]->(s)
WITH s, COUNT(DISTINCT out) AS fan_out, COUNT(DISTINCT in) AS fan_in
WHERE fan_out > 5 OR fan_in > 5
RETURN s.name, s.namespace, fan_out, fan_in
ORDER BY (fan_out + fan_in) DESC
```

### Anomaly Detection

```cypher
// Services with unusual error rates (2x average)
MATCH ()-[r:CALLS]->()
WITH AVG(r.error_rate) AS avg_error_rate
MATCH (a:Service)-[r:CALLS]->(b:Service)
WHERE r.error_rate > 2 * avg_error_rate
RETURN
    a.name AS caller,
    b.name AS callee,
    r.error_rate AS error_rate,
    avg_error_rate AS baseline
ORDER BY r.error_rate DESC
```

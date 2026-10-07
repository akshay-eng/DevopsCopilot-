package graph

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type ServiceGraph struct {
	driver       neo4j.DriverWithContext
	edges        map[string]*Edge
	mu           sync.RWMutex
	ctx          context.Context
	cancel       context.CancelFunc
	exportEvery  time.Duration
}

type Edge struct {
	Source      string
	Target      string
	RequestCount int64
	ErrorCount   int64
	TotalLatency int64
	Latencies    []int64
}

type EdgeMetrics struct {
	Source       string  `json:"source"`
	Target       string  `json:"target"`
	RequestCount int64   `json:"request_count"`
	ErrorRate    float64 `json:"error_rate"`
	P99Latency   int64   `json:"p99_latency_ms"`
	AvgLatency   float64 `json:"avg_latency_ms"`
}

func NewServiceGraph(neo4jURI, username, password string) (*ServiceGraph, error) {
	driver, err := neo4j.NewDriverWithContext(neo4jURI, neo4j.BasicAuth(username, password, ""))
	if err != nil {
		return nil, fmt.Errorf("failed to create neo4j driver: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	sg := &ServiceGraph{
		driver:      driver,
		edges:       make(map[string]*Edge),
		ctx:         ctx,
		cancel:      cancel,
		exportEvery: 10 * time.Second,
	}

	return sg, nil
}

func (sg *ServiceGraph) Start() error {
	// Initialize Neo4j schema
	if err := sg.initSchema(); err != nil {
		return fmt.Errorf("failed to initialize schema: %w", err)
	}

	// Start export loop
	go sg.exportLoop()

	log.Println("Service graph started")
	return nil
}

func (sg *ServiceGraph) Stop() error {
	sg.cancel()
	return sg.driver.Close(sg.ctx)
}

func (sg *ServiceGraph) initSchema() error {
	session := sg.driver.NewSession(sg.ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(sg.ctx)

	// Create constraints and indexes
	queries := []string{
		"CREATE CONSTRAINT IF NOT EXISTS FOR (s:Service) REQUIRE s.name IS UNIQUE",
		"CREATE INDEX IF NOT EXISTS FOR (s:Service) ON (s.namespace)",
	}

	for _, query := range queries {
		_, err := session.Run(sg.ctx, query, nil)
		if err != nil {
			return fmt.Errorf("failed to execute query %s: %w", query, err)
		}
	}

	return nil
}

func (sg *ServiceGraph) Update(srcNamespace, srcService, dstNamespace, dstService string, status int, latencyMs int64) {
	if srcService == "" {
		srcService = "unknown"
	}
	if dstService == "" {
		dstService = "unknown"
	}

	source := fmt.Sprintf("%s/%s", srcNamespace, srcService)
	target := fmt.Sprintf("%s/%s", dstNamespace, dstService)
	key := fmt.Sprintf("%s->%s", source, target)

	sg.mu.Lock()
	defer sg.mu.Unlock()

	edge, ok := sg.edges[key]
	if !ok {
		edge = &Edge{
			Source:    source,
			Target:    target,
			Latencies: make([]int64, 0, 1000),
		}
		sg.edges[key] = edge
	}

	edge.RequestCount++
	edge.TotalLatency += latencyMs
	edge.Latencies = append(edge.Latencies, latencyMs)

	// Keep only last 1000 latencies for percentile calculation
	if len(edge.Latencies) > 1000 {
		edge.Latencies = edge.Latencies[len(edge.Latencies)-1000:]
	}

	if status >= 400 {
		edge.ErrorCount++
	}
}

func (sg *ServiceGraph) exportLoop() {
	ticker := time.NewTicker(sg.exportEvery)
	defer ticker.Stop()

	for {
		select {
		case <-sg.ctx.Done():
			return
		case <-ticker.C:
			if err := sg.exportToNeo4j(); err != nil {
				log.Printf("Failed to export to Neo4j: %v", err)
			}
		}
	}
}

func (sg *ServiceGraph) exportToNeo4j() error {
	sg.mu.Lock()
	edges := make([]*Edge, 0, len(sg.edges))
	for _, edge := range sg.edges {
		edges = append(edges, edge)
	}
	// Reset edges
	sg.edges = make(map[string]*Edge)
	sg.mu.Unlock()

	if len(edges) == 0 {
		return nil
	}

	session := sg.driver.NewSession(sg.ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(sg.ctx)

	for _, edge := range edges {
		metrics := sg.calculateMetrics(edge)

		// Parse source and target
		srcParts := parseFQN(edge.Source)
		dstParts := parseFQN(edge.Target)

		query := `
		MERGE (src:Service {name: $src_name, namespace: $src_ns})
		MERGE (dst:Service {name: $dst_name, namespace: $dst_ns})
		MERGE (src)-[r:CALLS]->(dst)
		ON CREATE SET
			r.request_count = $request_count,
			r.error_rate = $error_rate,
			r.p99_latency = $p99_latency,
			r.avg_latency = $avg_latency,
			r.last_updated = datetime()
		ON MATCH SET
			r.request_count = r.request_count + $request_count,
			r.error_rate = ($error_rate + r.error_rate) / 2.0,
			r.p99_latency = ($p99_latency + r.p99_latency) / 2.0,
			r.avg_latency = ($avg_latency + r.avg_latency) / 2.0,
			r.last_updated = datetime()
		`

		params := map[string]interface{}{
			"src_name":      srcParts[1],
			"src_ns":        srcParts[0],
			"dst_name":      dstParts[1],
			"dst_ns":        dstParts[0],
			"request_count": metrics.RequestCount,
			"error_rate":    metrics.ErrorRate,
			"p99_latency":   metrics.P99Latency,
			"avg_latency":   metrics.AvgLatency,
		}

		_, err := session.Run(sg.ctx, query, params)
		if err != nil {
			log.Printf("Failed to update edge %s: %v", edge.Source+"->"+edge.Target, err)
		}
	}

	log.Printf("Exported %d edges to Neo4j", len(edges))
	return nil
}

func (sg *ServiceGraph) calculateMetrics(edge *Edge) *EdgeMetrics {
	metrics := &EdgeMetrics{
		Source:       edge.Source,
		Target:       edge.Target,
		RequestCount: edge.RequestCount,
	}

	if edge.RequestCount > 0 {
		metrics.ErrorRate = float64(edge.ErrorCount) / float64(edge.RequestCount)
		metrics.AvgLatency = float64(edge.TotalLatency) / float64(edge.RequestCount)
	}

	if len(edge.Latencies) > 0 {
		metrics.P99Latency = calculateP99(edge.Latencies)
	}

	return metrics
}

func calculateP99(latencies []int64) int64 {
	if len(latencies) == 0 {
		return 0
	}

	// Simple p99 calculation - sort and take 99th percentile
	sorted := make([]int64, len(latencies))
	copy(sorted, latencies)

	// Bubble sort (good enough for small arrays)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[i] > sorted[j] {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	index := int(float64(len(sorted)) * 0.99)
	if index >= len(sorted) {
		index = len(sorted) - 1
	}

	return sorted[index]
}

func parseFQN(fqn string) [2]string {
	// Parse "namespace/service" format
	for i := 0; i < len(fqn); i++ {
		if fqn[i] == '/' {
			return [2]string{fqn[:i], fqn[i+1:]}
		}
	}
	return [2]string{"default", fqn}
}

func (sg *ServiceGraph) GetMetrics() []*EdgeMetrics {
	sg.mu.RLock()
	defer sg.mu.RUnlock()

	metrics := make([]*EdgeMetrics, 0, len(sg.edges))
	for _, edge := range sg.edges {
		metrics = append(metrics, sg.calculateMetrics(edge))
	}

	return metrics
}

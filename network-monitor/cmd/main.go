package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	httpparser "network-monitor/pkg/http"
	"network-monitor/pkg/ebpf"
	"network-monitor/pkg/graph"
	"network-monitor/pkg/k8s"
	"network-monitor/pkg/kafka"
)

type NetworkMonitor struct {
	ebpfLoader *ebpf.Loader
	k8sCache   *k8s.K8sCache
	httpParser *httpparser.HTTPParser
	kafkaProd  *kafka.Producer
	graph      *graph.ServiceGraph

	// TCP stream reassembly
	streams    map[string]*TCPStream
	mu         sync.RWMutex
	packetCount atomic.Int64

}

type TCPStream struct {
	SrcIP       string
	DstIP       string
	SrcPort     uint16
	DstPort     uint16
	RequestBuf  []byte
	ResponseBuf []byte
	LastSeen    time.Time
	RequestTS   time.Time
	// Pending response waiting for body in next segment
	PendingResp   *httpparser.HTTPRequest
	PendingExpect int // Expected body size from Content-Length
	// L4 bookkeeping: whether we've seen HTTP on this connection, and whether we've
	// already emitted a single L4 (non-HTTP) connection record for it.
	SawHTTP   bool
	L4Emitted bool
}

func main() {
	var (
		bpfObjectPath  = flag.String("bpf-object", "/app/bpf/packet_capture.bpf.o", "Path to eBPF object file")
		libsslPath     = flag.String("libssl", "/usr/lib/x86_64-linux-gnu/libssl.so.3", "Path to libssl.so")
		kubeconfig     = flag.String("kubeconfig", "", "Path to kubeconfig (empty for in-cluster)")
		kafkaBrokers   = flag.String("kafka-brokers", getEnv("KAFKA_BROKERS", "kafka:9092"), "Kafka brokers")
		kafkaTopic     = flag.String("kafka-topic", "network-events", "Kafka topic")
		neo4jURI       = flag.String("neo4j-uri", getEnv("NEO4J_URI", "bolt://neo4j:7687"), "Neo4j URI")
		neo4jUser      = flag.String("neo4j-user", getEnv("NEO4J_USER", "neo4j"), "Neo4j username")
		neo4jPassword  = flag.String("neo4j-password", getEnv("NEO4J_PASSWORD", "password"), "Neo4j password")
		userID         = flag.String("user-id", getEnv("USER_ID", ""), "User ID for Kafka event routing")
		clusterID      = flag.String("cluster-id", getEnv("CLUSTER_ID", ""), "Cluster ID for Kafka event routing")
	)
	flag.Parse()

	log.Println("Starting Network Monitor...")

	// Initialize K8s cache
	k8sCache, err := k8s.NewK8sCache(*kubeconfig)
	if err != nil {
		log.Fatalf("Failed to create K8s cache: %v", err)
	}
	if err := k8sCache.Start(); err != nil {
		log.Fatalf("Failed to start K8s cache: %v", err)
	}

	// Initialize Kafka producer
	brokers := strings.Split(*kafkaBrokers, ",")
	if *userID == "" || *clusterID == "" {
		log.Println("Warning: USER_ID or CLUSTER_ID not set. Events will not be routed to frontend.")
	}
	kafkaProd, err := kafka.NewProducer(brokers, *kafkaTopic, *userID, *clusterID)
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}

	// Initialize service graph (optional - will continue without it)
	var serviceGraph *graph.ServiceGraph
	serviceGraph, err = graph.NewServiceGraph(*neo4jURI, *neo4jUser, *neo4jPassword)
	if err != nil {
		log.Printf("Warning: Failed to create service graph: %v (continuing without Neo4j)", err)
		serviceGraph = nil
	} else if err := serviceGraph.Start(); err != nil {
		log.Printf("Warning: Failed to start service graph: %v (continuing without Neo4j)", err)
		serviceGraph = nil
	} else {
		log.Println("Service graph connected to Neo4j")
	}

	// Initialize network monitor
	monitor := &NetworkMonitor{
		k8sCache:   k8sCache,
		httpParser: httpparser.NewHTTPParser(),
		kafkaProd:  kafkaProd,
		graph:      serviceGraph,
		streams:    make(map[string]*TCPStream),
	}

	// Start cleanup goroutine
	go monitor.cleanupStreams()

	// Start stats goroutine
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			log.Printf("[STATS] Total packets received: %d", monitor.packetCount.Load())
		}
	}()

	// Initialize eBPF loader with handlers
	handlers := &ebpf.Handlers{
		OnPacket: monitor.handlePacket,
		OnSSL:    monitor.handleSSL,
	}

	ebpfLoader, err := ebpf.NewLoader(*bpfObjectPath, handlers)
	if err != nil {
		log.Fatalf("Failed to create eBPF loader: %v", err)
	}
	monitor.ebpfLoader = ebpfLoader

	// Attach TC hooks
	if err := ebpfLoader.AttachTC(); err != nil {
		log.Fatalf("Failed to attach TC: %v", err)
	}

	// Re-scan interfaces periodically so veths for pods created AFTER startup are
	// also tapped. AttachTC is idempotent and only attaches interfaces it hasn't
	// seen yet, so this is cheap.
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if err := ebpfLoader.AttachTC(); err != nil {
				log.Printf("Periodic TC re-attach error: %v", err)
			}
		}
	}()

	// Attach SSL uprobes
	if err := ebpfLoader.AttachSSLUprobes(*libsslPath); err != nil {
		log.Printf("Warning: Failed to attach SSL uprobes: %v", err)
	}

	// Start reading events
	if err := ebpfLoader.StartReading(); err != nil {
		log.Fatalf("Failed to start reading events: %v", err)
	}

	log.Println("Network Monitor is running. Press Ctrl+C to exit.")

	// Handle signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down...")
	ebpfLoader.Close()
	k8sCache.Stop()
	kafkaProd.Close()
	if serviceGraph != nil {
		serviceGraph.Stop()
	}
}

// Skip Kafka broker ports to prevent feedback loop
// (network-monitor captures Kafka traffic -> sends to Kafka -> more traffic -> infinite loop)
func isKafkaPort(port uint16) bool {
	return port == 9092 || port == 9093 || port == 9094 ||
		port == 30092 || port == 30093 || port == 30094 ||
		port == 29092 || port == 29093 || port == 29094
}

func (nm *NetworkMonitor) handlePacket(event *ebpf.PacketEvent) {
	// Skip Kafka broker traffic to prevent feedback loop
	if isKafkaPort(event.SrcPort) || isKafkaPort(event.DstPort) {
		return
	}

	srcIP := ebpf.Uint32ToIP(event.SrcIP)
	dstIP := ebpf.Uint32ToIP(event.DstIP)

	nm.packetCount.Add(1)
	count := nm.packetCount.Load()
	if count <= 20 || count%100 == 0 {
		log.Printf("[DEBUG] Packet #%d: %s:%d -> %s:%d len=%d flags=0x%02x",
			count, srcIP, event.SrcPort, dstIP, event.DstPort, event.Len, event.Flags)
	}

	// Get payload
	if event.Len == 0 {
		return
	}
	payload := event.Data[:event.Len]

	// Check if it's HTTP
	if !httpparser.IsHTTP(payload) {
		// Not HTTP — but could be the body segment for a pending response
		streamKey := getStreamKey(srcIP, dstIP, event.SrcPort, event.DstPort)
		nm.mu.Lock()
		stream, ok := nm.streams[streamKey]
		if ok && stream.PendingResp != nil && stream.PendingExpect > 0 {
			// Attach this data as the body of the pending response
			stream.PendingResp.Body = string(payload)
			stream.PendingResp.BodySize = len(payload)
			if stream.PendingExpect > len(payload) {
				stream.PendingResp.BodySize = stream.PendingExpect
			}
			httpReq := stream.PendingResp
			stream.PendingResp = nil
			stream.PendingExpect = 0
			nm.mu.Unlock()

			log.Printf("[BODY-REASSEMBLY] %s:%d->%s:%d bodyLen=%d",
				srcIP, event.SrcPort, dstIP, event.DstPort, len(payload))

			// Send the completed response to Kafka
			nm.sendToKafka(srcIP, dstIP, event.SrcPort, event.DstPort, httpReq, int(event.Len))
			return
		}

		// Not a pending HTTP body — treat as a generic L4 connection (database,
		// cache, gRPC/HTTP2, TLS/HTTPS, DNS, message bus, external calls, …).
		// Emit exactly ONE record per connection so the dependency appears on the
		// workload map without flooding it with a record per packet.
		if !ok {
			stream = &TCPStream{
				SrcIP:   srcIP,
				DstIP:   dstIP,
				SrcPort: event.SrcPort,
				DstPort: event.DstPort,
			}
			nm.streams[streamKey] = stream
		}
		stream.LastSeen = time.Now()
		emitL4 := !stream.SawHTTP && !stream.L4Emitted
		if emitL4 {
			stream.L4Emitted = true
		}
		nm.mu.Unlock()

		if emitL4 {
			nm.sendL4ToKafka(srcIP, dstIP, event.SrcPort, event.DstPort, int(event.Len))
		}
		return
	}

	// Parse HTTP
	httpReq, err := nm.httpParser.Parse(payload)
	if err != nil {
		return
	}

	// Get stream for latency/reassembly
	streamKey := getStreamKey(srcIP, dstIP, event.SrcPort, event.DstPort)

	nm.mu.Lock()
	stream, ok := nm.streams[streamKey]
	if !ok {
		stream = &TCPStream{
			SrcIP:   srcIP,
			DstIP:   dstIP,
			SrcPort: event.SrcPort,
			DstPort: event.DstPort,
		}
		nm.streams[streamKey] = stream
	}
	stream.LastSeen = time.Now()
	stream.SawHTTP = true // HTTP connection — don't also emit a generic L4 record

	if httpReq.IsRequest {
		stream.RequestTS = time.Now()
		stream.RequestBuf = payload
	} else {
		// Response - calculate latency
		if !stream.RequestTS.IsZero() {
			httpReq.LatencyMs = time.Since(stream.RequestTS).Milliseconds()
		}
		// If response has Content-Length but no body, save as pending for reassembly
		if httpReq.Body == "" && httpReq.Headers["Content-Length"] != "" {
			cl, _ := strconv.Atoi(httpReq.Headers["Content-Length"])
			if cl > 0 {
				stream.PendingResp = httpReq
				stream.PendingExpect = cl
				nm.mu.Unlock()
				return // Wait for body segment
			}
		}
	}
	nm.mu.Unlock()

	nm.sendToKafka(srcIP, dstIP, event.SrcPort, event.DstPort, httpReq, int(event.Len))
}

func (nm *NetworkMonitor) sendToKafka(srcIP, dstIP string, srcPort, dstPort uint16, httpReq *httpparser.HTTPRequest, bytes int) {
	srcMeta, _ := nm.k8sCache.GetPodByIP(srcIP)
	dstMeta, _ := nm.k8sCache.GetPodByIP(dstIP)

	kafkaEvent := &kafka.NetworkEvent{
		Timestamp: time.Now(),
		Src: &kafka.EndpointMeta{
			IP:   srcIP,
			Port: srcPort,
		},
		Dst: &kafka.EndpointMeta{
			IP:   dstIP,
			Port: dstPort,
		},
		HTTP: &kafka.HTTPData{
			Method:        httpReq.Method,
			Path:          httpReq.Path,
			Query:         httpReq.Query,
			Headers:       httpReq.Headers,
			Body:          httpReq.Body,
			BodyTruncated: httpReq.BodyTruncated,
			BodySize:      httpReq.BodySize,
			Status:        httpReq.Status,
			LatencyMs:     httpReq.LatencyMs,
		},
		Bytes:    bytes,
		Protocol: "TCP",
	}

	if srcMeta != nil {
		kafkaEvent.Src.Pod = srcMeta.Name
		kafkaEvent.Src.Namespace = srcMeta.Namespace
		kafkaEvent.Src.Service = srcMeta.Service
		kafkaEvent.Src.Labels = srcMeta.Labels
	}

	if dstMeta != nil {
		kafkaEvent.Dst.Pod = dstMeta.Name
		kafkaEvent.Dst.Namespace = dstMeta.Namespace
		kafkaEvent.Dst.Service = dstMeta.Service
		kafkaEvent.Dst.Labels = dstMeta.Labels
	}

	if err := nm.kafkaProd.SendEvent(kafkaEvent); err != nil {
		// Kafka send failed - not critical since we also use webhook
	} else {
		log.Printf("[KAFKA] Sent: %s %s %s:%d -> %s:%d status=%d",
			httpReq.Method, httpReq.Path, srcIP, srcPort, dstIP, dstPort, httpReq.Status)
	}

	if nm.graph != nil && srcMeta != nil && dstMeta != nil && !httpReq.IsRequest {
		nm.graph.Update(
			srcMeta.Namespace, srcMeta.Service,
			dstMeta.Namespace, dstMeta.Service,
			httpReq.Status, httpReq.LatencyMs,
		)
	}
}

// sendL4ToKafka emits a single connection-level record for non-HTTP traffic so the
// dependency shows up on the workload map. It orients the edge client -> server
// (the side on a service port is the server) and labels each end as a pod when
// resolvable, otherwise leaves it as a bare IP (external / service-VIP / node).
func (nm *NetworkMonitor) sendL4ToKafka(srcIP, dstIP string, srcPort, dstPort uint16, bytes int) {
	cIP, cPort, sIP, sPort := srcIP, srcPort, dstIP, dstPort
	// The eBPF filter guarantees at least one side is on a service port (<32768).
	// If the source is the service side, flip so we record client -> server.
	if srcPort < 32768 && dstPort >= 32768 {
		cIP, cPort, sIP, sPort = dstIP, dstPort, srcIP, srcPort
	}

	event := &kafka.NetworkEvent{
		Timestamp: time.Now(),
		Src:       &kafka.EndpointMeta{IP: cIP, Port: cPort},
		Dst:       &kafka.EndpointMeta{IP: sIP, Port: sPort},
		Bytes:     bytes,
		Protocol:  inferProtocol(sPort),
	}

	if m, _ := nm.k8sCache.GetPodByIP(cIP); m != nil {
		applyPodMeta(event.Src, m)
	}
	if m, _ := nm.k8sCache.GetPodByIP(sIP); m != nil {
		applyPodMeta(event.Dst, m)
	}

	if err := nm.kafkaProd.SendEvent(event); err == nil {
		log.Printf("[KAFKA] L4 %s %s:%d -> %s:%d (%d bytes)",
			event.Protocol, cIP, cPort, sIP, sPort, bytes)
	}
}

func applyPodMeta(ep *kafka.EndpointMeta, m *k8s.PodMeta) {
	ep.Pod = m.Name
	ep.Namespace = m.Namespace
	ep.Service = m.Service
	ep.Labels = m.Labels
}

// inferProtocol labels a connection by its server port for map colouring.
func inferProtocol(serverPort uint16) string {
	switch serverPort {
	case 443, 8443, 6443, 4443:
		return "TLS"
	case 53:
		return "DNS"
	default:
		return "TCP"
	}
}

func (nm *NetworkMonitor) handleSSL(event *ebpf.SSLEvent) {
	// Get payload
	payload := event.Data[:event.Len]

	// Check if it's HTTP
	if !httpparser.IsHTTP(payload) {
		return
	}

	// Parse HTTP
	httpReq, err := nm.httpParser.Parse(payload)
	if err != nil {
		return
	}

	// For SSL, we can't easily correlate request/response without more context
	// So we'll just send individual events

	// Send to Kafka with PID/TID info
	kafkaEvent := &kafka.NetworkEvent{
		Timestamp: time.Now(),
		Src: &kafka.EndpointMeta{
			IP: "unknown", // SSL doesn't give us IP directly
		},
		Dst: &kafka.EndpointMeta{
			IP: "unknown",
		},
		HTTP: &kafka.HTTPData{
			Method:        httpReq.Method,
			Path:          httpReq.Path,
			Query:         httpReq.Query,
			Headers:       httpReq.Headers,
			Body:          httpReq.Body,
			BodyTruncated: httpReq.BodyTruncated,
			BodySize:      httpReq.BodySize,
			Status:        httpReq.Status,
		},
		Bytes:    int(event.Len),
		Protocol: "TLS",
	}

	if err := nm.kafkaProd.SendEvent(kafkaEvent); err != nil {
		log.Printf("Failed to send SSL event to Kafka: %v", err)
	}
}

func (nm *NetworkMonitor) cleanupStreams() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		nm.mu.Lock()
		now := time.Now()
		for key, stream := range nm.streams {
			if now.Sub(stream.LastSeen) > 2*time.Minute {
				delete(nm.streams, key)
			}
		}
		nm.mu.Unlock()
	}
}

// getStreamKey returns a canonical, direction-independent key for a connection so
// that a request (A->B) and its response (B->A) map to the SAME stream. The old
// implementation used string(rune(port)) and included direction, so request and
// response never correlated (broken latency) — this fixes both.
func getStreamKey(srcIP, dstIP string, srcPort, dstPort uint16) string {
	a := fmt.Sprintf("%s:%d", srcIP, srcPort)
	b := fmt.Sprintf("%s:%d", dstIP, dstPort)
	if a < b {
		return a + "|" + b
	}
	return b + "|" + a
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

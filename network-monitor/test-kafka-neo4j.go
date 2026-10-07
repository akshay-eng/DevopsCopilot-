package main

import (
	"log"
	"time"

	"network-monitor/pkg/graph"
	"network-monitor/pkg/kafka"
)

func main() {
	log.Println("Testing Kafka and Neo4j Connectivity...")

	// Test 1: Kafka Connection
	log.Println("\n=== Testing Kafka Connection ===")
	brokers := []string{
		"192.168.1.249:9092",
		"192.168.1.245:9093",
		"192.168.1.246:9094",
	}

	kafkaProd, err := kafka.NewProducer(brokers, "network-events")
	if err != nil {
		log.Fatalf("Failed to create Kafka producer: %v", err)
	}
	defer kafkaProd.Close()

	log.Println("✓ Kafka producer created!")

	// Send test event
	testEvent := &kafka.NetworkEvent{
		Timestamp: time.Now(),
		Src: &kafka.EndpointMeta{
			IP:        "10.1.2.3",
			Pod:       "test-pod",
			Namespace: "default",
			Service:   "test-service",
		},
		Dst: &kafka.EndpointMeta{
			IP:        "10.1.2.4",
			Pod:       "test-pod-2",
			Namespace: "default",
			Service:   "test-service-2",
		},
		HTTP: &kafka.HTTPData{
			Method:    "GET",
			Path:      "/health",
			Status:    200,
			LatencyMs: 10,
		},
	}

	log.Println("Sending test event...")
	if err := kafkaProd.SendEvent(testEvent); err != nil {
		log.Fatalf("Failed to send test event: %v", err)
	}

	log.Println("✓ Test event sent to Kafka!")
	time.Sleep(2 * time.Second)

	// Test 2: Neo4j Connection
	log.Println("\n=== Testing Neo4j Connection ===")
	serviceGraph, err := graph.NewServiceGraph(
		"bolt://10.43.47.95:7687",
		"neo4j",
		"changeme",
	)
	if err != nil {
		log.Fatalf("Failed to create service graph: %v", err)
	}
	defer serviceGraph.Stop()

	if err := serviceGraph.Start(); err != nil {
		log.Fatalf("Failed to start service graph: %v", err)
	}

	log.Println("✓ Neo4j connected!")

	// Update graph
	log.Println("Creating test service graph edge...")
	serviceGraph.Update("default", "test-service", "default", "test-service-2", 200, 10)
	serviceGraph.Update("default", "test-service", "default", "test-service-2", 200, 15)
	serviceGraph.Update("default", "test-service", "default", "test-service-2", 200, 12)
	serviceGraph.Update("default", "test-service", "prod", "api-service", 200, 25)
	log.Println("✓ Test service graph edges created!")

	// Wait for export
	log.Println("Waiting for Neo4j export (12 seconds)...")
	time.Sleep(13 * time.Second)

	log.Println("\n=== ✅ All Connectivity Tests Passed! ===")
	log.Println("\nNext steps:")
	log.Println("1. Check Kafka topic:")
	log.Println("   kubectl exec -it -n kafka kafka-broker-1-0 -- kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic network-events --from-beginning")
	log.Println("\n2. Check Neo4j graph:")
	log.Println("   kubectl port-forward svc/neo4j 7474:7474 7687:7687")
	log.Println("   Then open http://localhost:7474")
	log.Println("   Login: neo4j / changeme")
	log.Println("   Query: MATCH (a:Service)-[r:CALLS]->(b:Service) RETURN a.namespace, a.name, b.namespace, b.name, r.request_count, r.avg_latency")
}

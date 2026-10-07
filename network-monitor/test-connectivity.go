package main

import (
	"log"
	"time"

	"network-monitor/pkg/graph"
	"network-monitor/pkg/kafka"
	"network-monitor/pkg/k8s"
)

func main() {
	log.Println("Testing Network Monitor Connectivity...")

	// Test 1: K8s Connection
	log.Println("\n=== Testing Kubernetes Connection ===")
	kubeconfigPath := "" // Will use default ~/.kube/config
	k8sCache, err := k8s.NewK8sCache(kubeconfigPath)
	if err != nil {
		log.Printf("Trying with home kube config...")
		home := "/Users/akshay"
		kubeconfigPath = home + "/.kube/config"
		k8sCache, err = k8s.NewK8sCache(kubeconfigPath)
		if err != nil {
			log.Fatalf("Failed to create K8s cache: %v", err)
		}
	}

	if err := k8sCache.Start(); err != nil {
		log.Fatalf("Failed to start K8s cache: %v", err)
	}
	defer k8sCache.Stop()

	time.Sleep(2 * time.Second)
	pods := k8sCache.GetAllPods()
	log.Printf("✓ K8s connected! Found %d pods", len(pods))
	if len(pods) > 0 {
		log.Printf("  Sample pod: %s/%s (IP: %s)", pods[0].Namespace, pods[0].Name, pods[0].IP)
	}

	// Test 2: Kafka Connection
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

	if err := kafkaProd.SendEvent(testEvent); err != nil {
		log.Fatalf("Failed to send test event: %v", err)
	}

	log.Println("✓ Test event sent to Kafka!")
	time.Sleep(1 * time.Second)

	// Test 3: Neo4j Connection
	log.Println("\n=== Testing Neo4j Connection ===")
	serviceGraph, err := graph.NewServiceGraph(
		"bolt://10.43.47.95:7687",  // ClusterIP from kubectl get svc
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
	serviceGraph.Update("default", "test-service", "default", "test-service-2", 200, 10)
	log.Println("✓ Test service graph edge created!")

	// Wait for export
	time.Sleep(12 * time.Second)

	log.Println("\n=== All Connectivity Tests Passed! ===")
	log.Println("\nNext steps:")
	log.Println("1. Check Kafka topic: kubectl exec -it kafka-broker-1-0 -n default -- kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic network-events --from-beginning")
	log.Println("2. Check Neo4j: kubectl port-forward svc/neo4j 7474:7474 7687:7687")
	log.Println("3. Open http://localhost:7474 and run: MATCH (a:Service)-[r:CALLS]->(b:Service) RETURN a.name, b.name, r")
}

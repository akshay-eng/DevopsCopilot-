package kafka

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/IBM/sarama"
)

type NetworkEvent struct {
	UserID    string            `json:"userId,omitempty"`
	ClusterID string            `json:"clusterId,omitempty"`
	Timestamp time.Time         `json:"ts"`
	Src       *EndpointMeta     `json:"src"`
	Dst       *EndpointMeta     `json:"dst"`
	HTTP      *HTTPData         `json:"http,omitempty"`
	Bytes     int               `json:"bytes,omitempty"`
	Protocol  string            `json:"protocol,omitempty"`
}

type EndpointMeta struct {
	IP        string            `json:"ip"`
	Port      uint16            `json:"port,omitempty"`
	Pod       string            `json:"pod,omitempty"`
	Namespace string            `json:"ns,omitempty"`
	Service   string            `json:"svc,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

type HTTPData struct {
	Method        string            `json:"method,omitempty"`
	Path          string            `json:"path,omitempty"`
	Query         map[string]string `json:"query,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	Body          string            `json:"body,omitempty"`
	BodyTruncated bool              `json:"bodyTruncated,omitempty"`
	BodySize      int               `json:"bodySize,omitempty"`
	Status        int               `json:"status,omitempty"`
	LatencyMs     int64             `json:"latency_ms,omitempty"`
}

type Producer struct {
	producer  sarama.AsyncProducer
	topic     string
	errors    chan error
	userID    string
	clusterID string
}

func NewProducer(brokers []string, topic, userID, clusterID string) (*Producer, error) {
	config := sarama.NewConfig()
	config.Producer.RequiredAcks = sarama.WaitForLocal
	config.Producer.Compression = sarama.CompressionNone
	config.Producer.Return.Errors = true
	config.Producer.Return.Successes = false
	config.Producer.Flush.Frequency = 50 * time.Millisecond
	config.Producer.Flush.Messages = 500
	config.ChannelBufferSize = 4096

	producer, err := sarama.NewAsyncProducer(brokers, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka producer: %w", err)
	}

	p := &Producer{
		producer:  producer,
		topic:     topic,
		errors:    make(chan error, 100),
		userID:    userID,
		clusterID: clusterID,
	}

	// Handle errors
	go func() {
		for err := range producer.Errors() {
			log.Printf("Kafka producer error: %v", err)
			select {
			case p.errors <- err.Err:
			default:
			}
		}
	}()

	log.Printf("Kafka producer connected to %v, topic: %s", brokers, topic)
	return p, nil
}

func (p *Producer) SendEvent(event *NetworkEvent) error {
	// Inject userId/clusterId for backend routing
	event.UserID = p.userID
	event.ClusterID = p.clusterID

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	msg := &sarama.ProducerMessage{
		Topic: p.topic,
		Value: sarama.ByteEncoder(data),
		Key:   sarama.StringEncoder(fmt.Sprintf("%s-%s", event.Src.IP, event.Dst.IP)),
	}

	select {
	case p.producer.Input() <- msg:
		return nil
	default:
		return fmt.Errorf("producer input channel is full")
	}
}

func (p *Producer) Errors() <-chan error {
	return p.errors
}

func (p *Producer) Close() error {
	return p.producer.Close()
}

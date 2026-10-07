package k8s

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type PodMeta struct {
	IP        string            `json:"ip"`
	Name      string            `json:"pod"`
	Namespace string            `json:"ns"`
	Service   string            `json:"svc,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

type K8sCache struct {
	client    kubernetes.Interface
	ipToPod   map[string]*PodMeta
	mu        sync.RWMutex
	ctx       context.Context
	cancel    context.CancelFunc
	syncEvery time.Duration
}

func NewK8sCache(kubeconfigPath string) (*K8sCache, error) {
	var config *rest.Config
	var err error

	if kubeconfigPath != "" {
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	} else {
		// In-cluster config
		config, err = rest.InClusterConfig()
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create k8s config: %w", err)
	}

	client, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create k8s client: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	cache := &K8sCache{
		client:    client,
		ipToPod:   make(map[string]*PodMeta),
		ctx:       ctx,
		cancel:    cancel,
		syncEvery: 30 * time.Second,
	}

	return cache, nil
}

func (kc *K8sCache) Start() error {
	// Initial sync
	if err := kc.Sync(); err != nil {
		return fmt.Errorf("initial sync failed: %w", err)
	}

	// Start periodic sync
	go kc.syncLoop()

	log.Println("K8s cache started")
	return nil
}

func (kc *K8sCache) Stop() {
	kc.cancel()
}

func (kc *K8sCache) syncLoop() {
	ticker := time.NewTicker(kc.syncEvery)
	defer ticker.Stop()

	for {
		select {
		case <-kc.ctx.Done():
			return
		case <-ticker.C:
			if err := kc.Sync(); err != nil {
				log.Printf("Failed to sync k8s cache: %v", err)
			}
		}
	}
}

func (kc *K8sCache) Sync() error {
	ctx, cancel := context.WithTimeout(kc.ctx, 10*time.Second)
	defer cancel()

	// List all pods
	pods, err := kc.client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list pods: %w", err)
	}

	// List all services
	services, err := kc.client.CoreV1().Services("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("failed to list services: %w", err)
	}

	// Build service name map
	svcMap := make(map[string]map[string]string) // namespace -> labels -> service name
	for _, svc := range services.Items {
		if svcMap[svc.Namespace] == nil {
			svcMap[svc.Namespace] = make(map[string]string)
		}
		for key, val := range svc.Spec.Selector {
			svcMap[svc.Namespace][fmt.Sprintf("%s=%s", key, val)] = svc.Name
		}
	}

	newCache := make(map[string]*PodMeta)

	for _, pod := range pods.Items {
		if pod.Status.PodIP == "" || pod.Status.Phase != corev1.PodRunning {
			continue
		}

		meta := &PodMeta{
			IP:        pod.Status.PodIP,
			Name:      pod.Name,
			Namespace: pod.Namespace,
			Labels:    pod.Labels,
		}

		// Find service name
		if pod.Labels != nil {
			for key, val := range pod.Labels {
				svcKey := fmt.Sprintf("%s=%s", key, val)
				if svcName, ok := svcMap[pod.Namespace][svcKey]; ok {
					meta.Service = svcName
					break
				}
			}
		}

		newCache[pod.Status.PodIP] = meta
	}

	kc.mu.Lock()
	kc.ipToPod = newCache
	kc.mu.Unlock()

	log.Printf("K8s cache synced: %d pods", len(newCache))
	return nil
}

func (kc *K8sCache) GetPodByIP(ip string) (*PodMeta, bool) {
	kc.mu.RLock()
	defer kc.mu.RUnlock()

	meta, ok := kc.ipToPod[ip]
	return meta, ok
}

func (kc *K8sCache) GetAllPods() []*PodMeta {
	kc.mu.RLock()
	defer kc.mu.RUnlock()

	pods := make([]*PodMeta, 0, len(kc.ipToPod))
	for _, pod := range kc.ipToPod {
		pods = append(pods, pod)
	}

	return pods
}

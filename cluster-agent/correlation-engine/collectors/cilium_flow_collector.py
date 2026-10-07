"""
Cilium Flow Collector - Collects real-time network flows from Hubble Relay
"""
import logging
import json
import subprocess
import threading
from datetime import datetime
from typing import Dict, List, Optional
from collections import defaultdict
from confluent_kafka import Producer

logger = logging.getLogger(__name__)


class CiliumFlowCollector:
    """Collects network flows from Cilium Hubble Relay"""

    def __init__(self, hubble_relay_url: str, kafka_producer: Producer, kafka_topic: str = "network-flows"):
        self.hubble_relay_url = hubble_relay_url
        self.kafka_producer = kafka_producer
        self.kafka_topic = kafka_topic

        # Flow buffer (last 10 minutes)
        self.flow_buffer = []
        self.buffer_duration = 600  # 10 minutes in seconds

        # Service graph
        self.service_graph = defaultdict(lambda: {
            'downstream': set(),  # Services this calls
            'upstream': set(),    # Services that call this
            'request_count': defaultdict(int),
            'error_count': defaultdict(int),
            'latencies': defaultdict(list)
        })

        self.is_running = False
        self.collector_thread = None

    def start(self):
        """Start collecting flows in background thread"""
        if self.is_running:
            logger.warning("Cilium flow collector already running")
            return

        self.is_running = True
        self.collector_thread = threading.Thread(target=self._collect_flows, daemon=True)
        self.collector_thread.start()
        logger.info("✅ Cilium flow collector started")

    def stop(self):
        """Stop collecting flows"""
        self.is_running = False
        if self.collector_thread:
            self.collector_thread.join(timeout=5)
        logger.info("Cilium flow collector stopped")

    def _collect_flows(self):
        """Background task to collect flows from Hubble"""
        try:
            # Start hubble observe in subprocess
            cmd = [
                'hubble',
                'observe',
                '--server', self.hubble_relay_url,
                '--follow',
                '--output', 'json'
            ]

            logger.info(f"Starting hubble observe: {' '.join(cmd)}")

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1
            )

            while self.is_running:
                line = process.stdout.readline()
                if not line:
                    break

                try:
                    flow_data = json.loads(line.strip())
                    self._process_flow(flow_data)
                except json.JSONDecodeError:
                    continue
                except Exception as e:
                    logger.error(f"Error processing flow: {e}")

        except FileNotFoundError:
            logger.error("❌ 'hubble' CLI tool not found. Install Cilium CLI: https://docs.cilium.io/en/stable/gettingstarted/hubble_setup/")
        except Exception as e:
            logger.error(f"Error in flow collector: {e}")
        finally:
            if 'process' in locals():
                process.terminate()

    def _process_flow(self, raw_flow: Dict):
        """Process and normalize a flow from Hubble"""
        try:
            # Extract relevant fields from Hubble flow
            flow = self._normalize_flow(raw_flow)

            if not flow:
                return

            # Add to buffer
            self._add_to_buffer(flow)

            # Update service graph
            self._update_service_graph(flow)

            # Publish to Kafka
            self._publish_to_kafka(flow)

        except Exception as e:
            logger.error(f"Error processing flow: {e}")

    def _normalize_flow(self, raw_flow: Dict) -> Optional[Dict]:
        """Normalize Hubble flow to standard format"""
        try:
            # Check if this is an L7 (HTTP) flow
            l7 = raw_flow.get('l7', {})
            http = l7.get('http', {})

            if not http:
                # Skip non-HTTP flows for now
                return None

            source = raw_flow.get('source', {})
            dest = raw_flow.get('destination', {})

            # Extract service names from labels
            source_labels = source.get('labels', [])
            dest_labels = dest.get('labels', [])

            source_service = self._extract_service_name(source_labels)
            dest_service = self._extract_service_name(dest_labels)

            if not source_service or not dest_service:
                return None

            flow = {
                'timestamp': raw_flow.get('time', datetime.utcnow().isoformat() + 'Z'),
                'source': {
                    'service': source_service,
                    'pod': source.get('pod_name', ''),
                    'namespace': source.get('namespace', ''),
                    'ip': source.get('IP', '')
                },
                'destination': {
                    'service': dest_service,
                    'pod': dest.get('pod_name', ''),
                    'namespace': dest.get('namespace', ''),
                    'ip': dest.get('IP', '')
                },
                'http': {
                    'method': http.get('method', ''),
                    'url': http.get('url', ''),
                    'status_code': http.get('code', 0),
                    'protocol': http.get('protocol', '')
                },
                'latency_ms': http.get('latency', 0) / 1000000,  # Convert ns to ms
                'bytes_sent': raw_flow.get('reply', {}).get('bytes', 0),
                'bytes_received': raw_flow.get('request', {}).get('bytes', 0)
            }

            return flow

        except Exception as e:
            logger.error(f"Error normalizing flow: {e}")
            return None

    def _extract_service_name(self, labels: List[str]) -> Optional[str]:
        """Extract service name from pod labels"""
        for label in labels:
            if label.startswith('k8s:app='):
                return label.split('=', 1)[1]
            if label.startswith('k8s:app.kubernetes.io/name='):
                return label.split('=', 1)[1]
        return None

    def _add_to_buffer(self, flow: Dict):
        """Add flow to buffer and maintain 10-minute window"""
        now = datetime.utcnow()
        flow['_added_at'] = now

        # Add to buffer
        self.flow_buffer.append(flow)

        # Remove old flows (older than 10 minutes)
        cutoff_time = now.timestamp() - self.buffer_duration
        self.flow_buffer = [
            f for f in self.flow_buffer
            if f['_added_at'].timestamp() > cutoff_time
        ]

    def _update_service_graph(self, flow: Dict):
        """Update service dependency graph from flow"""
        source_svc = flow['source']['service']
        dest_svc = flow['destination']['service']

        # Update graph
        self.service_graph[source_svc]['downstream'].add(dest_svc)
        self.service_graph[dest_svc]['upstream'].add(source_svc)

        # Track request counts
        edge_key = f"{source_svc}->{dest_svc}"
        self.service_graph[source_svc]['request_count'][dest_svc] += 1

        # Track errors (HTTP 5xx)
        status_code = flow['http']['status_code']
        if 500 <= status_code < 600:
            self.service_graph[source_svc]['error_count'][dest_svc] += 1

        # Track latency
        latency = flow['latency_ms']
        self.service_graph[source_svc]['latencies'][dest_svc].append(latency)

        # Keep only last 100 latencies
        if len(self.service_graph[source_svc]['latencies'][dest_svc]) > 100:
            self.service_graph[source_svc]['latencies'][dest_svc] = \
                self.service_graph[source_svc]['latencies'][dest_svc][-100:]

    def _publish_to_kafka(self, flow: Dict):
        """Publish flow to Kafka"""
        try:
            # Remove internal fields
            flow_copy = {k: v for k, v in flow.items() if not k.startswith('_')}

            self.kafka_producer.produce(
                self.kafka_topic,
                value=json.dumps(flow_copy).encode('utf-8')
            )
            self.kafka_producer.poll(0)
        except Exception as e:
            logger.error(f"Error publishing flow to Kafka: {e}")

    def get_flows_for_service(self, service_name: str, minutes: int = 10) -> List[Dict]:
        """Get flows involving a specific service"""
        flows = [
            f for f in self.flow_buffer
            if f['source']['service'] == service_name or
               f['destination']['service'] == service_name
        ]
        return flows

    def get_flows_before_time(self, before_time: datetime, minutes: int = 10) -> List[Dict]:
        """Get flows from N minutes before a specific time"""
        start_time = before_time.timestamp() - (minutes * 60)
        end_time = before_time.timestamp()

        flows = [
            f for f in self.flow_buffer
            if start_time <= f['_added_at'].timestamp() <= end_time
        ]
        return flows

    def get_service_graph(self) -> Dict:
        """Get current service dependency graph"""
        # Convert sets to lists for JSON serialization
        graph = {}
        for service, data in self.service_graph.items():
            graph[service] = {
                'downstream': list(data['downstream']),
                'upstream': list(data['upstream']),
                'request_counts': dict(data['request_count']),
                'error_counts': dict(data['error_count']),
                'avg_latencies': {
                    target: sum(latencies) / len(latencies) if latencies else 0
                    for target, latencies in data['latencies'].items()
                }
            }

        return {
            'services': graph,
            'last_updated': datetime.utcnow().isoformat() + 'Z',
            'has_cilium': True
        }

    def analyze_flows_for_alert(self, pod_name: str, namespace: str, lookback_minutes: int = 10) -> Dict:
        """Analyze flows related to a specific pod/service"""
        # Find service name from pod
        service_name = None
        for flow in self.flow_buffer:
            if flow['source']['pod'] == pod_name or flow['destination']['pod'] == pod_name:
                service_name = flow['source']['service'] if flow['source']['pod'] == pod_name else flow['destination']['service']
                break

        if not service_name:
            return {'flows_before_error': [], 'flow_analysis': {}}

        # Get flows for this service
        service_flows = self.get_flows_for_service(service_name, minutes=lookback_minutes)

        # Analyze
        total_requests = len(service_flows)
        error_count = sum(1 for f in service_flows if 500 <= f['http']['status_code'] < 600)
        status_distribution = defaultdict(int)

        for flow in service_flows:
            status_distribution[str(flow['http']['status_code'])] += 1

        return {
            'flows_before_error': service_flows[-20:],  # Last 20 flows
            'flow_analysis': {
                'total_requests': total_requests,
                'error_count': error_count,
                'error_rate': error_count / total_requests if total_requests > 0 else 0,
                'status_distribution': dict(status_distribution)
            }
        }

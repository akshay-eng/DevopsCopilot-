"""
Alert Correlator - Correlates related alerts and creates incidents
"""
import logging
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)


class AlertCorrelator:
    """Correlates alerts and creates incidents"""

    def __init__(self, network_collector=None, service_graph_builder=None):
        self.network_collector = network_collector  # Cilium or None
        self.service_graph_builder = service_graph_builder  # Simple graph or None

        # Alert buffer (10-minute sliding window)
        self.alert_buffer = []
        self.correlation_window = 600  # 10 minutes

        # Deduplication cache (5-minute window)
        self.seen_signatures = {}
        self.dedup_window = 300  # 5 minutes

        # Known alert cascade patterns
        self.cascade_patterns = {
            'database_cascade': [
                'DatabaseConnectionFailed',
                'HighErrorRate',
                'ServiceUnavailable'
            ],
            'memory_cascade': [
                'PodOOMKilled',
                'KubePodCrashLooping',
                'CrashLoopBackOff'
            ],
            'kafka_cascade': [
                'KafkaConsumerLagIncreasing',
                'KubePodCrashLooping',
                'KubeDeploymentReplicasMismatch'
            ],
            'disk_pressure_cascade': [
                'DiskPressure',
                'NodeNotReady',
                'KubePodCrashLooping'
            ],
            'resource_exhaustion': [
                'HighCPUUsage',
                'HighMemoryUsage',
                'PodOOMKilled'
            ]
        }

        # Root cause priority (higher = more likely to be root cause)
        self.root_cause_priority = {
            'PodOOMKilled': 10,
            'DatabaseConnectionFailed': 9,
            'KafkaConsumerLagIncreasing': 9,
            'DiskPressure': 8,
            'NodeNotReady': 8,
            'HighCPUUsage': 7,
            'HighMemoryUsage': 7,
            'KubePodCrashLooping': 5,
            'KubeDeploymentReplicasMismatch': 3,
            'HighErrorRate': 2,
            'ServiceUnavailable': 1
        }

    def process_alert(self, enriched_alert: Dict) -> Optional[Dict]:
        """
        Process an enriched alert and return incident if correlated.
        Returns None if alert is duplicate or should not create incident.
        """
        # 1. Check for duplicates
        if self._is_duplicate(enriched_alert):
            logger.info(f"Skipping duplicate alert: {enriched_alert['labels'].get('alertname')}")
            return None

        # 2. Add to buffer
        self._add_to_buffer(enriched_alert)

        # 3. Find correlated alerts
        correlated_alerts = self._find_correlated_alerts(enriched_alert)

        if not correlated_alerts:
            logger.info(f"No correlation found for alert: {enriched_alert['labels'].get('alertname')}")
            return None

        # 4. Create incident from correlated alerts
        incident = self._create_incident(correlated_alerts)

        return incident

    def _is_duplicate(self, alert: Dict) -> bool:
        """Check if alert is a duplicate within 5-minute window"""
        signature = self._create_alert_signature(alert)

        # Clean old signatures
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=self.dedup_window)
        self.seen_signatures = {
            sig: timestamp for sig, timestamp in self.seen_signatures.items()
            if timestamp > cutoff
        }

        # Check if seen
        if signature in self.seen_signatures:
            return True

        # Mark as seen
        self.seen_signatures[signature] = now
        return False

    def _create_alert_signature(self, alert: Dict) -> str:
        """Create unique signature for alert"""
        labels = alert.get('labels', {})

        signature_parts = [
            labels.get('pod', ''),
            labels.get('alertname', ''),
            labels.get('namespace', ''),
            labels.get('cluster_id', '')
        ]

        signature_string = '|'.join(signature_parts)
        return hashlib.md5(signature_string.encode()).hexdigest()

    def _add_to_buffer(self, alert: Dict):
        """Add alert to buffer and maintain sliding window"""
        now = datetime.utcnow()
        alert['_added_at'] = now

        self.alert_buffer.append(alert)

        # Remove old alerts (older than correlation window)
        cutoff_time = now - timedelta(seconds=self.correlation_window)
        self.alert_buffer = [
            a for a in self.alert_buffer
            if a['_added_at'] > cutoff_time
        ]

    def _find_correlated_alerts(self, alert: Dict) -> List[Dict]:
        """Find alerts that correlate with the given alert"""
        correlated = [alert]  # Start with the alert itself

        labels = alert.get('labels', {})
        namespace = labels.get('namespace', '')
        cluster_id = labels.get('cluster_id', '')
        alertname = labels.get('alertname', '')
        service_name = alert.get('service_context', {}).get('service_name', '')

        for buffered_alert in self.alert_buffer:
            if buffered_alert == alert:
                continue

            buffered_labels = buffered_alert.get('labels', {})

            # Count correlation criteria matches
            matches = 0

            # Criterion 1: Same namespace & cluster
            if (buffered_labels.get('namespace') == namespace and
                buffered_labels.get('cluster_id') == cluster_id):
                matches += 1

            # Criterion 2: Service dependency
            if service_name:
                buffered_service = buffered_alert.get('service_context', {}).get('service_name', '')
                if self._are_services_related(service_name, buffered_service):
                    matches += 1

            # Criterion 3: Alert pattern match
            buffered_alertname = buffered_labels.get('alertname', '')
            if self._match_cascade_pattern(alertname, buffered_alertname):
                matches += 1

            # Correlate if 2 or more criteria match
            if matches >= 2:
                correlated.append(buffered_alert)

        # Only return if we found at least one correlation (excluding self)
        if len(correlated) > 1:
            logger.info(f"Found {len(correlated)} correlated alerts for {alertname}")
            return correlated

        return []

    def _are_services_related(self, service1: str, service2: str) -> bool:
        """Check if two services are related via dependency graph or network flows"""
        if not service1 or not service2:
            return False

        # If Cilium available, check network flows
        if self.network_collector:
            service_graph = self.network_collector.service_graph
            if service1 in service_graph and service2 in service_graph:
                # Check if there's traffic between them
                return (
                    service2 in service_graph[service1]['downstream'] or
                    service2 in service_graph[service1]['upstream']
                )

        # If simple graph available, check connections
        if self.service_graph_builder:
            return self.service_graph_builder.are_services_connected(service1, service2)

        return False

    def _match_cascade_pattern(self, alert1: str, alert2: str) -> bool:
        """Check if two alerts match a known cascade pattern"""
        for pattern_name, pattern_alerts in self.cascade_patterns.items():
            if alert1 in pattern_alerts and alert2 in pattern_alerts:
                return True
        return False

    def _create_incident(self, correlated_alerts: List[Dict]) -> Dict:
        """Create incident from correlated alerts"""
        # Sort alerts by time
        sorted_alerts = sorted(
            correlated_alerts,
            key=lambda a: a.get('startsAt', datetime.utcnow().isoformat())
        )

        first_alert = sorted_alerts[0]
        labels = first_alert.get('labels', {})

        # Determine root cause
        root_cause = self._determine_root_cause(correlated_alerts)

        # Extract affected services
        affected_services = set()
        for alert in correlated_alerts:
            svc = alert.get('service_context', {}).get('service_name')
            if svc:
                affected_services.add(svc)

        # Determine severity (highest among alerts)
        severities = {
            'critical': 4,
            'warning': 3,
            'info': 2,
            'none': 1
        }
        max_severity = 'info'
        for alert in correlated_alerts:
            alert_severity = alert.get('labels', {}).get('severity', 'info')
            if severities.get(alert_severity, 0) > severities.get(max_severity, 0):
                max_severity = alert_severity

        # Calculate time span
        first_time = datetime.fromisoformat(sorted_alerts[0].get('startsAt', '').replace('Z', '+00:00'))
        last_time = datetime.fromisoformat(sorted_alerts[-1].get('startsAt', '').replace('Z', '+00:00'))
        duration_seconds = (last_time - first_time).total_seconds()

        # Generate correlation reason
        correlation_reason = self._generate_correlation_reason(correlated_alerts)

        # Create incident
        incident_id = f"INC-{int(datetime.utcnow().timestamp())}"

        incident = {
            'incident_id': incident_id,
            'created_at': datetime.utcnow().isoformat() + 'Z',
            'updated_at': datetime.utcnow().isoformat() + 'Z',
            'status': 'open',
            'severity': max_severity,

            'cluster_id': labels.get('cluster_id', ''),
            'cluster_name': labels.get('cluster', ''),  # This comes from external labels
            'namespace': labels.get('namespace', ''),

            'affected_services': list(affected_services),

            'root_cause': root_cause,

            'alert_count': len(correlated_alerts),
            'alerts': correlated_alerts,

            'correlation_reason': correlation_reason,

            'time_span': {
                'first_alert': sorted_alerts[0].get('startsAt'),
                'last_alert': sorted_alerts[-1].get('startsAt'),
                'duration_seconds': duration_seconds
            }
        }

        # Add network analysis (works for both Cilium and Simple Service Graph)
        incident['network_analysis'] = self._generate_network_analysis(correlated_alerts)

        logger.info(f"✅ Created incident {incident_id} with {len(correlated_alerts)} correlated alerts")

        return incident

    def _determine_root_cause(self, alerts: List[Dict]) -> Dict:
        """Determine root cause from correlated alerts"""
        # Sort alerts by priority
        sorted_by_priority = sorted(
            alerts,
            key=lambda a: self.root_cause_priority.get(
                a.get('labels', {}).get('alertname', ''), 0
            ),
            reverse=True
        )

        root_alert = sorted_by_priority[0]
        labels = root_alert.get('labels', {})

        evidence = []

        # Evidence from logs
        logs = root_alert.get('logs', {})
        if logs.get('error_count', 0) > 0:
            evidence.append(f"{logs['error_count']} errors found in logs")
            if logs.get('last_error'):
                evidence.append(f"Last error: {logs['last_error'][:100]}")

        # Evidence from metrics
        metrics = root_alert.get('metrics', {})
        if metrics.get('cpu', {}).get('spike_detected'):
            evidence.append(f"CPU spike detected: {metrics['cpu']['max']:.2f} cores")
        if metrics.get('memory', {}).get('oom_risk'):
            evidence.append(f"Memory at {metrics['memory']['current_gb']:.2f}GB (OOM risk)")

        # Evidence from network flows (if Cilium)
        if self.network_collector and root_alert.get('network_flows'):
            flow_analysis = root_alert['network_flows'].get('flow_analysis', {})
            error_rate = flow_analysis.get('error_rate', 0)
            if error_rate > 0.5:
                evidence.append(f"Error rate {error_rate*100:.1f}% in network flows")

        return {
            'service': root_alert.get('service_context', {}).get('service_name', 'unknown'),
            'alert': labels.get('alertname', ''),
            'pod': labels.get('pod', ''),
            'reason': root_alert.get('annotations', {}).get('description', ''),
            'evidence': evidence
        }

    def _generate_correlation_reason(self, alerts: List[Dict]) -> str:
        """Generate human-readable correlation reason"""
        reasons = []

        # Time-based
        if len(alerts) > 1:
            first_time = datetime.fromisoformat(alerts[0].get('startsAt', '').replace('Z', '+00:00'))
            last_time = datetime.fromisoformat(alerts[-1].get('startsAt', '').replace('Z', '+00:00'))
            time_diff = (last_time - first_time).total_seconds() / 60
            reasons.append(f"Occurred within {time_diff:.1f} minutes")

        # Service dependency
        if self.network_collector or self.service_graph_builder:
            reasons.append("Service dependency graph match")

        # Alert sequence
        alert_sequence = " → ".join([
            a.get('labels', {}).get('alertname', 'Unknown')
            for a in alerts
        ])
        reasons.append(f"Alert sequence: {alert_sequence}")

        return " | ".join(reasons)

    def _generate_network_analysis(self, alerts: List[Dict]) -> Dict:
        """Generate network analysis for incident (supports both Cilium and Simple Service Graph)"""
        # If Cilium is available, use real-time network flows
        if self.network_collector:
            # Get service graph snapshot from Cilium
            service_graph = self.network_collector.get_service_graph()

            # Build flow diagram from Cilium flows
            edges = []
            for service, data in service_graph['services'].items():
                for target, count in data.get('request_counts', {}).items():
                    error_count = data.get('error_counts', {}).get(target, 0)
                    error_rate = error_count / count if count > 0 else 0

                    edges.append({
                        'source': service,
                        'target': target,
                        'request_count': count,
                        'error_count': error_count,
                        'error_rate': error_rate
                    })

            # Track error propagation from flows
            error_propagation_path = []
            for alert in alerts:
                service = alert.get('service_context', {}).get('service_name')
                flow_analysis = alert.get('network_flows', {}).get('flow_analysis', {})

                if service and flow_analysis:
                    error_propagation_path.append({
                        'timestamp': alert.get('startsAt', ''),
                        'service': service,
                        'error_rate': flow_analysis.get('error_rate', 0)
                    })

            return {
                'service_graph_snapshot': service_graph,
                'flow_diagram': {
                    'nodes': list(service_graph['services'].keys()),
                    'edges': edges
                },
                'error_propagation_path': sorted(
                    error_propagation_path,
                    key=lambda x: x['timestamp']
                )
            }

        # If using Simple Service Graph Builder (Tier 2 fallback)
        elif self.service_graph_builder:
            # Get service graph snapshot from metadata
            service_graph = self.service_graph_builder.get_service_graph()

            # Build connection diagram from service dependencies
            edges = []
            nodes = set()
            for service, data in service_graph['services'].items():
                nodes.add(service)
                for target in data.get('downstream', []):
                    nodes.add(target)
                    edges.append({
                        'source': service,
                        'target': target,
                        'relationship': 'calls'
                    })

            # Track affected services path
            error_propagation_path = []
            for alert in alerts:
                service = alert.get('service_context', {}).get('service_name')
                if service:
                    error_propagation_path.append({
                        'timestamp': alert.get('startsAt', ''),
                        'service': service,
                        'alert': alert.get('labels', {}).get('alertname', 'Unknown')
                    })

            return {
                'service_graph_snapshot': service_graph,
                'flow_diagram': {
                    'nodes': list(nodes),
                    'edges': edges
                },
                'error_propagation_path': sorted(
                    error_propagation_path,
                    key=lambda x: x['timestamp']
                )
            }

        # No network data available
        return {
            'service_graph_snapshot': {
                'services': {},
                'last_updated': datetime.utcnow().isoformat() + 'Z',
                'has_cilium': False
            },
            'flow_diagram': {
                'nodes': [],
                'edges': []
            },
            'error_propagation_path': []
        }

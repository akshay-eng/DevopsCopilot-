"""
Alert Enricher - Enriches alerts with logs, metrics, events, and pod information
"""
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from kubernetes import client, config
import requests

logger = logging.getLogger(__name__)


class AlertEnricher:
    """Enriches alerts with contextual data from Kubernetes and Prometheus"""

    def __init__(self, prometheus_url: str):
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()

        self.core_v1 = client.CoreV1Api()
        self.prometheus_url = prometheus_url.rstrip('/')

        # Error/warning patterns for log analysis
        self.error_patterns = re.compile(
            r'\b(error|exception|fatal|panic|failed|failure)\b',
            re.IGNORECASE
        )
        self.warning_patterns = re.compile(
            r'\b(warn|warning|deprecated)\b',
            re.IGNORECASE
        )

    def enrich_alert(self, alert: Dict) -> Dict:
        """
        Enrich alert with all contextual data.
        Returns enriched alert with added fields:
        - pod_info
        - logs
        - metrics
        - events
        - service_context
        - network_flows (if Cilium available)
        """
        enriched = alert.copy()

        labels = alert.get('labels', {})
        pod_name = labels.get('pod', '')
        namespace = labels.get('namespace', 'default')
        container = labels.get('container', '')

        logger.info(f"Enriching alert: {labels.get('alertname')} for pod {namespace}/{pod_name}")

        try:
            # 1. Pod Information
            if pod_name:
                enriched['pod_info'] = self.get_pod_info(pod_name, namespace)

            # 2. Logs (10 minutes before error)
            if pod_name:
                enriched['logs'] = self.get_pod_logs(pod_name, namespace, container, lookback_minutes=10)

            # 3. Metrics from Prometheus (10 minutes before error)
            if pod_name:
                enriched['metrics'] = self.get_pod_metrics(pod_name, namespace, container, lookback_minutes=10)

            # 4. Kubernetes Events (30 minutes lookback)
            if pod_name:
                enriched['events'] = self.get_pod_events(pod_name, namespace, lookback_minutes=30)

            # 5. Service Context
            if pod_name:
                enriched['service_context'] = self.get_service_context(pod_name, namespace)

            enriched['enriched_at'] = datetime.utcnow().isoformat() + 'Z'

        except Exception as e:
            logger.error(f"Error enriching alert: {e}")
            enriched['enrichment_error'] = str(e)

        return enriched

    def get_pod_info(self, pod_name: str, namespace: str) -> Dict:
        """Get detailed pod information"""
        try:
            pod = self.core_v1.read_namespaced_pod(name=pod_name, namespace=namespace)

            containers_info = []
            for container in pod.spec.containers:
                container_status = None

                # Find container status
                if pod.status.container_statuses:
                    container_status = next(
                        (cs for cs in pod.status.container_statuses if cs.name == container.name),
                        None
                    )

                state_info = {}
                last_state_info = {}

                if container_status:
                    # Current state
                    if container_status.state.running:
                        state_info = {
                            'state': 'running',
                            'started_at': container_status.state.running.started_at.isoformat() if container_status.state.running.started_at else None
                        }
                    elif container_status.state.waiting:
                        state_info = {
                            'state': 'waiting',
                            'reason': container_status.state.waiting.reason,
                            'message': container_status.state.waiting.message
                        }
                    elif container_status.state.terminated:
                        state_info = {
                            'state': 'terminated',
                            'reason': container_status.state.terminated.reason,
                            'exit_code': container_status.state.terminated.exit_code,
                            'message': container_status.state.terminated.message
                        }

                    # Last state
                    if container_status.last_state and container_status.last_state.terminated:
                        last_state_info = {
                            'terminated': {
                                'reason': container_status.last_state.terminated.reason,
                                'exit_code': container_status.last_state.terminated.exit_code,
                                'message': container_status.last_state.terminated.message
                            }
                        }

                containers_info.append({
                    'name': container.name,
                    'image': container.image,
                    'state': state_info.get('state', 'unknown'),
                    'reason': state_info.get('reason', ''),
                    'last_state': last_state_info
                })

            # Resource requests/limits
            resources = {}
            if pod.spec.containers and pod.spec.containers[0].resources:
                res = pod.spec.containers[0].resources
                resources = {
                    'requests': res.requests or {},
                    'limits': res.limits or {}
                }

            return {
                'pod_name': pod_name,
                'namespace': namespace,
                'node': pod.spec.node_name,
                'status': pod.status.phase,
                'restart_count': pod.status.container_statuses[0].restart_count if pod.status.container_statuses else 0,
                'containers': containers_info,
                'resources': resources,
                'created_at': pod.metadata.creation_timestamp.isoformat() if pod.metadata.creation_timestamp else None
            }

        except client.exceptions.ApiException as e:
            logger.error(f"Error getting pod info: {e}")
            return {'error': str(e)}

    def get_pod_logs(self, pod_name: str, namespace: str, container: str = '', lookback_minutes: int = 10) -> Dict:
        """Get pod logs with error/warning analysis"""
        try:
            since_seconds = lookback_minutes * 60

            kwargs = {
                'name': pod_name,
                'namespace': namespace,
                'since_seconds': since_seconds,
                'tail_lines': 500
            }

            if container:
                kwargs['container'] = container

            logs = self.core_v1.read_namespaced_pod_log(**kwargs)

            if not logs:
                return {
                    'lookback_minutes': lookback_minutes,
                    'total_lines': 0,
                    'errors': [],
                    'warnings': []
                }

            lines = logs.split('\n')

            # Find errors and warnings
            errors = [line for line in lines if self.error_patterns.search(line)]
            warnings = [line for line in lines if self.warning_patterns.search(line)]

            return {
                'lookback_minutes': lookback_minutes,
                'total_lines': len(lines),
                'errors': errors[:20],  # Last 20 errors
                'warnings': warnings[:20],  # Last 20 warnings
                'error_count': len(errors),
                'warning_count': len(warnings),
                'first_error': errors[0] if errors else None,
                'last_error': errors[-1] if errors else None,
                'last_100_lines': lines[-100:]
            }

        except client.exceptions.ApiException as e:
            logger.error(f"Error getting pod logs: {e}")
            return {'error': str(e)}

    def get_pod_metrics(self, pod_name: str, namespace: str, container: str = '', lookback_minutes: int = 10) -> Dict:
        """Get pod metrics from Prometheus"""
        try:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(minutes=lookback_minutes)

            metrics = {}

            # CPU Usage
            cpu_query = f'''rate(container_cpu_usage_seconds_total{{
                pod="{pod_name}",
                namespace="{namespace}",
                container!=""
            }}[1m])'''

            cpu_data = self._query_prometheus_range(cpu_query, start_time, end_time)
            if cpu_data:
                values = [float(v[1]) for v in cpu_data]
                metrics['cpu'] = {
                    'current': values[-1] if values else 0,
                    'max': max(values) if values else 0,
                    'avg': sum(values) / len(values) if values else 0,
                    'spike_detected': max(values) > 0.8 if values else False,  # >80% spike
                    'timeline': values[-20:]  # Last 20 data points
                }

            # Memory Usage
            memory_query = f'''container_memory_working_set_bytes{{
                pod="{pod_name}",
                namespace="{namespace}",
                container!=""
            }}'''

            memory_data = self._query_prometheus_range(memory_query, start_time, end_time)
            if memory_data:
                values = [float(v[1]) / (1024**3) for v in memory_data]  # Convert to GB
                metrics['memory'] = {
                    'current_gb': values[-1] if values else 0,
                    'max_gb': max(values) if values else 0,
                    'avg_gb': sum(values) / len(values) if values else 0,
                    'oom_risk': values[-1] > 0.9 * max(values) if values else False,  # >90% of max
                    'timeline': values[-20:]
                }

            # Network I/O
            network_query = f'''rate(container_network_receive_bytes_total{{
                pod="{pod_name}",
                namespace="{namespace}"
            }}[1m])'''

            network_data = self._query_prometheus_range(network_query, start_time, end_time)
            if network_data:
                values = [float(v[1]) for v in network_data]
                metrics['network'] = {
                    'receive_bytes_per_sec': values[-1] if values else 0,
                    'max_receive': max(values) if values else 0,
                    'avg_receive': sum(values) / len(values) if values else 0
                }

            return metrics

        except Exception as e:
            logger.error(f"Error getting pod metrics: {e}")
            return {'error': str(e)}

    def _query_prometheus_range(self, query: str, start_time: datetime, end_time: datetime) -> List:
        """Query Prometheus range API"""
        try:
            url = f"{self.prometheus_url}/api/v1/query_range"

            params = {
                'query': query,
                'start': start_time.timestamp(),
                'end': end_time.timestamp(),
                'step': '30s'
            }

            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()

            data = response.json()

            if data['status'] == 'success' and data['data']['result']:
                return data['data']['result'][0]['values']

            return []

        except Exception as e:
            logger.error(f"Error querying Prometheus: {e}")
            return []

    def get_pod_events(self, pod_name: str, namespace: str, lookback_minutes: int = 30) -> Dict:
        """Get Kubernetes events for pod"""
        try:
            events = self.core_v1.list_namespaced_event(
                namespace=namespace,
                field_selector=f'involvedObject.name={pod_name}'
            )

            cutoff_time = datetime.utcnow() - timedelta(minutes=lookback_minutes)

            filtered_events = []
            for event in events.items:
                if event.last_timestamp and event.last_timestamp.replace(tzinfo=None) > cutoff_time:
                    filtered_events.append({
                        'type': event.type,
                        'reason': event.reason,
                        'message': event.message,
                        'timestamp': event.last_timestamp.isoformat() if event.last_timestamp else None,
                        'count': event.count or 1
                    })

            return {
                'events': filtered_events,
                'lookback_minutes': lookback_minutes,
                'total_events': len(filtered_events)
            }

        except client.exceptions.ApiException as e:
            logger.error(f"Error getting pod events: {e}")
            return {'error': str(e)}

    def get_service_context(self, pod_name: str, namespace: str) -> Dict:
        """Get service context for pod"""
        try:
            # Get pod to find labels
            pod = self.core_v1.read_namespaced_pod(name=pod_name, namespace=namespace)

            if not pod.metadata.labels:
                return {}

            # Find service matching pod labels
            services = self.core_v1.list_namespaced_service(namespace=namespace)

            for svc in services.items:
                if not svc.spec.selector:
                    continue

                # Check if service selector matches pod labels
                if all(pod.metadata.labels.get(k) == v for k, v in svc.spec.selector.items()):
                    # Get endpoints
                    endpoints = []
                    try:
                        ep = self.core_v1.read_namespaced_endpoints(
                            name=svc.metadata.name,
                            namespace=namespace
                        )
                        if ep.subsets:
                            for subset in ep.subsets:
                                if subset.addresses and subset.ports:
                                    for addr in subset.addresses:
                                        for port in subset.ports:
                                            endpoints.append(f"{addr.ip}:{port.port}")
                    except:
                        pass

                    return {
                        'service_name': svc.metadata.name,
                        'service_type': svc.spec.type,
                        'endpoints': endpoints,
                        'selector': svc.spec.selector
                    }

            return {}

        except Exception as e:
            logger.error(f"Error getting service context: {e}")
            return {'error': str(e)}

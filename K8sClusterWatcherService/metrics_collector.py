"""
Prometheus Metrics Collector
Collects metrics from Prometheus and streams to backend
"""
import asyncio
from datetime import datetime, timedelta
import requests
from prometheus_api_client import PrometheusConnect
import structlog

from config import Config
from kafka_producer import KafkaDataProducer

logger = structlog.get_logger()


class PrometheusMetricsCollector:
    """Collects metrics from Prometheus"""

    def __init__(self, kafka_producer: KafkaDataProducer):
        self.kafka_producer = kafka_producer
        self.prom = None
        self._initialize_prometheus()

    def _initialize_prometheus(self):
        """Initialize Prometheus connection"""
        try:
            self.prom = PrometheusConnect(
                url=Config.PROMETHEUS_URL,
                disable_ssl=True
            )

            # Test connection
            self.prom.check_prometheus_connection()
            logger.info("prometheus_connected", url=Config.PROMETHEUS_URL)

        except Exception as e:
            logger.error("prometheus_connection_failed", error=str(e), url=Config.PROMETHEUS_URL)
            raise

    def _get_alerts_from_prometheus(self):
        """Get active alerts from Prometheus Alertmanager"""
        try:
            # Query Prometheus for ALERTS metric
            alerts_query = 'ALERTS{alertstate="firing"}'
            result = self.prom.custom_query(query=alerts_query)

            alerts = []
            for item in result:
                metric = item.get('metric', {})
                alert_data = {
                    'alertname': metric.get('alertname'),
                    'severity': metric.get('severity', 'warning'),
                    'labels': metric,
                    'annotations': {
                        'summary': metric.get('summary', ''),
                        'description': metric.get('description', ''),
                    },
                    'fingerprint': metric.get('fingerprint', ''),
                    'status': 'firing',
                    'starts_at': datetime.utcnow().isoformat(),
                }
                alerts.append(alert_data)

            return alerts

        except Exception as e:
            logger.error("failed_to_get_alerts", error=str(e))
            return []

    def _get_cluster_metrics(self):
        """Get cluster-level metrics"""
        metrics = {}

        try:
            # Node metrics
            metrics['nodes'] = {
                'total': self._query_prometheus('count(kube_node_info)'),
                'ready': self._query_prometheus('sum(kube_node_status_condition{condition="Ready",status="true"})'),
                'cpu_usage': self._query_prometheus('sum(rate(node_cpu_seconds_total{mode!="idle"}[5m])) / sum(machine_cpu_cores)'),
                'memory_usage': self._query_prometheus('sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)'),
            }

            # Pod metrics
            metrics['pods'] = {
                'total': self._query_prometheus('count(kube_pod_info)'),
                'running': self._query_prometheus('sum(kube_pod_status_phase{phase="Running"})'),
                'pending': self._query_prometheus('sum(kube_pod_status_phase{phase="Pending"})'),
                'failed': self._query_prometheus('sum(kube_pod_status_phase{phase="Failed"})'),
                'cpu_usage': self._query_prometheus('sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))'),
                'memory_usage': self._query_prometheus('sum(container_memory_working_set_bytes{container!=""})'),
            }

            # Namespace metrics
            metrics['namespaces'] = {
                'total': self._query_prometheus('count(kube_namespace_created)'),
            }

            # Container metrics
            metrics['containers'] = {
                'total': self._query_prometheus('count(kube_pod_container_info)'),
                'restarts': self._query_prometheus('sum(rate(kube_pod_container_status_restarts_total[5m]))'),
            }

            # Service metrics
            metrics['services'] = {
                'total': self._query_prometheus('count(kube_service_info)'),
            }

            # Deployment metrics
            metrics['deployments'] = {
                'total': self._query_prometheus('count(kube_deployment_created)'),
                'available': self._query_prometheus('sum(kube_deployment_status_replicas_available)'),
                'unavailable': self._query_prometheus('sum(kube_deployment_status_replicas_unavailable)'),
            }

            # Persistent Volume metrics
            metrics['persistent_volumes'] = {
                'total': self._query_prometheus('count(kube_persistentvolume_info)'),
                'bound': self._query_prometheus('sum(kube_persistentvolume_status_phase{phase="Bound"})'),
            }

            return metrics

        except Exception as e:
            logger.error("cluster_metrics_collection_failed", error=str(e))
            return metrics

    def _get_pod_metrics(self):
        """Get detailed pod metrics"""
        try:
            pod_metrics = []

            # CPU usage per pod
            cpu_query = 'sum(rate(container_cpu_usage_seconds_total{container!=""}[5m])) by (namespace, pod)'
            cpu_result = self.prom.custom_query(query=cpu_query)

            # Memory usage per pod
            memory_query = 'sum(container_memory_working_set_bytes{container!=""}) by (namespace, pod)'
            memory_result = self.prom.custom_query(query=memory_query)

            # Network I/O
            network_rx_query = 'sum(rate(container_network_receive_bytes_total[5m])) by (namespace, pod)'
            network_tx_query = 'sum(rate(container_network_transmit_bytes_total[5m])) by (namespace, pod)'
            network_rx_result = self.prom.custom_query(query=network_rx_query)
            network_tx_result = self.prom.custom_query(query=network_tx_query)

            # Combine metrics
            pods = {}
            for item in cpu_result:
                metric = item.get('metric', {})
                pod_key = f"{metric.get('namespace')}:{metric.get('pod')}"
                if pod_key not in pods:
                    pods[pod_key] = {
                        'namespace': metric.get('namespace'),
                        'pod': metric.get('pod'),
                    }
                pods[pod_key]['cpu'] = float(item.get('value', [0, 0])[1])

            for item in memory_result:
                metric = item.get('metric', {})
                pod_key = f"{metric.get('namespace')}:{metric.get('pod')}"
                if pod_key in pods:
                    pods[pod_key]['memory'] = float(item.get('value', [0, 0])[1])

            for item in network_rx_result:
                metric = item.get('metric', {})
                pod_key = f"{metric.get('namespace')}:{metric.get('pod')}"
                if pod_key in pods:
                    pods[pod_key]['network_rx'] = float(item.get('value', [0, 0])[1])

            for item in network_tx_result:
                metric = item.get('metric', {})
                pod_key = f"{metric.get('namespace')}:{metric.get('pod')}"
                if pod_key in pods:
                    pods[pod_key]['network_tx'] = float(item.get('value', [0, 0])[1])

            return list(pods.values())

        except Exception as e:
            logger.error("pod_metrics_collection_failed", error=str(e))
            return []

    def _get_node_metrics(self):
        """Get detailed node metrics"""
        try:
            node_metrics = []

            # CPU usage per node
            cpu_query = 'sum(rate(node_cpu_seconds_total{mode!="idle"}[5m])) by (instance)'
            cpu_result = self.prom.custom_query(query=cpu_query)

            # Memory usage per node
            memory_query = 'sum(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) by (instance)'
            memory_result = self.prom.custom_query(query=memory_query)

            # Disk usage per node
            disk_query = 'sum(node_filesystem_size_bytes - node_filesystem_avail_bytes) by (instance)'
            disk_result = self.prom.custom_query(query=disk_query)

            # Combine metrics
            nodes = {}
            for item in cpu_result:
                metric = item.get('metric', {})
                node = metric.get('instance')
                if node not in nodes:
                    nodes[node] = {'node': node}
                nodes[node]['cpu'] = float(item.get('value', [0, 0])[1])

            for item in memory_result:
                metric = item.get('metric', {})
                node = metric.get('instance')
                if node in nodes:
                    nodes[node]['memory'] = float(item.get('value', [0, 0])[1])

            for item in disk_result:
                metric = item.get('metric', {})
                node = metric.get('instance')
                if node in nodes:
                    nodes[node]['disk'] = float(item.get('value', [0, 0])[1])

            return list(nodes.values())

        except Exception as e:
            logger.error("node_metrics_collection_failed", error=str(e))
            return []

    def _query_prometheus(self, query):
        """Execute Prometheus query and return single value"""
        try:
            result = self.prom.custom_query(query=query)
            if result and len(result) > 0:
                return float(result[0].get('value', [0, 0])[1])
            return 0
        except Exception as e:
            logger.debug("prometheus_query_failed", query=query, error=str(e))
            return 0

    async def collect_and_send_metrics(self):
        """Collect metrics and send to Kafka"""
        logger.info("starting_metrics_collection")

        while True:
            try:
                # Collect cluster metrics
                cluster_metrics = self._get_cluster_metrics()
                pod_metrics = self._get_pod_metrics()
                node_metrics = self._get_node_metrics()

                metrics_data = {
                    'cluster': cluster_metrics,
                    'pods': pod_metrics,
                    'nodes': node_metrics,
                    'timestamp': datetime.utcnow().isoformat(),
                }

                # Send to Kafka
                self.kafka_producer.send_metrics(metrics_data)

                logger.info("metrics_collected_and_sent",
                           pods_count=len(pod_metrics),
                           nodes_count=len(node_metrics))

            except Exception as e:
                logger.error("metrics_collection_failed", error=str(e))

            # Wait before next collection
            await asyncio.sleep(Config.PROMETHEUS_SCRAPE_INTERVAL)

    async def watch_prometheus_alerts(self):
        """Watch Prometheus alerts and send to Kafka"""
        logger.info("starting_prometheus_alert_watcher")

        while True:
            try:
                alerts = self._get_alerts_from_prometheus()

                for alert in alerts:
                    self.kafka_producer.send_alert(alert)

                if alerts:
                    logger.info("prometheus_alerts_sent", count=len(alerts))

            except Exception as e:
                logger.error("prometheus_alert_watch_failed", error=str(e))

            # Check for alerts every 15 seconds
            await asyncio.sleep(15)

    async def start_collection(self):
        """Start all metric collection tasks"""
        tasks = []

        if Config.ENABLE_METRICS_COLLECTION:
            tasks.append(asyncio.create_task(self.collect_and_send_metrics()))

        if Config.ENABLE_ALERT_WATCHING:
            tasks.append(asyncio.create_task(self.watch_prometheus_alerts()))

        logger.info("metrics_collection_started", tasks_count=len(tasks))

        await asyncio.gather(*tasks)

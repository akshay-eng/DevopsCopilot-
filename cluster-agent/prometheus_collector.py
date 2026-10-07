"""
Prometheus Metrics Collector
Collects comprehensive metrics from Prometheus for all cluster resources
"""

import os
import logging
import requests
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import time

logger = logging.getLogger(__name__)


class PrometheusCollector:
    """
    Collects metrics from Prometheus for pods, nodes, deployments, and other resources
    """

    def __init__(self, prometheus_url: str):
        """
        Initialize Prometheus collector

        Args:
            prometheus_url: Base URL of Prometheus server (e.g., http://prometheus-server:9090)
        """
        self.prometheus_url = prometheus_url.rstrip('/')
        self.query_api = f"{self.prometheus_url}/api/v1/query"
        self.timeout = 30

        logger.info(f"Initialized PrometheusCollector with URL: {self.prometheus_url}")

    def _query_prometheus(self, query: str) -> Optional[Dict]:
        """
        Execute a PromQL query and return results

        Args:
            query: PromQL query string

        Returns:
            Query result data or None if failed
        """
        try:
            response = requests.get(
                self.query_api,
                params={'query': query},
                timeout=self.timeout
            )
            response.raise_for_status()

            result = response.json()
            if result.get('status') != 'success':
                logger.error(f"Prometheus query failed: {result}")
                return None

            return result.get('data', {})

        except requests.exceptions.RequestException as e:
            logger.error(f"Error querying Prometheus: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in Prometheus query: {e}")
            return None

    def _parse_metric_value(self, result: Dict) -> List[Dict[str, Any]]:
        """
        Parse Prometheus query result into list of metric values

        Args:
            result: Prometheus query result

        Returns:
            List of parsed metrics with labels and values
        """
        metrics = []

        if not result or result.get('resultType') != 'vector':
            return metrics

        for item in result.get('result', []):
            metric_labels = item.get('metric', {})
            value_array = item.get('value', [])

            if len(value_array) >= 2:
                timestamp, value = value_array[0], value_array[1]

                try:
                    metrics.append({
                        'labels': metric_labels,
                        'value': float(value),
                        'timestamp': timestamp
                    })
                except (ValueError, TypeError):
                    logger.warning(f"Could not parse metric value: {value}")

        return metrics

    # ========================================
    # POD METRICS
    # ========================================

    def get_pod_cpu_usage(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get CPU usage for pods (cores)

        Query: rate(container_cpu_usage_seconds_total[5m])
        """
        query = 'rate(container_cpu_usage_seconds_total{container!="",container!="POD"}[5m])'

        if namespace:
            query += f',namespace="{namespace}"'
        if pod:
            query += f',pod="{pod}"'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_memory_usage(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get memory usage for pods (bytes)

        Query: container_memory_working_set_bytes
        """
        query = 'container_memory_working_set_bytes{container!="",container!="POD"}'

        if namespace:
            query += f',namespace="{namespace}"'
        if pod:
            query += f',pod="{pod}"'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_memory_usage_percent(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get memory usage percentage for pods

        Query: (container_memory_working_set_bytes / container_spec_memory_limit_bytes) * 100
        """
        query = '(container_memory_working_set_bytes{container!="",container!="POD"} / container_spec_memory_limit_bytes{container!="",container!="POD"}) * 100'

        if namespace:
            query += f' and on(namespace,pod,container) container_memory_working_set_bytes{{namespace="{namespace}"}}'
        if pod:
            query += f' and on(namespace,pod,container) container_memory_working_set_bytes{{pod="{pod}"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_network_receive_bytes(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get network receive rate for pods (bytes/sec)

        Query: rate(container_network_receive_bytes_total[5m])
        """
        query = 'rate(container_network_receive_bytes_total{pod!=""}[5m])'

        if namespace:
            query += f' and on(namespace,pod) kube_pod_info{{namespace="{namespace}"}}'
        if pod:
            query += f' and on(namespace,pod) kube_pod_info{{pod="{pod}"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_network_transmit_bytes(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get network transmit rate for pods (bytes/sec)

        Query: rate(container_network_transmit_bytes_total[5m])
        """
        query = 'rate(container_network_transmit_bytes_total{pod!=""}[5m])'

        if namespace:
            query += f' and on(namespace,pod) kube_pod_info{{namespace="{namespace}"}}'
        if pod:
            query += f' and on(namespace,pod) kube_pod_info{{pod="{pod}"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_restart_count(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get container restart count

        Query: kube_pod_container_status_restarts_total
        """
        query = 'kube_pod_container_status_restarts_total'

        if namespace:
            query += f'{{namespace="{namespace}"}}'
        if pod:
            query += f'{{pod="{pod}"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_disk_usage(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get disk usage for pods (bytes)

        Query: container_fs_usage_bytes
        """
        query = 'container_fs_usage_bytes{container!="",container!="POD"}'

        if namespace:
            query += f',namespace="{namespace}"'
        if pod:
            query += f',pod="{pod}"'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_disk_io_read(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get disk read rate for pods (bytes/sec)

        Query: rate(container_fs_reads_bytes_total[5m])
        """
        query = 'rate(container_fs_reads_bytes_total{container!="",container!="POD"}[5m])'

        if namespace:
            query += f',namespace="{namespace}"'
        if pod:
            query += f',pod="{pod}"'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_disk_io_write(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get disk write rate for pods (bytes/sec)

        Query: rate(container_fs_writes_bytes_total[5m])
        """
        query = 'rate(container_fs_writes_bytes_total{container!="",container!="POD"}[5m])'

        if namespace:
            query += f',namespace="{namespace}"'
        if pod:
            query += f',pod="{pod}"'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_pod_uptime(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> List[Dict]:
        """
        Get pod uptime (seconds since start)

        Query: time() - kube_pod_start_time
        """
        query = 'time() - kube_pod_start_time{pod!=""}'

        if namespace:
            query += f',namespace="{namespace}"'
        if pod:
            query += f',pod="{pod}"'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    # ========================================
    # NODE METRICS
    # ========================================

    def get_node_cpu_usage(self, node: Optional[str] = None) -> List[Dict]:
        """
        Get CPU usage for nodes (percentage)

        Query: (1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance)) * 100
        """
        query = '(1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) by (instance)) * 100'

        if node:
            query = f'(1 - avg(rate(node_cpu_seconds_total{{mode="idle",instance=~"{node}.*"}}[5m])) by (instance)) * 100'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_node_memory_usage(self, node: Optional[str] = None) -> List[Dict]:
        """
        Get memory usage for nodes (bytes)

        Query: node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes
        """
        query = 'node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes'

        if node:
            query += f'{{instance=~"{node}.*"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_node_memory_usage_percent(self, node: Optional[str] = None) -> List[Dict]:
        """
        Get memory usage percentage for nodes

        Query: ((node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes) * 100
        """
        query = '((node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes) * 100'

        if node:
            query = f'((node_memory_MemTotal_bytes{{instance=~"{node}.*"}} - node_memory_MemAvailable_bytes{{instance=~"{node}.*"}}) / node_memory_MemTotal_bytes{{instance=~"{node}.*"}}) * 100'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_node_disk_usage(self, node: Optional[str] = None) -> List[Dict]:
        """
        Get disk usage for nodes (bytes)

        Query: node_filesystem_size_bytes - node_filesystem_avail_bytes
        """
        query = 'node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}'

        if node:
            query = f'node_filesystem_size_bytes{{mountpoint="/",instance=~"{node}.*"}} - node_filesystem_avail_bytes{{mountpoint="/",instance=~"{node}.*"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_node_disk_usage_percent(self, node: Optional[str] = None) -> List[Dict]:
        """
        Get disk usage percentage for nodes

        Query: ((node_filesystem_size_bytes - node_filesystem_avail_bytes) / node_filesystem_size_bytes) * 100
        """
        query = '((node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}) / node_filesystem_size_bytes{mountpoint="/"}) * 100'

        if node:
            query = f'((node_filesystem_size_bytes{{mountpoint="/",instance=~"{node}.*"}} - node_filesystem_avail_bytes{{mountpoint="/",instance=~"{node}.*"}}) / node_filesystem_size_bytes{{mountpoint="/",instance=~"{node}.*"}}) * 100'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_node_network_receive(self, node: Optional[str] = None) -> List[Dict]:
        """
        Get network receive rate for nodes (bytes/sec)

        Query: rate(node_network_receive_bytes_total[5m])
        """
        query = 'rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|cali.*|tunl.*"}[5m])'

        if node:
            query = f'rate(node_network_receive_bytes_total{{device!~"lo|veth.*|docker.*|cali.*|tunl.*",instance=~"{node}.*"}}[5m])'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_node_network_transmit(self, node: Optional[str] = None) -> List[Dict]:
        """
        Get network transmit rate for nodes (bytes/sec)

        Query: rate(node_network_transmit_bytes_total[5m])
        """
        query = 'rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*|cali.*|tunl.*"}[5m])'

        if node:
            query = f'rate(node_network_transmit_bytes_total{{device!~"lo|veth.*|docker.*|cali.*|tunl.*",instance=~"{node}.*"}}[5m])'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_node_load_average(self, node: Optional[str] = None) -> List[Dict]:
        """
        Get node load average (1 minute)

        Query: node_load1
        """
        query = 'node_load1'

        if node:
            query += f'{{instance=~"{node}.*"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    # ========================================
    # DEPLOYMENT METRICS
    # ========================================

    def get_deployment_replicas(self, namespace: Optional[str] = None, deployment: Optional[str] = None) -> List[Dict]:
        """
        Get deployment replica counts (desired, available, unavailable)

        Query: kube_deployment_status_replicas
        """
        query = 'kube_deployment_status_replicas'

        if namespace:
            query += f'{{namespace="{namespace}"}}'
        if deployment:
            query += f'{{deployment="{deployment}"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_deployment_replicas_available(self, namespace: Optional[str] = None, deployment: Optional[str] = None) -> List[Dict]:
        """
        Get available replicas for deployments

        Query: kube_deployment_status_replicas_available
        """
        query = 'kube_deployment_status_replicas_available'

        if namespace:
            query += f'{{namespace="{namespace}"}}'
        if deployment:
            query += f'{{deployment="{deployment}"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    def get_deployment_replicas_unavailable(self, namespace: Optional[str] = None, deployment: Optional[str] = None) -> List[Dict]:
        """
        Get unavailable replicas for deployments

        Query: kube_deployment_status_replicas_unavailable
        """
        query = 'kube_deployment_status_replicas_unavailable'

        if namespace:
            query += f'{{namespace="{namespace}"}}'
        if deployment:
            query += f'{{deployment="{deployment}"}}'

        result = self._query_prometheus(query)
        return self._parse_metric_value(result)

    # ========================================
    # COMPREHENSIVE METRICS COLLECTION
    # ========================================

    def collect_all_pod_metrics(self, namespace: Optional[str] = None, pod: Optional[str] = None) -> Dict[str, Any]:
        """
        Collect all available metrics for pods

        Returns:
            Dictionary with all pod metrics
        """
        logger.info(f"Collecting all pod metrics (namespace={namespace}, pod={pod})")

        metrics = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'resourceType': 'pod',
            'namespace': namespace,
            'pod': pod,
            'metrics': {}
        }

        # Collect all pod metrics
        metric_functions = {
            'cpu_usage_cores': self.get_pod_cpu_usage,
            'memory_usage_bytes': self.get_pod_memory_usage,
            'memory_usage_percent': self.get_pod_memory_usage_percent,
            'network_receive_bytes_per_sec': self.get_pod_network_receive_bytes,
            'network_transmit_bytes_per_sec': self.get_pod_network_transmit_bytes,
            'restart_count': self.get_pod_restart_count,
            'disk_usage_bytes': self.get_pod_disk_usage,
            'disk_read_bytes_per_sec': self.get_pod_disk_io_read,
            'disk_write_bytes_per_sec': self.get_pod_disk_io_write,
            'uptime_seconds': self.get_pod_uptime,
        }

        for metric_name, metric_func in metric_functions.items():
            try:
                result = metric_func(namespace, pod)
                metrics['metrics'][metric_name] = result
            except Exception as e:
                logger.error(f"Error collecting {metric_name}: {e}")
                metrics['metrics'][metric_name] = []

        return metrics

    def collect_all_node_metrics(self, node: Optional[str] = None) -> Dict[str, Any]:
        """
        Collect all available metrics for nodes

        Returns:
            Dictionary with all node metrics
        """
        logger.info(f"Collecting all node metrics (node={node})")

        metrics = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'resourceType': 'node',
            'node': node,
            'metrics': {}
        }

        # Collect all node metrics
        metric_functions = {
            'cpu_usage_percent': self.get_node_cpu_usage,
            'memory_usage_bytes': self.get_node_memory_usage,
            'memory_usage_percent': self.get_node_memory_usage_percent,
            'disk_usage_bytes': self.get_node_disk_usage,
            'disk_usage_percent': self.get_node_disk_usage_percent,
            'network_receive_bytes_per_sec': self.get_node_network_receive,
            'network_transmit_bytes_per_sec': self.get_node_network_transmit,
            'load_average_1m': self.get_node_load_average,
        }

        for metric_name, metric_func in metric_functions.items():
            try:
                result = metric_func(node)
                metrics['metrics'][metric_name] = result
            except Exception as e:
                logger.error(f"Error collecting {metric_name}: {e}")
                metrics['metrics'][metric_name] = []

        return metrics

    def collect_all_deployment_metrics(self, namespace: Optional[str] = None, deployment: Optional[str] = None) -> Dict[str, Any]:
        """
        Collect all available metrics for deployments

        Returns:
            Dictionary with all deployment metrics
        """
        logger.info(f"Collecting all deployment metrics (namespace={namespace}, deployment={deployment})")

        metrics = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'resourceType': 'deployment',
            'namespace': namespace,
            'deployment': deployment,
            'metrics': {}
        }

        # Collect all deployment metrics
        metric_functions = {
            'replicas_desired': self.get_deployment_replicas,
            'replicas_available': self.get_deployment_replicas_available,
            'replicas_unavailable': self.get_deployment_replicas_unavailable,
        }

        for metric_name, metric_func in metric_functions.items():
            try:
                result = metric_func(namespace, deployment)
                metrics['metrics'][metric_name] = result
            except Exception as e:
                logger.error(f"Error collecting {metric_name}: {e}")
                metrics['metrics'][metric_name] = []

        return metrics

    def collect_cluster_wide_metrics(self) -> Dict[str, Any]:
        """
        Collect cluster-wide aggregated metrics

        Returns:
            Dictionary with cluster-wide metrics
        """
        logger.info("Collecting cluster-wide metrics")

        return {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'resourceType': 'cluster',
            'pods': self.collect_all_pod_metrics(),
            'nodes': self.collect_all_node_metrics(),
            'deployments': self.collect_all_deployment_metrics(),
        }

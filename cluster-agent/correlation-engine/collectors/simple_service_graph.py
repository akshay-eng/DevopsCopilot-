"""
Simple Service Graph Builder - Builds service dependency graph from Kubernetes metadata
Fallback when Cilium is not available
"""
import logging
import threading
import time
from datetime import datetime
from typing import Dict, Set
from collections import defaultdict
from kubernetes import client, config

logger = logging.getLogger(__name__)


class SimpleServiceGraphBuilder:
    """Builds service graph from Kubernetes metadata when Cilium is not available"""

    def __init__(self):
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()

        self.core_v1 = client.CoreV1Api()
        self.networking_v1 = client.NetworkingV1Api()

        # Service graph
        self.service_graph = defaultdict(lambda: {
            'downstream': set(),
            'upstream': set(),
            'last_updated': None
        })

        self.is_running = False
        self.rebuild_thread = None
        self.rebuild_interval = 300  # 5 minutes

    def start(self):
        """Start building service graph in background"""
        if self.is_running:
            logger.warning("Service graph builder already running")
            return

        self.is_running = True

        # Build initial graph
        self.build_graph()

        # Start periodic rebuild
        self.rebuild_thread = threading.Thread(target=self._periodic_rebuild, daemon=True)
        self.rebuild_thread.start()
        logger.info("✅ Simple service graph builder started")

    def stop(self):
        """Stop service graph builder"""
        self.is_running = False
        if self.rebuild_thread:
            self.rebuild_thread.join(timeout=5)
        logger.info("Service graph builder stopped")

    def _periodic_rebuild(self):
        """Periodically rebuild service graph"""
        while self.is_running:
            time.sleep(self.rebuild_interval)
            logger.info("Rebuilding service graph...")
            self.build_graph()

    def build_graph(self):
        """Build service dependency graph from Kubernetes metadata"""
        logger.info("Building service dependency graph from Kubernetes metadata...")

        try:
            # Reset graph
            self.service_graph.clear()

            # Method 1: Parse environment variables from pods
            self._parse_env_vars()

            # Method 2: Parse ConfigMaps for service references
            self._parse_configmaps()

            # Method 3: Map pods to services using selectors
            self._map_pods_to_services()

            # Method 4: Parse Network Policies
            self._parse_network_policies()

            # Update timestamps
            now = datetime.utcnow().isoformat() + 'Z'
            for service in self.service_graph:
                self.service_graph[service]['last_updated'] = now

            logger.info(f"✅ Service graph built: {len(self.service_graph)} services")

        except Exception as e:
            logger.error(f"Error building service graph: {e}")

    def _parse_env_vars(self):
        """Parse environment variables from pods to find service dependencies"""
        try:
            namespaces = self.core_v1.list_namespace()

            for ns in namespaces.items:
                namespace = ns.metadata.name

                # Skip system namespaces
                if namespace in ['kube-system', 'kube-public', 'kube-node-lease']:
                    continue

                pods = self.core_v1.list_namespaced_pod(namespace)

                for pod in pods.items:
                    pod_service = self._get_service_for_pod(pod, namespace)

                    if not pod_service:
                        continue

                    # Parse env vars from all containers
                    for container in pod.spec.containers:
                        if not container.env:
                            continue

                        for env in container.env:
                            # Look for *_SERVICE_HOST env vars
                            if env.name and env.name.endswith('_SERVICE_HOST'):
                                # Extract service name
                                service_name = env.name.replace('_SERVICE_HOST', '').replace('_', '-').lower()

                                # Add dependency
                                self.service_graph[pod_service]['downstream'].add(service_name)
                                self.service_graph[service_name]['upstream'].add(pod_service)

        except Exception as e:
            logger.error(f"Error parsing env vars: {e}")

    def _parse_configmaps(self):
        """Parse ConfigMaps for service URL references"""
        try:
            namespaces = self.core_v1.list_namespace()

            for ns in namespaces.items:
                namespace = ns.metadata.name

                if namespace in ['kube-system', 'kube-public', 'kube-node-lease']:
                    continue

                configmaps = self.core_v1.list_namespaced_config_map(namespace)

                for cm in configmaps.items:
                    if not cm.data:
                        continue

                    # Find pods using this ConfigMap
                    using_pods = self._find_pods_using_configmap(cm.metadata.name, namespace)

                    for pod_service in using_pods:
                        # Parse ConfigMap data for service references
                        for key, value in cm.data.items():
                            if not isinstance(value, str):
                                continue

                            # Look for service names in URLs (http://service-name, https://service-name)
                            referenced_services = self._extract_service_names_from_text(value)

                            for svc in referenced_services:
                                self.service_graph[pod_service]['downstream'].add(svc)
                                self.service_graph[svc]['upstream'].add(pod_service)

        except Exception as e:
            logger.error(f"Error parsing configmaps: {e}")

    def _map_pods_to_services(self):
        """Map pods to services using label selectors"""
        try:
            namespaces = self.core_v1.list_namespace()

            for ns in namespaces.items:
                namespace = ns.metadata.name

                if namespace in ['kube-system', 'kube-public', 'kube-node-lease']:
                    continue

                services = self.core_v1.list_namespaced_service(namespace)

                for svc in services.items:
                    if not svc.spec.selector:
                        continue

                    service_name = svc.metadata.name

                    # Ensure service exists in graph
                    if service_name not in self.service_graph:
                        self.service_graph[service_name] = {
                            'downstream': set(),
                            'upstream': set(),
                            'last_updated': None
                        }

        except Exception as e:
            logger.error(f"Error mapping pods to services: {e}")

    def _parse_network_policies(self):
        """Parse Network Policies for allowed connections"""
        try:
            namespaces = self.core_v1.list_namespace()

            for ns in namespaces.items:
                namespace = ns.metadata.name

                if namespace in ['kube-system', 'kube-public', 'kube-node-lease']:
                    continue

                try:
                    policies = self.networking_v1.list_namespaced_network_policy(namespace)

                    for policy in policies.items:
                        # Get service for pods selected by this policy
                        if not policy.spec.pod_selector or not policy.spec.pod_selector.match_labels:
                            continue

                        target_service = self._get_service_by_labels(
                            policy.spec.pod_selector.match_labels,
                            namespace
                        )

                        if not target_service:
                            continue

                        # Parse ingress rules
                        if policy.spec.ingress:
                            for ingress in policy.spec.ingress:
                                if not ingress._from:
                                    continue

                                for from_rule in ingress._from:
                                    if from_rule.pod_selector and from_rule.pod_selector.match_labels:
                                        source_service = self._get_service_by_labels(
                                            from_rule.pod_selector.match_labels,
                                            namespace
                                        )

                                        if source_service:
                                            self.service_graph[source_service]['downstream'].add(target_service)
                                            self.service_graph[target_service]['upstream'].add(source_service)

                        # Parse egress rules
                        if policy.spec.egress:
                            for egress in policy.spec.egress:
                                if not egress.to:
                                    continue

                                for to_rule in egress.to:
                                    if to_rule.pod_selector and to_rule.pod_selector.match_labels:
                                        dest_service = self._get_service_by_labels(
                                            to_rule.pod_selector.match_labels,
                                            namespace
                                        )

                                        if dest_service:
                                            self.service_graph[target_service]['downstream'].add(dest_service)
                                            self.service_graph[dest_service]['upstream'].add(target_service)

                except Exception as e:
                    # NetworkPolicy API might not be available
                    logger.debug(f"NetworkPolicy not available in namespace {namespace}: {e}")
                    continue

        except Exception as e:
            logger.error(f"Error parsing network policies: {e}")

    def _get_service_for_pod(self, pod, namespace: str) -> str:
        """Get service name for a pod"""
        try:
            if not pod.metadata.labels:
                return None

            # Try common label patterns
            label_keys = ['app', 'app.kubernetes.io/name', 'k8s-app']

            for key in label_keys:
                if key in pod.metadata.labels:
                    return pod.metadata.labels[key]

            return None

        except Exception as e:
            return None

    def _get_service_by_labels(self, labels: Dict, namespace: str) -> str:
        """Find service name by labels"""
        try:
            services = self.core_v1.list_namespaced_service(namespace)

            for svc in services.items:
                if not svc.spec.selector:
                    continue

                # Check if service selector matches the labels
                if all(svc.spec.selector.get(k) == v for k, v in labels.items()):
                    return svc.metadata.name

            return None

        except Exception as e:
            return None

    def _find_pods_using_configmap(self, configmap_name: str, namespace: str) -> Set[str]:
        """Find pods that use a specific ConfigMap"""
        using_services = set()

        try:
            pods = self.core_v1.list_namespaced_pod(namespace)

            for pod in pods.items:
                # Check volumes
                if pod.spec.volumes:
                    for volume in pod.spec.volumes:
                        if volume.config_map and volume.config_map.name == configmap_name:
                            service = self._get_service_for_pod(pod, namespace)
                            if service:
                                using_services.add(service)

                # Check env from
                for container in pod.spec.containers:
                    if container.env_from:
                        for env_from in container.env_from:
                            if env_from.config_map_ref and env_from.config_map_ref.name == configmap_name:
                                service = self._get_service_for_pod(pod, namespace)
                                if service:
                                    using_services.add(service)

        except Exception as e:
            logger.error(f"Error finding pods using ConfigMap: {e}")

        return using_services

    def _extract_service_names_from_text(self, text: str) -> Set[str]:
        """Extract service names from text (URLs, hostnames, etc.)"""
        import re
        service_names = set()

        # Pattern for http://service-name or https://service-name
        url_pattern = r'https?://([a-z0-9-]+)'
        matches = re.findall(url_pattern, text, re.IGNORECASE)
        service_names.update(matches)

        # Pattern for service-name.namespace or service-name.namespace.svc.cluster.local
        dns_pattern = r'([a-z0-9-]+)\.(([a-z0-9-]+)\.)?svc\.cluster\.local'
        matches = re.findall(dns_pattern, text, re.IGNORECASE)
        service_names.update([m[0] for m in matches])

        return service_names

    def get_service_graph(self) -> Dict:
        """Get current service dependency graph"""
        # Convert sets to lists for JSON serialization
        graph = {}
        for service, data in self.service_graph.items():
            graph[service] = {
                'downstream': list(data['downstream']),
                'upstream': list(data['upstream']),
                'last_updated': data['last_updated']
            }

        return {
            'services': graph,
            'last_updated': datetime.utcnow().isoformat() + 'Z',
            'has_cilium': False
        }

    def are_services_connected(self, service1: str, service2: str) -> bool:
        """Check if two services are connected in the graph"""
        if service1 not in self.service_graph or service2 not in self.service_graph:
            return False

        # Check if service1 calls service2 or vice versa
        return (
            service2 in self.service_graph[service1]['downstream'] or
            service2 in self.service_graph[service1]['upstream'] or
            service1 in self.service_graph[service2]['downstream'] or
            service1 in self.service_graph[service2]['upstream']
        )

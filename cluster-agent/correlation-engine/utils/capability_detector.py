"""
Capability Detector - Auto-detects available observability tools in the cluster
"""
import logging
from kubernetes import client, config
from typing import Dict

logger = logging.getLogger(__name__)


class CapabilityDetector:
    """Detects available observability capabilities in the cluster"""

    def __init__(self):
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()

        self.core_v1 = client.CoreV1Api()
        self.apps_v1 = client.AppsV1Api()

    def detect_capabilities(self) -> Dict[str, bool]:
        """
        Auto-detect available observability tools.
        Returns:
            dict with:
            - cilium: bool (check for cilium pods in kube-system)
            - prometheus: bool (check for prometheus service)
            - hubble_relay: bool (check for hubble-relay service)
        """
        capabilities = {
            'cilium': self.has_cilium(),
            'prometheus': self.has_prometheus(),
            'hubble_relay': self.has_hubble_relay()
        }

        logger.info(f"Detected capabilities: {capabilities}")
        return capabilities

    def has_cilium(self) -> bool:
        """Check if Cilium is running in the cluster"""
        try:
            pods = self.core_v1.list_namespaced_pod(
                namespace='kube-system',
                label_selector='k8s-app=cilium'
            )
            has_cilium = len(pods.items) > 0

            if has_cilium:
                logger.info(f"✅ Cilium detected: {len(pods.items)} cilium pods found")
            else:
                logger.info("❌ Cilium not detected")

            return has_cilium
        except Exception as e:
            logger.warning(f"Error checking for Cilium: {e}")
            return False

    def has_prometheus(self) -> bool:
        """Check if Prometheus is available"""
        try:
            # Check for prometheus service in monitoring namespace
            services = self.core_v1.list_namespaced_service(namespace='monitoring')
            prometheus_services = [
                svc for svc in services.items
                if 'prometheus' in svc.metadata.name.lower()
            ]

            has_prom = len(prometheus_services) > 0

            if has_prom:
                logger.info(f"✅ Prometheus detected: {[svc.metadata.name for svc in prometheus_services]}")
            else:
                logger.info("❌ Prometheus not detected")

            return has_prom
        except Exception as e:
            logger.warning(f"Error checking for Prometheus: {e}")
            return False

    def has_hubble_relay(self) -> bool:
        """Check if Hubble Relay service is available"""
        try:
            # Check for hubble-relay service in kube-system
            services = self.core_v1.list_namespaced_service(namespace='kube-system')
            hubble_services = [
                svc for svc in services.items
                if 'hubble-relay' in svc.metadata.name
            ]

            has_hubble = len(hubble_services) > 0

            if has_hubble:
                logger.info(f"✅ Hubble Relay detected: {[svc.metadata.name for svc in hubble_services]}")
            else:
                logger.info("❌ Hubble Relay not detected")

            return has_hubble
        except Exception as e:
            logger.warning(f"Error checking for Hubble Relay: {e}")
            return False

    def get_hubble_relay_url(self) -> str:
        """Get Hubble Relay service URL"""
        try:
            service = self.core_v1.read_namespaced_service(
                name='hubble-relay',
                namespace='kube-system'
            )

            # Check if LoadBalancer
            if service.spec.type == 'LoadBalancer':
                if service.status.load_balancer.ingress:
                    lb_ip = service.status.load_balancer.ingress[0].ip
                    port = service.spec.ports[0].port
                    url = f"{lb_ip}:{port}"
                    logger.info(f"Using Hubble Relay LoadBalancer: {url}")
                    return url

            # Fallback to ClusterIP
            url = "hubble-relay.kube-system:80"
            logger.info(f"Using Hubble Relay ClusterIP: {url}")
            return url

        except Exception as e:
            logger.error(f"Error getting Hubble Relay URL: {e}")
            return "hubble-relay.kube-system:80"

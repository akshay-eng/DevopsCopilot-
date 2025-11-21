"""
Kubernetes Resource Watcher
Watches K8s resources and streams changes to backend
"""
import asyncio
from datetime import datetime
from kubernetes import client, config, watch
import structlog

from config import Config
from kafka_producer import KafkaDataProducer

logger = structlog.get_logger()


class K8sResourceWatcher:
    """Watches Kubernetes resources and streams to Kafka"""

    def __init__(self, kafka_producer: KafkaDataProducer):
        self.kafka_producer = kafka_producer
        self.v1 = None
        self.apps_v1 = None
        self.networking_v1 = None
        self.batch_v1 = None
        self.watchers = {}
        self._initialize_k8s_client()

    def _initialize_k8s_client(self):
        """Initialize Kubernetes client"""
        try:
            if Config.K8S_IN_CLUSTER:
                config.load_incluster_config()
                logger.info("kubernetes_client_initialized", mode="in-cluster")
            else:
                config.load_kube_config()
                logger.info("kubernetes_client_initialized", mode="kubeconfig")

            # Initialize API clients
            self.v1 = client.CoreV1Api()
            self.apps_v1 = client.AppsV1Api()
            self.networking_v1 = client.NetworkingV1Api()
            self.batch_v1 = client.BatchV1Api()

        except Exception as e:
            logger.error("kubernetes_client_initialization_failed", error=str(e))
            raise

    def _serialize_resource(self, resource, kind, event_type):
        """Serialize K8s resource to dictionary"""
        try:
            metadata = resource.metadata

            base_data = {
                'kind': kind,
                'event_type': event_type,  # ADDED, MODIFIED, DELETED
                'name': metadata.name,
                'namespace': metadata.namespace or 'default',
                'uid': metadata.uid,
                'resource_version': metadata.resource_version,
                'creation_timestamp': metadata.creation_timestamp.isoformat() if metadata.creation_timestamp else None,
                'labels': metadata.labels or {},
                'annotations': metadata.annotations or {},
            }

            # Add resource-specific data
            if kind == 'Pod':
                base_data.update({
                    'status': {
                        'phase': resource.status.phase,
                        'conditions': [
                            {
                                'type': c.type,
                                'status': c.status,
                                'reason': c.reason,
                                'message': c.message
                            } for c in (resource.status.conditions or [])
                        ],
                        'container_statuses': [
                            {
                                'name': cs.name,
                                'ready': cs.ready,
                                'restart_count': cs.restart_count,
                                'state': str(cs.state)
                            } for cs in (resource.status.container_statuses or [])
                        ],
                        'host_ip': resource.status.host_ip,
                        'pod_ip': resource.status.pod_ip,
                    },
                    'spec': {
                        'node_name': resource.spec.node_name,
                        'containers': [
                            {
                                'name': c.name,
                                'image': c.image,
                                'resources': {
                                    'requests': c.resources.requests or {} if c.resources else {},
                                    'limits': c.resources.limits or {} if c.resources else {},
                                }
                            } for c in resource.spec.containers
                        ]
                    }
                })

            elif kind == 'Service':
                base_data.update({
                    'spec': {
                        'type': resource.spec.type,
                        'cluster_ip': resource.spec.cluster_ip,
                        'ports': [
                            {
                                'name': p.name,
                                'port': p.port,
                                'target_port': str(p.target_port),
                                'protocol': p.protocol
                            } for p in (resource.spec.ports or [])
                        ],
                        'selector': resource.spec.selector or {}
                    }
                })

            elif kind == 'Deployment':
                base_data.update({
                    'spec': {
                        'replicas': resource.spec.replicas,
                        'selector': resource.spec.selector.match_labels if resource.spec.selector else {},
                        'strategy': resource.spec.strategy.type if resource.spec.strategy else 'RollingUpdate',
                    },
                    'status': {
                        'available_replicas': resource.status.available_replicas or 0,
                        'ready_replicas': resource.status.ready_replicas or 0,
                        'replicas': resource.status.replicas or 0,
                        'updated_replicas': resource.status.updated_replicas or 0,
                    }
                })

            elif kind == 'Node':
                base_data.update({
                    'status': {
                        'conditions': [
                            {
                                'type': c.type,
                                'status': c.status,
                                'reason': c.reason,
                                'message': c.message
                            } for c in (resource.status.conditions or [])
                        ],
                        'capacity': resource.status.capacity or {},
                        'allocatable': resource.status.allocatable or {},
                        'node_info': {
                            'os_image': resource.status.node_info.os_image,
                            'kernel_version': resource.status.node_info.kernel_version,
                            'container_runtime_version': resource.status.node_info.container_runtime_version,
                            'kubelet_version': resource.status.node_info.kubelet_version,
                        } if resource.status.node_info else {}
                    }
                })

            elif kind == 'Namespace':
                base_data.update({
                    'status': {
                        'phase': resource.status.phase if resource.status else 'Active'
                    }
                })

            elif kind == 'Ingress':
                base_data.update({
                    'spec': {
                        'rules': [
                            {
                                'host': r.host,
                                'paths': [
                                    {
                                        'path': p.path,
                                        'backend': {
                                            'service_name': p.backend.service.name if p.backend and p.backend.service else None,
                                            'service_port': p.backend.service.port.number if p.backend and p.backend.service and p.backend.service.port else None
                                        }
                                    } for p in (r.http.paths if r.http else [])
                                ]
                            } for r in (resource.spec.rules or [])
                        ]
                    }
                })

            return base_data

        except Exception as e:
            logger.error("resource_serialization_failed", kind=kind, error=str(e))
            return None

    async def watch_pods(self):
        """Watch pod resources"""
        logger.info("starting_pod_watcher")
        w = watch.Watch()

        try:
            for event in w.stream(self.v1.list_pod_for_all_namespaces, timeout_seconds=0):
                event_type = event['type']
                pod = event['object']

                resource_data = self._serialize_resource(pod, 'Pod', event_type)
                if resource_data:
                    self.kafka_producer.send_resource(resource_data)

                    # Check for pod failures
                    if pod.status.phase in ['Failed', 'Unknown']:
                        self._send_pod_failure_alert(pod, event_type)

        except Exception as e:
            logger.error("pod_watch_failed", error=str(e))
            # Reconnect after delay
            await asyncio.sleep(5)
            await self.watch_pods()

    async def watch_services(self):
        """Watch service resources"""
        logger.info("starting_service_watcher")
        w = watch.Watch()

        try:
            for event in w.stream(self.v1.list_service_for_all_namespaces, timeout_seconds=0):
                event_type = event['type']
                service = event['object']

                resource_data = self._serialize_resource(service, 'Service', event_type)
                if resource_data:
                    self.kafka_producer.send_resource(resource_data)

        except Exception as e:
            logger.error("service_watch_failed", error=str(e))
            await asyncio.sleep(5)
            await self.watch_services()

    async def watch_deployments(self):
        """Watch deployment resources"""
        logger.info("starting_deployment_watcher")
        w = watch.Watch()

        try:
            for event in w.stream(self.apps_v1.list_deployment_for_all_namespaces, timeout_seconds=0):
                event_type = event['type']
                deployment = event['object']

                resource_data = self._serialize_resource(deployment, 'Deployment', event_type)
                if resource_data:
                    self.kafka_producer.send_resource(resource_data)

                    # Check for deployment issues
                    if deployment.status.ready_replicas != deployment.spec.replicas:
                        self._send_deployment_alert(deployment, event_type)

        except Exception as e:
            logger.error("deployment_watch_failed", error=str(e))
            await asyncio.sleep(5)
            await self.watch_deployments()

    async def watch_nodes(self):
        """Watch node resources"""
        logger.info("starting_node_watcher")
        w = watch.Watch()

        try:
            for event in w.stream(self.v1.list_node, timeout_seconds=0):
                event_type = event['type']
                node = event['object']

                resource_data = self._serialize_resource(node, 'Node', event_type)
                if resource_data:
                    self.kafka_producer.send_resource(resource_data)

                    # Check for node issues
                    if node.status.conditions:
                        for condition in node.status.conditions:
                            if condition.type == 'Ready' and condition.status != 'True':
                                self._send_node_alert(node, event_type, condition)

        except Exception as e:
            logger.error("node_watch_failed", error=str(e))
            await asyncio.sleep(5)
            await self.watch_nodes()

    async def watch_events(self):
        """Watch K8s events"""
        logger.info("starting_event_watcher")
        w = watch.Watch()

        try:
            for event in w.stream(self.v1.list_event_for_all_namespaces, timeout_seconds=0):
                k8s_event = event['object']

                event_data = {
                    'type': k8s_event.type,
                    'reason': k8s_event.reason,
                    'message': k8s_event.message,
                    'count': k8s_event.count,
                    'first_timestamp': k8s_event.first_timestamp.isoformat() if k8s_event.first_timestamp else None,
                    'last_timestamp': k8s_event.last_timestamp.isoformat() if k8s_event.last_timestamp else None,
                    'involved_object': {
                        'kind': k8s_event.involved_object.kind,
                        'name': k8s_event.involved_object.name,
                        'namespace': k8s_event.involved_object.namespace,
                        'uid': k8s_event.involved_object.uid,
                    },
                    'source': {
                        'component': k8s_event.source.component if k8s_event.source else None,
                        'host': k8s_event.source.host if k8s_event.source else None,
                    }
                }

                self.kafka_producer.send_event(event_data)

        except Exception as e:
            logger.error("event_watch_failed", error=str(e))
            await asyncio.sleep(5)
            await self.watch_events()

    def _send_pod_failure_alert(self, pod, event_type):
        """Send alert for pod failure"""
        alert_data = {
            'alertname': 'PodFailure',
            'severity': 'critical',
            'labels': {
                'alertname': 'PodFailure',
                'pod': pod.metadata.name,
                'namespace': pod.metadata.namespace,
                'phase': pod.status.phase,
                'node': pod.spec.node_name,
            },
            'annotations': {
                'summary': f'Pod {pod.metadata.name} is in {pod.status.phase} state',
                'description': f'Pod {pod.metadata.name} in namespace {pod.metadata.namespace} is in {pod.status.phase} state',
            },
            'fingerprint': f'pod-failure-{pod.metadata.uid}',
            'status': 'firing',
            'starts_at': datetime.utcnow().isoformat(),
        }
        self.kafka_producer.send_alert(alert_data)

    def _send_deployment_alert(self, deployment, event_type):
        """Send alert for deployment issues"""
        alert_data = {
            'alertname': 'DeploymentReplicasMismatch',
            'severity': 'warning',
            'labels': {
                'alertname': 'DeploymentReplicasMismatch',
                'deployment': deployment.metadata.name,
                'namespace': deployment.metadata.namespace,
            },
            'annotations': {
                'summary': f'Deployment {deployment.metadata.name} has mismatched replicas',
                'description': f'Deployment {deployment.metadata.name} desired: {deployment.spec.replicas}, ready: {deployment.status.ready_replicas or 0}',
            },
            'fingerprint': f'deployment-replicas-{deployment.metadata.uid}',
            'status': 'firing',
            'starts_at': datetime.utcnow().isoformat(),
        }
        self.kafka_producer.send_alert(alert_data)

    def _send_node_alert(self, node, event_type, condition):
        """Send alert for node issues"""
        alert_data = {
            'alertname': 'NodeNotReady',
            'severity': 'critical',
            'labels': {
                'alertname': 'NodeNotReady',
                'node': node.metadata.name,
                'condition': condition.type,
            },
            'annotations': {
                'summary': f'Node {node.metadata.name} is not ready',
                'description': f'Node {node.metadata.name} condition {condition.type}: {condition.status} - {condition.reason}',
            },
            'fingerprint': f'node-not-ready-{node.metadata.uid}',
            'status': 'firing',
            'starts_at': datetime.utcnow().isoformat(),
        }
        self.kafka_producer.send_alert(alert_data)

    async def start_all_watchers(self):
        """Start all resource watchers"""
        tasks = []

        if 'pods' in Config.WATCH_RESOURCES:
            tasks.append(asyncio.create_task(self.watch_pods()))

        if 'services' in Config.WATCH_RESOURCES:
            tasks.append(asyncio.create_task(self.watch_services()))

        if 'deployments' in Config.WATCH_RESOURCES:
            tasks.append(asyncio.create_task(self.watch_deployments()))

        if 'nodes' in Config.WATCH_RESOURCES:
            tasks.append(asyncio.create_task(self.watch_nodes()))

        if Config.ENABLE_EVENT_WATCHING:
            tasks.append(asyncio.create_task(self.watch_events()))

        logger.info("all_watchers_started", count=len(tasks))

        await asyncio.gather(*tasks)

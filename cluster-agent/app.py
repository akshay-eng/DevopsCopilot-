#!/usr/bin/env python3
"""
DevOps Copilot - Kubernetes Cluster Agent

This agent runs inside user Kubernetes clusters to monitor resources,
collect metrics, and forward data to the DevOps Copilot SaaS platform via Kafka.
"""

import os
import sys
import time
import logging
import signal
import json
from datetime import datetime, timezone
from threading import Thread, Event
from flask import Flask, request, jsonify
from kubernetes import client, config, watch
from confluent_kafka import Producer
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
import requests as http_requests
from prometheus_collector import PrometheusCollector

# Configure logging
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Flask app
app = Flask(__name__)

# Configuration
USER_ID = os.getenv('USER_ID')
CLUSTER_ID = os.getenv('CLUSTER_ID')
CLUSTER_NAME = os.getenv('CLUSTER_NAME')
KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
KAFKA_SECURITY_PROTOCOL = os.getenv('KAFKA_SECURITY_PROTOCOL', 'PLAINTEXT')
KAFKA_SASL_MECHANISM = os.getenv('KAFKA_SASL_MECHANISM', 'PLAIN')
KAFKA_USERNAME = os.getenv('KAFKA_USERNAME', '')
KAFKA_PASSWORD = os.getenv('KAFKA_PASSWORD', '')

WATCH_INTERVAL = int(os.getenv('WATCH_INTERVAL', '30'))
HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', '60'))
METRICS_INTERVAL = int(os.getenv('METRICS_INTERVAL', '120'))

# Prometheus Configuration
PROMETHEUS_URL = os.getenv('PROMETHEUS_URL', 'http://prometheus-server:9090')

# Kafka connection timeouts
KAFKA_SOCKET_TIMEOUT_MS = int(os.getenv('KAFKA_SOCKET_TIMEOUT_MS', '60000'))
KAFKA_REQUEST_TIMEOUT_MS = int(os.getenv('KAFKA_REQUEST_TIMEOUT_MS', '60000'))
KAFKA_METADATA_MAX_AGE_MS = int(os.getenv('KAFKA_METADATA_MAX_AGE_MS', '300000'))

# Kafka topics
TOPIC_ALERTS = 'alerts'
TOPIC_K8S_EVENTS = 'k8s-events'
TOPIC_RESOURCES = 'resources'
TOPIC_METRICS = 'metrics'
TOPIC_HEARTBEATS = 'heartbeats'
TOPIC_LOGS = 'logs'  # New topic for pod logs
TOPIC_CHANGES = 'changes'  # K8s resource changes with diffing

# Prometheus metrics
kafka_messages_sent = Counter('agent_kafka_messages_sent_total', 'Total Kafka messages sent', ['topic'])
kafka_messages_failed = Counter('agent_kafka_messages_failed_total', 'Total Kafka messages failed', ['topic'])
k8s_watch_errors = Counter('agent_k8s_watch_errors_total', 'Total K8s watch errors', ['resource_type'])
resources_watched = Gauge('agent_resources_watched_total', 'Total resources being watched', ['resource_type'])
last_heartbeat = Gauge('agent_last_heartbeat_timestamp', 'Timestamp of last heartbeat sent')

# Global state
shutdown_event = Event()
kafka_producer = None
k8s_core_api = None
k8s_apps_api = None
k8s_rbac_api = None
k8s_metrics_api = None
prometheus_collector = None

# In-memory generation tracker for diffing MODIFIED events
# Structure: { "resourceType:namespace:name": { "generation": int, "snapshot": dict } }
_resource_generations = {}


def validate_config():
    """Validate required configuration"""
    required = ['USER_ID', 'CLUSTER_ID', 'CLUSTER_NAME', 'KAFKA_BOOTSTRAP_SERVERS']
    missing = [var for var in required if not os.getenv(var)]

    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)

    logger.info(f"Configuration validated. Cluster: {CLUSTER_NAME}, User: {USER_ID}")


def init_kafka():
    """Initialize Kafka producer"""
    global kafka_producer

    kafka_config = {
        'bootstrap.servers': KAFKA_BOOTSTRAP_SERVERS,
        'client.id': f'{CLUSTER_ID}-agent',
        'compression.type': 'gzip',
        'linger.ms': 100,
        'batch.size': 16384,
        'socket.timeout.ms': KAFKA_SOCKET_TIMEOUT_MS,
        'request.timeout.ms': KAFKA_REQUEST_TIMEOUT_MS,
        'metadata.max.age.ms': KAFKA_METADATA_MAX_AGE_MS,
        'api.version.request': True,
        'broker.address.family': 'v4',  # Force IPv4
        'socket.keepalive.enable': True,
    }

    if KAFKA_SECURITY_PROTOCOL != 'PLAINTEXT':
        kafka_config.update({
            'security.protocol': KAFKA_SECURITY_PROTOCOL,
            'sasl.mechanism': KAFKA_SASL_MECHANISM,
            'sasl.username': KAFKA_USERNAME,
            'sasl.password': KAFKA_PASSWORD,
        })

    try:
        kafka_producer = Producer(kafka_config)
        logger.info(f"Kafka producer initialized. Servers: {KAFKA_BOOTSTRAP_SERVERS}")
    except Exception as e:
        logger.error(f"Failed to initialize Kafka producer: {e}")
        sys.exit(1)


def init_kubernetes():
    """Initialize Kubernetes clients"""
    global k8s_core_api, k8s_apps_api, k8s_rbac_api, k8s_metrics_api

    try:
        # Try in-cluster config first (when running in pod)
        config.load_incluster_config()
        logger.info("Loaded in-cluster Kubernetes config")
    except:
        # Fall back to kubeconfig (for local development)
        try:
            config.load_kube_config()
            logger.info("Loaded kubeconfig")
        except Exception as e:
            logger.error(f"Failed to load Kubernetes config: {e}")
            sys.exit(1)

    k8s_core_api = client.CoreV1Api()
    k8s_apps_api = client.AppsV1Api()
    k8s_rbac_api = client.RbacAuthorizationV1Api()

    # Metrics API might not be available
    try:
        k8s_metrics_api = client.CustomObjectsApi()
        logger.info("Metrics API available")
    except:
        logger.warning("Metrics API not available")
        k8s_metrics_api = None


def send_to_kafka(topic, message_data):
    """Send message to Kafka with user context"""
    if not kafka_producer:
        logger.error("Kafka producer not initialized")
        return False

    # Add user context to every message
    message = {
        'userId': USER_ID,
        'clusterId': CLUSTER_ID,
        'clusterName': CLUSTER_NAME,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        **message_data
    }

    try:
        kafka_producer.produce(
            topic,
            value=json.dumps(message).encode('utf-8'),
            callback=lambda err, msg: delivery_callback(err, msg, topic)
        )
        kafka_producer.poll(0)
        return True
    except Exception as e:
        logger.error(f"Failed to send message to Kafka topic {topic}: {e}")
        kafka_messages_failed.labels(topic=topic).inc()
        return False


def delivery_callback(err, msg, topic):
    """Kafka delivery callback"""
    if err:
        logger.error(f"Message delivery failed to {topic}: {err}")
        kafka_messages_failed.labels(topic=topic).inc()
    else:
        kafka_messages_sent.labels(topic=topic).inc()


# ========================================
# Change Detection & Diffing Functions
# ========================================

def _resource_key(resource_type, namespace, name):
    """Build a unique key for the generation tracker."""
    return f"{resource_type}:{namespace}:{name}"


def _extract_images_from_containers(containers):
    """Extract image list from containers spec."""
    return [c.image for c in (containers or [])]


def _classify_severity(action, resource_type):
    """Return 'info', 'warning', or 'critical' based on change type."""
    if action == 'image_updated':
        return 'warning' if resource_type in ['deployment', 'statefulset', 'daemonset'] else 'info'
    elif action == 'deleted':
        return 'warning'
    elif action in ['created', 'scaled']:
        return 'info'
    elif action == 'config_updated':
        return 'warning'
    return 'info'


def _send_change_event(resource_type, namespace, name, action, summary, diff, labels, severity='info'):
    """Build and send a change event to the 'changes' Kafka topic."""
    message = {
        'type': 'change',
        'resourceType': resource_type,
        'resourceName': name,
        'namespace': namespace,
        'action': action,
        'summary': summary,
        'diff': diff,
        'severity': severity,
        'labels': labels or {}
    }
    send_to_kafka(TOPIC_CHANGES, message)
    logger.info(f"[CHANGE] {action} {resource_type} {namespace}/{name}")


def _extract_deployment_diff(old_snapshot, new_deployment):
    """Compare old snapshot with new deployment spec.
    Returns (action, summary, diff_dict) or None if no meaningful change."""
    try:
        # Check generation first - if not changed, skip
        new_gen = new_deployment.metadata.generation
        old_gen = old_snapshot.get('generation', 0)

        if new_gen == old_gen:
            return None  # No spec change, status-only update

        # Compare images
        old_images = old_snapshot.get('images', [])
        new_images = _extract_images_from_containers(new_deployment.spec.template.spec.containers)

        # Compare replicas
        old_replicas = old_snapshot.get('replicas', 0)
        new_replicas = new_deployment.spec.replicas or 0

        action = 'updated'
        summary_parts = []
        diff = {'generation': {'old': old_gen, 'new': new_gen}}

        if old_images != new_images:
            action = 'image_updated'
            diff['images'] = {'old': old_images, 'new': new_images}
            # Build summary: "nginx:1.19 → nginx:1.20"
            if len(old_images) == 1 and len(new_images) == 1:
                summary_parts.append(f"image changed from {old_images[0]} to {new_images[0]}")
            else:
                summary_parts.append(f"images updated")

        if old_replicas != new_replicas:
            if action != 'image_updated':  # Only override if not already image_updated
                action = 'scaled'
            diff['replicas'] = {'old': old_replicas, 'new': new_replicas}
            summary_parts.append(f"scaled from {old_replicas} to {new_replicas} replicas")

        if not summary_parts:
            summary_parts.append("configuration updated")

        summary = f"Deployment {new_deployment.metadata.name} {' and '.join(summary_parts)}"

        return (action, summary, diff)

    except Exception as e:
        logger.error(f"Error extracting deployment diff: {e}")
        return None


def _extract_configmap_diff(old_snapshot, new_configmap):
    """Compare old vs new ConfigMap data keys.
    Returns (action, summary, diff_dict) or None."""
    try:
        new_gen = new_configmap.metadata.generation or 0
        old_gen = old_snapshot.get('generation', 0)

        # ConfigMaps don't have .spec, so generation might not increment
        # Compare data keys directly
        old_keys = sorted(old_snapshot.get('data_keys', []))
        new_data = new_configmap.data or {}
        new_binary_data = new_configmap.binary_data or {}
        new_keys = sorted(list(new_data.keys()) + list(new_binary_data.keys()))

        if old_keys == new_keys and new_gen == old_gen:
            return None  # No change

        action = 'config_updated'
        diff = {
            'generation': {'old': old_gen, 'new': new_gen},
            'changedKeys': list(set(new_keys) - set(old_keys)) or new_keys
        }

        added_keys = set(new_keys) - set(old_keys)
        removed_keys = set(old_keys) - set(new_keys)

        if added_keys:
            summary = f"ConfigMap {new_configmap.metadata.name} updated: added keys {list(added_keys)}"
        elif removed_keys:
            summary = f"ConfigMap {new_configmap.metadata.name} updated: removed keys {list(removed_keys)}"
        else:
            summary = f"ConfigMap {new_configmap.metadata.name} updated"

        return (action, summary, diff)

    except Exception as e:
        logger.error(f"Error extracting configmap diff: {e}")
        return None


def _extract_secret_diff(old_snapshot, new_secret):
    """Compare ONLY metadata changes for secrets (NEVER inspect .data).
    Returns (action, summary, diff_dict) or None."""
    try:
        new_gen = new_secret.metadata.generation or 0
        old_gen = old_snapshot.get('generation', 0)

        old_labels = old_snapshot.get('labels', {})
        new_labels = new_secret.metadata.labels or {}

        if new_gen == old_gen and old_labels == new_labels:
            return None  # No change

        action = 'updated'
        diff = {
            'generation': {'old': old_gen, 'new': new_gen}
        }

        if old_labels != new_labels:
            diff['labels'] = {'old': old_labels, 'new': new_labels}

        summary = f"Secret {new_secret.metadata.name} metadata updated"

        return (action, summary, diff)

    except Exception as e:
        logger.error(f"Error extracting secret diff: {e}")
        return None


def _extract_statefulset_diff(old_snapshot, new_sts):
    """Compare StatefulSet spec for replica/image changes."""
    try:
        new_gen = new_sts.metadata.generation
        old_gen = old_snapshot.get('generation', 0)

        if new_gen == old_gen:
            return None

        old_images = old_snapshot.get('images', [])
        new_images = _extract_images_from_containers(new_sts.spec.template.spec.containers)

        old_replicas = old_snapshot.get('replicas', 0)
        new_replicas = new_sts.spec.replicas or 0

        action = 'updated'
        summary_parts = []
        diff = {'generation': {'old': old_gen, 'new': new_gen}}

        if old_images != new_images:
            action = 'image_updated'
            diff['images'] = {'old': old_images, 'new': new_images}
            if len(old_images) == 1 and len(new_images) == 1:
                summary_parts.append(f"image changed from {old_images[0]} to {new_images[0]}")
            else:
                summary_parts.append(f"images updated")

        if old_replicas != new_replicas:
            if action != 'image_updated':
                action = 'scaled'
            diff['replicas'] = {'old': old_replicas, 'new': new_replicas}
            summary_parts.append(f"scaled from {old_replicas} to {new_replicas} replicas")

        if not summary_parts:
            summary_parts.append("configuration updated")

        summary = f"StatefulSet {new_sts.metadata.name} {' and '.join(summary_parts)}"

        return (action, summary, diff)

    except Exception as e:
        logger.error(f"Error extracting statefulset diff: {e}")
        return None


def _extract_daemonset_diff(old_snapshot, new_ds):
    """Compare DaemonSet spec for image/template changes."""
    try:
        new_gen = new_ds.metadata.generation
        old_gen = old_snapshot.get('generation', 0)

        if new_gen == old_gen:
            return None

        old_images = old_snapshot.get('images', [])
        new_images = _extract_images_from_containers(new_ds.spec.template.spec.containers)

        action = 'updated'
        summary_parts = []
        diff = {'generation': {'old': old_gen, 'new': new_gen}}

        if old_images != new_images:
            action = 'image_updated'
            diff['images'] = {'old': old_images, 'new': new_images}
            if len(old_images) == 1 and len(new_images) == 1:
                summary_parts.append(f"image changed from {old_images[0]} to {new_images[0]}")
            else:
                summary_parts.append(f"images updated")

        if not summary_parts:
            summary_parts.append("configuration updated")

        summary = f"DaemonSet {new_ds.metadata.name} {' and '.join(summary_parts)}"

        return (action, summary, diff)

    except Exception as e:
        logger.error(f"Error extracting daemonset diff: {e}")
        return None


def watch_pods():
    """Watch Pod resources and send updates to Kafka"""
    logger.info("Starting Pod watcher...")
    w = watch.Watch()

    while not shutdown_event.is_set():
        try:
            for event in w.stream(k8s_core_api.list_pod_for_all_namespaces, timeout_seconds=WATCH_INTERVAL):
                if shutdown_event.is_set():
                    break

                pod = event['object']
                event_type = event['type']

                message = {
                    'eventType': 'resource_event',
                    'resourceType': 'pod',
                    'action': event_type,
                    'namespace': pod.metadata.namespace,
                    'name': pod.metadata.name,
                    'data': {
                        'status': pod.status.phase,
                        'hostIP': pod.status.host_ip,
                        'podIP': pod.status.pod_ip,
                        'startTime': pod.status.start_time.isoformat() if pod.status.start_time else None,
                        'containers': [
                            {
                                'name': c.name,
                                'image': c.image,
                                'ready': cs.ready if cs else False,
                                'restartCount': cs.restart_count if cs else 0
                            }
                            for c, cs in zip(pod.spec.containers, pod.status.container_statuses or [])
                        ]
                    }
                }

                send_to_kafka(TOPIC_RESOURCES, message)

        except Exception as e:
            if not shutdown_event.is_set():
                logger.error(f"Error watching pods: {e}")
                k8s_watch_errors.labels(resource_type='pod').inc()
                time.sleep(5)


def watch_deployments():
    """Watch Deployment resources and send updates to Kafka"""
    logger.info("Starting Deployment watcher...")
    w = watch.Watch()

    while not shutdown_event.is_set():
        try:
            for event in w.stream(k8s_apps_api.list_deployment_for_all_namespaces, timeout_seconds=WATCH_INTERVAL):
                if shutdown_event.is_set():
                    break

                deployment = event['object']
                event_type = event['type']
                ns = deployment.metadata.namespace
                name = deployment.metadata.name

                # Skip kube-system noise
                if ns in ('kube-system', 'kube-public', 'kube-node-lease'):
                    continue

                # Send to TOPIC_RESOURCES (existing behavior)
                message = {
                    'eventType': 'resource_event',
                    'resourceType': 'deployment',
                    'action': event_type,
                    'namespace': ns,
                    'name': name,
                    'data': {
                        'replicas': deployment.spec.replicas,
                        'readyReplicas': deployment.status.ready_replicas or 0,
                        'availableReplicas': deployment.status.available_replicas or 0,
                        'updatedReplicas': deployment.status.updated_replicas or 0,
                    }
                }
                send_to_kafka(TOPIC_RESOURCES, message)

                # Change tracking logic (send to TOPIC_CHANGES)
                key = _resource_key('deployment', ns, name)
                labels_dict = (deployment.metadata.labels if isinstance(deployment.metadata.labels, dict) else deployment.metadata.labels.to_dict()) if deployment.metadata.labels else {}

                if event_type == 'ADDED':
                    # Store snapshot and emit 'created' change
                    snapshot = {
                        'generation': deployment.metadata.generation,
                        'images': _extract_images_from_containers(deployment.spec.template.spec.containers),
                        'replicas': deployment.spec.replicas or 0
                    }
                    _resource_generations[key] = snapshot

                    summary = f"Deployment {name} created with {deployment.spec.replicas or 0} replicas"
                    _send_change_event('deployment', ns, name, 'created', summary, {}, labels_dict, 'info')

                elif event_type == 'DELETED':
                    # Remove from tracker and emit 'deleted' change
                    _resource_generations.pop(key, None)
                    summary = f"Deployment {name} deleted"
                    _send_change_event('deployment', ns, name, 'deleted', summary, {}, labels_dict, 'warning')

                elif event_type == 'MODIFIED':
                    # Check for meaningful diff
                    old_snapshot = _resource_generations.get(key, {})
                    if old_snapshot:
                        diff_result = _extract_deployment_diff(old_snapshot, deployment)
                        if diff_result:
                            action, summary, diff = diff_result
                            severity = _classify_severity(action, 'deployment')
                            _send_change_event('deployment', ns, name, action, summary, diff, labels_dict, severity)

                            # Update snapshot
                            _resource_generations[key] = {
                                'generation': deployment.metadata.generation,
                                'images': _extract_images_from_containers(deployment.spec.template.spec.containers),
                                'replicas': deployment.spec.replicas or 0
                            }

        except Exception as e:
            if not shutdown_event.is_set():
                logger.error(f"Error watching deployments: {e}")
                k8s_watch_errors.labels(resource_type='deployment').inc()
                time.sleep(5)


def watch_events():
    """Watch Kubernetes events and send to Kafka"""
    logger.info("Starting Event watcher...")
    w = watch.Watch()

    while not shutdown_event.is_set():
        try:
            for event in w.stream(k8s_core_api.list_event_for_all_namespaces, timeout_seconds=WATCH_INTERVAL):
                if shutdown_event.is_set():
                    break

                k8s_event = event['object']

                message = {
                    'eventType': 'k8s_event',
                    'action': event['type'],
                    'namespace': k8s_event.metadata.namespace,
                    'name': k8s_event.metadata.name,
                    'reason': k8s_event.reason,
                    'message': k8s_event.message,
                    'type': k8s_event.type,
                    'involvedObject': {
                        'kind': k8s_event.involved_object.kind,
                        'namespace': k8s_event.involved_object.namespace,
                        'name': k8s_event.involved_object.name,
                    },
                    'count': k8s_event.count,
                    'firstTimestamp': k8s_event.first_timestamp.isoformat() if k8s_event.first_timestamp else None,
                    'lastTimestamp': k8s_event.last_timestamp.isoformat() if k8s_event.last_timestamp else None,
                }

                send_to_kafka(TOPIC_K8S_EVENTS, message)

        except Exception as e:
            if not shutdown_event.is_set():
                logger.error(f"Error watching events: {e}")
                k8s_watch_errors.labels(resource_type='event').inc()
                time.sleep(5)


def watch_configmaps():
    """Watch ConfigMap resources for meaningful changes."""
    logger.info("Starting ConfigMap watcher...")
    w = watch.Watch()

    while not shutdown_event.is_set():
        try:
            for event in w.stream(k8s_core_api.list_config_map_for_all_namespaces, timeout_seconds=WATCH_INTERVAL):
                if shutdown_event.is_set():
                    break

                cm = event['object']
                event_type = event['type']
                ns = cm.metadata.namespace
                name = cm.metadata.name

                # Skip kube-system noise
                if ns in ('kube-system', 'kube-public', 'kube-node-lease'):
                    continue

                key = _resource_key('configmap', ns, name)
                labels_dict = (cm.metadata.labels if isinstance(cm.metadata.labels, dict) else cm.metadata.labels.to_dict()) if cm.metadata.labels else {}

                if event_type == 'ADDED':
                    # Store snapshot
                    data_keys = list((cm.data or {}).keys()) + list((cm.binary_data or {}).keys())
                    snapshot = {
                        'generation': cm.metadata.generation or 0,
                        'data_keys': sorted(data_keys)
                    }
                    _resource_generations[key] = snapshot

                    summary = f"ConfigMap {name} created"
                    _send_change_event('configmap', ns, name, 'created', summary, {}, labels_dict, 'info')

                elif event_type == 'DELETED':
                    _resource_generations.pop(key, None)
                    summary = f"ConfigMap {name} deleted"
                    _send_change_event('configmap', ns, name, 'deleted', summary, {}, labels_dict, 'info')

                elif event_type == 'MODIFIED':
                    old_snapshot = _resource_generations.get(key, {})
                    if old_snapshot:
                        diff_result = _extract_configmap_diff(old_snapshot, cm)
                        if diff_result:
                            action, summary, diff = diff_result
                            severity = _classify_severity(action, 'configmap')
                            _send_change_event('configmap', ns, name, action, summary, diff, labels_dict, severity)

                            # Update snapshot
                            data_keys = list((cm.data or {}).keys()) + list((cm.binary_data or {}).keys())
                            _resource_generations[key] = {
                                'generation': cm.metadata.generation or 0,
                                'data_keys': sorted(data_keys)
                            }

        except Exception as e:
            if not shutdown_event.is_set():
                logger.error(f"Error watching configmaps: {e}")
                k8s_watch_errors.labels(resource_type='configmap').inc()
                time.sleep(5)


def watch_secrets():
    """Watch Secret resources (metadata only, never .data)."""
    logger.info("Starting Secret watcher...")
    w = watch.Watch()

    while not shutdown_event.is_set():
        try:
            for event in w.stream(k8s_core_api.list_secret_for_all_namespaces, timeout_seconds=WATCH_INTERVAL):
                if shutdown_event.is_set():
                    break

                secret = event['object']
                event_type = event['type']
                ns = secret.metadata.namespace
                name = secret.metadata.name

                # Skip kube-system and service account tokens
                if ns in ('kube-system', 'kube-public', 'kube-node-lease'):
                    continue
                if secret.type == 'kubernetes.io/service-account-token':
                    continue

                key = _resource_key('secret', ns, name)
                labels_dict = (secret.metadata.labels if isinstance(secret.metadata.labels, dict) else secret.metadata.labels.to_dict()) if secret.metadata.labels else {}

                if event_type == 'ADDED':
                    snapshot = {
                        'generation': secret.metadata.generation or 0,
                        'labels': labels_dict
                    }
                    _resource_generations[key] = snapshot

                    summary = f"Secret {name} created"
                    _send_change_event('secret', ns, name, 'created', summary, {}, labels_dict, 'info')

                elif event_type == 'DELETED':
                    _resource_generations.pop(key, None)
                    summary = f"Secret {name} deleted"
                    _send_change_event('secret', ns, name, 'deleted', summary, {}, labels_dict, 'info')

                elif event_type == 'MODIFIED':
                    old_snapshot = _resource_generations.get(key, {})
                    if old_snapshot:
                        diff_result = _extract_secret_diff(old_snapshot, secret)
                        if diff_result:
                            action, summary, diff = diff_result
                            severity = _classify_severity(action, 'secret')
                            _send_change_event('secret', ns, name, action, summary, diff, labels_dict, severity)

                            # Update snapshot
                            _resource_generations[key] = {
                                'generation': secret.metadata.generation or 0,
                                'labels': labels_dict
                            }

        except Exception as e:
            if not shutdown_event.is_set():
                logger.error(f"Error watching secrets: {e}")
                k8s_watch_errors.labels(resource_type='secret').inc()
                time.sleep(5)


def watch_statefulsets():
    """Watch StatefulSet resources for changes."""
    logger.info("Starting StatefulSet watcher...")
    w = watch.Watch()

    while not shutdown_event.is_set():
        try:
            for event in w.stream(k8s_apps_api.list_stateful_set_for_all_namespaces, timeout_seconds=WATCH_INTERVAL):
                if shutdown_event.is_set():
                    break

                sts = event['object']
                event_type = event['type']
                ns = sts.metadata.namespace
                name = sts.metadata.name

                if ns in ('kube-system', 'kube-public', 'kube-node-lease'):
                    continue

                key = _resource_key('statefulset', ns, name)
                labels_dict = (sts.metadata.labels if isinstance(sts.metadata.labels, dict) else sts.metadata.labels.to_dict()) if sts.metadata.labels else {}

                if event_type == 'ADDED':
                    snapshot = {
                        'generation': sts.metadata.generation,
                        'images': _extract_images_from_containers(sts.spec.template.spec.containers),
                        'replicas': sts.spec.replicas or 0
                    }
                    _resource_generations[key] = snapshot

                    summary = f"StatefulSet {name} created with {sts.spec.replicas or 0} replicas"
                    _send_change_event('statefulset', ns, name, 'created', summary, {}, labels_dict, 'info')

                elif event_type == 'DELETED':
                    _resource_generations.pop(key, None)
                    summary = f"StatefulSet {name} deleted"
                    _send_change_event('statefulset', ns, name, 'deleted', summary, {}, labels_dict, 'warning')

                elif event_type == 'MODIFIED':
                    old_snapshot = _resource_generations.get(key, {})
                    if old_snapshot:
                        diff_result = _extract_statefulset_diff(old_snapshot, sts)
                        if diff_result:
                            action, summary, diff = diff_result
                            severity = _classify_severity(action, 'statefulset')
                            _send_change_event('statefulset', ns, name, action, summary, diff, labels_dict, severity)

                            _resource_generations[key] = {
                                'generation': sts.metadata.generation,
                                'images': _extract_images_from_containers(sts.spec.template.spec.containers),
                                'replicas': sts.spec.replicas or 0
                            }

        except Exception as e:
            if not shutdown_event.is_set():
                logger.error(f"Error watching statefulsets: {e}")
                k8s_watch_errors.labels(resource_type='statefulset').inc()
                time.sleep(5)


def watch_daemonsets():
    """Watch DaemonSet resources for changes."""
    logger.info("Starting DaemonSet watcher...")
    w = watch.Watch()

    while not shutdown_event.is_set():
        try:
            for event in w.stream(k8s_apps_api.list_daemon_set_for_all_namespaces, timeout_seconds=WATCH_INTERVAL):
                if shutdown_event.is_set():
                    break

                ds = event['object']
                event_type = event['type']
                ns = ds.metadata.namespace
                name = ds.metadata.name

                if ns in ('kube-system', 'kube-public', 'kube-node-lease'):
                    continue

                key = _resource_key('daemonset', ns, name)
                labels_dict = (ds.metadata.labels if isinstance(ds.metadata.labels, dict) else ds.metadata.labels.to_dict()) if ds.metadata.labels else {}

                if event_type == 'ADDED':
                    snapshot = {
                        'generation': ds.metadata.generation,
                        'images': _extract_images_from_containers(ds.spec.template.spec.containers)
                    }
                    _resource_generations[key] = snapshot

                    summary = f"DaemonSet {name} created"
                    _send_change_event('daemonset', ns, name, 'created', summary, {}, labels_dict, 'info')

                elif event_type == 'DELETED':
                    _resource_generations.pop(key, None)
                    summary = f"DaemonSet {name} deleted"
                    _send_change_event('daemonset', ns, name, 'deleted', summary, {}, labels_dict, 'warning')

                elif event_type == 'MODIFIED':
                    old_snapshot = _resource_generations.get(key, {})
                    if old_snapshot:
                        diff_result = _extract_daemonset_diff(old_snapshot, ds)
                        if diff_result:
                            action, summary, diff = diff_result
                            severity = _classify_severity(action, 'daemonset')
                            _send_change_event('daemonset', ns, name, action, summary, diff, labels_dict, severity)

                            _resource_generations[key] = {
                                'generation': ds.metadata.generation,
                                'images': _extract_images_from_containers(ds.spec.template.spec.containers)
                            }

        except Exception as e:
            if not shutdown_event.is_set():
                logger.error(f"Error watching daemonsets: {e}")
                k8s_watch_errors.labels(resource_type='daemonset').inc()
                time.sleep(5)


def send_heartbeat():
    """Send periodic heartbeats to Kafka"""
    logger.info("Starting heartbeat sender...")

    while not shutdown_event.is_set():
        try:
            message = {
                'eventType': 'heartbeat',
                'status': 'healthy',
                'agentVersion': '1.0.0'
            }

            if send_to_kafka(TOPIC_HEARTBEATS, message):
                last_heartbeat.set(time.time())
                logger.debug(f"Heartbeat sent to Kafka")

        except Exception as e:
            logger.error(f"Error sending heartbeat: {e}")

        shutdown_event.wait(HEARTBEAT_INTERVAL)


def collect_and_send_metrics():
    """Collect metrics from Prometheus and send to Kafka"""
    global prometheus_collector

    logger.info("Starting metrics collector...")

    # Initialize Prometheus collector
    try:
        prometheus_collector = PrometheusCollector(PROMETHEUS_URL)
        logger.info(f"Prometheus collector initialized with URL: {PROMETHEUS_URL}")
    except Exception as e:
        logger.error(f"Failed to initialize Prometheus collector: {e}")
        return

    while not shutdown_event.is_set():
        try:
            logger.debug("Collecting cluster-wide metrics from Prometheus...")

            # Collect pod metrics (all namespaces, all pods)
            pod_metrics = prometheus_collector.collect_all_pod_metrics()
            if pod_metrics and pod_metrics.get('metrics'):
                # Send aggregated pod metrics
                for metric_name, metric_data in pod_metrics['metrics'].items():
                    if metric_data:  # Only send if there's data
                        message = {
                            'eventType': 'metrics',
                            'resourceType': 'pod',
                            'metricName': metric_name,
                            'data': metric_data,
                            'timestamp': pod_metrics['timestamp']
                        }
                        send_to_kafka(TOPIC_METRICS, message)

                logger.debug(f"Sent {len(pod_metrics['metrics'])} pod metric types to Kafka")

            # Collect node metrics (all nodes)
            node_metrics = prometheus_collector.collect_all_node_metrics()
            if node_metrics and node_metrics.get('metrics'):
                for metric_name, metric_data in node_metrics['metrics'].items():
                    if metric_data:
                        message = {
                            'eventType': 'metrics',
                            'resourceType': 'node',
                            'metricName': metric_name,
                            'data': metric_data,
                            'timestamp': node_metrics['timestamp']
                        }
                        send_to_kafka(TOPIC_METRICS, message)

                logger.debug(f"Sent {len(node_metrics['metrics'])} node metric types to Kafka")

            # Collect deployment metrics (all namespaces, all deployments)
            deployment_metrics = prometheus_collector.collect_all_deployment_metrics()
            if deployment_metrics and deployment_metrics.get('metrics'):
                for metric_name, metric_data in deployment_metrics['metrics'].items():
                    if metric_data:
                        message = {
                            'eventType': 'metrics',
                            'resourceType': 'deployment',
                            'metricName': metric_name,
                            'data': metric_data,
                            'timestamp': deployment_metrics['timestamp']
                        }
                        send_to_kafka(TOPIC_METRICS, message)

                logger.debug(f"Sent {len(deployment_metrics['metrics'])} deployment metric types to Kafka")

            logger.info("Metrics collection and send completed successfully")

        except Exception as e:
            logger.error(f"Error collecting/sending metrics: {e}", exc_info=True)

        # Wait for next metrics interval
        shutdown_event.wait(METRICS_INTERVAL)


def stream_pod_logs(namespace, pod_name, container=None, tail_lines=100, follow=True):
    """Stream logs from a pod to Kafka"""
    logger.info(f"Starting log stream for pod {namespace}/{pod_name}")

    try:
        # Get pod logs
        if container:
            log_stream = k8s_core_api.read_namespaced_pod_log(
                name=pod_name,
                namespace=namespace,
                container=container,
                follow=follow,
                tail_lines=tail_lines,
                _preload_content=False
            )
        else:
            log_stream = k8s_core_api.read_namespaced_pod_log(
                name=pod_name,
                namespace=namespace,
                follow=follow,
                tail_lines=tail_lines,
                _preload_content=False
            )

        # Stream logs line by line
        for line in log_stream:
            if shutdown_event.is_set():
                break

            log_line = line.decode('utf-8').strip()
            if not log_line:
                continue

            message = {
                'eventType': 'log',
                'namespace': namespace,
                'pod': pod_name,
                'container': container,
                'logLine': log_line,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }

            send_to_kafka(TOPIC_LOGS, message)

        log_stream.close()
        logger.info(f"Log stream closed for {namespace}/{pod_name}")

    except Exception as e:
        logger.error(f"Error streaming logs for {namespace}/{pod_name}: {e}")


# Global dict to track active log streams
active_log_streams = {}


# Flask routes
@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'userId': USER_ID,
        'clusterId': CLUSTER_ID,
        'clusterName': CLUSTER_NAME
    }), 200


@app.route('/ready', methods=['GET'])
def ready():
    """Readiness check endpoint"""
    # Check if Kafka producer is initialized
    if not kafka_producer:
        return jsonify({'status': 'not ready', 'reason': 'Kafka producer not initialized'}), 503

    return jsonify({'status': 'ready'}), 200


@app.route('/metrics', methods=['GET'])
def metrics():
    """Prometheus metrics endpoint"""
    return generate_latest(), 200, {'Content-Type': CONTENT_TYPE_LATEST}


@app.route('/webhook/alerts', methods=['POST'])
def alertmanager_webhook():
    """Webhook endpoint for Alertmanager alerts"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        logger.info(f"Received alertmanager webhook: {json.dumps(data, indent=2)}")

        # Alertmanager sends alerts in groups
        alerts = data.get('alerts', [])

        for alert in alerts:
            labels = alert.get('labels', {})
            annotations = alert.get('annotations', {})

            # Extract alert details
            alertname = labels.get('alertname', 'UnknownAlert')
            severity = labels.get('severity', 'warning')
            namespace = labels.get('namespace', 'default')
            pod = labels.get('pod', labels.get('pod_name', 'N/A'))

            # Build message from annotations or labels
            message = (
                annotations.get('summary') or
                annotations.get('description') or
                annotations.get('message') or
                f"{alertname} alert triggered"
            )

            alert_message = {
                'eventType': 'alert',
                'status': alert.get('status', 'firing'),
                'severity': severity,
                'alertname': alertname,
                'namespace': namespace,
                'pod': pod,
                'message': message,
                'labels': labels,
                'annotations': annotations,
                'startsAt': alert.get('startsAt'),
                'endsAt': alert.get('endsAt'),
                'generatorURL': alert.get('generatorURL'),
            }

            logger.info(f"Sending alert to Kafka: {alertname} ({severity}) in {namespace}/{pod}")
            send_to_kafka(TOPIC_ALERTS, alert_message)

        logger.info(f"✅ Processed {len(alerts)} alerts from Alertmanager")
        return jsonify({'status': 'ok', 'alerts_received': len(alerts)}), 200

    except Exception as e:
        logger.error(f"❌ Error processing alertmanager webhook: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/logs/stream/start', methods=['POST'])
def start_log_stream():
    """Start streaming logs for a specific pod"""
    try:
        data = request.get_json()
        namespace = data.get('namespace')
        pod_name = data.get('pod')
        container = data.get('container')
        tail_lines = data.get('tailLines', 100)

        if not namespace or not pod_name:
            return jsonify({'error': 'namespace and pod are required'}), 400

        stream_key = f"{namespace}/{pod_name}/{container or 'default'}"

        # Check if already streaming
        if stream_key in active_log_streams:
            return jsonify({
                'status': 'already_streaming',
                'message': f'Already streaming logs for {stream_key}'
            }), 200

        # Start log streaming in background thread
        thread = Thread(
            target=stream_pod_logs,
            args=(namespace, pod_name, container, tail_lines, True),
            daemon=True
        )
        thread.start()
        active_log_streams[stream_key] = thread

        logger.info(f"Started log stream for {stream_key}")
        return jsonify({
            'status': 'started',
            'namespace': namespace,
            'pod': pod_name,
            'container': container,
            'streamKey': stream_key
        }), 200

    except Exception as e:
        logger.error(f"Error starting log stream: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/logs/stream/stop', methods=['POST'])
def stop_log_stream():
    """Stop streaming logs for a specific pod"""
    try:
        data = request.get_json()
        namespace = data.get('namespace')
        pod_name = data.get('pod')
        container = data.get('container')

        if not namespace or not pod_name:
            return jsonify({'error': 'namespace and pod are required'}), 400

        stream_key = f"{namespace}/{pod_name}/{container or 'default'}"

        if stream_key in active_log_streams:
            # Thread will stop when shutdown_event is set or stream ends
            del active_log_streams[stream_key]
            logger.info(f"Stopped log stream for {stream_key}")
            return jsonify({
                'status': 'stopped',
                'streamKey': stream_key
            }), 200
        else:
            return jsonify({
                'status': 'not_found',
                'message': f'No active stream for {stream_key}'
            }), 404

    except Exception as e:
        logger.error(f"Error stopping log stream: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/logs/streams', methods=['GET'])
def list_active_streams():
    """List all active log streams"""
    return jsonify({
        'activeStreams': list(active_log_streams.keys()),
        'count': len(active_log_streams)
    }), 200


@app.route('/api/pods/logs', methods=['GET'])
def get_pod_logs():
    """Fetch last N log lines for a pod (used by alert enrichment)."""
    try:
        namespace = request.args.get('namespace', 'default')
        pod = request.args.get('pod')
        container = request.args.get('container')
        tail = min(int(request.args.get('tail', 400)), 1000)
        previous = request.args.get('previous', 'false').lower() == 'true'

        if not pod:
            return jsonify({'error': 'pod parameter required', 'lines': []}), 400

        kwargs = {
            'name': pod,
            'namespace': namespace,
            'tail_lines': tail,
            'timestamps': True,
            'previous': previous,
        }
        if container:
            kwargs['container'] = container

        try:
            log_text = k8s_core_api.read_namespaced_pod_log(**kwargs)
        except client.exceptions.ApiException as e:
            if e.status == 400:
                # Try previous container logs for crashed pods
                if not previous:
                    kwargs['previous'] = True
                    try:
                        log_text = k8s_core_api.read_namespaced_pod_log(**kwargs)
                    except client.exceptions.ApiException:
                        return jsonify({'pod': pod, 'lines': [], 'note': 'No logs available (container not ready)'}), 200
                else:
                    return jsonify({'pod': pod, 'lines': [], 'note': 'No logs available'}), 200
            elif e.status == 404:
                return jsonify({'pod': pod, 'lines': [], 'note': 'Pod not found'}), 404
            else:
                raise

        lines = log_text.strip().split('\n') if log_text and log_text.strip() else []
        return jsonify({'pod': pod, 'namespace': namespace, 'lines': lines, 'count': len(lines)}), 200

    except Exception as e:
        logger.error(f"Error fetching pod logs for {request.args.get('pod')}: {e}")
        return jsonify({'error': str(e), 'lines': []}), 500


# ========================================
# MCP Server Management Endpoints
# ========================================

def _ensure_namespace(namespace):
    """Ensure a K8s namespace exists, create if not."""
    import subprocess
    try:
        result = subprocess.run(
            ['kubectl', 'get', 'namespace', namespace],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            subprocess.run(
                ['kubectl', 'create', 'namespace', namespace],
                capture_output=True, text=True, timeout=10
            )
            logger.info(f"Created namespace: {namespace}")
    except Exception as e:
        logger.warning(f"Could not verify/create namespace {namespace}: {e}")


def _helm_install(name, namespace, helm_chart, helm_repo, helm_repo_url, helm_values):
    """Install an MCP server via Helm."""
    import subprocess

    # Add Helm repo if specified
    if helm_repo and helm_repo_url:
        cmd_add = ['helm', 'repo', 'add', helm_repo, helm_repo_url, '--force-update']
        subprocess.run(cmd_add, capture_output=True, text=True, timeout=30)
        subprocess.run(['helm', 'repo', 'update'], capture_output=True, text=True, timeout=30)

    # Build helm install command
    cmd = [
        'helm', 'upgrade', '--install', name, helm_chart,
        '--namespace', namespace, '--create-namespace',
        '--wait', '--timeout', '120s',
    ]

    # Add --set flags for helm values
    for key, value in (helm_values or {}).items():
        if value:
            cmd.extend(['--set', f'{key}={value}'])

    logger.info(f"Running Helm: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

    if result.returncode != 0:
        logger.error(f"Helm install failed: {result.stderr}")
        raise RuntimeError(f"Helm install failed: {result.stderr}")

    logger.info(f"Helm install succeeded: {result.stdout}")
    return result.stdout


def _ensure_rbac(name, namespace):
    """Create ServiceAccount, ClusterRole, and ClusterRoleBinding for MCP servers that need cluster-wide access."""
    sa_name = f'{name}-sa'
    role_name = f'{name}-cluster-role'
    binding_name = f'{name}-cluster-rolebinding'

    # Create ServiceAccount
    try:
        k8s_core_api.read_namespaced_service_account(sa_name, namespace)
        logger.info(f"ServiceAccount {sa_name} already exists")
    except client.exceptions.ApiException as e:
        if e.status == 404:
            sa = client.V1ServiceAccount(
                metadata=client.V1ObjectMeta(name=sa_name, namespace=namespace, labels={'app': name, 'managed-by': 'devops-copilot-mcp'})
            )
            k8s_core_api.create_namespaced_service_account(namespace, sa)
            logger.info(f"Created ServiceAccount: {sa_name}")
        else:
            raise

    # Create ClusterRole with broad K8s access
    try:
        k8s_rbac_api.read_cluster_role(role_name)
        logger.info(f"ClusterRole {role_name} already exists")
    except client.exceptions.ApiException as e:
        if e.status == 404:
            role = client.V1ClusterRole(
                metadata=client.V1ObjectMeta(name=role_name, labels={'app': name, 'managed-by': 'devops-copilot-mcp'}),
                rules=[
                    client.V1PolicyRule(
                        api_groups=['', 'apps', 'batch', 'extensions', 'networking.k8s.io', 'rbac.authorization.k8s.io', 'storage.k8s.io', 'autoscaling', 'policy'],
                        resources=['*'],
                        verbs=['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
                    ),
                    client.V1PolicyRule(
                        api_groups=['metrics.k8s.io'],
                        resources=['pods', 'nodes'],
                        verbs=['get', 'list'],
                    ),
                    client.V1PolicyRule(
                        api_groups=['apiextensions.k8s.io'],
                        resources=['customresourcedefinitions'],
                        verbs=['get', 'list'],
                    ),
                ]
            )
            k8s_rbac_api.create_cluster_role(role)
            logger.info(f"Created ClusterRole: {role_name}")
        else:
            raise

    # Create ClusterRoleBinding
    try:
        k8s_rbac_api.read_cluster_role_binding(binding_name)
        logger.info(f"ClusterRoleBinding {binding_name} already exists")
    except client.exceptions.ApiException as e:
        if e.status == 404:
            binding = client.V1ClusterRoleBinding(
                metadata=client.V1ObjectMeta(name=binding_name, labels={'app': name, 'managed-by': 'devops-copilot-mcp'}),
                role_ref=client.V1RoleRef(api_group='rbac.authorization.k8s.io', kind='ClusterRole', name=role_name),
                subjects=[client.V1Subject(kind='ServiceAccount', name=sa_name, namespace=namespace)]
            )
            k8s_rbac_api.create_cluster_role_binding(binding)
            logger.info(f"Created ClusterRoleBinding: {binding_name}")
        else:
            raise

    return sa_name


def _docker_deploy(name, namespace, image, port, env_vars, transport_args=None, stdio_cmd=None, service_account=None):
    """Deploy an MCP server as a K8s Deployment + Service using manifests.

    If stdio_cmd is provided, uses supercorp/supergateway to wrap stdio-based
    MCP servers with an SSE HTTP endpoint.
    """
    # Build env list
    env_list = [client.V1EnvVar(name=k, value=str(v)) for k, v in env_vars.items() if v]

    containers = []

    if stdio_cmd:
        # Stdio-based server: use supergateway to convert stdio → SSE
        logger.info(f"Using supergateway for stdio-based server: {stdio_cmd}")

        is_node_image = 'node:' in image

        if is_node_image:
            # npm-based server (image is already node:20-slim)
            # Install supergateway and run directly — no init container needed
            main_container = client.V1Container(
                name=name,
                image=image,
                command=['sh', '-c', f'npm install -g supergateway && supergateway --stdio "{stdio_cmd}" --port {port}'],
                ports=[client.V1ContainerPort(container_port=port)],
                env=env_list,
                resources=client.V1ResourceRequirements(
                    requests={'cpu': '100m', 'memory': '256Mi'},
                    limits={'cpu': '500m', 'memory': '512Mi'},
                ),
            )
            pod_spec = client.V1PodSpec(containers=[main_container])
        else:
            # Binary-based server (e.g. ghcr.io/github/github-mcp-server)
            # Use init container to copy binary, then run supergateway in node container
            init_container = client.V1Container(
                name=f'{name}-init',
                image=image,
                command=['sh', '-c', 'cp -a /usr/bin/* /shared/ 2>/dev/null; cp -a /usr/local/bin/* /shared/ 2>/dev/null; cp -a /bin/* /shared/ 2>/dev/null; cp -a /app/* /shared/ 2>/dev/null; echo "init done"'],
                volume_mounts=[
                    client.V1VolumeMount(name='shared-bin', mount_path='/shared')
                ],
                env=env_list,
            )

            gateway_container = client.V1Container(
                name=name,
                image='node:20-slim',
                command=['sh', '-c', f'npm install -g supergateway && supergateway --stdio "{stdio_cmd}" --port {port}'],
                ports=[client.V1ContainerPort(container_port=port)],
                env=env_list + [
                    client.V1EnvVar(name='PATH', value='/shared:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'),
                ],
                volume_mounts=[
                    client.V1VolumeMount(name='shared-bin', mount_path='/shared')
                ],
                resources=client.V1ResourceRequirements(
                    requests={'cpu': '100m', 'memory': '256Mi'},
                    limits={'cpu': '500m', 'memory': '512Mi'},
                ),
            )

            pod_spec = client.V1PodSpec(
                init_containers=[init_container],
                containers=[gateway_container],
                volumes=[
                    client.V1Volume(
                        name='shared-bin',
                        empty_dir=client.V1EmptyDirVolumeSpec()
                    )
                ]
            )
    else:
        # Server supports native SSE / HTTP – deploy directly
        container_args = transport_args if transport_args else None

        main_container = client.V1Container(
            name=name,
            image=image,
            args=container_args,
            ports=[client.V1ContainerPort(container_port=port)],
            env=env_list,
            resources=client.V1ResourceRequirements(
                requests={'cpu': '100m', 'memory': '128Mi'},
                limits={'cpu': '500m', 'memory': '512Mi'},
            ),
        )
        containers = [main_container]
        pod_spec = client.V1PodSpec(containers=containers)

    # Set service account if provided (for RBAC-enabled MCP servers)
    if service_account:
        pod_spec.service_account_name = service_account
        pod_spec.automount_service_account_token = True

    # Create Deployment
    deployment_body = client.V1Deployment(
        metadata=client.V1ObjectMeta(
            name=name,
            namespace=namespace,
            labels={'app': name, 'managed-by': 'devops-copilot-mcp'}
        ),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(match_labels={'app': name}),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={'app': name, 'managed-by': 'devops-copilot-mcp'}),
                spec=pod_spec,
            ),
        ),
    )

    try:
        k8s_apps_api.create_namespaced_deployment(namespace, deployment_body)
    except client.exceptions.ApiException as e:
        if e.status == 409:
            k8s_apps_api.replace_namespaced_deployment(name, namespace, deployment_body)
            logger.info(f"Updated existing deployment: {name}")
        else:
            raise

    # Create Service (NodePort for external access from agent)
    service_body = client.V1Service(
        metadata=client.V1ObjectMeta(
            name=name,
            namespace=namespace,
            labels={'app': name, 'managed-by': 'devops-copilot-mcp'}
        ),
        spec=client.V1ServiceSpec(
            type='NodePort',
            selector={'app': name},
            ports=[client.V1ServicePort(port=port, target_port=port, protocol='TCP')]
        )
    )

    try:
        k8s_core_api.create_namespaced_service(namespace, service_body)
    except client.exceptions.ApiException as e:
        if e.status == 409:
            pass  # Service already exists
        else:
            raise


@app.route('/mcp/deploy', methods=['POST'])
def mcp_deploy():
    """Deploy an MCP server via Helm or K8s manifests"""
    try:
        data = request.get_json()
        name = data.get('name')
        namespace = data.get('namespace', 'mcp-servers')
        deploy_method = data.get('deployMethod', 'docker')
        image = data.get('image')
        port = data.get('port', 3000)
        env_vars = data.get('envVars', {})
        transport_args = data.get('transportArgs', [])
        stdio_cmd = data.get('stdioCmd', '')  # e.g. "github-mcp-server stdio"
        requires_rbac = data.get('requiresRBAC', False)

        # Helm-specific
        helm_chart = data.get('helmChart', '')
        helm_repo = data.get('helmRepo', '')
        helm_repo_url = data.get('helmRepoUrl', '')
        helm_values = data.get('helmValues', {})

        if not name:
            return jsonify({'error': 'name is required'}), 400

        logger.info(f"Deploying MCP server: {name} via {deploy_method} in {namespace}")

        _ensure_namespace(namespace)

        # Set up RBAC if the MCP server needs cluster-wide access
        service_account = None
        if requires_rbac:
            logger.info(f"Setting up RBAC for {name}")
            service_account = _ensure_rbac(name, namespace)

        if deploy_method == 'helm' and helm_chart:
            _helm_install(name, namespace, helm_chart, helm_repo, helm_repo_url, helm_values)
        elif image:
            _docker_deploy(name, namespace, image, port, env_vars, transport_args, stdio_cmd=stdio_cmd or None, service_account=service_account)
        else:
            return jsonify({'error': 'Either image (docker) or helmChart (helm) is required'}), 400

        # Wait briefly and get pod name
        pod_name = ''
        try:
            time.sleep(3)
            pods = k8s_core_api.list_namespaced_pod(namespace, label_selector=f'app={name}')
            if pods.items:
                pod_name = pods.items[0].metadata.name
        except Exception:
            pass

        sse_url = f"http://{name}.{namespace}.svc.cluster.local:{port}/sse"

        logger.info(f"MCP server deployed: {name}, SSE URL: {sse_url}")
        return jsonify({
            'status': 'running',
            'name': name,
            'namespace': namespace,
            'podName': pod_name,
            'sseUrl': sse_url,
            'deployMethod': deploy_method,
        }), 201

    except Exception as e:
        logger.error(f"Error deploying MCP server: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@app.route('/mcp/status/<name>', methods=['GET'])
def mcp_status(name):
    """Get the status of a deployed MCP server"""
    try:
        namespace = request.args.get('namespace', 'mcp-servers')

        # Get deployment
        try:
            dep = k8s_apps_api.read_namespaced_deployment(name, namespace)
        except client.exceptions.ApiException as e:
            if e.status == 404:
                return jsonify({'status': 'stopped', 'error': 'Deployment not found'}), 404
            raise

        ready = dep.status.ready_replicas or 0
        desired = dep.spec.replicas or 1
        status = 'running' if ready >= desired else 'pending'

        # Get pod info
        pods = k8s_core_api.list_namespaced_pod(namespace, label_selector=f'app={name}')
        pod_name = pods.items[0].metadata.name if pods.items else ''
        pod_phase = pods.items[0].status.phase if pods.items else 'Unknown'

        if pod_phase == 'Failed':
            status = 'failed'

        return jsonify({
            'status': status,
            'name': name,
            'namespace': namespace,
            'podName': pod_name,
            'podPhase': pod_phase,
            'readyReplicas': ready,
            'desiredReplicas': desired,
        }), 200

    except Exception as e:
        logger.error(f"Error getting MCP status for {name}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/mcp/metrics/<name>', methods=['GET'])
def mcp_metrics(name):
    """Get live CPU, memory, and network metrics for an MCP server pod."""
    try:
        namespace = request.args.get('namespace', 'mcp-servers')

        # Find the pod
        pods = k8s_core_api.list_namespaced_pod(namespace, label_selector=f'app={name}')
        if not pods.items:
            return jsonify({'error': 'No pod found'}), 404

        pod = pods.items[0]
        pod_name = pod.metadata.name

        cpu_usage = 0
        memory_usage = 0
        cpu_percent = 0
        memory_percent = 0

        # Get CPU/Memory from metrics-server (if available)
        if k8s_metrics_api:
            try:
                pod_metrics = k8s_metrics_api.get_namespaced_custom_object(
                    'metrics.k8s.io', 'v1beta1', namespace, 'pods', pod_name
                )
                for container in pod_metrics.get('containers', []):
                    usage = container.get('usage', {})
                    cpu_str = usage.get('cpu', '0')
                    if cpu_str.endswith('n'):
                        cpu_usage += int(cpu_str[:-1]) / 1_000_000
                    elif cpu_str.endswith('m'):
                        cpu_usage += int(cpu_str[:-1])
                    else:
                        cpu_usage += int(cpu_str) * 1000

                    mem_str = usage.get('memory', '0')
                    if mem_str.endswith('Ki'):
                        memory_usage += int(mem_str[:-2]) / 1024
                    elif mem_str.endswith('Mi'):
                        memory_usage += int(mem_str[:-2])
                    elif mem_str.endswith('Gi'):
                        memory_usage += int(mem_str[:-2]) * 1024
                    else:
                        memory_usage += int(mem_str) / (1024 * 1024)

                for container in pod.spec.containers:
                    limits = container.resources.limits or {}
                    cpu_limit = limits.get('cpu', '500m')
                    mem_limit = limits.get('memory', '512Mi')
                    if cpu_limit.endswith('m'):
                        cpu_percent = round((cpu_usage / int(cpu_limit[:-1])) * 100, 1)
                    if mem_limit.endswith('Mi'):
                        memory_percent = round((memory_usage / int(mem_limit[:-2])) * 100, 1)
                    break
            except Exception as e:
                logger.warning(f"Metrics-server unavailable for {pod_name}: {e}")

        # Fallback: if metrics-server gave 0, try kubelet stats summary API via requests
        if cpu_usage == 0 and memory_usage == 0:
            try:
                import requests as _requests
                api_client = k8s_core_api.api_client
                api_host = api_client.configuration.host
                node_name = pod.spec.node_name
                if node_name and api_host:
                    stats_url = f"{api_host}/api/v1/nodes/{node_name}/proxy/stats/summary"

                    # Build auth headers from the api client config
                    headers = {}
                    auth_settings = api_client.configuration.api_key
                    if 'authorization' in auth_settings:
                        headers['Authorization'] = auth_settings['authorization']
                    elif api_client.configuration.api_key_prefix.get('authorization'):
                        token_file = '/var/run/secrets/kubernetes.io/serviceaccount/token'
                        import os
                        if os.path.exists(token_file):
                            with open(token_file) as f:
                                headers['Authorization'] = f'Bearer {f.read().strip()}'

                    # Get SSL config
                    verify = api_client.configuration.ssl_ca_cert or False
                    cert = None
                    if api_client.configuration.cert_file:
                        cert = (api_client.configuration.cert_file, api_client.configuration.key_file)

                    r = _requests.get(stats_url, headers=headers, verify=verify, cert=cert, timeout=10)
                    if r.status_code == 200:
                        stats = r.json()
                        for p in stats.get('pods', []):
                            ref = p.get('podRef', {})
                            if ref.get('name') == pod_name and ref.get('namespace') == namespace:
                                # CPU
                                nano = p.get('cpu', {}).get('usageNanoCores', 0)
                                cpu_usage = nano / 1_000_000  # nano to milli
                                cpu_limit_milli = 500
                                for c in pod.spec.containers:
                                    if c.resources and c.resources.limits:
                                        cl = c.resources.limits.get('cpu', '500m')
                                        cpu_limit_milli = int(cl[:-1]) if cl.endswith('m') else int(cl) * 1000
                                    break
                                cpu_percent = round((cpu_usage / cpu_limit_milli) * 100, 1) if cpu_limit_milli > 0 else 0

                                # Memory
                                mem_bytes = p.get('memory', {}).get('workingSetBytes', 0)
                                memory_usage = mem_bytes / (1024 * 1024)
                                mem_limit_mi = 512
                                for c in pod.spec.containers:
                                    if c.resources and c.resources.limits:
                                        ml = c.resources.limits.get('memory', '512Mi')
                                        if ml.endswith('Mi'): mem_limit_mi = int(ml[:-2])
                                        elif ml.endswith('Gi'): mem_limit_mi = int(ml[:-2]) * 1024
                                    break
                                memory_percent = round((memory_usage / mem_limit_mi) * 100, 1) if mem_limit_mi > 0 else 0
                                break
            except Exception as e:
                logger.debug(f"Kubelet stats fallback failed for {pod_name}: {e}")

        # Get network stats via exec into pod
        network_rx = 0
        network_tx = 0
        try:
            from kubernetes.stream import stream as k8s_stream
            exec_cmd = ['cat', '/proc/net/dev']
            resp = k8s_stream(
                k8s_core_api.connect_get_namespaced_pod_exec,
                pod_name, namespace,
                command=exec_cmd,
                container=name,
                stderr=True, stdin=False, stdout=True, tty=False,
            )
            for line in resp.strip().split('\n'):
                line = line.strip()
                if line.startswith('eth0:') or line.startswith('net0:'):
                    parts = line.split()
                    network_rx = int(parts[1]) / (1024 * 1024)
                    network_tx = int(parts[9]) / (1024 * 1024)
        except BaseException as e:
            logger.debug(f"Could not get network stats for {pod_name}: {e}")

        import datetime
        return jsonify({
            'podName': pod_name,
            'timestamp': datetime.datetime.utcnow().isoformat(),
            'cpu': {
                'millicores': round(cpu_usage, 1),
                'percent': cpu_percent,
            },
            'memory': {
                'usageMi': round(memory_usage, 1),
                'percent': memory_percent,
            },
            'network': {
                'rxMB': round(network_rx, 2),
                'txMB': round(network_tx, 2),
            },
        }), 200

    except Exception as e:
        logger.error(f"Error getting MCP metrics for {name}: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/mcp/logs/<name>', methods=['GET'])
def mcp_logs(name):
    """Get recent pod logs for an MCP server."""
    try:
        namespace = request.args.get('namespace', 'mcp-servers')
        tail = int(request.args.get('tail', 200))

        # Find the pod
        pods = k8s_core_api.list_namespaced_pod(namespace, label_selector=f'app={name}')
        if not pods.items:
            return jsonify({'error': 'No pod found', 'lines': []}), 404

        pod_name = pods.items[0].metadata.name

        try:
            log_text = k8s_core_api.read_namespaced_pod_log(
                pod_name, namespace,
                tail_lines=tail,
                timestamps=True,
            )
        except client.exceptions.ApiException as e:
            if e.status == 400:
                # Container not ready yet
                return jsonify({'podName': pod_name, 'lines': ['Container is starting...']}), 200
            raise

        lines = log_text.strip().split('\n') if log_text.strip() else []

        return jsonify({
            'podName': pod_name,
            'lines': lines,
        }), 200

    except Exception as e:
        logger.error(f"Error getting MCP logs for {name}: {e}")
        return jsonify({'error': str(e), 'lines': []}), 500


def _mcp_fetch_tools(base_url):
    """Connect to an MCP server via SSE and fetch its tools list."""
    import sseclient
    import json as json_mod
    import uuid as uuid_mod
    import threading

    deadline = time.time() + 25  # 25s total timeout

    sse_url = f"{base_url}/sse"
    logger.info(f"[MCP Tools] Connecting to SSE: {sse_url}")
    sse_resp = http_requests.get(sse_url, stream=True, timeout=8)
    sse_client = sseclient.SSEClient(sse_resp)

    # Collect SSE events in a background thread
    collected_events = []
    stop_event = threading.Event()

    def _collect():
        try:
            for event in sse_client.events():
                if stop_event.is_set():
                    break
                logger.debug(f"[MCP Tools] SSE event: type={event.event} data={event.data[:200]}")
                collected_events.append(event)
                if event.event == 'message':
                    try:
                        data = json_mod.loads(event.data)
                        if 'result' in data and 'tools' in data.get('result', {}):
                            stop_event.set()
                            break
                    except Exception:
                        pass
        except Exception as e:
            logger.debug(f"[MCP Tools] SSE collector ended: {e}")

    collector = threading.Thread(target=_collect, daemon=True)
    collector.start()

    def _timed_out():
        return time.time() > deadline

    # Wait for endpoint event
    message_url = None
    while not message_url and not _timed_out():
        time.sleep(0.2)
        for ev in collected_events:
            if ev.event == 'endpoint':
                endpoint = ev.data.strip()
                message_url = f"{base_url}{endpoint}" if endpoint.startswith('/') else endpoint
                break

    if not message_url:
        stop_event.set()
        sse_resp.close()
        raise Exception('Could not get MCP message endpoint from SSE')

    logger.info(f"[MCP Tools] Message endpoint: {message_url}")

    # Send initialize
    init_id = str(uuid_mod.uuid4())
    http_requests.post(message_url, json={
        "jsonrpc": "2.0", "id": init_id, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "devops-copilot", "version": "1.0.0"}}
    }, timeout=8)

    # Wait for initialize response
    init_done = False
    while not init_done and not _timed_out():
        time.sleep(0.2)
        for ev in collected_events:
            if ev.event == 'message':
                try:
                    data = json_mod.loads(ev.data)
                    if data.get('id') == init_id:
                        init_done = True
                        break
                except Exception:
                    pass

    # Send initialized notification
    http_requests.post(message_url, json={"jsonrpc": "2.0", "method": "notifications/initialized"}, timeout=8)
    time.sleep(0.1)

    # Send tools/list
    tools_id = str(uuid_mod.uuid4())
    http_requests.post(message_url, json={
        "jsonrpc": "2.0", "id": tools_id, "method": "tools/list", "params": {}
    }, timeout=8)

    # Wait for tools response
    tools = []
    while not tools and not _timed_out():
        time.sleep(0.2)
        for ev in collected_events:
            if ev.event == 'message':
                try:
                    data = json_mod.loads(ev.data)
                    if data.get('id') == tools_id and 'result' in data and 'tools' in data['result']:
                        tools = data['result']['tools']
                        break
                except Exception:
                    pass

    stop_event.set()
    sse_resp.close()

    if not tools and _timed_out():
        raise Exception(f'Timed out fetching tools from {base_url}')

    return [{'name': t.get('name', ''), 'description': t.get('description', ''), 'inputSchema': t.get('inputSchema', {})} for t in tools]


# Cache for MCP tools: { name: { tools: [...], fetched_at: timestamp, url: str } }
_mcp_tools_cache = {}
_MCP_CACHE_TTL = 300  # 5 minutes

@app.route('/mcp/tools/<name>', methods=['GET'])
def mcp_tools(name):
    """Fetch available tools from a running MCP server via SSE/JSON-RPC.
    Uses cache, tries NodePort first (fastest from Mac), then DNS, then port-forward."""
    try:
        namespace = request.args.get('namespace', 'mcp-servers')
        port = request.args.get('port', '8000')

        # Check cache first
        cached = _mcp_tools_cache.get(name)
        if cached and (time.time() - cached['fetched_at']) < _MCP_CACHE_TTL:
            logger.info(f"[MCP Tools] Returning {len(cached['tools'])} cached tools for {name}")
            return jsonify({'tools': cached['tools'], 'count': len(cached['tools']), 'cached': True}), 200

        # Try NodePort first (fastest when agent runs outside cluster)
        try:
            svc = k8s_core_api.read_namespaced_service(name, namespace)
            if svc.spec.type == 'NodePort' and svc.spec.ports:
                node_port = svc.spec.ports[0].node_port
                nodes = k8s_core_api.list_node()
                node_ip = None
                for node in nodes.items:
                    for addr in (node.status.addresses or []):
                        if addr.type == 'InternalIP':
                            node_ip = addr.address
                            break
                    if node_ip:
                        break
                if node_ip and node_port:
                    nodeport_url = f"http://{node_ip}:{node_port}"
                    logger.info(f"[MCP Tools] Trying NodePort first: {nodeport_url}")
                    normalized = _mcp_fetch_tools(nodeport_url)
                    logger.info(f"[MCP Tools] Found {len(normalized)} tools for {name} (NodePort)")
                    _mcp_tools_cache[name] = {'tools': normalized, 'fetched_at': time.time(), 'url': nodeport_url}
                    return jsonify({'tools': normalized, 'count': len(normalized)}), 200
        except Exception as np_err:
            logger.warning(f"[MCP Tools] NodePort failed for {name}: {np_err}")

        # Fallback: try direct K8s service DNS
        base_url = f"http://{name}.{namespace}.svc.cluster.local:{port}"
        try:
            normalized = _mcp_fetch_tools(base_url)
            logger.info(f"[MCP Tools] Found {len(normalized)} tools for {name} (direct)")
            _mcp_tools_cache[name] = {'tools': normalized, 'fetched_at': time.time(), 'url': base_url}
            return jsonify({'tools': normalized, 'count': len(normalized)}), 200
        except Exception as direct_err:
            logger.warning(f"[MCP Tools] Direct connection failed for {name}: {direct_err}")

        # Last fallback: kubectl port-forward
        import subprocess
        import socket

        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))
            local_port = s.getsockname()[1]

        logger.info(f"[MCP Tools] Using port-forward fallback: localhost:{local_port} -> svc/{name}:{port}")
        pf_proc = subprocess.Popen(
            ['kubectl', 'port-forward', f'svc/{name}', f'{local_port}:{port}', '-n', namespace],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )

        try:
            import time as time_mod
            ready = False
            for attempt in range(20):
                time_mod.sleep(0.5)
                try:
                    sock = socket.create_connection(('127.0.0.1', local_port), timeout=2)
                    sock.close()
                    ready = True
                    logger.info(f"[MCP Tools] Port-forward ready after {(attempt+1)*0.5}s")
                    break
                except (ConnectionRefusedError, OSError):
                    continue

            if not ready:
                raise Exception(f"Port-forward to {name} did not become ready in 10s")

            local_base = f"http://127.0.0.1:{local_port}"
            normalized = _mcp_fetch_tools(local_base)
            logger.info(f"[MCP Tools] Found {len(normalized)} tools for {name} (port-forward)")
            _mcp_tools_cache[name] = {'tools': normalized, 'fetched_at': time.time(), 'url': 'port-forward'}
            return jsonify({'tools': normalized, 'count': len(normalized)}), 200
        finally:
            pf_proc.terminate()
            try:
                pf_proc.wait(timeout=5)
            except Exception:
                pf_proc.kill()

    except http_requests.exceptions.ConnectionError:
        logger.warning(f"[MCP Tools] Cannot reach MCP server {name} in {namespace}")
        return jsonify({'error': f'MCP server {name} is not reachable', 'tools': []}), 503
    except Exception as e:
        logger.error(f"[MCP Tools] Error fetching tools for {name}: {e}", exc_info=True)
        return jsonify({'error': str(e), 'tools': []}), 500


@app.route('/mcp/undeploy/<name>', methods=['DELETE'])
def mcp_undeploy(name):
    """Undeploy an MCP server (supports both Helm and manifest deploys)"""
    try:
        namespace = request.args.get('namespace', 'mcp-servers')
        deploy_method = request.args.get('deployMethod', 'docker')

        logger.info(f"Undeploying MCP server: {name} from {namespace} (method: {deploy_method})")

        if deploy_method == 'helm':
            import subprocess
            result = subprocess.run(
                ['helm', 'uninstall', name, '--namespace', namespace],
                capture_output=True, text=True, timeout=60
            )
            if result.returncode != 0 and 'not found' not in result.stderr:
                logger.warning(f"Helm uninstall warning: {result.stderr}")

        # Always try to clean up K8s resources (works for both methods)
        try:
            k8s_apps_api.delete_namespaced_deployment(name, namespace)
            logger.info(f"Deleted deployment: {name}")
        except client.exceptions.ApiException as e:
            if e.status != 404:
                raise

        try:
            k8s_core_api.delete_namespaced_service(name, namespace)
            logger.info(f"Deleted service: {name}")
        except client.exceptions.ApiException as e:
            if e.status != 404:
                raise

        # Clean up RBAC resources if they exist
        sa_name = f'{name}-sa'
        role_name = f'{name}-cluster-role'
        binding_name = f'{name}-cluster-rolebinding'
        for cleanup_fn, resource_name in [
            (lambda: k8s_rbac_api.delete_cluster_role_binding(binding_name), binding_name),
            (lambda: k8s_rbac_api.delete_cluster_role(role_name), role_name),
            (lambda: k8s_core_api.delete_namespaced_service_account(sa_name, namespace), sa_name),
        ]:
            try:
                cleanup_fn()
                logger.info(f"Deleted RBAC resource: {resource_name}")
            except client.exceptions.ApiException as e:
                if e.status != 404:
                    logger.warning(f"Failed to delete {resource_name}: {e}")

        return jsonify({'status': 'deleted', 'name': name, 'namespace': namespace}), 200

    except Exception as e:
        logger.error(f"Error undeploying MCP server {name}: {e}")
        return jsonify({'error': str(e)}), 500


# ========================================
# Agent Checkin
# ========================================

BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:5001')
AGENT_PORT = int(os.getenv('AGENT_PORT', '8080'))

def agent_checkin():
    """Register this agent's endpoint with the backend so it can route deploy requests."""
    import requests as req_lib
    import socket

    try:
        # Determine this pod's IP
        pod_ip = os.getenv('POD_IP', '')
        if not pod_ip:
            pod_ip = socket.gethostbyname(socket.gethostname())

        agent_endpoint = f"http://{pod_ip}:{AGENT_PORT}"

        payload = {
            'clusterId': CLUSTER_ID,
            'userId': USER_ID,
            'agentEndpoint': agent_endpoint,
        }

        resp = req_lib.post(
            f"{BACKEND_URL}/api/clusters/agent-checkin",
            json=payload,
            timeout=10
        )

        if resp.status_code == 200:
            logger.info(f"✅ Agent checkin successful: {agent_endpoint}")
        else:
            logger.warning(f"Agent checkin returned {resp.status_code}: {resp.text}")

    except Exception as e:
        logger.warning(f"Agent checkin failed (will retry): {e}")


def periodic_checkin():
    """Periodically send checkin to backend."""
    while not shutdown_event.is_set():
        agent_checkin()
        shutdown_event.wait(300)  # Every 5 minutes


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    shutdown_event.set()


def main():
    """Main application entry point"""
    logger.info("=== DevOps Copilot Cluster Agent Starting ===")

    # Validate configuration
    validate_config()

    # Initialize Kafka
    init_kafka()

    # Initialize Kubernetes clients
    init_kubernetes()

    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    # Start background threads
    threads = [
        Thread(target=watch_pods, name='PodWatcher', daemon=True),
        Thread(target=watch_deployments, name='DeploymentWatcher', daemon=True),
        Thread(target=watch_events, name='EventWatcher', daemon=True),
        Thread(target=watch_configmaps, name='ConfigMapWatcher', daemon=True),
        Thread(target=watch_secrets, name='SecretWatcher', daemon=True),
        Thread(target=watch_statefulsets, name='StatefulSetWatcher', daemon=True),
        Thread(target=watch_daemonsets, name='DaemonSetWatcher', daemon=True),
        Thread(target=send_heartbeat, name='HeartbeatSender', daemon=True),
        Thread(target=collect_and_send_metrics, name='MetricsCollector', daemon=True),
        Thread(target=periodic_checkin, name='AgentCheckin', daemon=True),
    ]

    for thread in threads:
        thread.start()
        logger.info(f"Started thread: {thread.name}")

    # Initial checkin
    agent_checkin()

    # Start Flask app
    logger.info(f"Starting Flask web server on port {AGENT_PORT}...")
    app.run(host='0.0.0.0', port=AGENT_PORT, debug=False)

    # Wait for shutdown
    shutdown_event.wait()
    # Cleanup
    if kafka_producer:
        kafka_producer.flush()

    logger.info("=== DevOps Copilot Cluster Agent Stopped ===")


if __name__ == '__main__':
    main()


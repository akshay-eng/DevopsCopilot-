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
from datetime import datetime
from threading import Thread, Event
from flask import Flask, request, jsonify
from kubernetes import client, config, watch
from confluent_kafka import Producer
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST

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

# Kafka topics
TOPIC_ALERTS = 'alerts'
TOPIC_K8S_EVENTS = 'k8s-events'
TOPIC_RESOURCES = 'resources'
TOPIC_METRICS = 'metrics'
TOPIC_HEARTBEATS = 'heartbeats'

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
k8s_metrics_api = None


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
    global k8s_core_api, k8s_apps_api, k8s_metrics_api

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
        'timestamp': datetime.utcnow().isoformat() + 'Z',
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

                message = {
                    'eventType': 'resource_event',
                    'resourceType': 'deployment',
                    'action': event_type,
                    'namespace': deployment.metadata.namespace,
                    'name': deployment.metadata.name,
                    'data': {
                        'replicas': deployment.spec.replicas,
                        'readyReplicas': deployment.status.ready_replicas or 0,
                        'availableReplicas': deployment.status.available_replicas or 0,
                        'updatedReplicas': deployment.status.updated_replicas or 0,
                    }
                }

                send_to_kafka(TOPIC_RESOURCES, message)

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

        # Alertmanager sends alerts in groups
        alerts = data.get('alerts', [])

        for alert in alerts:
            message = {
                'eventType': 'alert',
                'status': alert.get('status'),
                'severity': alert.get('labels', {}).get('severity', 'unknown'),
                'alertname': alert.get('labels', {}).get('alertname'),
                'namespace': alert.get('labels', {}).get('namespace'),
                'pod': alert.get('labels', {}).get('pod'),
                'labels': alert.get('labels', {}),
                'annotations': alert.get('annotations', {}),
                'startsAt': alert.get('startsAt'),
                'endsAt': alert.get('endsAt'),
                'generatorURL': alert.get('generatorURL'),
            }

            send_to_kafka(TOPIC_ALERTS, message)

        logger.info(f"Received {len(alerts)} alerts from Alertmanager")
        return jsonify({'status': 'ok', 'alerts_received': len(alerts)}), 200

    except Exception as e:
        logger.error(f"Error processing alertmanager webhook: {e}")
        return jsonify({'error': str(e)}), 500


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
        Thread(target=send_heartbeat, name='HeartbeatSender', daemon=True),
    ]

    for thread in threads:
        thread.start()
        logger.info(f"Started thread: {thread.name}")

    # Start Flask app
    logger.info("Starting Flask web server on port 8080...")
    app.run(host='0.0.0.0', port=8080, debug=False)

    # Wait for shutdown
    shutdown_event.wait()

    # Cleanup
    if kafka_producer:
        kafka_producer.flush()

    logger.info("=== DevOps Copilot Cluster Agent Stopped ===")


if __name__ == '__main__':
    main()

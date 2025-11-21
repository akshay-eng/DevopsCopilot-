"""
Configuration management for K8s Cluster Watcher Agent
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Agent configuration"""

    # Agent Identity
    AGENT_ID = os.getenv('AGENT_ID', '')
    CLUSTER_NAME = os.getenv('CLUSTER_NAME', 'default-cluster')
    CLUSTER_TYPE = os.getenv('CLUSTER_TYPE', 'kubernetes')  # kubernetes, openshift, eks, gke, aks

    # Backend SaaS Configuration
    BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:5000')
    API_KEY = os.getenv('API_KEY', '')
    USER_ID = os.getenv('USER_ID', '')

    # Kafka Configuration
    KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
    KAFKA_SECURITY_PROTOCOL = os.getenv('KAFKA_SECURITY_PROTOCOL', 'PLAINTEXT')
    KAFKA_SASL_MECHANISM = os.getenv('KAFKA_SASL_MECHANISM', 'PLAIN')
    KAFKA_SASL_USERNAME = os.getenv('KAFKA_SASL_USERNAME', '')
    KAFKA_SASL_PASSWORD = os.getenv('KAFKA_SASL_PASSWORD', '')

    # Kafka Topics
    KAFKA_TOPIC_ALERTS = os.getenv('KAFKA_TOPIC_ALERTS', 'alerts')
    KAFKA_TOPIC_METRICS = os.getenv('KAFKA_TOPIC_METRICS', 'metrics')
    KAFKA_TOPIC_EVENTS = os.getenv('KAFKA_TOPIC_EVENTS', 'k8s-events')
    KAFKA_TOPIC_LOGS = os.getenv('KAFKA_TOPIC_LOGS', 'logs')
    KAFKA_TOPIC_RESOURCES = os.getenv('KAFKA_TOPIC_RESOURCES', 'resources')

    # Kubernetes Configuration
    K8S_IN_CLUSTER = os.getenv('K8S_IN_CLUSTER', 'true').lower() == 'true'
    K8S_NAMESPACE = os.getenv('K8S_NAMESPACE', 'default')
    K8S_SERVICE_ACCOUNT_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token'

    # Prometheus Configuration
    PROMETHEUS_URL = os.getenv('PROMETHEUS_URL', 'http://prometheus:9090')
    PROMETHEUS_SCRAPE_INTERVAL = int(os.getenv('PROMETHEUS_SCRAPE_INTERVAL', '30'))  # seconds

    # Grafana Configuration (for alert ingestion)
    GRAFANA_URL = os.getenv('GRAFANA_URL', 'http://grafana:3000')
    GRAFANA_API_KEY = os.getenv('GRAFANA_API_KEY', '')

    # Loki Configuration (for log ingestion)
    LOKI_URL = os.getenv('LOKI_URL', 'http://loki:3100')

    # Agent API Server
    API_SERVER_HOST = os.getenv('API_SERVER_HOST', '0.0.0.0')
    API_SERVER_PORT = int(os.getenv('API_SERVER_PORT', '8080'))

    # Monitoring & Health Check
    HEALTH_CHECK_INTERVAL = int(os.getenv('HEALTH_CHECK_INTERVAL', '60'))  # seconds
    HEARTBEAT_INTERVAL = int(os.getenv('HEARTBEAT_INTERVAL', '30'))  # seconds

    # Feature Flags
    ENABLE_METRICS_COLLECTION = os.getenv('ENABLE_METRICS_COLLECTION', 'true').lower() == 'true'
    ENABLE_LOG_COLLECTION = os.getenv('ENABLE_LOG_COLLECTION', 'true').lower() == 'true'
    ENABLE_EVENT_WATCHING = os.getenv('ENABLE_EVENT_WATCHING', 'true').lower() == 'true'
    ENABLE_RESOURCE_WATCHING = os.getenv('ENABLE_RESOURCE_WATCHING', 'true').lower() == 'true'
    ENABLE_ALERT_WATCHING = os.getenv('ENABLE_ALERT_WATCHING', 'true').lower() == 'true'

    # Resource Watching Configuration
    WATCH_RESOURCES = os.getenv('WATCH_RESOURCES', 'pods,services,deployments,nodes,namespaces,ingresses').split(',')

    # Retry Configuration
    MAX_RETRIES = int(os.getenv('MAX_RETRIES', '3'))
    RETRY_BACKOFF = int(os.getenv('RETRY_BACKOFF', '5'))  # seconds

    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FORMAT = os.getenv('LOG_FORMAT', 'json')  # json or text

    # Sentry Configuration (Error Tracking)
    SENTRY_DSN = os.getenv('SENTRY_DSN', '')
    SENTRY_ENVIRONMENT = os.getenv('SENTRY_ENVIRONMENT', 'production')

    @classmethod
    def validate(cls):
        """Validate required configuration"""
        required = ['AGENT_ID', 'API_KEY', 'USER_ID', 'BACKEND_URL']
        missing = [key for key in required if not getattr(cls, key)]

        if missing:
            raise ValueError(f"Missing required configuration: {', '.join(missing)}")

        return True

    @classmethod
    def get_kafka_config(cls):
        """Get Kafka producer configuration"""
        config = {
            'bootstrap_servers': cls.KAFKA_BOOTSTRAP_SERVERS.split(','),
            'security_protocol': cls.KAFKA_SECURITY_PROTOCOL,
            'client_id': f'agent-{cls.AGENT_ID}',
        }

        if cls.KAFKA_SECURITY_PROTOCOL in ['SASL_SSL', 'SASL_PLAINTEXT']:
            config.update({
                'sasl_mechanism': cls.KAFKA_SASL_MECHANISM,
                'sasl_plain_username': cls.KAFKA_SASL_USERNAME,
                'sasl_plain_password': cls.KAFKA_SASL_PASSWORD,
            })

        return config

    @classmethod
    def to_dict(cls):
        """Convert config to dictionary (excluding sensitive data)"""
        return {
            'agent_id': cls.AGENT_ID,
            'cluster_name': cls.CLUSTER_NAME,
            'cluster_type': cls.CLUSTER_TYPE,
            'backend_url': cls.BACKEND_URL,
            'features': {
                'metrics_collection': cls.ENABLE_METRICS_COLLECTION,
                'log_collection': cls.ENABLE_LOG_COLLECTION,
                'event_watching': cls.ENABLE_EVENT_WATCHING,
                'resource_watching': cls.ENABLE_RESOURCE_WATCHING,
                'alert_watching': cls.ENABLE_ALERT_WATCHING,
            },
            'watch_resources': cls.WATCH_RESOURCES,
            'prometheus_url': cls.PROMETHEUS_URL,
            'grafana_url': cls.GRAFANA_URL,
            'loki_url': cls.LOKI_URL,
        }

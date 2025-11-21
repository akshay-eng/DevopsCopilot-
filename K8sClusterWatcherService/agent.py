"""
K8s Cluster Watcher Agent - Main Entry Point
Runs in user's Kubernetes cluster and streams data to SaaS backend
"""
import asyncio
import signal
import sys
import threading
from datetime import datetime

from logger import setup_logging, get_logger
from config import Config
from kafka_producer import KafkaDataProducer
from k8s_watcher import K8sResourceWatcher
from metrics_collector import PrometheusMetricsCollector
from api_server import AgentAPIServer

# Setup logging
setup_logging()
logger = get_logger(__name__)


class K8sWatcherAgent:
    """Main agent orchestrator"""

    def __init__(self):
        self.kafka_producer = None
        self.k8s_watcher = None
        self.metrics_collector = None
        self.api_server = None
        self.heartbeat_task = None
        self.running = False

    def _validate_config(self):
        """Validate configuration before starting"""
        try:
            Config.validate()
            logger.info("configuration_validated", config=Config.to_dict())
        except ValueError as e:
            logger.error("configuration_validation_failed", error=str(e))
            sys.exit(1)

    def _initialize_components(self):
        """Initialize all agent components"""
        try:
            # Initialize Kafka producer
            logger.info("initializing_kafka_producer")
            self.kafka_producer = KafkaDataProducer()

            # Initialize K8s watcher (if enabled)
            if Config.ENABLE_RESOURCE_WATCHING or Config.ENABLE_EVENT_WATCHING:
                logger.info("initializing_k8s_watcher")
                self.k8s_watcher = K8sResourceWatcher(self.kafka_producer)

            # Initialize metrics collector (if enabled)
            if Config.ENABLE_METRICS_COLLECTION or Config.ENABLE_ALERT_WATCHING:
                logger.info("initializing_metrics_collector")
                self.metrics_collector = PrometheusMetricsCollector(self.kafka_producer)

            # Initialize API server
            logger.info("initializing_api_server")
            self.api_server = AgentAPIServer(self.k8s_watcher, self.metrics_collector)

            logger.info("all_components_initialized")

        except Exception as e:
            logger.error("component_initialization_failed", error=str(e))
            sys.exit(1)

    def _register_agent(self):
        """Register agent with backend"""
        try:
            import requests

            registration_data = {
                'agent_id': Config.AGENT_ID,
                'cluster_name': Config.CLUSTER_NAME,
                'cluster_type': Config.CLUSTER_TYPE,
                'user_id': Config.USER_ID,
                'status': 'online',
                'registered_at': datetime.utcnow().isoformat(),
                'features': Config.to_dict()['features'],
            }

            response = requests.post(
                f"{Config.BACKEND_URL}/api/agents/register",
                json=registration_data,
                headers={'X-API-Key': Config.API_KEY},
                timeout=10
            )

            if response.status_code == 200:
                logger.info("agent_registered_successfully", agent_id=Config.AGENT_ID)
            else:
                logger.warning("agent_registration_failed",
                             status_code=response.status_code,
                             response=response.text)

        except Exception as e:
            logger.error("agent_registration_error", error=str(e))
            # Continue anyway - registration is not critical for agent operation

    async def _send_heartbeat(self):
        """Send periodic heartbeat to backend"""
        logger.info("starting_heartbeat_task")

        while self.running:
            try:
                self.kafka_producer.send_heartbeat()
                logger.debug("heartbeat_sent")
            except Exception as e:
                logger.error("heartbeat_failed", error=str(e))

            await asyncio.sleep(Config.HEARTBEAT_INTERVAL)

    async def _start_async_tasks(self):
        """Start all async tasks"""
        tasks = []

        # Start heartbeat
        self.heartbeat_task = asyncio.create_task(self._send_heartbeat())
        tasks.append(self.heartbeat_task)

        # Start K8s watchers
        if self.k8s_watcher:
            logger.info("starting_k8s_watchers")
            tasks.append(asyncio.create_task(self.k8s_watcher.start_all_watchers()))

        # Start metrics collection
        if self.metrics_collector:
            logger.info("starting_metrics_collection")
            tasks.append(asyncio.create_task(self.metrics_collector.start_collection()))

        logger.info("all_async_tasks_started", count=len(tasks))

        # Wait for all tasks
        await asyncio.gather(*tasks)

    def _start_api_server(self):
        """Start Flask API server in separate thread"""
        logger.info("starting_api_server_thread")

        api_thread = threading.Thread(target=self.api_server.run, daemon=True)
        api_thread.start()

        logger.info("api_server_started")

    def _setup_signal_handlers(self):
        """Setup signal handlers for graceful shutdown"""

        def signal_handler(sig, frame):
            logger.info("shutdown_signal_received", signal=sig)
            self.shutdown()

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

    def start(self):
        """Start the agent"""
        logger.info("starting_k8s_watcher_agent",
                   agent_id=Config.AGENT_ID,
                   cluster_name=Config.CLUSTER_NAME,
                   version="1.0.0")

        # Validate configuration
        self._validate_config()

        # Initialize components
        self._initialize_components()

        # Register agent with backend
        self._register_agent()

        # Setup signal handlers
        self._setup_signal_handlers()

        # Mark as running
        self.running = True

        # Start API server in background thread
        self._start_api_server()

        # Start async tasks
        try:
            asyncio.run(self._start_async_tasks())
        except KeyboardInterrupt:
            logger.info("keyboard_interrupt_received")
            self.shutdown()
        except Exception as e:
            logger.error("agent_failed", error=str(e))
            self.shutdown()
            sys.exit(1)

    def shutdown(self):
        """Graceful shutdown"""
        if not self.running:
            return

        logger.info("shutting_down_agent")
        self.running = False

        # Cancel heartbeat task
        if self.heartbeat_task:
            self.heartbeat_task.cancel()

        # Flush and close Kafka producer
        if self.kafka_producer:
            logger.info("flushing_kafka_messages")
            self.kafka_producer.close()

        # Deregister agent
        self._deregister_agent()

        logger.info("agent_shutdown_complete")

    def _deregister_agent(self):
        """Deregister agent from backend"""
        try:
            import requests

            response = requests.post(
                f"{Config.BACKEND_URL}/api/agents/deregister",
                json={
                    'agent_id': Config.AGENT_ID,
                    'user_id': Config.USER_ID,
                },
                headers={'X-API-Key': Config.API_KEY},
                timeout=5
            )

            if response.status_code == 200:
                logger.info("agent_deregistered_successfully")
            else:
                logger.warning("agent_deregistration_failed",
                             status_code=response.status_code)

        except Exception as e:
            logger.error("agent_deregistration_error", error=str(e))


def main():
    """Main entry point"""
    try:
        agent = K8sWatcherAgent()
        agent.start()
    except Exception as e:
        logger.error("agent_startup_failed", error=str(e))
        sys.exit(1)


if __name__ == '__main__':
    main()

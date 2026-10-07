"""
Main Correlation Engine
Orchestrates alert enrichment, correlation, and incident creation
"""
import logging
import json
import threading
import os
from typing import Dict
from confluent_kafka import Consumer, Producer, KafkaError
from dotenv import load_dotenv

from utils.capability_detector import CapabilityDetector
from collectors.cilium_flow_collector import CiliumFlowCollector
from collectors.simple_service_graph import SimpleServiceGraphBuilder
from enrichers.alert_enricher import AlertEnricher
from correlators.alert_correlator import AlertCorrelator
from models.incident_store import IncidentStore
from api.rest_api import CorrelationAPI

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CorrelationEngine:
    """Main Alert Correlation Engine"""

    def __init__(self):
        # Load environment variables
        load_dotenv()

        self.kafka_brokers = os.getenv('KAFKA_BOOTSTRAP_SERVERS')
        self.mongo_uri = os.getenv('MONGO_DB_URI', 'mongodb://localhost:27017/admin')
        self.prometheus_url = os.getenv('PROMETHEUS_URL', 'http://localhost:9090')
        self.cluster_id = os.getenv('CLUSTER_ID', '')

        logger.info("=" * 60)
        logger.info("🚀 Initializing Alert Correlation Engine")
        logger.info("=" * 60)

        # 1. Detect capabilities
        logger.info("Step 1: Detecting cluster capabilities...")
        self.detector = CapabilityDetector()
        self.capabilities = self.detector.detect_capabilities()

        # 2. Setup Kafka
        logger.info("Step 2: Setting up Kafka...")
        self.kafka_producer = self._setup_kafka_producer()
        self.kafka_consumer = self._setup_kafka_consumer()

        # 3. Setup network collectors based on capabilities
        logger.info("Step 3: Setting up network collectors...")
        self.network_collector = None
        self.service_graph_builder = None

        if self.capabilities['cilium'] and self.capabilities['hubble_relay']:
            # Use Cilium (Tier 1)
            hubble_url = self.detector.get_hubble_relay_url()
            self.network_collector = CiliumFlowCollector(
                hubble_url,
                self.kafka_producer,
                kafka_topic='network-flows'
            )
            logger.info("✅ Using Cilium Flow Collector (Tier 1 - Premium)")
        else:
            # Use simple graph builder (Tier 2)
            self.service_graph_builder = SimpleServiceGraphBuilder()
            logger.info("✅ Using Simple Service Graph Builder (Tier 2 - Fallback)")

        # 4. Setup enricher
        logger.info("Step 4: Setting up alert enricher...")
        self.enricher = AlertEnricher(self.prometheus_url)

        # 5. Setup correlator
        logger.info("Step 5: Setting up alert correlator...")
        self.correlator = AlertCorrelator(
            network_collector=self.network_collector,
            service_graph_builder=self.service_graph_builder
        )

        # 6. Setup MongoDB storage
        logger.info("Step 6: Connecting to MongoDB...")
        self.incident_store = IncidentStore(self.mongo_uri)

        # 7. Setup REST API
        logger.info("Step 7: Setting up REST API...")
        self.api = CorrelationAPI(
            incident_store=self.incident_store,
            network_collector=self.network_collector,
            service_graph_builder=self.service_graph_builder,
            capabilities=self.capabilities
        )

        self.is_running = False
        self.consumer_thread = None

        logger.info("=" * 60)
        logger.info("✅ Correlation Engine initialized successfully")
        logger.info("=" * 60)

    def _setup_kafka_producer(self) -> Producer:
        """Setup Kafka producer for publishing incidents and flows"""
        conf = {
            'bootstrap.servers': self.kafka_brokers,
            'client.id': 'correlation-engine-producer'
        }

        producer = Producer(conf)
        logger.info(f"✅ Kafka producer connected: {self.kafka_brokers}")
        return producer

    def _setup_kafka_consumer(self) -> Consumer:
        """Setup Kafka consumer for consuming alerts"""
        conf = {
            'bootstrap.servers': self.kafka_brokers,
            'group.id': 'correlation-engine',
            'auto.offset.reset': 'latest',
            'enable.auto.commit': True,
            'session.timeout.ms': 60000
        }

        consumer = Consumer(conf)
        consumer.subscribe(['alerts'])

        logger.info(f"✅ Kafka consumer subscribed to 'alerts' topic")
        return consumer

    def start(self):
        """Start the correlation engine"""
        if self.is_running:
            logger.warning("Correlation engine already running")
            return

        logger.info("🚀 Starting Correlation Engine...")

        self.is_running = True

        # Start network collectors
        if self.network_collector:
            self.network_collector.start()
        elif self.service_graph_builder:
            self.service_graph_builder.start()

        # Start alert consumer thread
        self.consumer_thread = threading.Thread(target=self._consume_alerts, daemon=True)
        self.consumer_thread.start()

        # Start API server in main thread
        logger.info("Starting REST API server on port 9000...")
        self.api.run(host='0.0.0.0', port=9000, debug=False)

    def stop(self):
        """Stop the correlation engine"""
        logger.info("Stopping Correlation Engine...")

        self.is_running = False

        # Stop network collectors
        if self.network_collector:
            self.network_collector.stop()
        elif self.service_graph_builder:
            self.service_graph_builder.stop()

        # Stop consumer
        if self.kafka_consumer:
            self.kafka_consumer.close()

        # Stop producer
        if self.kafka_producer:
            self.kafka_producer.flush()

        logger.info("✅ Correlation Engine stopped")

    def _consume_alerts(self):
        """Background task to consume alerts from Kafka"""
        logger.info("📡 Started consuming alerts from Kafka...")

        try:
            while self.is_running:
                msg = self.kafka_consumer.poll(timeout=1.0)

                if msg is None:
                    continue

                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    else:
                        logger.error(f"Kafka error: {msg.error()}")
                        continue

                # Process alert
                try:
                    alert = json.loads(msg.value().decode('utf-8'))
                    self._process_alert(alert)
                except Exception as e:
                    logger.error(f"Error processing alert: {e}")

        except Exception as e:
            logger.error(f"Error in alert consumer: {e}")
        finally:
            logger.info("Alert consumer stopped")

    def _process_alert(self, alert: Dict):
        """Process a single alert through the enrichment and correlation pipeline"""
        try:
            alertname = alert.get('labels', {}).get('alertname', 'Unknown')
            logger.info(f"📥 Processing alert: {alertname}")

            # 1. Enrich alert
            enriched_alert = self.enricher.enrich_alert(alert)

            # 2. Add network flow data if Cilium available
            if self.network_collector:
                pod_name = alert.get('labels', {}).get('pod', '')
                namespace = alert.get('labels', {}).get('namespace', '')

                if pod_name and namespace:
                    enriched_alert['network_flows'] = self.network_collector.analyze_flows_for_alert(
                        pod_name,
                        namespace,
                        lookback_minutes=10
                    )

            # 3. Save alert to history (sampling)
            self.incident_store.save_alert_to_history(enriched_alert)

            # 4. Correlate and create incident if needed
            incident = self.correlator.process_alert(enriched_alert)

            if incident:
                # Save incident to MongoDB
                incident_id = self.incident_store.save_incident(incident)

                # Publish incident to Kafka for notifications
                self._publish_incident(incident)

                logger.info(f"✅ Incident {incident_id} created/updated with {incident['alert_count']} alerts")
            else:
                logger.info(f"No incident created for alert: {alertname}")

        except Exception as e:
            logger.error(f"Error processing alert: {e}", exc_info=True)

    def _publish_incident(self, incident: Dict):
        """Publish incident to Kafka for notifications (Slack, email, etc.)"""
        try:
            # Remove MongoDB-specific fields
            incident_copy = {k: v for k, v in incident.items() if k != '_id'}

            self.kafka_producer.produce(
                'incidents-notifications',
                value=json.dumps(incident_copy).encode('utf-8')
            )
            self.kafka_producer.poll(0)

            logger.info(f"Published incident to Kafka: {incident['incident_id']}")

        except Exception as e:
            logger.error(f"Error publishing incident to Kafka: {e}")


def main():
    """Main entry point"""
    try:
        engine = CorrelationEngine()
        engine.start()
    except KeyboardInterrupt:
        logger.info("Received interrupt signal, shutting down...")
        engine.stop()
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)


if __name__ == '__main__':
    main()

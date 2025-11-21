"""
Kafka Producer for streaming data to SaaS backend
"""
import json
import time
from datetime import datetime
from confluent_kafka import Producer
from tenacity import retry, stop_after_attempt, wait_exponential
import structlog

from config import Config

logger = structlog.get_logger()


class KafkaDataProducer:
    """Kafka producer for streaming K8s data to backend"""

    def __init__(self):
        self.producer = None
        self.config = Config.get_kafka_config()
        self._initialize_producer()

    def _initialize_producer(self):
        """Initialize Kafka producer"""
        try:
            # Convert to confluent_kafka format
            producer_config = {
                'bootstrap.servers': ','.join(self.config['bootstrap_servers']),
                'client.id': self.config['client_id'],
                'acks': 'all',
                'retries': 3,
                'max.in.flight.requests.per.connection': 5,
                'compression.type': 'snappy',
                'linger.ms': 10,
                'batch.size': 32768,
            }

            # Add SASL configuration if needed
            if self.config.get('security_protocol') in ['SASL_SSL', 'SASL_PLAINTEXT']:
                producer_config.update({
                    'security.protocol': self.config['security_protocol'],
                    'sasl.mechanism': self.config['sasl_mechanism'],
                    'sasl.username': self.config['sasl_plain_username'],
                    'sasl.password': self.config['sasl_plain_password'],
                })

            self.producer = Producer(producer_config)
            logger.info("kafka_producer_initialized", client_id=self.config['client_id'])

        except Exception as e:
            logger.error("kafka_producer_initialization_failed", error=str(e))
            raise

    def _delivery_callback(self, err, msg):
        """Callback for message delivery reports"""
        if err:
            logger.error(
                "message_delivery_failed",
                topic=msg.topic(),
                partition=msg.partition(),
                error=str(err)
            )
        else:
            logger.debug(
                "message_delivered",
                topic=msg.topic(),
                partition=msg.partition(),
                offset=msg.offset()
            )

    def _enrich_message(self, data):
        """Enrich message with metadata"""
        return {
            **data,
            'agent_id': Config.AGENT_ID,
            'cluster_name': Config.CLUSTER_NAME,
            'cluster_type': Config.CLUSTER_TYPE,
            'user_id': Config.USER_ID,
            'timestamp': datetime.utcnow().isoformat(),
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def send_alert(self, alert_data):
        """Send alert to Kafka"""
        try:
            enriched_data = self._enrich_message({
                'type': 'alert',
                'data': alert_data
            })

            self.producer.produce(
                topic=Config.KAFKA_TOPIC_ALERTS,
                key=alert_data.get('fingerprint', '').encode('utf-8'),
                value=json.dumps(enriched_data).encode('utf-8'),
                callback=self._delivery_callback
            )

            self.producer.poll(0)  # Trigger callbacks
            logger.info("alert_sent", alert=alert_data.get('labels', {}).get('alertname'))

        except Exception as e:
            logger.error("alert_send_failed", error=str(e), alert=alert_data)
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def send_metrics(self, metrics_data):
        """Send metrics to Kafka"""
        try:
            enriched_data = self._enrich_message({
                'type': 'metrics',
                'data': metrics_data
            })

            self.producer.produce(
                topic=Config.KAFKA_TOPIC_METRICS,
                value=json.dumps(enriched_data).encode('utf-8'),
                callback=self._delivery_callback
            )

            self.producer.poll(0)
            logger.debug("metrics_sent", count=len(metrics_data))

        except Exception as e:
            logger.error("metrics_send_failed", error=str(e))
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def send_event(self, event_data):
        """Send K8s event to Kafka"""
        try:
            enriched_data = self._enrich_message({
                'type': 'event',
                'data': event_data
            })

            self.producer.produce(
                topic=Config.KAFKA_TOPIC_EVENTS,
                key=event_data.get('uid', '').encode('utf-8'),
                value=json.dumps(enriched_data).encode('utf-8'),
                callback=self._delivery_callback
            )

            self.producer.poll(0)
            logger.info(
                "event_sent",
                event_type=event_data.get('type'),
                reason=event_data.get('reason'),
                object=event_data.get('involved_object', {}).get('name')
            )

        except Exception as e:
            logger.error("event_send_failed", error=str(e), event=event_data)
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def send_resource(self, resource_data):
        """Send K8s resource to Kafka"""
        try:
            enriched_data = self._enrich_message({
                'type': 'resource',
                'data': resource_data
            })

            resource_key = f"{resource_data.get('kind')}:{resource_data.get('namespace')}:{resource_data.get('name')}"

            self.producer.produce(
                topic=Config.KAFKA_TOPIC_RESOURCES,
                key=resource_key.encode('utf-8'),
                value=json.dumps(enriched_data).encode('utf-8'),
                callback=self._delivery_callback
            )

            self.producer.poll(0)
            logger.debug(
                "resource_sent",
                kind=resource_data.get('kind'),
                name=resource_data.get('name'),
                namespace=resource_data.get('namespace')
            )

        except Exception as e:
            logger.error("resource_send_failed", error=str(e), resource=resource_data)
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def send_logs(self, log_data):
        """Send logs to Kafka"""
        try:
            enriched_data = self._enrich_message({
                'type': 'logs',
                'data': log_data
            })

            self.producer.produce(
                topic=Config.KAFKA_TOPIC_LOGS,
                value=json.dumps(enriched_data).encode('utf-8'),
                callback=self._delivery_callback
            )

            self.producer.poll(0)
            logger.debug("logs_sent", count=len(log_data.get('entries', [])))

        except Exception as e:
            logger.error("logs_send_failed", error=str(e))
            raise

    def send_heartbeat(self):
        """Send heartbeat to backend"""
        try:
            heartbeat_data = self._enrich_message({
                'type': 'heartbeat',
                'data': {
                    'status': 'healthy',
                    'uptime': time.time(),
                    'features': {
                        'metrics_collection': Config.ENABLE_METRICS_COLLECTION,
                        'log_collection': Config.ENABLE_LOG_COLLECTION,
                        'event_watching': Config.ENABLE_EVENT_WATCHING,
                        'resource_watching': Config.ENABLE_RESOURCE_WATCHING,
                        'alert_watching': Config.ENABLE_ALERT_WATCHING,
                    }
                }
            })

            self.producer.produce(
                topic=f"heartbeat-{Config.USER_ID}",
                value=json.dumps(heartbeat_data).encode('utf-8'),
                callback=self._delivery_callback
            )

            self.producer.poll(0)
            logger.debug("heartbeat_sent")

        except Exception as e:
            logger.error("heartbeat_send_failed", error=str(e))

    def flush(self, timeout=10):
        """Flush pending messages"""
        try:
            remaining = self.producer.flush(timeout)
            if remaining > 0:
                logger.warning("messages_not_flushed", remaining=remaining)
            else:
                logger.info("all_messages_flushed")
        except Exception as e:
            logger.error("flush_failed", error=str(e))

    def close(self):
        """Close producer and flush messages"""
        logger.info("closing_kafka_producer")
        self.flush()
        if self.producer:
            self.producer = None

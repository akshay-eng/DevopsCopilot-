"""
Flask API Server for Agent
Receives commands from SaaS backend
"""
import asyncio
from flask import Flask, request, jsonify
from functools import wraps
import structlog

from config import Config
from kubernetes import client

logger = structlog.get_logger()


class AgentAPIServer:
    """API server for receiving commands from backend"""

    def __init__(self, k8s_watcher, metrics_collector):
        self.app = Flask(__name__)
        self.k8s_watcher = k8s_watcher
        self.metrics_collector = metrics_collector
        self._setup_routes()

    def _verify_api_key(self, f):
        """Decorator to verify API key"""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            api_key = request.headers.get('X-API-Key')

            if not api_key or api_key != Config.API_KEY:
                logger.warning("unauthorized_api_access", ip=request.remote_addr)
                return jsonify({'error': 'Unauthorized'}), 401

            return f(*args, **kwargs)
        return decorated_function

    def _setup_routes(self):
        """Setup API routes"""

        @self.app.route('/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            return jsonify({
                'status': 'healthy',
                'agent_id': Config.AGENT_ID,
                'cluster_name': Config.CLUSTER_NAME,
                'version': '1.0.0'
            }), 200

        @self.app.route('/info', methods=['GET'])
        @self._verify_api_key
        def agent_info():
            """Get agent information"""
            return jsonify(Config.to_dict()), 200

        @self.app.route('/query/pods', methods=['POST'])
        @self._verify_api_key
        def query_pods():
            """Query pods in the cluster"""
            try:
                data = request.get_json()
                namespace = data.get('namespace', 'default')
                label_selector = data.get('label_selector', '')

                v1 = client.CoreV1Api()

                if namespace == 'all':
                    if label_selector:
                        pods = v1.list_pod_for_all_namespaces(label_selector=label_selector)
                    else:
                        pods = v1.list_pod_for_all_namespaces()
                else:
                    if label_selector:
                        pods = v1.list_namespaced_pod(namespace, label_selector=label_selector)
                    else:
                        pods = v1.list_namespaced_pod(namespace)

                pod_list = []
                for pod in pods.items:
                    pod_list.append({
                        'name': pod.metadata.name,
                        'namespace': pod.metadata.namespace,
                        'status': pod.status.phase,
                        'node': pod.spec.node_name,
                        'ip': pod.status.pod_ip,
                        'labels': pod.metadata.labels,
                    })

                return jsonify({'pods': pod_list, 'count': len(pod_list)}), 200

            except Exception as e:
                logger.error("query_pods_failed", error=str(e))
                return jsonify({'error': str(e)}), 500

        @self.app.route('/query/services', methods=['POST'])
        @self._verify_api_key
        def query_services():
            """Query services in the cluster"""
            try:
                data = request.get_json()
                namespace = data.get('namespace', 'default')

                v1 = client.CoreV1Api()

                if namespace == 'all':
                    services = v1.list_service_for_all_namespaces()
                else:
                    services = v1.list_namespaced_service(namespace)

                service_list = []
                for svc in services.items:
                    service_list.append({
                        'name': svc.metadata.name,
                        'namespace': svc.metadata.namespace,
                        'type': svc.spec.type,
                        'cluster_ip': svc.spec.cluster_ip,
                        'ports': [{'port': p.port, 'target_port': str(p.target_port)} for p in svc.spec.ports or []],
                    })

                return jsonify({'services': service_list, 'count': len(service_list)}), 200

            except Exception as e:
                logger.error("query_services_failed", error=str(e))
                return jsonify({'error': str(e)}), 500

        @self.app.route('/query/nodes', methods=['GET'])
        @self._verify_api_key
        def query_nodes():
            """Query nodes in the cluster"""
            try:
                v1 = client.CoreV1Api()
                nodes = v1.list_node()

                node_list = []
                for node in nodes.items:
                    conditions = {c.type: c.status for c in node.status.conditions or []}

                    node_list.append({
                        'name': node.metadata.name,
                        'status': 'Ready' if conditions.get('Ready') == 'True' else 'NotReady',
                        'roles': list(node.metadata.labels.get('node-role.kubernetes.io', {}).keys()) if node.metadata.labels else [],
                        'capacity': node.status.capacity,
                        'allocatable': node.status.allocatable,
                        'conditions': conditions,
                        'node_info': {
                            'os_image': node.status.node_info.os_image,
                            'kernel_version': node.status.node_info.kernel_version,
                            'kubelet_version': node.status.node_info.kubelet_version,
                        }
                    })

                return jsonify({'nodes': node_list, 'count': len(node_list)}), 200

            except Exception as e:
                logger.error("query_nodes_failed", error=str(e))
                return jsonify({'error': str(e)}), 500

        @self.app.route('/execute/prometheus-query', methods=['POST'])
        @self._verify_api_key
        def execute_prometheus_query():
            """Execute custom Prometheus query"""
            try:
                data = request.get_json()
                query = data.get('query')

                if not query:
                    return jsonify({'error': 'Query parameter required'}), 400

                result = self.metrics_collector.prom.custom_query(query=query)

                return jsonify({'result': result}), 200

            except Exception as e:
                logger.error("prometheus_query_failed", error=str(e), query=query)
                return jsonify({'error': str(e)}), 500

        @self.app.route('/execute/create-prometheus-alert', methods=['POST'])
        @self._verify_api_key
        def create_prometheus_alert():
            """Create Prometheus alert rule"""
            try:
                data = request.get_json()
                alert_name = data.get('alert_name')
                expression = data.get('expression')
                duration = data.get('duration', '5m')
                severity = data.get('severity', 'warning')
                annotations = data.get('annotations', {})
                labels = data.get('labels', {})

                # In production, this would write to Prometheus rules file
                # For now, we'll return success
                # You would typically use ConfigMap or PrometheusRule CRD

                alert_rule = {
                    'alert': alert_name,
                    'expr': expression,
                    'for': duration,
                    'labels': {
                        'severity': severity,
                        **labels
                    },
                    'annotations': annotations
                }

                logger.info("prometheus_alert_created", alert=alert_name)

                return jsonify({
                    'message': 'Alert rule created successfully',
                    'alert_rule': alert_rule
                }), 200

            except Exception as e:
                logger.error("create_prometheus_alert_failed", error=str(e))
                return jsonify({'error': str(e)}), 500

        @self.app.route('/execute/pod-logs', methods=['POST'])
        @self._verify_api_key
        def get_pod_logs():
            """Get logs from a pod"""
            try:
                data = request.get_json()
                namespace = data.get('namespace', 'default')
                pod_name = data.get('pod_name')
                container = data.get('container')
                tail_lines = data.get('tail_lines', 100)

                if not pod_name:
                    return jsonify({'error': 'pod_name required'}), 400

                v1 = client.CoreV1Api()

                if container:
                    logs = v1.read_namespaced_pod_log(
                        name=pod_name,
                        namespace=namespace,
                        container=container,
                        tail_lines=tail_lines
                    )
                else:
                    logs = v1.read_namespaced_pod_log(
                        name=pod_name,
                        namespace=namespace,
                        tail_lines=tail_lines
                    )

                return jsonify({
                    'pod': pod_name,
                    'namespace': namespace,
                    'logs': logs
                }), 200

            except Exception as e:
                logger.error("get_pod_logs_failed", error=str(e))
                return jsonify({'error': str(e)}), 500

        @self.app.route('/execute/restart-deployment', methods=['POST'])
        @self._verify_api_key
        def restart_deployment():
            """Restart a deployment (rollout restart)"""
            try:
                data = request.get_json()
                namespace = data.get('namespace', 'default')
                deployment_name = data.get('deployment_name')

                if not deployment_name:
                    return jsonify({'error': 'deployment_name required'}), 400

                apps_v1 = client.AppsV1Api()

                # Trigger rollout by updating annotation
                from datetime import datetime
                now = datetime.utcnow().isoformat()

                deployment = apps_v1.read_namespaced_deployment(deployment_name, namespace)

                if deployment.spec.template.metadata.annotations:
                    deployment.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = now
                else:
                    deployment.spec.template.metadata.annotations = {
                        'kubectl.kubernetes.io/restartedAt': now
                    }

                apps_v1.patch_namespaced_deployment(deployment_name, namespace, deployment)

                logger.info("deployment_restarted", deployment=deployment_name, namespace=namespace)

                return jsonify({
                    'message': f'Deployment {deployment_name} restarted successfully',
                    'timestamp': now
                }), 200

            except Exception as e:
                logger.error("restart_deployment_failed", error=str(e))
                return jsonify({'error': str(e)}), 500

        @self.app.route('/execute/scale-deployment', methods=['POST'])
        @self._verify_api_key
        def scale_deployment():
            """Scale a deployment"""
            try:
                data = request.get_json()
                namespace = data.get('namespace', 'default')
                deployment_name = data.get('deployment_name')
                replicas = data.get('replicas', 1)

                if not deployment_name:
                    return jsonify({'error': 'deployment_name required'}), 400

                apps_v1 = client.AppsV1Api()

                # Scale deployment
                scale = apps_v1.read_namespaced_deployment_scale(deployment_name, namespace)
                scale.spec.replicas = replicas
                apps_v1.patch_namespaced_deployment_scale(deployment_name, namespace, scale)

                logger.info("deployment_scaled", deployment=deployment_name, replicas=replicas)

                return jsonify({
                    'message': f'Deployment {deployment_name} scaled to {replicas} replicas',
                    'replicas': replicas
                }), 200

            except Exception as e:
                logger.error("scale_deployment_failed", error=str(e))
                return jsonify({'error': str(e)}), 500

    def run(self):
        """Run Flask server"""
        logger.info("starting_api_server", host=Config.API_SERVER_HOST, port=Config.API_SERVER_PORT)
        self.app.run(
            host=Config.API_SERVER_HOST,
            port=Config.API_SERVER_PORT,
            debug=False
        )

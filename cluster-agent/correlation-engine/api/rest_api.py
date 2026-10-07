"""
REST API for Correlation Engine
"""
import logging
from flask import Flask, jsonify, request
from typing import Dict

logger = logging.getLogger(__name__)


class CorrelationAPI:
    """REST API for accessing correlation engine data"""

    def __init__(self, incident_store, network_collector=None, service_graph_builder=None, capabilities: Dict = None):
        self.app = Flask(__name__)
        self.incident_store = incident_store
        self.network_collector = network_collector
        self.service_graph_builder = service_graph_builder
        self.capabilities = capabilities or {}

        self._setup_routes()

    def _setup_routes(self):
        """Setup API routes"""

        @self.app.route('/api/health', methods=['GET'])
        def health():
            """Health check endpoint"""
            stats = self.incident_store.get_stats()

            return jsonify({
                'status': 'healthy',
                'capabilities': self.capabilities,
                'buffer_size': len(self.network_collector.flow_buffer) if self.network_collector else 0,
                'incidents_open': stats['open_incidents'],
                'incidents_stats': stats
            })

        @self.app.route('/api/service-map', methods=['GET'])
        def get_service_map():
            """Get service dependency graph"""
            try:
                if self.network_collector:
                    # Use Cilium network flows
                    service_graph = self.network_collector.get_service_graph()
                elif self.service_graph_builder:
                    # Use simple service graph
                    service_graph = self.service_graph_builder.get_service_graph()
                else:
                    return jsonify({
                        'nodes': [],
                        'edges': [],
                        'has_cilium': False,
                        'last_updated': None
                    })

                # Convert to nodes/edges format for frontend
                nodes = []
                edges = []

                for service, data in service_graph['services'].items():
                    nodes.append({
                        'id': service,
                        'label': service
                    })

                    # Add edges for downstream connections
                    for downstream in data['downstream']:
                        edge = {
                            'source': service,
                            'target': downstream
                        }

                        # Add metrics if Cilium
                        if 'request_counts' in data:
                            edge['request_count'] = data['request_counts'].get(downstream, 0)
                            edge['error_count'] = data['error_counts'].get(downstream, 0)
                            edge['avg_latency'] = data['avg_latencies'].get(downstream, 0)

                        edges.append(edge)

                return jsonify({
                    'nodes': nodes,
                    'edges': edges,
                    'has_cilium': service_graph.get('has_cilium', False),
                    'last_updated': service_graph.get('last_updated')
                })

            except Exception as e:
                logger.error(f"Error getting service map: {e}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/incidents', methods=['GET'])
        def get_incidents():
            """Get recent incidents"""
            try:
                status = request.args.get('status')
                limit = int(request.args.get('limit', 20))
                cluster_id = request.args.get('cluster_id')

                incidents = self.incident_store.get_incidents(
                    status=status,
                    limit=limit,
                    cluster_id=cluster_id
                )

                return jsonify({
                    'incidents': incidents,
                    'total': len(incidents)
                })

            except Exception as e:
                logger.error(f"Error getting incidents: {e}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/incidents/<incident_id>', methods=['GET'])
        def get_incident(incident_id):
            """Get incident details"""
            try:
                incident = self.incident_store.get_incident_by_id(incident_id)

                if not incident:
                    return jsonify({'error': 'Incident not found'}), 404

                return jsonify({
                    'incident': incident
                })

            except Exception as e:
                logger.error(f"Error getting incident: {e}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/incidents/<incident_id>/status', methods=['PUT'])
        def update_incident_status(incident_id):
            """Update incident status"""
            try:
                data = request.get_json()
                status = data.get('status')

                if not status:
                    return jsonify({'error': 'Status is required'}), 400

                self.incident_store.update_incident_status(incident_id, status)

                return jsonify({
                    'success': True,
                    'incident_id': incident_id,
                    'status': status
                })

            except ValueError as e:
                return jsonify({'error': str(e)}), 400
            except Exception as e:
                logger.error(f"Error updating incident status: {e}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/flows', methods=['GET'])
        def get_flows():
            """Get network flows (Cilium only)"""
            try:
                if not self.network_collector:
                    return jsonify({
                        'flows': [],
                        'total': 0,
                        'has_cilium': False,
                        'message': 'Cilium not available'
                    })

                service = request.args.get('service')
                minutes = int(request.args.get('minutes', 10))

                if service:
                    flows = self.network_collector.get_flows_for_service(service, minutes)
                else:
                    # Return all flows in buffer
                    flows = self.network_collector.flow_buffer

                # Remove internal fields
                flows_clean = [
                    {k: v for k, v in flow.items() if not k.startswith('_')}
                    for flow in flows
                ]

                return jsonify({
                    'flows': flows_clean,
                    'total': len(flows_clean),
                    'has_cilium': True
                })

            except Exception as e:
                logger.error(f"Error getting flows: {e}")
                return jsonify({'error': str(e)}), 500

        @self.app.route('/api/stats', methods=['GET'])
        def get_stats():
            """Get overall statistics"""
            try:
                stats = self.incident_store.get_stats()

                return jsonify(stats)

            except Exception as e:
                logger.error(f"Error getting stats: {e}")
                return jsonify({'error': str(e)}), 500

    def run(self, host='0.0.0.0', port=9000, debug=False):
        """Run the API server"""
        logger.info(f"Starting Correlation Engine API on {host}:{port}")
        self.app.run(host=host, port=port, debug=debug, threaded=True)

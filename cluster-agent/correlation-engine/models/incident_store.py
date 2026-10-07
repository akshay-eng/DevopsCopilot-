"""
Incident Store - MongoDB storage for correlated incidents
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from pymongo import MongoClient, ASCENDING, DESCENDING
from bson import ObjectId

logger = logging.getLogger(__name__)


class IncidentStore:
    """MongoDB storage for incidents"""

    def __init__(self, mongo_uri: str, database: str = 'admin'):
        self.client = MongoClient(mongo_uri)
        self.db = self.client[database]
        self.incidents = self.db['incidents']
        self.alert_history = self.db['alert_history']

        # Create indexes
        self._create_indexes()

        logger.info(f"✅ Connected to MongoDB: {database}")

    def _create_indexes(self):
        """Create indexes for efficient queries"""
        # Incidents collection indexes
        self.incidents.create_index([('status', ASCENDING)])
        self.incidents.create_index([('created_at', DESCENDING)])
        self.incidents.create_index([('affected_services', ASCENDING)])
        self.incidents.create_index([('cluster_id', ASCENDING)])
        self.incidents.create_index([
            ('affected_services', ASCENDING),
            ('status', ASCENDING),
            ('created_at', DESCENDING)
        ])

        # Alert history collection indexes
        self.alert_history.create_index([('created_at', DESCENDING)])
        self.alert_history.create_index([('severity', ASCENDING)])

        # TTL index for alert history (auto-delete after 90 days)
        self.alert_history.create_index(
            [('created_at', ASCENDING)],
            expireAfterSeconds=90 * 24 * 60 * 60  # 90 days
        )

    def save_incident(self, incident: Dict) -> str:
        """
        Save incident to MongoDB.
        If related incident exists (same services, within 15 minutes), update it.
        Otherwise create new incident.
        """
        # Check for existing incident
        existing = self._find_existing_incident(incident)

        if existing:
            # Update existing incident
            incident_id = str(existing['_id'])
            self._update_incident(incident_id, incident)
            logger.info(f"Updated existing incident: {incident_id}")
            return incident_id
        else:
            # Create new incident
            incident['created_at'] = datetime.utcnow()
            incident['updated_at'] = datetime.utcnow()
            result = self.incidents.insert_one(incident)
            incident_id = str(result.inserted_id)
            logger.info(f"Created new incident: {incident_id}")
            return incident_id

    def _find_existing_incident(self, incident: Dict) -> Optional[Dict]:
        """Find existing incident for same services within 15 minutes"""
        affected_services = incident.get('affected_services', [])

        if not affected_services:
            return None

        now = datetime.utcnow()
        cutoff_time = now - timedelta(minutes=15)

        existing = self.incidents.find_one({
            'affected_services': {'$all': affected_services},
            'status': {'$in': ['open', 'investigating']},
            'created_at': {'$gte': cutoff_time}
        })

        return existing

    def _update_incident(self, incident_id: str, new_incident: Dict):
        """Update existing incident with new alert"""
        update_data = {
            '$inc': {'alert_count': new_incident.get('alert_count', 1)},
            '$push': {
                'alerts': {
                    '$each': new_incident.get('alerts', [])
                }
            },
            '$set': {
                'updated_at': datetime.utcnow(),
                'time_span.last_alert': new_incident['time_span']['last_alert'],
                'time_span.duration_seconds': new_incident['time_span']['duration_seconds']
            }
        }

        # Update severity if higher
        severities = {'critical': 4, 'warning': 3, 'info': 2}
        new_severity = new_incident.get('severity', 'info')

        existing = self.incidents.find_one({'_id': ObjectId(incident_id)})
        if existing:
            current_severity = existing.get('severity', 'info')
            if severities.get(new_severity, 0) > severities.get(current_severity, 0):
                update_data['$set']['severity'] = new_severity

        self.incidents.update_one(
            {'_id': ObjectId(incident_id)},
            update_data
        )

    def get_incidents(self, status: str = None, limit: int = 20, cluster_id: str = None) -> List[Dict]:
        """Get incidents with optional filtering"""
        query = {}

        if status:
            query['status'] = status

        if cluster_id:
            query['cluster_id'] = cluster_id

        incidents = list(
            self.incidents
            .find(query)
            .sort('created_at', DESCENDING)
            .limit(limit)
        )

        # Convert ObjectId to string
        for incident in incidents:
            incident['_id'] = str(incident['_id'])

        return incidents

    def get_incident_by_id(self, incident_id: str) -> Optional[Dict]:
        """Get incident by ID"""
        try:
            incident = self.incidents.find_one({'_id': ObjectId(incident_id)})

            if incident:
                incident['_id'] = str(incident['_id'])
                return incident

            return None

        except Exception as e:
            logger.error(f"Error getting incident: {e}")
            return None

    def update_incident_status(self, incident_id: str, status: str):
        """Update incident status"""
        valid_statuses = ['open', 'investigating', 'resolved']

        if status not in valid_statuses:
            raise ValueError(f"Invalid status. Must be one of: {valid_statuses}")

        self.incidents.update_one(
            {'_id': ObjectId(incident_id)},
            {
                '$set': {
                    'status': status,
                    'updated_at': datetime.utcnow()
                }
            }
        )

        logger.info(f"Updated incident {incident_id} status to {status}")

    def save_alert_to_history(self, alert: Dict):
        """
        Save alert to history collection.
        Only saves 1% of alerts (sampling) or critical/high severity alerts.
        """
        import random

        severity = alert.get('labels', {}).get('severity', 'info')

        # Save all critical alerts or sample 1% of others
        should_save = severity in ['critical', 'warning'] or random.random() < 0.01

        if should_save:
            alert_copy = alert.copy()
            alert_copy['created_at'] = datetime.utcnow()

            self.alert_history.insert_one(alert_copy)

    def get_stats(self) -> Dict:
        """Get incident statistics"""
        total_incidents = self.incidents.count_documents({})
        open_incidents = self.incidents.count_documents({'status': 'open'})
        investigating = self.incidents.count_documents({'status': 'investigating'})
        resolved = self.incidents.count_documents({'status': 'resolved'})

        # Get recent critical incidents
        recent_critical = self.incidents.count_documents({
            'severity': 'critical',
            'created_at': {'$gte': datetime.utcnow() - timedelta(hours=24)}
        })

        return {
            'total_incidents': total_incidents,
            'open_incidents': open_incidents,
            'investigating': investigating,
            'resolved': resolved,
            'recent_critical_24h': recent_critical
        }

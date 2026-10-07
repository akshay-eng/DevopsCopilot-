import { backendApi } from '../services/api';

// Fetch pre-grouped timeline data from MongoDB aggregation
// Used for the swim-lane chart (faster than client-side grouping for large datasets)
export const fetchTimelineGrouped = async ({ hours = 48, clusterId } = {}) => {
  try {
    const response = await backendApi.get('/api/alerts/timeline-grouped', {
      params: {
        hours,                         // send 0 explicitly for "All Alerts" (no time filter)
        clusterId: clusterId || undefined,
      }
    });
    return response;
  } catch (error) {
    console.error('[alertsApi] fetchTimelineGrouped failed:', error);
    return { success: false, groups: [], error: error.message };
  }
};

// Fetch detailed occurrences for a single alert (side panel history)
export const fetchAlertHistory = async ({ alertname, hours = 48, limit = 30 } = {}) => {
  try {
    const response = await backendApi.get(`/api/alerts/history/${encodeURIComponent(alertname)}`, {
      params: { hours, limit }
    });
    return response;
  } catch (error) {
    console.error('[alertsApi] fetchAlertHistory failed:', error);
    return { success: false, occurrences: [], error: error.message };
  }
};

// Fetch raw alerts for the Event Stream table
export const fetchRecentAlerts = async ({ hours = 48, clusterId, limit = 200 } = {}) => {
  try {
    const response = await backendApi.get('/api/alerts/recent', {
      params: {
        hours: hours > 0 ? hours : undefined,
        clusterId: clusterId || undefined,
        limit,
      }
    });
    return response;
  } catch (error) {
    console.error('[alertsApi] fetchRecentAlerts failed:', error);
    return { success: false, alerts: [], error: error.message };
  }
};

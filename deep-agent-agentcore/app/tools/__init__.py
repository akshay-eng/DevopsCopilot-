from app.tools.prometheus import prometheus_query, prometheus_query_range
from app.tools.platform import (
    list_clusters, get_cluster_details,
    get_namespaces, get_resources,
    get_pod_logs, get_pod_metrics, get_node_metrics,
    get_cluster_metrics, get_k8s_events,
    get_alerts, get_alert_timeline_grouped, get_managed_alerts,
    get_timeline_events, get_correlated_incidents, run_correlation_analysis,
    get_network_traffic, get_service_map,
    get_integrations,
)
from app.tools.itsm import (
    itsm_create_incident, itsm_create_change_request,
    itsm_update_ticket, itsm_close_ticket,
)
from app.tools.snow_direct import (
    search_cmdb_ci, add_affected_cis, add_change_attachment,
    check_change_conflicts, update_change_dates,
    search_similar_incidents, search_similar_change_requests,
)


def get_all_tools(enable_write: bool = True):
    """Curated tool set for the ops agent."""

    return [
        # Cluster discovery
        list_clusters,
        get_cluster_details,
        get_namespaces,

        # K8s resources and observability
        get_resources,
        get_pod_logs,
        get_k8s_events,

        # Metrics
        get_cluster_metrics,
        get_pod_metrics,
        get_node_metrics,
        prometheus_query,
        prometheus_query_range,

        # Alerts and correlation
        get_alerts,
        get_alert_timeline_grouped,
        get_managed_alerts,
        get_correlated_incidents,
        run_correlation_analysis,

        # Timeline and network
        get_timeline_events,
        get_network_traffic,
        get_service_map,

        # ITSM — ServiceNow via MCP
        itsm_create_incident,
        itsm_create_change_request,
        itsm_update_ticket,
        itsm_close_ticket,

        # SNOW Direct — CMDB, attachments, conflicts
        search_cmdb_ci,
        add_affected_cis,
        add_change_attachment,
        check_change_conflicts,
        update_change_dates,

        # Vector search — similar incidents/changes from Milvus
        search_similar_incidents,
        search_similar_change_requests,

        # Integrations
        get_integrations,
    ]

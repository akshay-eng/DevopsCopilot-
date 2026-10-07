from app.tools.kubernetes import (
    kubectl_get, kubectl_describe, kubectl_logs, kubectl_top,
    kubectl_apply, kubectl_delete, kubectl_exec, kubectl_scale, kubectl_rollout
)
from app.tools.bash import bash_execute
from app.tools.prometheus import prometheus_query, prometheus_query_range
from app.tools.data import get_alerts, get_timeline, get_network_traffic, get_cluster_info
from app.tools.analysis import grep_text, analyze_metrics
from app.tools.filesystem import read_file, write_file


def get_all_tools(enable_write: bool = True):
    """Return all available tools. If enable_write is False, exclude destructive tools."""
    read_tools = [
        kubectl_get,
        kubectl_describe,
        kubectl_logs,
        kubectl_top,
        bash_execute,
        prometheus_query,
        prometheus_query_range,
        get_alerts,
        get_timeline,
        get_network_traffic,
        get_cluster_info,
        grep_text,
        analyze_metrics,
        read_file,
    ]

    write_tools = [
        kubectl_apply,
        kubectl_delete,
        kubectl_exec,
        kubectl_scale,
        kubectl_rollout,
        write_file,
    ]

    if enable_write:
        return read_tools + write_tools
    return read_tools

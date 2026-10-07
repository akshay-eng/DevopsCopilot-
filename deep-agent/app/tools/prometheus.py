import time
import httpx
from langchain_core.tools import tool
from app.config import settings


DURATION_MAP = {
    "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "3h": 10800, "6h": 21600,
    "12h": 43200, "24h": 86400, "48h": 172800,
    "7d": 604800,
}


def _format_results(results: list, max_series: int = 20) -> str:
    """Format Prometheus query results for readability."""
    if not results:
        return "No results"
    lines = []
    for r in results[:max_series]:
        metric = r.get("metric", {})
        label_str = ", ".join(
            f'{k}="{v}"' for k, v in metric.items() if k != "__name__"
        )
        metric_name = metric.get("__name__", "")
        prefix = f"{metric_name}{{{label_str}}}" if metric_name else label_str

        # Instant query
        if "value" in r:
            val = r["value"][1]
            lines.append(f"  {prefix}: {val}")
        # Range query
        elif "values" in r:
            values = r["values"]
            if values:
                latest = values[-1][1]
                earliest = values[0][1]
                lines.append(f"  {prefix}: {len(values)} points, {earliest} -> {latest}")
    if len(results) > max_series:
        lines.append(f"  ... and {len(results) - max_series} more series")
    return "\n".join(lines)


@tool
def prometheus_query(query: str) -> str:
    """Execute an instant PromQL query. Returns the current value of metrics.

    Args:
        query: PromQL query string, e.g. 'up', 'node_memory_MemAvailable_bytes', 'rate(container_cpu_usage_seconds_total[5m])'
    """
    try:
        resp = httpx.get(
            f"{settings.prometheus_url}/api/v1/query",
            params={"query": query},
            timeout=15,
        )
        data = resp.json()
        if data.get("status") != "success":
            return f"ERROR: {data.get('error', data.get('errorType', 'Unknown error'))}"
        results = data.get("data", {}).get("result", [])
        return _format_results(results)
    except httpx.ConnectError:
        return f"ERROR: Cannot connect to Prometheus at {settings.prometheus_url}"
    except Exception as e:
        return f"ERROR: {str(e)}"


@tool
def prometheus_query_range(query: str, duration: str = "1h", step: str = "5m") -> str:
    """Execute a range PromQL query over a time window. Returns time series data.

    Args:
        query: PromQL query string
        duration: How far back to look. Options: 5m, 15m, 30m, 1h, 3h, 6h, 12h, 24h, 48h, 7d
        step: Data point interval. Options: 1m, 5m, 15m, 1h
    """
    try:
        now = int(time.time())
        seconds = DURATION_MAP.get(duration, 3600)
        start = now - seconds

        resp = httpx.get(
            f"{settings.prometheus_url}/api/v1/query_range",
            params={"query": query, "start": start, "end": now, "step": step},
            timeout=15,
        )
        data = resp.json()
        if data.get("status") != "success":
            return f"ERROR: {data.get('error', data.get('errorType', 'Unknown error'))}"
        results = data.get("data", {}).get("result", [])
        return _format_results(results)
    except httpx.ConnectError:
        return f"ERROR: Cannot connect to Prometheus at {settings.prometheus_url}"
    except Exception as e:
        return f"ERROR: {str(e)}"

"""
Anomaly Detection — uses Isolation Forest and statistical methods
to score how anomalous each pod's metrics are relative to its
recent baseline.

For each pod involved in an alert cluster, we:
  1. Pull 24h of CPU, memory, network, restart metrics from Prometheus
  2. Fit an Isolation Forest on the baseline (first 80% of data)
  3. Score the recent window (last 20% — the period around the alert)
  4. Also compute z-scores for interpretability

Output: per-pod anomaly report with scores + which metrics deviate.
"""

import logging
import numpy as np
from sklearn.ensemble import IsolationForest

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CONTAMINATION = 0.1          # expected fraction of anomalies in training data
BASELINE_FRACTION = 0.8      # use first 80% as baseline
ZSCORE_THRESHOLD = 2.5       # z-score above which a metric is "anomalous"
MIN_DATAPOINTS = 10          # need at least this many points to run


# ---------------------------------------------------------------------------
# Single-metric analysis
# ---------------------------------------------------------------------------

def _zscore_analysis(values):
    """
    Compute z-score of the recent window vs the baseline.
    Returns {mean, std, recent_mean, zscore, is_anomalous}.
    """
    if len(values) < MIN_DATAPOINTS:
        return {"zscore": 0, "is_anomalous": False, "reason": "insufficient_data"}

    split = int(len(values) * BASELINE_FRACTION)
    baseline = np.array(values[:split])
    recent = np.array(values[split:])

    if len(recent) == 0 or len(baseline) == 0:
        return {"zscore": 0, "is_anomalous": False, "reason": "insufficient_data"}

    mean = float(np.mean(baseline))
    std = float(np.std(baseline))
    recent_mean = float(np.mean(recent))

    if std < 1e-10:
        # Constant baseline — any deviation is notable
        zscore = 0.0 if abs(recent_mean - mean) < 1e-10 else 10.0
    else:
        zscore = (recent_mean - mean) / std

    return {
        "baseline_mean": round(mean, 6),
        "baseline_std": round(std, 6),
        "recent_mean": round(recent_mean, 6),
        "zscore": round(zscore, 3),
        "is_anomalous": abs(zscore) >= ZSCORE_THRESHOLD,
    }


# ---------------------------------------------------------------------------
# Multi-metric Isolation Forest
# ---------------------------------------------------------------------------

def _isolation_forest_score(metrics_dict):
    """
    Run Isolation Forest on all available metrics simultaneously.

    metrics_dict: {metric_name: [(ts, value), ...]}

    Returns:
      anomaly_score: float in [-1, 1], lower = more anomalous
      is_anomalous: bool
      feature_importances: {metric_name: contribution_score}
    """
    # Align all metrics to the same timestamps
    metric_names = []
    all_values = []

    for name, series in metrics_dict.items():
        if not series or len(series) < MIN_DATAPOINTS:
            continue
        vals = [v for _, v in series]
        metric_names.append(name)
        all_values.append(vals)

    if len(metric_names) < 2:
        return {
            "anomaly_score": 0,
            "is_anomalous": False,
            "reason": "insufficient_metrics",
        }

    # Truncate to shortest series
    min_len = min(len(v) for v in all_values)
    X = np.column_stack([np.array(v[:min_len]) for v in all_values])

    # Split baseline / recent
    split = int(min_len * BASELINE_FRACTION)
    if split < MIN_DATAPOINTS or (min_len - split) < 3:
        return {
            "anomaly_score": 0,
            "is_anomalous": False,
            "reason": "insufficient_data",
        }

    X_baseline = X[:split]
    X_recent = X[split:]

    # Normalize
    means = X_baseline.mean(axis=0)
    stds = X_baseline.std(axis=0)
    stds[stds < 1e-10] = 1.0  # avoid division by zero

    X_baseline_norm = (X_baseline - means) / stds
    X_recent_norm = (X_recent - means) / stds

    # Fit Isolation Forest on baseline
    try:
        iso = IsolationForest(
            contamination=CONTAMINATION,
            n_estimators=100,
            random_state=42,
            n_jobs=-1,
        )
        iso.fit(X_baseline_norm)

        # Score recent points
        scores = iso.decision_function(X_recent_norm)
        predictions = iso.predict(X_recent_norm)

        avg_score = float(np.mean(scores))
        anomaly_fraction = float(np.mean(predictions == -1))

        # Feature importance: which metric's recent values deviate most?
        importances = {}
        for i, name in enumerate(metric_names):
            recent_vals = X_recent_norm[:, i]
            importances[name] = round(float(np.mean(np.abs(recent_vals))), 4)

        # Sort by importance
        importances = dict(sorted(importances.items(), key=lambda x: x[1], reverse=True))

        return {
            "anomaly_score": round(avg_score, 4),
            "anomaly_fraction": round(anomaly_fraction, 4),
            "is_anomalous": anomaly_fraction > 0.3,  # >30% of recent points flagged
            "feature_importances": importances,
        }

    except Exception as e:
        log.error("Isolation Forest error: %s", e)
        return {
            "anomaly_score": 0,
            "is_anomalous": False,
            "reason": f"model_error: {e}",
        }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_pod(metrics_dict):
    """
    Full anomaly analysis for a single pod.

    Parameters
    ----------
    metrics_dict : dict
        {metric_name: [(timestamp, value), ...]}
        Typically: cpu_usage, memory_usage, network_rx, network_tx, restarts

    Returns
    -------
    dict
        {
            "overall_anomaly_score": float,
            "is_anomalous": bool,
            "isolation_forest": {...},
            "per_metric": {
                "cpu_usage": {zscore, is_anomalous, ...},
                "memory_usage": {...},
                ...
            },
            "anomalous_metrics": [str],  # names of metrics that are anomalous
            "summary": str,  # human-readable summary
        }
    """
    # Per-metric z-score analysis
    per_metric = {}
    anomalous_metrics = []

    for name, series in metrics_dict.items():
        values = [v for _, v in series] if series else []
        result = _zscore_analysis(values)
        per_metric[name] = result
        if result.get("is_anomalous"):
            anomalous_metrics.append(name)

    # Multi-metric Isolation Forest
    iso_result = _isolation_forest_score(metrics_dict)

    # Combine into overall score
    # Higher = more anomalous (0 to 1 scale)
    z_max = max((abs(per_metric[m].get("zscore", 0)) for m in per_metric), default=0)
    z_score_normalized = min(z_max / 5.0, 1.0)  # 5 sigma → 1.0

    iso_score_normalized = 0
    if iso_result.get("anomaly_fraction") is not None:
        iso_score_normalized = iso_result["anomaly_fraction"]

    overall = 0.5 * z_score_normalized + 0.5 * iso_score_normalized

    # Build summary
    if not anomalous_metrics and not iso_result.get("is_anomalous"):
        summary = "Metrics are within normal range."
    else:
        parts = []
        for m in anomalous_metrics:
            z = per_metric[m].get("zscore", 0)
            direction = "above" if z > 0 else "below"
            parts.append(f"{m} is {abs(z):.1f}\u03C3 {direction} baseline")
        summary = "; ".join(parts) if parts else "Anomaly detected by Isolation Forest model."

    return {
        "overall_anomaly_score": round(overall, 4),
        "is_anomalous": bool(anomalous_metrics) or iso_result.get("is_anomalous", False),
        "isolation_forest": iso_result,
        "per_metric": per_metric,
        "anomalous_metrics": anomalous_metrics,
        "summary": summary,
    }

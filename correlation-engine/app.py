"""
Correlation Engine — Flask API

Endpoints:
  POST /api/correlate           — Run full correlation for a user/cluster
  POST /api/correlate/alerts    — Correlate specific alert IDs
  GET  /api/health              — Health check
"""

import os
import logging
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from correlator import run_correlation, correlate_specific_alerts

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = Flask(__name__)
CORS(app)

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "correlation-engine",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/api/correlate", methods=["POST"])
def correlate():
    """
    Run full correlation pipeline.

    Body:
      {
        "userId": "...",
        "clusterId": "...",   (optional)
        "token": "...",       (JWT for authService calls)
        "hours": 48           (optional, default 48)
      }
    """
    body = request.get_json(force=True)
    user_id = body.get("userId")
    if not user_id:
        return jsonify({"success": False, "error": "userId is required"}), 400

    cluster_id = body.get("clusterId")
    token = body.get("token")
    hours = int(body.get("hours", 48))

    try:
        result = run_correlation(
            user_id=user_id,
            cluster_id=cluster_id,
            token=token,
            hours=hours,
        )
        return jsonify(result)
    except Exception as e:
        log.exception("Correlation failed")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/correlate/alerts", methods=["POST"])
def correlate_alerts():
    """
    Correlate specific alerts by their IDs.

    Body:
      {
        "userId": "...",
        "alertIds": ["id1", "id2", ...],
        "token": "..."
      }
    """
    body = request.get_json(force=True)
    user_id = body.get("userId")
    alert_ids = body.get("alertIds", [])
    token = body.get("token")

    if not user_id:
        return jsonify({"success": False, "error": "userId is required"}), 400
    if not alert_ids:
        return jsonify({"success": False, "error": "alertIds is required"}), 400

    try:
        result = correlate_specific_alerts(alert_ids, user_id, token)
        return jsonify(result)
    except Exception as e:
        log.exception("Alert correlation failed")
        return jsonify({"success": False, "error": str(e)}), 500


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5005))
    log.info("Correlation Engine starting on port %d", port)
    app.run(host="0.0.0.0", port=port, debug=os.getenv("LOG_LEVEL") == "DEBUG")

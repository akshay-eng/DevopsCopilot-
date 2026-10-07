"""
Embedding sidecar for AIOps DevOps Copilot.

Serves an OpenAI-compatible /v1/embeddings endpoint backed by the SAME model
that produced the existing Milvus collections (all-MiniLM-L6-v2, 384-dim).
Matching the model matters: cosine similarity is only meaningful inside one
vector space, so querying MiniLM-embedded tickets with any other embedder
returns noise.

Run:  python app.py        (listens on :5006)
Then: EMBEDDING_URL=http://localhost:5006/v1  EMBEDDING_DIM=384
"""

import logging
import os

from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
PORT = int(os.getenv("PORT", 5006))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

log.info("Loading embedding model %s ...", MODEL_NAME)
model = SentenceTransformer(MODEL_NAME)
DIM = model.get_sentence_embedding_dimension()
log.info("Model ready: %s (dim=%d)", MODEL_NAME, DIM)


@app.get("/api/health")
@app.get("/health")
def health():
    return jsonify({"status": "ok", "model": MODEL_NAME, "dimension": DIM})


@app.post("/v1/embeddings")
def embeddings():
    """OpenAI-compatible embeddings endpoint."""
    body = request.get_json(silent=True) or {}
    raw = body.get("input")
    if raw is None:
        return jsonify({"error": {"message": "'input' is required"}}), 400

    texts = [raw] if isinstance(raw, str) else list(raw)
    texts = [("" if t is None else str(t))[:8000] for t in texts]

    try:
        vectors = model.encode(texts, normalize_embeddings=True).tolist()
    except Exception as exc:  # pragma: no cover
        log.exception("encode failed")
        return jsonify({"error": {"message": str(exc)}}), 500

    return jsonify({
        "object": "list",
        "model": MODEL_NAME,
        "data": [
            {"object": "embedding", "index": i, "embedding": v}
            for i, v in enumerate(vectors)
        ],
        "usage": {"prompt_tokens": sum(len(t.split()) for t in texts), "total_tokens": 0},
    })


if __name__ == "__main__":
    log.info("Embedding service starting on port %d", PORT)
    app.run(host="0.0.0.0", port=PORT)

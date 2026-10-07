/**
 * Vector / knowledge-base routes.
 *
 * Exposes the Milvus-backed knowledge the agent reasons over:
 *  - ServiceNow tickets ingested by the pipeline
 *  - Correlated incidents produced by the correlation engine
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const vectorStore = require('../services/vectorStore');
const { provider: embedProvider, DIM } = require('../services/embeddingService');
const CorrelatedIncident = require('../models/CorrelatedIncident');

// GET /api/vectors/status — what's indexed and which embedder is active
router.get('/status', protect, async (req, res) => {
  try {
    const cfg = await vectorStore.milvusConfig(req.user._id.toString());
    const collections = await vectorStore.listCollections(cfg);
    res.json({
      success: true,
      connected: true,
      embedding: { provider: embedProvider(), dimension: DIM },
      collections,
      incidentCollection: vectorStore.INCIDENT_COLLECTION,
    });
  } catch (e) {
    res.json({ success: true, connected: false, error: e.message, embedding: { provider: embedProvider(), dimension: DIM } });
  }
});

// POST /api/vectors/index-incidents — vectorize correlated incidents
router.post('/index-incidents', protect, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const limit = Math.min(parseInt(req.body?.limit, 10) || 200, 1000);
    const docs = await CorrelatedIncident.find({ userId }).sort({ lastSeenAt: -1 }).limit(limit);
    const out = await vectorStore.indexCorrelatedIncidents(userId, docs);
    res.json({ success: true, ...out, source: docs.length });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// GET /api/vectors/search/tickets?q=&topK=
router.get('/search/tickets', protect, async (req, res) => {
  const { q, topK, collection } = req.query;
  if (!q) return res.status(400).json({ success: false, error: 'q is required' });
  try {
    const results = await vectorStore.searchTickets(req.user._id.toString(), q, {
      topK: parseInt(topK, 10) || 5, collection,
    });
    res.json({ success: true, query: q, count: results.length, results });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// GET /api/vectors/search/incidents?q=&topK=
router.get('/search/incidents', protect, async (req, res) => {
  const { q, topK } = req.query;
  if (!q) return res.status(400).json({ success: false, error: 'q is required' });
  try {
    const results = await vectorStore.searchIncidents(req.user._id.toString(), q, parseInt(topK, 10) || 5);
    res.json({ success: true, query: q, count: results.length, results });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;

/**
 * Custom dashboard + AI/NLP widget routes (Trends page).
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Dashboard = require('../models/Dashboard');
const nlp = require('../services/nlpWidgetService');

async function getOrCreate(userId) {
  let dash = await Dashboard.findOne({ userId, name: 'My Dashboard' });
  if (!dash) dash = await Dashboard.create({ userId, name: 'My Dashboard', widgets: [] });
  return dash;
}

// POST /api/dashboards/nlp — generate a widget spec from natural language
router.post('/nlp', protect, async (req, res) => {
  const { prompt, available, context } = req.body || {};
  if (!prompt || !prompt.trim()) return res.status(400).json({ success: false, error: 'prompt is required' });
  try {
    const ctx = context && typeof context === 'object'
      ? context
      : { counts: available && typeof available === 'object' ? available : {} };
    const widget = await nlp.generateWidget(prompt.trim(), ctx);
    res.json({ success: true, widget });
  } catch (e) {
    console.error('NLP widget error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/dashboards/catalog — datasets, fields and chart types the AI can compose
router.get('/catalog', protect, (req, res) => {
  res.json({
    success: true,
    datasets: nlp.DATASETS,
    types: nlp.WIDGET_TYPES,
    aggs: nlp.AGGS,
    sorts: nlp.SORTS,
  });
});

// GET /api/dashboards — the user's custom widgets
router.get('/', protect, async (req, res) => {
  try {
    const dash = await getOrCreate(req.user._id);
    res.json({ success: true, widgets: dash.widgets });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/dashboards/widgets — add a widget to the user's dashboard
router.post('/widgets', protect, async (req, res) => {
  const spec = nlp.validateSpec(req.body?.widget || req.body);
  if (!spec) return res.status(400).json({ success: false, error: 'Invalid widget spec' });
  try {
    const dash = await getOrCreate(req.user._id);
    const widget = {
      id: req.body?.widget?.id || `w-${Date.now().toString(36)}`,
      ...spec,
      prompt: req.body?.widget?.prompt || '',
      createdAt: new Date(),
    };
    dash.widgets.push(widget);
    await dash.save();
    res.status(201).json({ success: true, widget, widgets: dash.widgets });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/dashboards/widgets/:id
router.delete('/widgets/:id', protect, async (req, res) => {
  try {
    const dash = await getOrCreate(req.user._id);
    dash.widgets = dash.widgets.filter((w) => w.id !== req.params.id);
    await dash.save();
    res.json({ success: true, widgets: dash.widgets });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

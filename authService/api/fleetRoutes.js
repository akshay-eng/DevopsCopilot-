/**
 * Fleet routes — the whole estate in one call, for the Trends dashboard.
 */
const express = require('express');
const { protect } = require('../middleware/auth');
const { getFleetOverview } = require('../services/fleetService');
const { advise, TOPICS } = require('../services/fleetAdviceService');
const AiArtifact = require('../models/AiArtifact');

const router = express.Router();

// Fleet rollups are expensive (every cluster, every resource type), and the
// dashboard loads two tabs off the same data — so serve a short cache and
// refresh behind it rather than re-reading every cluster per tab switch.
const CACHE_TTL_MS = Number(process.env.FLEET_CACHE_TTL_MS || 45000);
// Past the TTL a value is stale but still worth serving while a refresh runs.
// Without this, one viewer per TTL window eats the whole cold read and sees
// "Reading every cluster" for seconds.
const CACHE_STALE_MS = Number(process.env.FLEET_CACHE_STALE_MS || 900000);
const cache = new Map();
const inflight = new Map();

/** Refresh in the background; never let a failure poison the cached value. */
function refresh(userId, hours, key) {
  if (inflight.has(key)) return inflight.get(key);
  const p = getFleetOverview(userId, { hours })
    .then((value) => { cache.set(key, { at: Date.now(), value }); return value; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// @route GET /api/fleet/overview?hours=24
router.get('/overview', protect, async (req, res) => {
  const hours = Math.max(1, Math.min(720, parseInt(req.query.hours, 10) || 24));
  const key = `${req.user._id}|${hours}`;
  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;

  if (hit && age < CACHE_TTL_MS && !req.query.refresh) {
    return res.json({ success: true, cached: true, ...hit.value });
  }
  // Stale but usable: answer immediately and rebuild behind the response.
  if (hit && age < CACHE_STALE_MS && !req.query.refresh) {
    refresh(req.user._id, hours, key).catch(() => {});
    return res.json({ success: true, cached: true, stale: true, ...hit.value });
  }
  try {
    const value = await refresh(req.user._id, hours, key);
    res.json({ success: true, cached: false, ...value });
  } catch (error) {
    console.error('[FLEET] overview failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// The model reasons before it answers and the bigger panels take ~2 minutes.
// Nobody will sit through that behind a double-click, so an answer is cached and
// re-asked on a slower cycle than the data underneath it.

const advice = new Map();
const adviceInflight = new Map();

/**
 * One answer per (user, hours, topic); concurrent openers share one model call.
 *
 * Three layers, cheapest first: process memory, then the durable AiArtifact
 * store, then the model. The durable layer is what makes "already generated"
 * survive a restart — without it every deploy sends the next viewer back to a
 * two-minute spinner for an answer that already existed.
 *
 * Nothing here expires on a timer. A stored answer is returned until someone
 * asks for a new one with `?refresh=1`.
 */
function adviceFor(userId, hours, topic, key, force) {
  const k = `${key}|${topic}`;
  const hit = advice.get(k);
  if (hit && !force) return Promise.resolve(hit.value);
  if (adviceInflight.has(k)) return adviceInflight.get(k);

  const p = (async () => {
    const storeKey = `${hours}|${topic}`;

    if (!force) {
      const saved = await AiArtifact.findOne({ userId: String(userId), kind: 'fleet-advice', key: storeKey }).lean().catch(() => null);
      if (saved?.value) {
        advice.set(k, { at: Date.now(), value: { ...saved.value, generatedAt: saved.generatedAt } });
        return advice.get(k).value;
      }
    }

    const fleetHit = cache.get(key);
    const fleet = fleetHit && Date.now() - fleetHit.at < CACHE_STALE_MS
      ? fleetHit.value
      : await refresh(userId, hours, key);

    const started = Date.now();
    const value = await advise(topic, fleet);

    // Only persist a real answer — a timeout must not become the stored record.
    if (value.source === 'ai') {
      advice.set(k, { at: Date.now(), value });
      await AiArtifact.findOneAndUpdate(
        { userId: String(userId), kind: 'fleet-advice', key: storeKey },
        {
          $set: {
            value, source: value.source, model: value.model || '',
            generatedAt: new Date(), generationMs: Date.now() - started,
          },
        },
        { upsert: true },
      ).catch((e) => console.warn('[FLEET] advice persist failed:', e.message));
    }
    return value;
  })().finally(() => adviceInflight.delete(k));

  adviceInflight.set(k, p);
  return p;
}

// @route GET /api/fleet/advice/:topic?hours=24
// @desc  AI recommendations for ONE dashboard panel, fed only that panel's slice
//        of the fleet. Reuses the cached overview so opening several panels does
//        not re-read every cluster.
router.get('/advice/:topic', protect, async (req, res) => {
  const topic = req.params.topic;
  if (!TOPICS.includes(topic)) {
    return res.status(400).json({ success: false, error: `Unknown topic. One of: ${TOPICS.join(', ')}` });
  }
  const hours = Math.max(1, Math.min(720, parseInt(req.query.hours, 10) || 24));
  const key = `${req.user._id}|${hours}`;
  try {
    const value = await adviceFor(req.user._id, hours, topic, key, req.query.refresh);
    res.json({ success: true, ...value });
  } catch (error) {
    console.error('[FLEET] advice failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Keep the rollup hot for the users who actually have clusters.
 *
 * A cold rollup takes ~10s because it reads every cluster, so the first visit
 * after a restart would sit on a spinner. Build it at boot and rebuild on a
 * timer instead, so a page load always lands on a cached value.
 */
function warmFleetCache() {
  const User = require('../models/User');
  const Cluster = require('../models/Cluster');
  // Only the window the Trends page opens on. With one topic per panel there
  // are 12 answers per window, so warming all three ranges would be 36 model
  // calls a pass — the rest are generated on demand and then persist anyway.
  const HOURS = [720];
  let running = false;
  const run = async () => {
    // A full pass can outlast the interval (the model is slow), and two passes
    // at once would just queue up against each other.
    if (running) return;
    running = true;
    try {
      const userIds = await Cluster.distinct('userId');
      if (!userIds.length) return;
      const users = await User.find({ _id: { $in: userIds } }, { _id: 1 }).lean();
      for (const u of users) {
        for (const hours of HOURS) {
          // Sequential on purpose: warming must never compete with a live request.
          const key = `${u._id}|${hours}`;
          await refresh(u._id, hours, key).catch(() => {});
          // Then ask the model about each panel, so a double-click opens on an
          // answer instead of a two-minute spinner. Slow and in the background;
          // nothing waits on it.
          for (const topic of TOPICS) {
            await adviceFor(u._id, hours, topic, key).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('[FLEET] cache warm skipped:', e.message);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, CACHE_TTL_MS * 8);
  timer.unref?.();
}

module.exports = router;
module.exports.warmFleetCache = warmFleetCache;


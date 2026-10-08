/**
 * Pre-generates the root-cause analysis shown in alert details.
 *
 * The analysis was already stored once produced, but it was only ever produced
 * when somebody opened the panel — so every alert's first viewer waited through
 * the full model run. Here it is generated ahead of time, worst alerts first,
 * and the panel simply reads what is already there.
 *
 * Deliberately slow and sequential: this is background work and must never
 * compete with a human waiting on the same model. One alert at a time, a pause
 * between each, and a hard cap per pass.
 */

const Alert = require('../models/Alert');
const rootCause = require('../services/rootCauseService');
const ai = require('./../services/aiService');

const INTERVAL_MS = Number(process.env.ENRICH_WARM_INTERVAL_MS || 600000); // 10 min
const PER_PASS = Number(process.env.ENRICH_WARM_PER_PASS || 12);
const GAP_MS = Number(process.env.ENRICH_WARM_GAP_MS || 3000);
const LOOKBACK_HOURS = Number(process.env.ENRICH_WARM_LOOKBACK_HOURS || 48);

// Worst first — if the budget runs out, it should run out on the noise.
const SEVERITY_ORDER = { critical: 0, high: 1, warning: 2, medium: 3, low: 4, info: 5, none: 6 };

let running = false;

/**
 * Alerts worth analysing: currently firing, recent, and not yet analysed.
 * Collapsed by alertname+namespace+pod — the analysis is about the condition,
 * so re-running it for every repeat notification would be pure waste.
 */
async function pickTargets(limit) {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600000);
  const candidates = await Alert.find({
    status: 'firing',
    createdAt: { $gte: since },
    'enrichment.rootCause': { $exists: false },
  })
    .select('_id userId alertname namespace pod severity enrichment receivedAt')
    .sort({ receivedAt: -1 })
    .limit(600)
    .lean();

  const seen = new Set();
  const unique = [];
  for (const a of candidates) {
    const sig = `${a.userId}|${a.alertname}|${a.namespace || ''}|${a.pod || ''}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    unique.push(a);
  }

  unique.sort((x, y) =>
    (SEVERITY_ORDER[x.severity] ?? 9) - (SEVERITY_ORDER[y.severity] ?? 9));

  return unique.slice(0, limit);
}

async function pass() {
  if (running) return;
  if (!ai.available()) return;
  running = true;

  try {
    const targets = await pickTargets(PER_PASS);
    if (!targets.length) return;

    console.log(`[ENRICH] pre-generating root-cause analysis for ${targets.length} alert(s)`);
    let done = 0;

    for (const a of targets) {
      try {
        const analysis = await rootCause.investigate(a, a.enrichment || {});
        // Write to every record of the same condition, so whichever occurrence
        // the user opens already has it.
        await Alert.updateMany(
          {
            userId: a.userId, alertname: a.alertname,
            ...(a.namespace ? { namespace: a.namespace } : {}),
            ...(a.pod ? { pod: a.pod } : {}),
            'enrichment.rootCause': { $exists: false },
          },
          { $set: { 'enrichment.rootCause': analysis } },
        );
        done += 1;
      } catch (e) {
        console.warn(`[ENRICH] ${a.alertname} failed:`, e.message);
      }
      await new Promise((r) => setTimeout(r, GAP_MS));
    }

    console.log(`[ENRICH] pre-generated ${done}/${targets.length}`);
  } catch (e) {
    console.warn('[ENRICH] pass failed:', e.message);
  } finally {
    running = false;
  }
}

function startEnrichmentWarmer() {
  // Let the service finish booting before competing for the model.
  const first = setTimeout(pass, 45000);
  first.unref?.();
  const timer = setInterval(pass, INTERVAL_MS);
  timer.unref?.();
  console.log(`[ENRICH] Root-cause pre-generation every ${Math.round(INTERVAL_MS / 60000)}m (${PER_PASS}/pass)`);
}

module.exports = { startEnrichmentWarmer, pass };

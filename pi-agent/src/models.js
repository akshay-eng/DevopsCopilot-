/**
 * Modular model registry.
 *
 * Reads models.json (BYO on-prem + cloud) and resolves each entry into a
 * pi-ai model object. Adding a model is a data change in models.json — or a
 * runtime POST /api/models — no code changes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getModel } from '@mariozechner/pi-ai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_PATH = process.env.MODELS_JSON || path.join(__dirname, '..', 'models.json');

export function loadRegistry() {
  const raw = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
  const models = raw.models || [];
  const defaultId = raw.default || (models[0] && models[0].id);
  return { models, defaultId };
}

export function saveRegistry(registry) {
  fs.writeFileSync(MODELS_PATH, JSON.stringify(registry, null, 2));
}

/** Public list for the UI model selector (no secrets). */
export function publicModels() {
  const { models, defaultId } = loadRegistry();
  return {
    default: defaultId,
    models: models.map((m) => ({
      id: m.id,
      label: m.label || m.id,
      provider: m.provider,
      model: m.model,
      onPrem: !!m.onPrem,
      thinkingLevel: m.thinkingLevel || 'off',
      configured: isConfigured(m),
    })),
  };
}

function isConfigured(cfg) {
  // Custom/on-prem endpoints only need a reachable baseUrl; cloud needs a key.
  if (cfg.provider === 'custom' || cfg.onPrem) return !!cfg.baseUrl;
  if (cfg.provider === 'bedrock') return true; // uses AWS credential chain
  const key = cfg.apiKeyEnv && process.env[cfg.apiKeyEnv];
  return !!key;
}

/**
 * Resolve a models.json entry (by id) into a pi-ai model object usable by
 * streamSimple / Agent. Falls back to the default model.
 */
export function resolveModel(requestedId) {
  const { models, defaultId } = loadRegistry();
  const cfg = models.find((m) => m.id === requestedId)
    || models.find((m) => m.id === defaultId)
    || models[0];
  if (!cfg) throw new Error('No models configured in models.json');

  const apiKey = cfg.apiKeyEnv ? process.env[cfg.apiKeyEnv] : undefined;

  // On-prem / OpenAI-compatible custom endpoints: build a full model object.
  // pi-ai resolves the API key from the PROVIDER (e.g. OPENAI_API_KEY), so a
  // custom endpoint must declare a provider AND have that env var present —
  // otherwise streaming fails with "No API key for provider: undefined".
  if (cfg.provider === 'custom' || cfg.onPrem || cfg.baseUrl) {
    const provider = cfg.apiProvider || 'openai';
    const keyVar = `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
    if (!process.env[keyVar]) process.env[keyVar] = apiKey || 'not-needed';

    return {
      cfg,
      model: {
        id: cfg.model || cfg.id,
        name: cfg.label || cfg.id,
        api: cfg.api || 'openai-completions',
        provider,
        baseUrl: cfg.baseUrl,
        reasoning: !!cfg.reasoning,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: cfg.contextWindow || 128000,
        maxTokens: cfg.maxTokens || 8192,
      },
    };
  }

  // Cloud providers from the pi-ai catalog (anthropic/openai/bedrock/...).
  const model = getModel(cfg.provider, cfg.model);
  if (apiKey) model.apiKey = apiKey;
  if (cfg.region) model.region = cfg.region;
  return { cfg, model };
}

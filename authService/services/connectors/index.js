/**
 * Connector registry.
 *
 * A connector turns a stored integration config into real API calls. Each one
 * exposes `test(cfg)` plus a set of named `actions` — and every action is
 * automatically surfaced to the Pi agent as a callable tool, so the AI can
 * actually operate ServiceNow / GitHub / Jenkins / Argo CD / AWX on request.
 */

const { request, trimUrl, authHeaders, cleanHeaders } = require('./http');
const { buildGeneric } = require('./generic');
const { REGISTRY } = require('../../config/integrationRegistry');

const servicenow = require('./servicenow');
const github = require('./github');
const jenkins = require('./jenkins');
const argocd = require('./argocd');
const awx = require('./awx');
const jira = require('./jira');

// --- Webhook connectors -----------------------------------------------------
// Each product wants the message under a different key, so the payload shape is
// part of the connector rather than assumed.
const WEBHOOK_SHAPE = {
  slack: (text, cfg) => ({ text, channel: cfg.channel || undefined, username: cfg.username || undefined }),
  teams: (text) => ({ text }),
  discord: (text) => ({ content: text }),           // Discord rejects `text`
  mattermost: (text, cfg) => ({ text, channel: cfg.channel || undefined }),
  webhook: (text, cfg) => ({ text, source: 'aiops-devops-copilot', sentAt: new Date().toISOString(), ...(cfg.extra || {}) }),
};

const webhookConnector = (id, name) => ({
  id,
  name,
  async post(cfg, text) {
    if (!cfg.webhook_url) throw new Error(`${name} webhook URL is not configured.`);
    // A generic webhook may additionally carry a bearer token / API key header.
    let headers = {};
    if (id === 'webhook' && cfg.auth_method && cfg.auth_method !== 'webhook') {
      try { headers = cleanHeaders(await authHeaders(cfg)); } catch { /* URL-only is valid */ }
    }
    const shape = WEBHOOK_SHAPE[id] || WEBHOOK_SHAPE.webhook;
    return request(cfg.method === 'PUT' ? 'PUT' : 'POST', cfg.webhook_url, {
      headers, body: shape(text, cfg), raw: true, tls: cfg, label: id,
    });
  },
  async test(cfg) {
    await this.post(cfg, `Test notification from AIOps DevOps Copilot`);
    return { success: true, message: `${name} webhook accepted a test message` };
  },
  actions: {
    send_message: {
      description: `Post a message to ${name}.`,
      params: { text: { type: 'string', required: true, description: 'Message body' } },
      async run(cfg, p) {
        await webhookConnector(id, name).post(cfg, p.text);
        return { sent: true, target: name, channel: cfg.channel || 'default' };
      },
    },
  },
});

const CONNECTORS = {
  snow: servicenow,
  github,
  jenkins,
  argocd,
  awx,
  jira,
  slack: webhookConnector('slack', 'Slack'),
  teams: webhookConnector('teams', 'Microsoft Teams'),
  discord: webhookConnector('discord', 'Discord'),
  mattermost: webhookConnector('mattermost', 'Mattermost'),
  webhook: webhookConnector('webhook', 'Generic Webhook'),
};

// Any manifest that declares a `probe` gets a working connector for free, so a
// new integration is testable as soon as it is declared. Hand-written
// connectors above always win.
for (const manifest of REGISTRY) {
  if (CONNECTORS[manifest.id] || !manifest.probe) continue;
  const c = buildGeneric(manifest);
  if (c) CONNECTORS[manifest.id] = c;
}

const get = (type) => CONNECTORS[type] || null;
const has = (type) => Boolean(CONNECTORS[type]);

/** Action catalog (no secrets) — used by the UI and by the Pi agent. */
function catalog(type) {
  const c = get(type);
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    actions: Object.entries(c.actions || {}).map(([name, a]) => ({
      name,
      description: a.description,
      params: Object.entries(a.params || {}).map(([pname, p]) => ({
        name: pname, type: p.type || 'string', required: !!p.required, description: p.description, items: p.items,
      })),
    })),
  };
}

function fullCatalog() {
  return Object.keys(CONNECTORS).map((t) => catalog(t)).filter(Boolean);
}

/** Execute one action for a connector. */
async function run(type, actionName, cfg, params = {}) {
  const c = get(type);
  if (!c) throw new Error(`No connector implemented for '${type}'`);
  const action = (c.actions || {})[actionName];
  if (!action) throw new Error(`Unknown action '${actionName}' for ${type}. Available: ${Object.keys(c.actions || {}).join(', ')}`);

  // Validate required params up-front so the agent gets a clear error.
  const missing = Object.entries(action.params || {})
    .filter(([n, p]) => p.required && (params[n] === undefined || params[n] === null || params[n] === ''))
    .map(([n]) => n);
  if (missing.length) throw new Error(`Missing required parameter(s): ${missing.join(', ')}`);

  return action.run(cfg, params);
}

async function test(type, cfg) {
  const c = get(type);
  if (!c) throw new Error(`No connector implemented for '${type}'`);
  return c.test(cfg);
}

module.exports = { CONNECTORS, get, has, catalog, fullCatalog, run, test, trimUrl };

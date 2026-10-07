/**
 * Generic HTTP connector, driven entirely by a manifest `probe` descriptor.
 *
 * Most integrations only need "can I reach it and are my credentials good?".
 * Declaring that in the registry means a new integration is testable the moment
 * its manifest exists, instead of being a config form that silently pretends to
 * work until someone writes a bespoke connector.
 *
 * probe: {
 *   path        '/api/v1/status'            appended to the base URL
 *   baseField   'url'                       which config field holds the base URL
 *   style       {}                          auth style passed to authHeaders
 *   okText      'a human sentence'          shown on success
 *   pick        (body, cfg) => 'detail'     optional extra detail from the response
 *   method      'GET'
 * }
 */

const { request, authHeaders, cleanHeaders, trimUrl } = require('./http');

const BASE_FIELDS = ['url', 'base_url', 'api_base_url', 'server_url', 'host', 'endpoint', 'instance_url'];

const baseUrl = (cfg, probe = {}) => {
  const raw = probe.baseField ? cfg[probe.baseField] : BASE_FIELDS.map((f) => cfg[f]).find(Boolean);
  const u = trimUrl(raw);
  if (!u) throw new Error('No server URL is configured for this integration.');
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
};

/** Build a connector from a manifest entry that declares `probe`. */
function buildGeneric(manifest) {
  const probe = manifest.probe;
  if (!probe) return null;

  const callRaw = async (cfg, method, path, body) => {
    // `none` auth means a public/unauthenticated endpoint — skip the header build
    // rather than throwing "no authentication configured".
    let headers = {};
    if (cfg.auth_method !== 'none') {
      try {
        headers = cleanHeaders(await authHeaders(cfg, { style: probe.style || {}, manifestAuth: probe.manifestAuth }));
      } catch (e) {
        if (!probe.authOptional) throw e;
      }
    }
    return request(method, `${baseUrl(cfg, probe)}${path}`, {
      headers, body, tls: cfg, label: manifest.id, timeout: probe.timeout || 20000,
    });
  };

  return {
    id: manifest.id,
    name: manifest.name,
    generic: true,

    async test(cfg) {
      const body = await callRaw(cfg, probe.method || 'GET', probe.path);
      let detail = '';
      if (typeof probe.pick === 'function') {
        try { detail = probe.pick(body, cfg) || ''; } catch { /* detail is a nicety */ }
      }
      return {
        success: true,
        message: detail ? `${probe.okText || `Connected to ${manifest.name}`} — ${detail}` : (probe.okText || `Connected to ${manifest.name}`),
      };
    },

    actions: {
      ...(probe.exposeRequest === false ? {} : {
        http_get: {
          description: `Perform an authenticated GET against the configured ${manifest.name} API. Use for read-only lookups this platform has no dedicated tool for.`,
          params: {
            path: { type: 'string', required: true, description: `API path, e.g. "${probe.path}"` },
          },
          async run(cfg, p) {
            const path = String(p.path || '').startsWith('/') ? p.path : `/${p.path}`;
            return callRaw(cfg, 'GET', path);
          },
        },
      }),
      ...(manifest.extraActions || {}),
    },
  };
}

module.exports = { buildGeneric, baseUrl };

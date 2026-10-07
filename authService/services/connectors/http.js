/**
 * Shared HTTP + auth helpers for integration connectors.
 *
 * Every connector describes WHAT it calls; this module handles HOW it
 * authenticates, so a single integration can support basic auth, PAT/API
 * tokens, custom API-key headers, or OAuth 2.0 (with refresh) interchangeably.
 */

const crypto = require('crypto');
const { Agent } = require('undici');

/**
 * TLS policy for outbound connector calls.
 *
 * Node's global fetch verifies certificates and offers no per-request way to
 * change that, so a "skip TLS verification" checkbox in the UI did nothing at
 * all — self-signed AWX / Argo CD endpoints failed with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE no matter what the user ticked. These build a
 * real undici dispatcher, which Node's fetch does honour.
 *
 * Secure by default. Two explicit escape hatches, in order of preference:
 *   ca_cert       — paste the private CA / self-signed PEM. Still verifies.
 *   insecure_tls  — verify nothing. Logged, because it is a real exposure.
 *
 * `insecure` is the legacy Argo CD spelling and is still honoured. The legacy
 * AWX `verify_ssl` checkbox is deliberately NOT read as an opt-out: it defaulted
 * to unchecked, so honouring it would silently disable verification for every
 * existing config — and since the flag was never applied, strict is in fact the
 * behaviour those configs have always had.
 */
const wantsInsecure = (cfg = {}) => cfg.insecure_tls === true || cfg.insecure_tls === 'true'
  || cfg.insecure === true || cfg.insecure === 'true';

const dispatcherCache = new Map();
const warned = new Set();

function tlsDispatcher(cfg = {}, label = 'integration') {
  const insecure = wantsInsecure(cfg);
  const ca = typeof cfg.ca_cert === 'string' && cfg.ca_cert.includes('BEGIN CERTIFICATE')
    ? cfg.ca_cert.trim() : null;
  const servername = cfg.tls_servername || null;
  if (!insecure && !ca && !servername) return undefined; // plain strict verification

  if (insecure && !warned.has(label)) {
    warned.add(label);
    console.warn(`[connector:${label}] TLS verification DISABLED by configuration — traffic can be intercepted. Prefer pasting the CA certificate instead.`);
  }

  const key = `${insecure ? 'i' : 's'}|${servername || ''}|${ca ? crypto.createHash('sha1').update(ca).digest('hex') : ''}`;
  if (!dispatcherCache.has(key)) {
    const connect = {};
    if (insecure) connect.rejectUnauthorized = false;
    if (ca) connect.ca = ca;
    if (servername) connect.servername = servername;
    dispatcherCache.set(key, new Agent({ connect }));
  }
  return dispatcherCache.get(key);
}

/**
 * Dig a real error code out of a fetch failure.
 * Node wraps the cause, and undici reports several failed connection attempts
 * as an AggregateError, so `err.cause.code` alone is often undefined and the
 * caller is left with a useless bare "fetch failed".
 */
function causeCode(err, depth = 0) {
  if (!err || depth > 4) return null;
  if (typeof err.code === 'string') return err.code;
  if (Array.isArray(err.errors)) {
    for (const e of err.errors) {
      const c = causeCode(e, depth + 1);
      if (c) return c;
    }
  }
  return causeCode(err.cause, depth + 1);
}

/** The most specific thing we can say about a failed fetch. */
function causeText(err) {
  const code = causeCode(err);
  if (code) return code;
  // No code (e.g. undici's "bad port") — the innermost message beats the
  // outer "fetch failed", which tells the user nothing.
  let c = err?.cause, best = null, depth = 0;
  while (c && depth++ < 4) { if (c.message) best = c.message; c = c.cause; }
  return best || err?.message || 'request failed';
}

/** Human-readable reason for a TLS failure, with the fix named. */
function tlsHint(err, host) {
  const code = causeCode(err);
  const TLS_CODES = {
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'the certificate is not signed by a CA this server trusts',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'the certificate is self-signed',
    SELF_SIGNED_CERT_IN_CHAIN: 'the chain contains a self-signed certificate',
    CERT_HAS_EXPIRED: 'the certificate has expired',
    ERR_TLS_CERT_ALTNAME_INVALID: 'the certificate is not valid for this hostname',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'the issuing CA certificate is not available locally',
  };
  if (!TLS_CODES[code]) return null;
  return `TLS verification failed for ${host}: ${TLS_CODES[code]} (${code}). `
    + 'Paste the CA certificate into the integration, or tick "Skip TLS verification" if this endpoint is trusted.';
}

const AUTH = {
  BASIC: 'basic',
  TOKEN: 'token',      // PAT / API token (Bearer)
  API_KEY: 'api_key',  // custom header
  OAUTH2: 'oauth2',
};

const basicAuth = (u, p) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;
const bearer = (t) => `Bearer ${t}`;

class ConnectorError extends Error {
  constructor(message, { status, body, tls } = {}) {
    super(message);
    this.name = 'ConnectorError';
    this.status = status;
    this.body = body;
    this.tls = !!tls;
  }
}

/**
 * Minimal JSON HTTP client with timeout + useful errors.
 * Pass `tls` (the integration config) to apply its TLS policy to this call.
 */
async function request(method, url, { headers = {}, body, timeout = 20000, raw = false, tls, label } = {}) {
  let res;
  const hostOf = () => { try { return new URL(url).host; } catch { return url; } };
  try {
    const dispatcher = tls ? tlsDispatcher(tls, label || hostOf()) : undefined;
    res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
      ...(dispatcher ? { dispatcher } : {}),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    const hint = tlsHint(e, hostOf());
    const msg = hint
      || (e.name === 'TimeoutError' || e.name === 'AbortError'
        ? `Request to ${hostOf()} timed out after ${timeout}ms`
        : `Could not reach ${hostOf()}: ${causeText(e)}`);
    throw new ConnectorError(msg, { tls: !!hint });
  }

  const text = await res.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }

  if (!res.ok) {
    const detail = typeof parsed === 'string'
      ? parsed.slice(0, 300)
      : JSON.stringify(parsed?.error || parsed?.message || parsed || {}).slice(0, 300);
    throw new ConnectorError(`HTTP ${res.status} from ${new URL(url).host}: ${detail}`, { status: res.status, body: parsed });
  }
  return raw ? text : parsed;
}

/**
 * Exchange / refresh an OAuth2 access token when needed.
 * Mutates nothing — returns the (possibly new) token bundle so the caller can persist it.
 */
async function ensureOAuthToken(cfg, manifestAuth) {
  const now = Date.now();
  if (cfg.access_token && cfg.expires_at && now < Number(cfg.expires_at) - 60000) {
    return { access_token: cfg.access_token };
  }

  const tokenUrl = cfg.token_url || manifestAuth?.tokenUrl;
  if (!tokenUrl) {
    if (cfg.access_token) return { access_token: cfg.access_token }; // no refresh possible; use as-is
    throw new ConnectorError('OAuth is not configured (no token URL and no access token).');
  }

  const params = new URLSearchParams();
  if (cfg.refresh_token) {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', cfg.refresh_token);
  } else {
    params.set('grant_type', 'client_credentials');
    if (cfg.scope || manifestAuth?.scopes) params.set('scope', cfg.scope || (manifestAuth.scopes || []).join(' '));
  }
  params.set('client_id', cfg.client_id || '');
  params.set('client_secret', cfg.client_secret || '');

  const body = await request('POST', tokenUrl, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    tls: cfg, // the token endpoint is usually the same host as the API
  });

  if (!body?.access_token) throw new ConnectorError('OAuth token endpoint did not return an access_token');
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token || cfg.refresh_token,
    expires_at: body.expires_in ? Date.now() + body.expires_in * 1000 : undefined,
  };
}

/**
 * Build Authorization headers for a config, based on its chosen auth_method.
 * `style` lets a connector deviate (e.g. Jenkins uses Basic even for a PAT).
 */
async function authHeaders(cfg = {}, { style = {}, manifestAuth } = {}) {
  const method = cfg.auth_method
    // Back-compat: infer from whichever legacy fields are populated.
    || (cfg.access_token || cfg.refresh_token ? AUTH.OAUTH2
      : (cfg.token || cfg.api_token || cfg.personal_access_token || cfg.auth_token) ? AUTH.TOKEN
        : (cfg.username && cfg.password) ? AUTH.BASIC : null);

  switch (method) {
    case AUTH.BASIC: {
      const u = cfg.username || cfg.user || cfg.email;
      const p = cfg.password || cfg.api_token || cfg.token;
      if (!u || !p) throw new ConnectorError('Basic auth requires a username and password.');
      return { Authorization: basicAuth(u, p) };
    }
    case AUTH.TOKEN: {
      const t = cfg.token || cfg.api_token || cfg.personal_access_token || cfg.auth_token;
      if (!t) throw new ConnectorError('No API token / PAT configured.');
      // Some products want the token as the password half of Basic auth.
      if (style.tokenAsBasic) {
        const u = cfg.username || cfg.email || cfg.user;
        if (!u) throw new ConnectorError('This integration needs a username alongside the token.');
        return { Authorization: basicAuth(u, t) };
      }
      if (style.tokenHeader) return { [style.tokenHeader]: style.tokenPrefix ? `${style.tokenPrefix} ${t}` : t };
      return { Authorization: style.tokenPrefix ? `${style.tokenPrefix} ${t}` : bearer(t) };
    }
    case AUTH.API_KEY: {
      const key = cfg.api_key || cfg.token;
      if (!key) throw new ConnectorError('No API key configured.');
      const header = cfg.api_key_header || style.apiKeyHeader || 'X-API-Key';
      return { [header]: key };
    }
    case AUTH.OAUTH2: {
      const tok = await ensureOAuthToken(cfg, manifestAuth);
      return { Authorization: bearer(tok.access_token), __refreshed: tok };
    }
    default:
      throw new ConnectorError('No authentication configured for this integration.');
  }
}

/** Strip the internal marker before sending headers over the wire. */
function cleanHeaders(h) {
  const { __refreshed, ...rest } = h || {};
  return rest;
}

const trimUrl = (u) => String(u || '').replace(/\/+$/, '');

module.exports = {
  AUTH, request, authHeaders, cleanHeaders, basicAuth, bearer, trimUrl,
  ConnectorError, ensureOAuthToken, tlsDispatcher, tlsHint, wantsInsecure, causeCode, causeText,
};

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const Integration = require('../models/Integration');
const registry = require('../config/integrationRegistry');

// GET /api/integrations/registry - manifest describing every available integration
// (field definitions only; the frontend renders config forms from this).
router.get('/registry', protect, (req, res) => {
  res.json({ integrations: registry.publicRegistry() });
});

const connectors = require('../services/connectors');

/**
 * Merge a client-supplied config with what's stored, so the user doesn't have
 * to retype secrets that came back masked ('••••••••').
 */
async function resolveConfig(userId, type, provided) {
  let stored = {};
  try {
    const row = await Integration.findOne({ userId, type });
    if (row) stored = decrypt(row.encryptedConfig) || {};
  } catch (_) { stored = {}; }

  if (!provided) return stored;
  const merged = { ...stored };
  for (const [k, v] of Object.entries(provided)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && /^•+$/.test(v)) continue; // masked placeholder — keep stored
    merged[k] = v;
  }
  return merged;
}

// GET /api/integrations/catalog — every connector's callable actions + whether
// the user has it configured. Consumed by the UI and by the Pi agent.
router.get('/catalog', protect, async (req, res) => {
  try {
    const rows = await Integration.find({ userId: req.user.id });
    const configured = new Map(rows.map((r) => [r.type, r.enabled !== false]));
    const manifests = Object.fromEntries(registry.publicRegistry().map((m) => [m.id, m]));

    const integrations = connectors.fullCatalog().map((c) => ({
      ...c,
      displayName: manifests[c.id]?.name || c.name,
      category: manifests[c.id]?.category,
      configured: configured.has(c.id),
      enabled: configured.get(c.id) === true,
    }));
    res.json({ success: true, integrations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/integrations/:type/actions/:action — execute a connector action.
router.post('/:type/actions/:action', protect, async (req, res) => {
  const { type, action } = req.params;
  try {
    if (!connectors.has(type)) {
      return res.status(404).json({ success: false, error: `No connector for '${type}'` });
    }
    const cfg = await resolveConfig(req.user.id, type, req.body?.config);
    if (!cfg || Object.keys(cfg).length === 0) {
      return res.status(400).json({ success: false, error: `${type} is not configured. Add credentials in Settings → Integrations.` });
    }
    const result = await connectors.run(type, action, cfg, req.body?.params || {});
    await Integration.findOneAndUpdate({ userId: req.user.id, type }, { lastUsed: new Date() });
    res.json({ success: true, integration: type, action, result });
  } catch (e) {
    console.error(`[integration] ${type}.${action} failed:`, e.message);
    res.status(e.status && e.status < 500 ? 400 : 502).json({ success: false, integration: type, action, error: e.message });
  }
});

// ---- OAuth 2.0 (authorization code) ---------------------------------------

// GET /api/integrations/:type/oauth/authorize-url?redirectUri=...
router.get('/:type/oauth/authorize-url', protect, async (req, res) => {
  const { type } = req.params;
  try {
    const manifest = registry.byId[type];
    const method = (manifest?.authMethods || []).find((a) => a.flow === 'authorization_code');
    if (!method) return res.status(400).json({ success: false, error: `${type} does not support OAuth authorization-code flow` });

    const cfg = await resolveConfig(req.user.id, type, null);
    if (!cfg.client_id) return res.status(400).json({ success: false, error: 'Save the OAuth Client ID and Secret first, then connect.' });

    const redirectUri = req.query.redirectUri || `${process.env.PUBLIC_BACKEND_URL || 'http://localhost:5001'}/api/integrations/oauth/callback`;
    // state carries the user + integration so the callback can attribute it.
    const state = Buffer.from(JSON.stringify({ u: String(req.user.id), t: type, r: redirectUri })).toString('base64url');

    const url = new URL(method.authorizeUrl);
    url.searchParams.set('client_id', cfg.client_id);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    if (method.scopes?.length) url.searchParams.set('scope', method.scopes.join(' '));

    res.json({ success: true, authorizeUrl: url.toString(), redirectUri });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/integrations/oauth/callback?code=...&state=...  (browser redirect)
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const done = (ok, msg) => res.send(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center">
    <h2 style="color:${ok ? '#16a34a' : '#dc2626'}">${ok ? '✅ Connected' : '❌ Connection failed'}</h2>
    <p style="color:#555">${msg}</p><p style="color:#888;font-size:13px">You can close this window.</p>
    <script>setTimeout(()=>window.close(),2500)</script></body>`);

  try {
    if (oauthError) return done(false, String(oauthError));
    if (!code || !state) return done(false, 'Missing authorization code.');

    const { u: userId, t: type, r: redirectUri } = JSON.parse(Buffer.from(String(state), 'base64url').toString());
    const manifest = registry.byId[type];
    const method = (manifest?.authMethods || []).find((a) => a.flow === 'authorization_code');
    if (!method) return done(false, 'Unsupported integration.');

    const row = await Integration.findOne({ userId, type });
    const cfg = row ? decrypt(row.encryptedConfig) : {};

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUri,
      client_id: cfg.client_id || '',
      client_secret: cfg.client_secret || '',
    });

    const tokenRes = await fetch(method.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    });
    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tok.access_token) {
      return done(false, tok.error_description || tok.error || `Token exchange failed (HTTP ${tokenRes.status}).`);
    }

    const next = {
      ...cfg,
      auth_method: 'oauth2',
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || cfg.refresh_token,
      expires_at: tok.expires_in ? Date.now() + tok.expires_in * 1000 : undefined,
      token_url: method.tokenUrl,
    };
    await Integration.findOneAndUpdate(
      { userId, type },
      { userId, type, encryptedConfig: encrypt(next), enabled: true, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    return done(true, `${manifest.name} authorized successfully.`);
  } catch (e) {
    console.error('[oauth callback]', e.message);
    return done(false, e.message);
  }
});

// Encryption configuration
const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

// Encryption helper functions
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag: authTag.toString('hex')
  };
}

function decrypt(encryptedObject) {
  try {
    const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(encryptedObject.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedObject.authTag, 'hex'));

    let decrypted = decipher.update(encryptedObject.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

// GET /api/integrations - Get all integrations for user
router.get('/', protect, async (req, res) => {
  try {
    const integrations = await Integration.find({ userId: req.user.id });

    // Return integrations without decrypted config (just metadata)
    const integrationsData = {};
    integrations.forEach(integration => {
      integrationsData[integration.type] = {
        enabled: integration.enabled,
        lastTested: integration.lastTested,
        lastUsed: integration.lastUsed,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
        // Return masked config for display (show field names but hide values)
        config: maskConfig(integration.type)
      };
    });

    res.json(integrationsData);
  } catch (error) {
    console.error('Error fetching integrations:', error);
    res.status(500).json({ message: 'Failed to fetch integrations' });
  }
});

// POST /api/integrations/:type - Save/Update integration
// Validates required fields and optionally tests the connection before saving.
router.post('/:type', protect, async (req, res) => {
  try {
    const { type } = req.params;
    const { config, skipValidation } = req.body;

    if (!config) {
      return res.status(400).json({ message: 'Configuration is required' });
    }

    // Basic field validation per integration type
    const validationErrors = validateConfig(type, config);
    if (validationErrors.length > 0) {
      return res.status(400).json({ message: validationErrors.join('. '), errors: validationErrors });
    }

    // Encrypt the configuration
    const encryptedConfig = encrypt(config);

    // Find or create integration
    let integration = await Integration.findOne({
      userId: req.user.id,
      type
    });

    if (integration) {
      // Update existing
      integration.encryptedConfig = encryptedConfig;
      integration.enabled = true;
      integration.updatedAt = new Date();
    } else {
      // Create new
      integration = new Integration({
        userId: req.user.id,
        type,
        encryptedConfig,
        enabled: true
      });
    }

    await integration.save();

    res.json({
      type,
      enabled: integration.enabled,
      message: 'Integration saved successfully'
    });
  } catch (error) {
    console.error('Error saving integration:', error);
    res.status(500).json({ message: 'Failed to save integration' });
  }
});

// Field validation helper — derived from the integration registry manifest.
function validateConfig(type, config) {
  return registry.validateConfig(type, config);
}

// DELETE /api/integrations/:type - Delete integration
router.delete('/:type', protect, async (req, res) => {
  try {
    const { type } = req.params;

    await Integration.findOneAndDelete({
      userId: req.user.id,
      type
    });

    res.json({ message: 'Integration deleted successfully' });
  } catch (error) {
    console.error('Error deleting integration:', error);
    res.status(500).json({ message: 'Failed to delete integration' });
  }
});

// POST /api/integrations/:type/test - Test integration
router.post('/:type/test', protect, async (req, res) => {
  try {
    const { type } = req.params;
    const { config } = req.body;

    // Prefer the real connector (handles every auth method); fall back to the
    // legacy per-type test for integrations without a connector yet.
    let testResult;
    if (connectors.has(type)) {
      const merged = await resolveConfig(req.user.id, type, config);
      try {
        testResult = await connectors.test(type, merged);
      } catch (e) {
        testResult = { success: false, message: e.message };
      }
    } else {
      testResult = await testIntegration(type, config);
    }

    // Update lastTested timestamp
    await Integration.findOneAndUpdate(
      { userId: req.user.id, type },
      { lastTested: new Date() }
    );

    res.json(testResult);
  } catch (error) {
    console.error('Error testing integration:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to test integration'
    });
  }
});

// GET /api/integrations/:type/config - Get decrypted config for internal use
router.get('/:type/config', protect, async (req, res) => {
  try {
    const { type } = req.params;

    const integration = await Integration.findOne({
      userId: req.user.id,
      type
    });

    if (!integration) {
      return res.status(404).json({ message: 'Integration not found' });
    }

    // Decrypt and return config
    const config = decrypt(integration.encryptedConfig);

    res.json({ config });
  } catch (error) {
    console.error('Error getting integration config:', error);
    res.status(500).json({ message: 'Failed to get integration config' });
  }
});

// Helper function to mask config for display — derived from the registry manifest.
function maskConfig(type) {
  return registry.maskConfig(type);
}

// Helper function to test integrations
async function testIntegration(type, config) {
  const axios = require('axios');

  try {
    switch (type) {
      case 'email':
        // Test SMTP connection using nodemailer
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: config.smtp_host,
          port: config.smtp_port,
          secure: config.smtp_port === 465,
          auth: {
            user: config.smtp_user,
            pass: config.smtp_password
          }
        });
        await transporter.verify();
        return { success: true, message: 'SMTP connection successful' };

      case 'slack':
        // Test Slack webhook
        await axios.post(config.webhook_url, {
          text: 'AIOps Integration Test - Connection Successful! 🎉'
        });
        return { success: true, message: 'Slack webhook test successful' };

      case 'teams':
        // Test Teams webhook
        await axios.post(config.webhook_url, {
          text: 'AIOps Integration Test - Connection Successful! 🎉'
        });
        return { success: true, message: 'Teams webhook test successful' };

      case 'argocd':
        // Test ArgoCD API
        const argoResponse = await axios.get(`${config.server_url}/api/version`, {
          headers: {
            'Authorization': `Bearer ${config.auth_token}`
          },
          httpsAgent: config.insecure ? new (require('https').Agent)({ rejectUnauthorized: false }) : undefined
        });
        return { success: true, message: `ArgoCD connection successful (v${argoResponse.data.Version})` };

      case 'jenkins':
        // Test Jenkins API
        const jenkinsAuth = Buffer.from(`${config.username}:${config.api_token}`).toString('base64');
        const jenkinsResponse = await axios.get(`${config.jenkins_url}/api/json`, {
          headers: {
            'Authorization': `Basic ${jenkinsAuth}`
          }
        });
        return { success: true, message: 'Jenkins API connection successful' };

      case 'github':
        // Test GitHub API
        const githubResponse = await axios.get('https://api.github.com/user', {
          headers: {
            'Authorization': `token ${config.personal_access_token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        return { success: true, message: `GitHub connection successful (${githubResponse.data.login})` };

      case 'snow':
        // Test ServiceNow API
        const snowAuth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        await axios.get(`${config.instance_url}/api/now/table/sys_user?sysparm_limit=1`, {
          headers: {
            'Authorization': `Basic ${snowAuth}`,
            'Content-Type': 'application/json'
          }
        });
        return { success: true, message: 'ServiceNow API connection successful' };

      case 'jira':
        // Test Jira API
        const jiraAuth = Buffer.from(`${config.email}:${config.api_token}`).toString('base64');
        await axios.get(`${config.jira_url}/rest/api/3/myself`, {
          headers: {
            'Authorization': `Basic ${jiraAuth}`,
            'Accept': 'application/json'
          }
        });
        return { success: true, message: 'Jira API connection successful' };

      case 'awx':
        // Test AWX/Ansible Tower API
        const awxHost = config.host.replace(/\/+$/, '');
        const awxAuth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        const awxResponse = await axios.get(`${awxHost}/api/v2/me/`, {
          headers: {
            'Authorization': `Basic ${awxAuth}`,
            'Content-Type': 'application/json'
          },
          httpsAgent: config.verify_ssl === false ? new (require('https').Agent)({ rejectUnauthorized: false }) : undefined
        });
        return { success: true, message: `AWX connection successful (user: ${awxResponse.data.results?.[0]?.username || config.username})` };

      case 'aws':
        // Test AWS credentials (basic check - actual implementation would use AWS SDK)
        const AWS = require('aws-sdk');
        AWS.config.update({
          accessKeyId: config.access_key_id,
          secretAccessKey: config.secret_access_key,
          region: config.region
        });
        const sts = new AWS.STS();
        const identity = await sts.getCallerIdentity().promise();
        return { success: true, message: `AWS credentials valid (Account: ${identity.Account})` };

      case 'milvus':
        // Test Milvus connection via health endpoint
        const milvusHost = config.host.replace(/\/+$/, '').replace(/^https?:\/\//i, '');
        const milvusPort = config.port || '19530';
        // Milvus v2 exposes a health check on the REST API (port 9091 or via proxy)
        try {
          await axios.get(`http://${milvusHost}:${milvusPort}/v2/vectordb/collections/list`, {
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({}),
            timeout: 5000
          });
          return { success: true, message: 'Milvus connection successful' };
        } catch (milvusErr) {
          // Try health endpoint as fallback
          try {
            await axios.get(`http://${milvusHost}:9091/healthz`, { timeout: 5000 });
            return { success: true, message: 'Milvus health check successful' };
          } catch {
            throw milvusErr;
          }
        }

      default:
        return { success: false, message: 'Unknown integration type' };
    }
  } catch (error) {
    console.error(`Test failed for ${type}:`, error.message);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Connection test failed'
    };
  }
}

module.exports = router;

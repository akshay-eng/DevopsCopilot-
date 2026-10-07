/**
 * Shared encryption + config access for integrations.
 *
 * Extracted so every service (integrations API, remediation, agent tools) uses
 * ONE key and ONE decrypt path. Node caches this module, so the random-fallback
 * key is shared process-wide when INTEGRATION_ENCRYPTION_KEY is not set.
 */

const crypto = require('crypto');
const Integration = require('../models/Integration');

const ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { iv: iv.toString('hex'), encryptedData: encrypted, authTag: cipher.getAuthTag().toString('hex') };
}

function decrypt(encryptedObject) {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(encryptedObject.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encryptedObject.authTag, 'hex'));
  let decrypted = decipher.update(encryptedObject.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}

/**
 * Load and decrypt an integration's config for a user.
 * @returns {Promise<object|null>} config or null if not configured/enabled
 */
async function getIntegrationConfig(userId, type, { requireEnabled = true } = {}) {
  const integration = await Integration.findOne({ userId, type });
  if (!integration) return null;
  if (requireEnabled && !integration.enabled) return null;
  try {
    return decrypt(integration.encryptedConfig);
  } catch (e) {
    console.error(`Failed to decrypt ${type} integration config:`, e.message);
    return null;
  }
}

module.exports = { encrypt, decrypt, getIntegrationConfig, ENCRYPTION_KEY };

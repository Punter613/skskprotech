'use strict';

const crypto = require('node:crypto');

const CANARY_SHOP_ID = 'shop_preview_canary';

function canaryCredential(env = process.env) {
  if (env.IS_PULL_REQUEST !== 'true') throw new Error('Preview canary is disabled outside pull requests');
  const key = String(env.SKSK_PREVIEW_CANARY_API_KEY || '').trim();
  if (!key) throw new Error('Preview canary shop credential is not configured');
  let bindings;
  try { bindings = JSON.parse(env.SKSK_SHOP_KEY_BINDINGS || '{}'); }
  catch { throw new Error('Preview canary shop binding configuration is invalid'); }
  if (!bindings || Array.isArray(bindings) || typeof bindings !== 'object') {
    throw new Error('Preview canary shop binding configuration is invalid');
  }
  const configuredKeys = String(env.SKSK_API_KEYS || env.SKSK_API_KEY || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  const matches = configuredKeys.some(candidate => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(key);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
  if (!matches || bindings[key] !== CANARY_SHOP_ID) {
    throw new Error('Preview canary credential is not bound to its dedicated test tenant');
  }
  return key;
}

function canaryHeaders(path, credential) {
  if (path !== '/api/vehicle/decode' && path !== '/api/quick-ask') {
    throw new Error('Preview canary credential forwarding is not allowed for this path');
  }
  return { 'Content-Type': 'application/json', 'X-SKSK-API-Key': credential };
}

module.exports = { canaryCredential, canaryHeaders, CANARY_SHOP_ID };

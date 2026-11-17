'use strict';

const crypto = require('crypto');

const PREVIEW_CANARY_SHOP_ID = 'shop_preview_canary';

function configuredKeys() {
  return String(process.env.SKSK_API_KEYS || process.env.SKSK_API_KEY || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function configuredShopBindings() {
  let parsed;
  try {
    parsed = JSON.parse(process.env.SKSK_SHOP_KEY_BINDINGS || '{}');
  } catch {
    return null;
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;

  const entries = Object.entries(parsed);
  const seen = new Set();
  for (const [key, shopId] of entries) {
    if (!key.trim() || typeof shopId !== 'string' || !/^[a-zA-Z0-9_-]{3,128}$/.test(shopId) || seen.has(shopId)) {
      return null;
    }
    seen.add(shopId);
  }

  return entries;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getConfiguredPreviewCanaryKey() {
  return String(process.env.SKSK_PREVIEW_CANARY_API_KEY || '').trim();
}

function getPreviewCanaryAuthorizationHeaders() {
  const previewApiKey = getConfiguredPreviewCanaryKey();
  const apiKeys = configuredKeys();
  const bindings = configuredShopBindings();

  if (!previewApiKey) {
    throw new Error('Preview canary API key is not configured');
  }

  if (!apiKeys.some(key => safeEqual(previewApiKey, key))) {
    throw new Error('Preview canary API key is not present in SKSK_API_KEYS');
  }

  const bindingMatch = Array.isArray(bindings)
    ? bindings.some(([key, shopId]) => safeEqual(previewApiKey, key) && shopId === PREVIEW_CANARY_SHOP_ID)
    : false;

  if (!bindingMatch) {
    throw new Error('Preview canary API key is not bound to shop_preview_canary');
  }

  return {
    'Content-Type': 'application/json',
    'X-SKSK-API-Key': previewApiKey
  };
}

function requirePreviewCanaryAccess(req, res, next) {
  if (process.env.IS_PULL_REQUEST !== 'true') {
    return res.status(403).json({ success: false, error: 'Preview canary access is disabled outside pull request previews' });
  }

  if (req.auth?.type !== 'shop_key' || req.shopId !== PREVIEW_CANARY_SHOP_ID || req.auth?.shopId !== PREVIEW_CANARY_SHOP_ID) {
    return res.status(403).json({ success: false, error: 'Dedicated preview canary tenant required' });
  }

  try {
    const headers = getPreviewCanaryAuthorizationHeaders();
    req.previewCanary = { headers };
    return next();
  } catch (error) {
    return res.status(503).json({ success: false, error: error.message || 'Preview canary authentication is unavailable' });
  }
}

module.exports = {
  PREVIEW_CANARY_SHOP_ID,
  getPreviewCanaryAuthorizationHeaders,
  requirePreviewCanaryAccess
};

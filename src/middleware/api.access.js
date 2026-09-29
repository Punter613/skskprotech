'use strict';

const crypto = require('crypto');

function configuredKeys() {
  return String(process.env.SKSK_API_KEYS || process.env.SKSK_API_KEY || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function authRequired() {
  return String(process.env.SKSK_REQUIRE_AUTH || '').toLowerCase() === 'true';
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function extractCredential(req) {
  const auth = String(req.get?.('authorization') || '');
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return String(req.get?.('x-sksk-api-key') || '').trim();
}

function requireApiAccess(req, res, next) {
  if (!authRequired()) return next();

  const keys = configuredKeys();
  if (!keys.length) {
    console.error('[Access] SKSK_REQUIRE_AUTH=true but no API key is configured');
    return res.status(503).json({ success: false, error: 'API access is not configured' });
  }

  const credential = extractCredential(req);
  if (!credential || !keys.some(key => safeEqual(credential, key))) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="SKSK ProTech"');
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  return next();
}

function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(options.max || process.env.AI_RATE_LIMIT_MAX || 20);
  const buckets = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const credential = extractCredential(req);
    const key = credential ? crypto.createHash('sha256').update(credential).digest('hex') : String(req.ip || 'unknown');
    const current = buckets.get(key);

    if (!current || now >= current.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - 1)));
      return next();
    }

    current.count += 1;
    const remaining = Math.max(0, max - current.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));

    if (current.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      return res.status(429).json({ success: false, error: 'Too many AI requests; retry later' });
    }

    return next();
  };
}

module.exports = { requireApiAccess, createRateLimiter, authRequired, configuredKeys, extractCredential };

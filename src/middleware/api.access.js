'use strict';

const crypto = require('crypto');
const net = require('net');
const { configured: supabaseIdentityConfigured, verifySupabaseAccessToken } = require('../auth/supabase.identity');

function configuredKeys() {
  return String(process.env.SKSK_API_KEYS || process.env.SKSK_API_KEY || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function configuredTestKeys() {
  return String(process.env.SKSK_TEST_API_KEYS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function testKeysAllowed() {
  return String(process.env.SKSK_ALLOW_TEST_KEYS || '').toLowerCase() === 'true';
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

function markPrincipal(req, type, id, claims = {}) {
  req.auth = { type, id, ...claims };
}

async function requireApiAccess(req, res, next) {
  if (!authRequired()) return next();

  const keys = configuredKeys();
  if (!keys.length && !supabaseIdentityConfigured()) {
    console.error('[Access] SKSK_REQUIRE_AUTH=true but neither shop keys nor Supabase identity are configured');
    return res.status(503).json({ success: false, error: 'API access is not configured' });
  }

  const credential = extractCredential(req);
  const keyIndex = credential ? keys.findIndex(key => safeEqual(credential, key)) : -1;
  if (credential && keyIndex >= 0) {
    // Transitional shop-key identity remains supported during browser migration.
    const shopId = `shop_key_${keyIndex + 1}`;
    markPrincipal(req, 'shop_key', shopId, { shopId });
    req.shopId = shopId;
    return next();
  }

  // Bearer tokens that are not transitional shop keys may be Supabase user
  // sessions. Verification is server-side via auth.getUser; JWT claims are never
  // trusted merely because they decode.
  const authorization = String(req.get?.('authorization') || '');
  if (/^Bearer\s+/i.test(authorization) && credential) {
    try {
      const principal = await verifySupabaseAccessToken(credential);
      if (principal) {
        req.auth = principal;
        req.shopId = principal.shopId;
        return next();
      }
    } catch (error) {
      if (error?.code === 'SHOP_MEMBERSHIP_REQUIRED') {
        return res.status(403).json({ success: false, error: 'Shop membership required' });
      }
      console.warn('[Access] User-session verification failed:', error?.message || error);
    }
  }

  res.setHeader('WWW-Authenticate', 'Bearer realm="SKSK ProTech"');
  return res.status(401).json({ success: false, error: 'Authentication required' });
}

function requireTestAccess(req, res, next) {
  if (!authRequired()) {
    return res.status(503).json({ success: false, error: 'Authentication enforcement is not enabled' });
  }
  if (!testKeysAllowed()) {
    return res.status(503).json({ success: false, error: 'Testing access is not enabled' });
  }
  const keys = configuredTestKeys();
  if (!keys.length) {
    return res.status(503).json({ success: false, error: 'Testing access is not configured' });
  }
  const credential = extractCredential(req);
  const keyIndex = credential ? keys.findIndex(key => safeEqual(credential, key)) : -1;
  if (!credential || keyIndex < 0) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="SKSK ProTech test"');
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  markPrincipal(req, 'test_key', `test_key_${keyIndex + 1}`);
  return next();
}

function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(options.max || process.env.AI_RATE_LIMIT_MAX || 20);
  const maxBuckets = Math.max(2, Number(options.maxBuckets || process.env.AI_RATE_LIMIT_MAX_BUCKETS || 10_000));
  const sweepMs = Math.max(10, Number(options.sweepMs || process.env.AI_RATE_LIMIT_SWEEP_MS || Math.min(windowMs, 60_000)));
  const buckets = new Map();
  const overflowKey = '__overflow__';

  function pruneExpired(now = Date.now()) {
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key);
    }
  }

  function validatedCredentialKey(req) {
    const credential = extractCredential(req);
    if (!credential) return null;
    const keys = configuredKeys();
    const keyIndex = keys.findIndex(key => safeEqual(credential, key));
    if (keyIndex < 0) return null;
    return `credential:${crypto.createHash('sha256').update(credential).digest('hex')}`;
  }

  function normalizeIpBucket(ip) {
    const value = String(ip || 'unknown').trim();
    const mappedIpv4 = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (mappedIpv4 && net.isIP(mappedIpv4[1]) === 4) return mappedIpv4[1];
    if (net.isIP(value) !== 6) return value;
    const expanded = value.split(':');
    const missing = 8 - (expanded.filter(Boolean).length);
    const groups = [];
    for (const part of expanded) {
      if (part === '') {
        if (!groups.length || groups[groups.length - 1] !== '') groups.push('');
      } else {
        groups.push(part.padStart(4, '0').toLowerCase());
      }
    }
    const gap = groups.indexOf('');
    if (gap >= 0) groups.splice(gap, 1, ...Array(missing + 1).fill('0000'));
    return groups.slice(0, 4).join(':') + '::/64';
  }

  function authenticatedPrincipalKey(req) {
    const principal = req.auth;
    if (!principal?.type || !principal?.id) return null;
    const scope = principal.shopId ? `:${principal.shopId}` : '';
    return `principal:${principal.type}:${principal.id}${scope}`;
  }

  function bucketKey(req, now) {
    const principalKey = authenticatedPrincipalKey(req);
    if (principalKey) return principalKey;
    const credentialKey = validatedCredentialKey(req);
    if (credentialKey) return credentialKey;
    const candidate = `ip:${normalizeIpBucket(req.ip)}`;
    if (buckets.has(candidate)) return candidate;
    if (buckets.size >= maxBuckets - 1) return overflowKey;
    return candidate;
  }

  const sweepTimer = setInterval(() => pruneExpired(), sweepMs);
  sweepTimer.unref?.();

  function rateLimit(req, res, next) {
    const now = Date.now();
    const key = bucketKey(req, now);
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
  }

  rateLimit.bucketCount = () => buckets.size;
  rateLimit.pruneExpired = pruneExpired;
  rateLimit.close = () => clearInterval(sweepTimer);
  return rateLimit;
}

module.exports = { requireApiAccess, requireTestAccess, createRateLimiter, authRequired, configuredKeys, configuredTestKeys, testKeysAllowed, extractCredential, markPrincipal };

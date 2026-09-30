'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { requireApiAccess, createRateLimiter } = require('../src/middleware/api.access');

function req(headers = {}, ip = '127.0.0.1') {
  const normalized = Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), v]));
  return { ip, get(name) { return normalized[String(name).toLowerCase()] || ''; } };
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k,v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('AI access rejects missing and invalid credentials before route execution', () => {
  const oldRequired = process.env.SKSK_REQUIRE_AUTH;
  const oldKeys = process.env.SKSK_API_KEYS;
  process.env.SKSK_REQUIRE_AUTH = 'true';
  process.env.SKSK_API_KEYS = 'shop-secret';
  try {
    for (const headers of [{}, { Authorization: 'Bearer wrong' }]) {
      const response = res();
      let ran = false;
      requireApiAccess(req(headers), response, () => { ran = true; });
      assert.equal(ran, false);
      assert.equal(response.statusCode, 401);
      assert.equal(response.body.error, 'Authentication required');
    }
  } finally {
    if (oldRequired === undefined) delete process.env.SKSK_REQUIRE_AUTH; else process.env.SKSK_REQUIRE_AUTH = oldRequired;
    if (oldKeys === undefined) delete process.env.SKSK_API_KEYS; else process.env.SKSK_API_KEYS = oldKeys;
  }
});

test('AI access accepts bearer and explicit SKSK key headers', () => {
  const oldRequired = process.env.SKSK_REQUIRE_AUTH;
  const oldKeys = process.env.SKSK_API_KEYS;
  process.env.SKSK_REQUIRE_AUTH = 'true';
  process.env.SKSK_API_KEYS = 'shop-secret,rotated-secret';
  try {
    for (const headers of [
      { Authorization: 'Bearer shop-secret' },
      { 'X-SKSK-API-Key': 'rotated-secret' }
    ]) {
      const response = res();
      let ran = false;
      const request = req(headers);
      requireApiAccess(request, response, () => { ran = true; });
      assert.equal(ran, true);
      assert.equal(response.statusCode, 200);
      assert.equal(request.auth.type, 'shop_key');
      assert.match(request.auth.id, /^shop_key_[12]$/);
      assert.equal(JSON.stringify(request.auth).includes('secret'), false);
    }
  } finally {
    if (oldRequired === undefined) delete process.env.SKSK_REQUIRE_AUTH; else process.env.SKSK_REQUIRE_AUTH = oldRequired;
    if (oldKeys === undefined) delete process.env.SKSK_API_KEYS; else process.env.SKSK_API_KEYS = oldKeys;
  }
});

test('required auth fails closed when server key configuration is missing', () => {
  const oldRequired = process.env.SKSK_REQUIRE_AUTH;
  const oldKeys = process.env.SKSK_API_KEYS;
  const oldKey = process.env.SKSK_API_KEY;
  process.env.SKSK_REQUIRE_AUTH = 'true';
  delete process.env.SKSK_API_KEYS;
  delete process.env.SKSK_API_KEY;
  try {
    const response = res();
    let ran = false;
    requireApiAccess(req({ Authorization: 'Bearer anything' }), response, () => { ran = true; });
    assert.equal(ran, false);
    assert.equal(response.statusCode, 503);
  } finally {
    if (oldRequired === undefined) delete process.env.SKSK_REQUIRE_AUTH; else process.env.SKSK_REQUIRE_AUTH = oldRequired;
    if (oldKeys === undefined) delete process.env.SKSK_API_KEYS; else process.env.SKSK_API_KEYS = oldKeys;
    if (oldKey === undefined) delete process.env.SKSK_API_KEY; else process.env.SKSK_API_KEY = oldKey;
  }
});

test('AI limiter returns 429 after the configured burst', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  const request = req({ Authorization: 'Bearer shop-secret' });
  for (let i = 0; i < 2; i++) {
    const response = res();
    let ran = false;
    limiter(request, response, () => { ran = true; });
    assert.equal(ran, true);
  }
  const response = res();
  let ran = false;
  limiter(request, response, () => { ran = true; });
  assert.equal(ran, false);
  assert.equal(response.statusCode, 429);
  assert.match(response.body.error, /Too many AI requests/);
  assert.ok(response.headers['Retry-After']);
});

test('production server mounts access control before costly AI handlers', () => {
  const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
  assert.ok(server.includes("app.use('/api/diagnose', ...protectAi, diagnosisLifecycle, diagnose);"));
  assert.ok(server.includes("app.use('/api/quick-ask', ...protectAi, quickAskRouter);"));
  assert.ok(server.includes("app.use('/api/translate', ...protectAi, require('../src/routes/translate'));"));
  assert.ok(server.includes("app.use('/api/intelligence', ...protectAi, require('../src/routes/intelligence.routes'));"));
  assert.ok(server.includes("'X-SKSK-API-Key'"));
});

test('lifecycle client keeps shop credential session-scoped and retries a 401 once', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/lifecycle.html'), 'utf8');
  assert.ok(html.includes("sessionStorage.getItem('skskApiKey')"));
  assert.ok(html.includes("headers['X-SKSK-API-Key']=key"));
  assert.ok(html.includes("r.status===401&&!retried"));
  assert.ok(html.includes("sessionStorage.setItem('skskApiKey'"));
  assert.equal(html.includes("localStorage.setItem('skskApiKey'"), false);
});


test('testing key is isolated from shop routes and accepted only by dedicated test access', () => {
  process.env.SKSK_REQUIRE_AUTH = 'true';
  process.env.SKSK_API_KEYS = 'real-shop-key';
  process.env.SKSK_TEST_API_KEYS = 'test-only-key';
  process.env.SKSK_ALLOW_TEST_KEYS = 'true';

  const { requireApiAccess, requireTestAccess } = require('../src/middleware/api.access');
  const req = { get: name => name.toLowerCase() === 'x-sksk-api-key' ? 'test-only-key' : '' };

  let shopStatus = null;
  requireApiAccess(req, { setHeader() {}, status(code) { shopStatus = code; return this; }, json() {} }, () => assert.fail('test key must not enter shop route'));
  assert.equal(shopStatus, 401);

  let nextCalled = false;
  requireTestAccess(req, { setHeader() {}, status() { return this; }, json() {} }, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.deepEqual(req.auth, { type: 'test_key', id: 'test_key_1' });
});


test('production server protects stateful shop routes with the shared auth contract', () => {
  const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
  for (const route of [
    "app.use('/api/scrape', requireApiAccess, scrapeRouter);",
    "app.use('/api/parts', requireApiAccess, partsRouter);",
    "app.use('/api/jobs', requireApiAccess, jobsRouter);",
    "app.use('/api/estimateHeuristic', requireApiAccess, estimateLifecycle, estimateHeuristic);",
    "app.use('/api/invoice', requireApiAccess, invoiceLifecycle, invoice);",
    "app.use('/api/fleet', requireApiAccess, fleetRouter);",
    "app.use('/api/buyer', requireApiAccess, require('../src/routes/buyer'));"
  ]) assert.ok(server.includes(route), route);
});


test('rate limiter HTTP boundary resists fake credentials and forwarded-for prefix spoofing', async () => {
  const express = require('express');
  const oldKeys = process.env.SKSK_API_KEYS;
  process.env.SKSK_API_KEYS = 'valid-shop-key';
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, maxBuckets: 32, sweepMs: 60_000 });
  const app = express();
  app.set('trust proxy', 1);
  app.get('/limited', limiter, (request, response) => response.json({ ok: true, ip: request.ip }));
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/limited`;
  try {
    const fakeStatuses = [];
    for (let i = 0; i < 4; i++) {
      const response = await fetch(base, { headers: { Authorization: `Bearer fake-${i}`, 'X-Forwarded-For': `spoof-${i}, 203.0.113.9` } });
      fakeStatuses.push(response.status);
    }
    assert.deepEqual(fakeStatuses, [200, 200, 200, 429]);

    const validStatuses = [];
    for (let i = 0; i < 3; i++) {
      const response = await fetch(base, { headers: { Authorization: 'Bearer valid-shop-key', 'X-Forwarded-For': 'different-prefix, 203.0.113.9' } });
      validStatuses.push(response.status);
    }
    assert.deepEqual(validStatuses, [200, 200, 200], 'validated shop key must have its own bucket');
  } finally {
    limiter.close();
    await new Promise(resolve => server.close(resolve));
    if (oldKeys === undefined) delete process.env.SKSK_API_KEYS; else process.env.SKSK_API_KEYS = oldKeys;
  }
});

test('rate limiter prunes expired buckets and keeps its map bounded', async () => {
  const oldKeys = process.env.SKSK_API_KEYS;
  delete process.env.SKSK_API_KEYS;
  const limiter = createRateLimiter({ windowMs: 20, max: 100, maxBuckets: 5, sweepMs: 10 });
  try {
    for (let i = 0; i < 30; i++) {
      limiter(req({}, `198.51.100.${i}`), res(), () => {});
    }
    assert.ok(limiter.bucketCount() <= 5, `bucket count ${limiter.bucketCount()} exceeded cap`);
    await new Promise(resolve => setTimeout(resolve, 35));
    limiter.pruneExpired();
    assert.equal(limiter.bucketCount(), 0);
  } finally {
    limiter.close();
    if (oldKeys === undefined) delete process.env.SKSK_API_KEYS; else process.env.SKSK_API_KEYS = oldKeys;
  }
});

test('production server trusts exactly one proxy hop', () => {
  const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
  assert.ok(server.includes("app.set('trust proxy', 1);"));
  assert.equal(server.includes("app.set('trust proxy', true);"), false);
});


test('valid credentials bypass overflow contention and IPv6 addresses share a /64 bucket', () => {
  const oldKeys = process.env.SKSK_API_KEYS;
  process.env.SKSK_API_KEYS = 'valid-shop-key';
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, maxBuckets: 6, sweepMs: 60_000 });
  try {
    for (let i = 1; i <= 10; i++) limiter(req({}, `198.51.100.${i}`), res(), () => {});
    assert.ok(limiter.bucketCount() <= 6);

    for (let i = 0; i < 3; i++) {
      const response = res();
      let ran = false;
      limiter(req({ Authorization: 'Bearer valid-shop-key' }, '203.0.113.250'), response, () => { ran = true; });
      assert.equal(ran, true, 'validated credential must not be forced into overflow');
      assert.equal(response.statusCode, 200);
    }

    const ipv6Limiter = createRateLimiter({ windowMs: 60_000, max: 3, maxBuckets: 20, sweepMs: 60_000 });
    try {
      const addresses = ['2001:db8:abcd:12::1', '2001:db8:abcd:12::2', '2001:db8:abcd:12:ffff::1'];
      const statuses = [];
      for (const ip of addresses) {
        const response = res(); let ran = false;
        ipv6Limiter(req({}, ip), response, () => { ran = true; });
        statuses.push(ran ? 200 : response.statusCode);
      }
      const blocked = res(); let ran = false;
      ipv6Limiter(req({}, '2001:db8:abcd:12:1234::9'), blocked, () => { ran = true; });
      statuses.push(ran ? 200 : blocked.statusCode);
      assert.deepEqual(statuses, [200, 200, 200, 429], 'same IPv6 /64 must share one bucket');
      assert.equal(ipv6Limiter.bucketCount(), 1);
    } finally {
      ipv6Limiter.close();
    }
  } finally {
    limiter.close();
    if (oldKeys === undefined) delete process.env.SKSK_API_KEYS; else process.env.SKSK_API_KEYS = oldKeys;
  }
});


test('IPv4-mapped IPv6 shares equivalent IPv4 buckets without collapsing clients', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, maxBuckets: 20, sweepMs: 60_000 });
  try {
    for (const ip of ['::ffff:203.0.113.1', '203.0.113.1']) {
      const response = res(); let ran = false;
      limiter(req({}, ip), response, () => { ran = true; });
      assert.equal(ran, true);
    }
    const blocked = res(); let blockedRan = false;
    limiter(req({}, '::ffff:203.0.113.1'), blocked, () => { blockedRan = true; });
    assert.equal(blockedRan, false);
    assert.equal(blocked.statusCode, 429);
    const distinct = res(); let distinctRan = false;
    limiter(req({}, '::ffff:203.0.113.2'), distinct, () => { distinctRan = true; });
    assert.equal(distinctRan, true);
    assert.equal(limiter.bucketCount(), 2);
  } finally { limiter.close(); }
});

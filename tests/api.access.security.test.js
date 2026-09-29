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

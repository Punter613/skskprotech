'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
      requireApiAccess(req(headers), response, () => { ran = true; });
      assert.equal(ran, true);
      assert.equal(response.statusCode, 200);
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

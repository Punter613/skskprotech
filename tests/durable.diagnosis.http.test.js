'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { durableHttpAdmission } = require('../src/middleware/durable.diagnosis.http');
const prior = { auth: process.env.SKSK_REQUIRE_AUTH, durable: process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED };
test.beforeEach(() => { process.env.SKSK_REQUIRE_AUTH = 'true'; process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = 'true'; });
test.afterEach(() => {
  for (const [key, env] of [['auth', 'SKSK_REQUIRE_AUTH'], ['durable', 'SKSK_DURABLE_DIAGNOSIS_ENABLED']]) {
    if (prior[key] === undefined) delete process.env[env]; else process.env[env] = prior[key];
  }
});
function req(shop = 'shop_A', key = 'diagnosis-key-123456789') {
  return { method: 'POST', path: '/', auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: shop }, shopId: shop,
    body: { symptoms: ['noise'] }, get: name => name === 'Idempotency-Key' ? key : undefined };
}
function res() {
  return { headers: {}, statusCode: 200, body: null,
    setHeader(k,v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; return this; } };
}
test('missing executor fails closed without claiming or legacy fallback', async () => {
  let calls = 0, nexts = 0;
  const handler = durableHttpAdmission({ rpcClient: { rpc: async () => { calls++; } } });
  const response = res();
  await handler(req(), response, () => nexts++);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'DURABLE_DIAGNOSIS_NOT_READY');
  assert.equal(calls, 0);
  assert.equal(nexts, 0);
});
test('wrong shop and invalid key rejected before SQL', async () => {
  let calls = 0;
  const handler = durableHttpAdmission({ rpcClient: { rpc: async () => { calls++; } }, execute: async () => {} });
  const wrong = req(); wrong.shopId = 'shop_B';
  const a = res();
  await handler(wrong, a, () => assert.fail('legacy fallthrough'));
  assert.equal(a.statusCode, 403);
  const b = res();
  await handler(req('shop_A', 'short'), b, () => assert.fail('legacy fallthrough'));
  assert.equal(b.statusCode, 400);
  assert.equal(calls, 0);
});
test('disabled durable flag preserves legacy route', async () => {
  process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = 'false';
  let nexts = 0;
  await durableHttpAdmission({})(req(), res(), () => nexts++);
  assert.equal(nexts, 1);
});
test('conflicting claim returns HTTP 409 without executing AI', async () => {
  let executions = 0;
  const handler = durableHttpAdmission({
    rpcClient: { rpc: async () => ({ data: [{ disposition: 'CONFLICT' }], error: null }) },
    execute: async () => { executions++; }
  });
  const response = res();
  await handler(req(), response, () => assert.fail('legacy fallthrough'));
  assert.equal(response.statusCode, 409);
  assert.equal(executions, 0);
});

test('rejects untrusted ownership fields before SQL admission', async () => {
  let calls = 0;
  const handler = durableHttpAdmission({
    rpcClient: { rpc: async () => { calls++; } },
    execute: async () => assert.fail('diagnostic executor must not run')
  });
  const cases = [
    { shopId: 'shop_B' },
    { shop_id: 'shop_B' },
    { p_shop: 'shop_B' },
    { jobId: 'job_B' },
    { intake: { shopId: 'shop_B' } }
  ];
  for (const fields of cases) {
    const request = req();
    request.body = { ...request.body, ...fields };
    const response = res();
    await handler(request, response, () => assert.fail('legacy route must not run'));
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'DURABLE_UNTRUSTED_IDENTITY');
  }
  assert.equal(calls, 0);
});

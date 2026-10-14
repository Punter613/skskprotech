'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { executeDurableDiagnosis } = require('../src/services/durable.diagnosis.execute');
const prior = process.env.SKSK_REQUIRE_AUTH;
test.beforeEach(() => { process.env.SKSK_REQUIRE_AUTH = 'true'; });
test.afterEach(() => { if (prior === undefined) delete process.env.SKSK_REQUIRE_AUTH; else process.env.SKSK_REQUIRE_AUTH = prior; });
const req = { auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: 'shop_A' }, shopId: 'shop_A', body: { symptoms: ['engine hesitation'] } };
const claim = { action: 'EXECUTE', operationId: '00000000-0000-0000-0000-000000000001', generation: 1, jobId: 'job_A' };
function response() {
  return { code: 200, sent: null, headers: {}, status(code) { this.code = code; return this; },
    setHeader(k,v) { this.headers[k] = v; }, send(b) { this.sent = b; return this; } };
}
test('SQL completion precedes sending response bytes', async () => {
  const res = response();
  let calls = 0;
  const rpc = { rpc: async (name, params) => {
    calls++;
    assert.equal(name, 'finish_diagnosis_operation');
    assert.equal(res.sent, null);
    assert.equal(params.p_shop, 'shop_A');
    return { data: true, error: null };
  } };
  await executeDurableDiagnosis(req, res, claim, rpc, async (_req, captured) =>
    captured.json({ success: true, result: { primaryCause: 'Test required' } }));
  assert.equal(calls, 1);
  assert.equal(JSON.parse(res.sent.toString()).jobId, 'job_A');
});
test('fenced finish never sends a diagnosis response', async () => {
  const res = response();
  await assert.rejects(
    executeDurableDiagnosis(req, res, claim, { rpc: async () => ({ data: false, error: null }) },
      async (_req, captured) => captured.json({ success: true, result: { primaryCause: 'Test required' } })),
    { code: 'DURABLE_FINISH_REJECTED' }
  );
  assert.equal(res.sent, null);
});
test('invalid intake finishes as failed without running AI', async () => {
  const res = response();
  let ran = false;
  const rpc = { rpc: async (_name, params) => {
    assert.equal(params.p_terminal, 'FAILED');
    assert.equal(params.p_http_status, 400);
    return { data: true, error: null };
  } };
  await executeDurableDiagnosis({ ...req, body: {} }, res, claim, rpc, async () => { ran = true; });
  assert.equal(ran, false);
  assert.equal(res.code, 400);
});

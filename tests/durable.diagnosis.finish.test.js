'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toPgBytea, finishDurableDiagnosis } = require('../src/services/durable.diagnosis.finish');
const before = process.env.SKSK_REQUIRE_AUTH;
test.beforeEach(() => { process.env.SKSK_REQUIRE_AUTH = 'true'; });
test.afterEach(() => { if (before === undefined) delete process.env.SKSK_REQUIRE_AUTH; else process.env.SKSK_REQUIRE_AUTH = before; });
const req = { auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: 'shop_A' }, shopId: 'shop_A' };
const claim = { action: 'EXECUTE', operationId: '00000000-0000-0000-0000-000000000001', generation: 1, jobId: 'job_A' };
test('bytea encoding retains exact UTF-8 bytes', () => {
  const bytes = Buffer.from('{"ok":true,"utf8":"⚒"}');
  assert.equal(toPgBytea(bytes), String.fromCharCode(92) + 'x' + bytes.toString('hex'));
});
test('successful finish is shop-scoped, generation-fenced and atomic RPC', async () => {
  const calls = [];
  const db = { rpc: async (name, params) => { calls.push({ name, params }); return { data: true, error: null }; } };
  assert.equal(await finishDurableDiagnosis(req, db, claim, { httpStatus: 200, responseBytes: Buffer.from('{"ok":true}'), jobPayload: { status: 'TESTING' } }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'finish_diagnosis_operation');
  assert.equal(calls[0].params.p_shop, 'shop_A');
  assert.equal(calls[0].params.p_generation, 1);
  assert.equal(calls[0].params.p_terminal, 'COMPLETED');
  assert.equal(calls[0].params.p_job_payload.jobId, 'job_A');
});
test('fenced completion and forged job reject', async () => {
  let calls = 0;
  const db = { rpc: async () => { calls++; return { data: false, error: null }; } };
  await assert.rejects(finishDurableDiagnosis(req, db, claim, { httpStatus: 200, responseBytes: Buffer.from('{}'), jobPayload: { jobId: 'job_B' } }), { code: 'DURABLE_JOB_MISMATCH' });
  assert.equal(calls, 0);
  await assert.rejects(finishDurableDiagnosis(req, db, claim, { httpStatus: 500, responseBytes: Buffer.from('{}'), jobPayload: {} }), { code: 'DURABLE_FINISH_REJECTED' });
  assert.equal(calls, 1);
});

test('invalid generation never reaches terminal RPC', async () => {
  let calls = 0;
  const db = { rpc: async () => { calls++; return { data: true, error: null }; } };
  for (const generation of ['1', 0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(finishDurableDiagnosis(req, db, { ...claim, generation }, {
      httpStatus: 500, responseBytes: Buffer.from('{}'), jobPayload: {}
    }), TypeError);
  }
  assert.equal(calls, 0);
});

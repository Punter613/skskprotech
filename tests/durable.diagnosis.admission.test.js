'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprint, claimOrRead } = require('../src/services/durable.diagnosis.admission');
const request = shop => ({ auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: shop }, shopId: shop });
const key = 'diagnosis-idempotency-key-123456';
function transport(disposition, readDisposition = 'PROCESSING') {
  const calls = [];
  return {
    calls,
    rpc: async (name, params) => {
      calls.push({ name, params });
      if (name === 'claim_diagnosis_operation') return { data: [{ disposition, operation_id: 'op1', generation: 1, linked_job_id: 'job1' }], error: null };
      return { data: [{ disposition: readDisposition, http_status: 200 }], error: null };
    }
  };
}
test('canonical fingerprint ignores JSON key ordering', () => {
  assert.equal(fingerprint({ a: 1, b: { z: 2, c: 3 } }), fingerprint({ b: { c: 3, z: 2 }, a: 1 }));
});
test('new claim executes once and stamps verified shop', async () => {
  const db = transport('CLAIMED');
  const result = await claimOrRead(request('shop_A'), db, { key, jobId: 'job1', body: { symptoms: ['noise'] } });
  assert.equal(result.action, 'EXECUTE');
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].params.p_shop, 'shop_A');
  assert.equal(db.calls[0].params.p_initial_job.shopId, 'shop_A');
});
test('in-progress claim never executes AI again', async () => {
  const db = transport('PROCESSING');
  const result = await claimOrRead(request('shop_A'), db, { key, jobId: 'job1', body: { symptoms: ['noise'] } });
  assert.equal(result.action, 'PENDING');
  assert.equal(db.calls.length, 2);
});
test('completed retry is replayed and scoped to verified shop', async () => {
  const db = transport('COMPLETED', 'COMPLETED');
  const result = await claimOrRead(request('shop_A'), db, { key, jobId: 'job1', body: { symptoms: ['noise'] } });
  assert.equal(result.action, 'REPLAY');
  assert.ok(db.calls.every(call => call.params.p_shop === 'shop_A'));
});
test('conflicting fingerprint fails closed without read', async () => {
  const db = transport('CONFLICT');
  await assert.rejects(claimOrRead(request('shop_A'), db, { key, jobId: 'job1', body: {} }), { code: 'DURABLE_IDEMPOTENCY_CONFLICT' });
  assert.equal(db.calls.length, 1);
});
test('unauthenticated request makes zero RPC calls', async () => {
  const db = transport('CLAIMED');
  await assert.rejects(claimOrRead({}, db, { key, jobId: 'job1', body: {} }), { code: 'DURABLE_SHOP_AUTH_REQUIRED' });
  assert.equal(db.calls.length, 0);
});
test('database failure never falls back to execution', async () => {
  const db = { rpc: async () => ({ data: null, error: { message: 'offline' } }) };
  await assert.rejects(claimOrRead(request('shop_A'), db, { key, jobId: 'job1', body: {} }), { code: 'DURABLE_RPC_FAILED' });
});

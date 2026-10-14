'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { executeDurableRpc } = require('../src/services/durable.diagnosis.rpc');

test('durable RPC rejects forged tenant alias before transport', async () => {
  const before = process.env.SKSK_REQUIRE_AUTH;
  try {
    process.env.SKSK_REQUIRE_AUTH = 'true';
    let calls = 0;
    const transport = { rpc: async () => { calls++; return { data: null, error: null }; } };
    const req = { auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: 'shop_A' }, shopId: 'shop_A' };
    for (const field of ['p_shop', 'shop_id', 'shopId']) {
      await assert.rejects(executeDurableRpc(req, transport, 'read_diagnosis_operation', { [field]: 'shop_B' }), { code: 'DURABLE_SHOP_MISMATCH' });
    }
    assert.equal(calls, 0);
    await executeDurableRpc(req, transport, 'read_diagnosis_operation', { p_shop: 'shop_A' });
    assert.equal(calls, 1);
    await assert.rejects(executeDurableRpc({ ...req, shopId: 'shop_B' }, transport, 'read_diagnosis_operation', {}), { code: 'DURABLE_SHOP_AUTH_REQUIRED' });
  } finally {
    if (before === undefined) delete process.env.SKSK_REQUIRE_AUTH;
    else process.env.SKSK_REQUIRE_AUTH = before;
  }
});

test('durable RPC denies anonymous, mismatched, and auth-disabled callers before transport', async () => {
  const before = process.env.SKSK_REQUIRE_AUTH;
  let calls = 0;
  const transport = { rpc: async () => { calls++; return { data: null, error: null }; } };
  const verified = { auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: 'shop_A' }, shopId: 'shop_A' };
  try {
    process.env.SKSK_REQUIRE_AUTH = 'true';
    for (const req of [
      {},
      { shopId: 'shop_A' },
      { ...verified, shopId: 'shop_B' },
      { ...verified, auth: { ...verified.auth, shopId: 'shop_B' } },
      { ...verified, auth: { type: 'supabase_user', id: 'user_1', shopId: 'shop_A' } },
      { ...verified, auth: { type: 'shop_key', id: 'forged', shopId: 'shop_A' } }
    ]) {
      await assert.rejects(
        executeDurableRpc(req, transport, 'claim_diagnosis_operation', { p_shop: 'shop_A' }),
        { code: 'DURABLE_SHOP_AUTH_REQUIRED' }
      );
    }
    process.env.SKSK_REQUIRE_AUTH = 'false';
    await assert.rejects(
      executeDurableRpc(verified, transport, 'claim_diagnosis_operation', {}),
      { code: 'DURABLE_SHOP_AUTH_REQUIRED' }
    );
    assert.equal(calls, 0);
  } finally {
    if (before === undefined) delete process.env.SKSK_REQUIRE_AUTH;
    else process.env.SKSK_REQUIRE_AUTH = before;
  }
});

test('every permitted durable RPC is shop-stamped from verified identity', async () => {
  const before = process.env.SKSK_REQUIRE_AUTH;
  try {
    process.env.SKSK_REQUIRE_AUTH = 'true';
    const calls = [];
    const transport = { rpc: async (name, params) => { calls.push({ name, params }); return { data: null, error: null }; } };
    const req = { auth: { type: 'shop_key', id: 'shop_key_1', shopId: 'shop_A' }, shopId: 'shop_A' };
    const inputs = {
      claim_diagnosis_operation: { p_job_id: 'job_1', p_initial_job: { status: 'DIAGNOSING' } },
      finish_diagnosis_operation: { p_job_payload: { status: 'TESTING' } }
    };
    for (const name of [
      'claim_diagnosis_operation', 'heartbeat_diagnosis_operation',
      'finish_diagnosis_operation', 'read_diagnosis_operation',
      'reconcile_diagnosis_operation'
    ]) {
      await executeDurableRpc(req, transport, name, { ...(inputs[name] || {}), p_shop: 'shop_A' });
    }
    assert.equal(calls.length, 5);
    assert.ok(calls.every(call => call.params.p_shop === 'shop_A'));
    assert.equal(calls[0].params.p_initial_job.shopId, 'shop_A');
    assert.equal(calls[2].params.p_job_payload.shopId, 'shop_A');
    await assert.rejects(executeDurableRpc(req, transport, 'delete_diagnosis_operation', {}), { code: 'DURABLE_RPC_NOT_ALLOWED' });
    assert.equal(calls.length, 5);
  } finally {
    if (before === undefined) delete process.env.SKSK_REQUIRE_AUTH;
    else process.env.SKSK_REQUIRE_AUTH = before;
  }
});

test('claim and finish reject forged payload ownership before RPC', async () => {
  const before = process.env.SKSK_REQUIRE_AUTH;
  try {
    process.env.SKSK_REQUIRE_AUTH = 'true';
    const calls = [];
    const transport = { rpc: async (name, params) => { calls.push({ name, params }); return { data: null, error: null }; } };
    const req = { auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: 'shop_A' }, shopId: 'shop_A' };
    await assert.rejects(
      executeDurableRpc(req, transport, 'claim_diagnosis_operation', {
        p_job_id: 'job_1', p_initial_job: { shopId: 'shop_B', jobId: 'job_1' }
      }), { code: 'DURABLE_SHOP_MISMATCH' });
    await assert.rejects(
      executeDurableRpc(req, transport, 'claim_diagnosis_operation', {
        p_job_id: 'job_1', p_initial_job: { jobId: 'forged' }
      }), { code: 'DURABLE_JOB_MISMATCH' });
    await assert.rejects(
      executeDurableRpc(req, transport, 'finish_diagnosis_operation', {
        p_job_payload: { shopId: 'shop_B' }
      }), { code: 'DURABLE_SHOP_MISMATCH' });
    assert.equal(calls.length, 0);
    await executeDurableRpc(req, transport, 'claim_diagnosis_operation', {
      p_job_id: 'job_1', p_initial_job: { status: 'DIAGNOSING' }
    });
    await executeDurableRpc(req, transport, 'finish_diagnosis_operation', {
      p_job_payload: { status: 'TESTING' }
    });
    assert.deepEqual(calls[0].params.p_initial_job, {
      shopId: 'shop_A', jobId: 'job_1', status: 'DIAGNOSING'
    });
    assert.equal(calls[1].params.p_job_payload.shopId, 'shop_A');
    await assert.rejects(
      executeDurableRpc(req, transport, 'claim_diagnosis_operation', {
        p_job_id: 'job_2', p_initial_job: []
      }), TypeError);
    assert.equal(calls.length, 2);
  } finally {
    if (before === undefined) delete process.env.SKSK_REQUIRE_AUTH;
    else process.env.SKSK_REQUIRE_AUTH = before;
  }
});

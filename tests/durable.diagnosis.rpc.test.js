'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { executeDurableRpc } = require('../src/services/durable.diagnosis.rpc');

test('durable RPC uses verified shop instead of caller shop', async () => {
  const before = process.env.SKSK_REQUIRE_AUTH;
  try {
    process.env.SKSK_REQUIRE_AUTH = 'true';
    let observed;
    const transport = { rpc: async (name, params) => { observed = { name, params }; return { data: null, error: null }; } };
    const req = { auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: 'shop_A' }, shopId: 'shop_A' };
    await executeDurableRpc(req, transport, 'read_diagnosis_operation', { p_shop: 'shop_B', p_idempotency_key: 'key' });
    assert.equal(observed.params.p_shop, 'shop_A');
    assert.equal(observed.params.p_idempotency_key, 'key');
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
    for (const name of [
      'claim_diagnosis_operation', 'heartbeat_diagnosis_operation',
      'finish_diagnosis_operation', 'read_diagnosis_operation',
      'reconcile_diagnosis_operation'
    ]) {
      await executeDurableRpc(req, transport, name, {
        p_shop: 'shop_B', shop_id: 'shop_B', shopId: 'shop_B', p_idempotency_key: 'key'
      });
    }
    assert.equal(calls.length, 5);
    for (const { params } of calls) {
      assert.deepEqual(params, { p_idempotency_key: 'key', p_shop: 'shop_A' });
    }
    await assert.rejects(
      executeDurableRpc(req, transport, 'delete_diagnosis_operation', {}),
      { code: 'DURABLE_RPC_NOT_ALLOWED' }
    );
    assert.equal(calls.length, 5);
  } finally {
    if (before === undefined) delete process.env.SKSK_REQUIRE_AUTH;
    else process.env.SKSK_REQUIRE_AUTH = before;
  }
});

test('claim and finish RPC overwrite tenant identity inside job payloads', async () => {
  const before = process.env.SKSK_REQUIRE_AUTH;
  try {
    process.env.SKSK_REQUIRE_AUTH = 'true';
    const calls = [];
    const transport = { rpc: async (name, params) => { calls.push({ name, params }); return { data: null, error: null }; } };
    const req = { auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: 'shop_A' }, shopId: 'shop_A' };
    const supplied = { shopId: 'shop_B', jobId: 'forged', status: 'DIAGNOSING' };
    await executeDurableRpc(req, transport, 'claim_diagnosis_operation', {
      p_job_id: 'job_1', p_initial_job: supplied
    });
    await executeDurableRpc(req, transport, 'finish_diagnosis_operation', {
      p_job_payload: supplied
    });
    assert.deepEqual(calls[0].params.p_initial_job, {
      shopId: 'shop_A', jobId: 'job_1', status: 'DIAGNOSING'
    });
    assert.equal(calls[1].params.p_job_payload.shopId, 'shop_A');
    assert.equal(supplied.shopId, 'shop_B');
    await assert.rejects(
      executeDurableRpc(req, transport, 'claim_diagnosis_operation', {
        p_job_id: 'job_2', p_initial_job: []
      }),
      TypeError
    );
    assert.equal(calls.length, 2);
  } finally {
    if (before === undefined) delete process.env.SKSK_REQUIRE_AUTH;
    else process.env.SKSK_REQUIRE_AUTH = before;
  }
});

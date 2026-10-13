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

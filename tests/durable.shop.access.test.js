'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizedDurableShop, requireDurableShop } = require('../src/middleware/durable.shop.access');

function request(auth, shopId, extras = {}) { return { auth, shopId, ...extras }; }
function runGate(req) {
  let called = false, code = null, body = null;
  const res = { status(n) { code = n; return this; }, json(v) { body = v; return this; } };
  requireDurableShop(req, res, () => { called = true; });
  return { called, code, body };
}
test('durable shop boundary denies missing identity and auth-disabled beta', () => {
  const prior = process.env.SKSK_REQUIRE_AUTH;
  try {
    process.env.SKSK_REQUIRE_AUTH = 'false';
    assert.equal(authorizedDurableShop(request({type:'shop_key', id:'shop_key_1', shopId:'shop_key_1'}, 'shop_key_1')), null);
    process.env.SKSK_REQUIRE_AUTH = 'true';
    const denied = runGate(request(null, null, {body:{shopId:'victim'}}));
    assert.equal(denied.called, false);
    assert.equal(denied.code, 403);
    assert.equal(denied.body.code, 'DURABLE_SHOP_AUTH_REQUIRED');
  } finally {
    if (prior === undefined) delete process.env.SKSK_REQUIRE_AUTH;
    else process.env.SKSK_REQUIRE_AUTH = prior;
  }
});
test('durable shop boundary binds to verified principal, not client overrides', () => {
  const prior = process.env.SKSK_REQUIRE_AUTH;
  try {
    process.env.SKSK_REQUIRE_AUTH = 'true';
    const auth = {type:'supabase_user', id:'user_123', userId:'123', shopId:'shop_A'};
    const accepted = request(auth, 'shop_A', {body:{shopId:'shop_B'}, query:{shop_id:'shop_B'}, headers:{'x-shop-id':'shop_B'}});
    assert.equal(runGate(accepted).called, true);
    assert.equal(accepted.durableShopId, 'shop_A');
    assert.equal(runGate(request(auth, 'shop_B')).code, 403);
    assert.equal(runGate(request({...auth, shopId:''}, 'shop_A')).code, 403);
    assert.equal(runGate(request({type:'test_key', id:'test_key_1', shopId:'shop_A'}, 'shop_A')).code, 403);
    const key = request({type:'shop_key', id:'shop_key_1', shopId:'shop_key_1'}, 'shop_key_1');
    assert.equal(runGate(key).called, true);
    assert.equal(key.durableShopId, 'shop_key_1');
  } finally {
    if (prior === undefined) delete process.env.SKSK_REQUIRE_AUTH;
    else process.env.SKSK_REQUIRE_AUTH = prior;
  }
});

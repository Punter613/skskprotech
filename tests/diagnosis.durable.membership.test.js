'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDurableShopId, requireDurableShopMembership } = require('../src/middleware/diagnosis.durable.membership');

function response() {
  return {
    code: 200, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('verified Supabase users in one shop resolve to the same stable tenant', () => {
  const a = { auth: { type: 'supabase_user', id: 'user_a', userId: 'a', shopId: 'shop-stable-123' } };
  const b = { auth: { type: 'supabase_user', id: 'user_b', userId: 'b', shopId: 'shop-stable-123' } };
  assert.equal(resolveDurableShopId(a), 'shop-stable-123');
  assert.equal(resolveDurableShopId(b), 'shop-stable-123');
  const res = response(); let called = false;
  requireDurableShopMembership(a, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(a.durableShopId, 'shop-stable-123');
});

test('positional shop keys, test keys and unverified request data cannot define tenant', () => {
  for (const request of [
    { auth: { type: 'shop_key', id: 'shop_key_1', shopId: 'shop_key_1' } },
    { auth: { type: 'shop_key', id: 'shop_key_2', shopId: 'shop_key_2' } },
    { auth: { type: 'test_key', id: 'test_key_1', shopId: 'shop-a' } },
    { body: { shopId: 'attacker-shop' }, headers: { 'x-shop-id': 'attacker-shop' } },
    { auth: { type: 'supabase_user', id: 'user_a', shopId: 'shop-a' } },
    { auth: { type: 'supabase_user', userId: 'a', shopId: ' shop-a ' } }
  ]) assert.equal(resolveDurableShopId(request), null);
});

test('missing identity is 401; authenticated but unmapped identity is 403', () => {
  const missing = response();
  requireDurableShopMembership({}, missing, () => assert.fail('must not pass'));
  assert.equal(missing.code, 401);
  assert.match(missing.headers['WWW-Authenticate'], /Bearer/);
  const unmapped = response();
  const request = { auth: { type: 'shop_key', id: 'shop_key_1', shopId: 'shop_key_1' } };
  requireDurableShopMembership(request, unmapped, () => assert.fail('must not pass'));
  assert.equal(unmapped.code, 403);
  assert.equal(request.durableShopId, undefined);
});

test('shop membership rejects empty, control-character and oversized identifiers', () => {
  for (const shopId of ['', '  ', 'shop\nother', 'x'.repeat(129)]) {
    assert.equal(resolveDurableShopId({ auth: { type: 'supabase_user', userId: 'u', shopId } }), null);
  }
});

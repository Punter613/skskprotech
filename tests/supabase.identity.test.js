'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { shopIdFromUser } = require('../src/auth/supabase.identity');

test('shop identity comes only from trusted app metadata', () => {
  assert.equal(shopIdFromUser({ app_metadata: { shop_id: 'shop-123' } }), 'shop-123');
  assert.equal(shopIdFromUser({ app_metadata: { tenant_id: 'tenant-456' } }), 'tenant-456');
  assert.equal(shopIdFromUser({ user_metadata: { shop_id: 'user-controlled' } }), '');
});

test('shop id is normalized and missing membership stays empty', () => {
  assert.equal(shopIdFromUser({ app_metadata: { shop_id: '  shop-a  ' } }), 'shop-a');
  assert.equal(shopIdFromUser({ app_metadata: {} }), '');
  assert.equal(shopIdFromUser(null), '');
});

test('identity verifier source requires server-side getUser validation', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/auth/supabase.identity.js'), 'utf8');
  assert.ok(source.includes('supabase.auth.getUser(token)'));
  assert.equal(source.includes('user_metadata.shop_id'), false);
  assert.ok(source.includes("type: 'supabase_user'"));
  assert.ok(source.includes('userId: data.user.id'));
  assert.ok(source.includes('shopId'));
});

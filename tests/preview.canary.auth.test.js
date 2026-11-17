'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canaryCredential, canaryHeaders, CANARY_SHOP_ID } = require('../src/middleware/preview.canary.auth');

const key = 'example-preview-canary-only-key';
const env = {
  IS_PULL_REQUEST: 'true',
  SKSK_PREVIEW_CANARY_API_KEY: key,
  SKSK_API_KEYS: key,
  SKSK_SHOP_KEY_BINDINGS: JSON.stringify({ [key]: CANARY_SHOP_ID })
};

test('preview canary uses a dedicated bound tenant', () => {
  assert.equal(canaryCredential(env), key);
  assert.equal(canaryHeaders('/api/vehicle/decode', key)['X-SKSK-API-Key'], key);
  assert.equal(canaryHeaders('/api/quick-ask', key)['X-SKSK-API-Key'], key);
});

test('missing or invalid credential fails closed', () => {
  assert.throws(() => canaryCredential({ ...env, SKSK_PREVIEW_CANARY_API_KEY: '' }), /not configured/);
  assert.throws(() => canaryCredential({ ...env, SKSK_PREVIEW_CANARY_API_KEY: 'invalid' }), /not bound/);
  assert.throws(() => canaryCredential({ ...env, IS_PULL_REQUEST: 'false' }), /disabled/);
});

test('cross-tenant binding is rejected, even for a configured key', () => {
  assert.throws(() => canaryCredential({
    ...env, SKSK_SHOP_KEY_BINDINGS: JSON.stringify({ [key]: 'shop_production' })
  }), /not bound/);
});

test('credential forwarding is restricted to two internal routes', () => {
  for (const path of ['/api/jobs', '/api/fleet', '/api/vehicle/other', '/health', '/api/diagnose']) {
    assert.throws(() => canaryHeaders(path, key), /not allowed/);
  }
});

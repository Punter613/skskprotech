'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPreviewCanaryAuthorizationHeaders,
  requirePreviewCanaryAccess,
  PREVIEW_CANARY_SHOP_ID
} = require('../src/middleware/preview.canary.auth');

function req(headers = {}) {
  return {
    get(name) { return headers[String(name).toLowerCase()] || ''; },
    headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  };
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('preview canary auth accepts a dedicated shop-preview key only when it is configured and bound', () => {
  const saved = {
    previewKey: process.env.SKSK_PREVIEW_CANARY_API_KEY,
    apiKeys: process.env.SKSK_API_KEYS,
    bindings: process.env.SKSK_SHOP_KEY_BINDINGS,
    isPullRequest: process.env.IS_PULL_REQUEST
  };

  process.env.SKSK_PREVIEW_CANARY_API_KEY = 'preview-canary-key';
  process.env.SKSK_API_KEYS = 'shop-secret,preview-canary-key';
  process.env.SKSK_SHOP_KEY_BINDINGS = JSON.stringify({ 'preview-canary-key': PREVIEW_CANARY_SHOP_ID });
  process.env.IS_PULL_REQUEST = 'true';

  try {
    const headers = getPreviewCanaryAuthorizationHeaders();
    assert.equal(headers['X-SKSK-API-Key'], 'preview-canary-key');
    assert.equal(headers['Content-Type'], 'application/json');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('preview canary auth fails closed when the key is absent or unbound', () => {
  const saved = {
    previewKey: process.env.SKSK_PREVIEW_CANARY_API_KEY,
    apiKeys: process.env.SKSK_API_KEYS,
    bindings: process.env.SKSK_SHOP_KEY_BINDINGS,
    isPullRequest: process.env.IS_PULL_REQUEST
  };

  process.env.SKSK_PREVIEW_CANARY_API_KEY = 'preview-canary-key';
  process.env.SKSK_API_KEYS = 'shop-secret';
  process.env.SKSK_SHOP_KEY_BINDINGS = JSON.stringify({ 'shop-secret': 'shop_test' });
  process.env.IS_PULL_REQUEST = 'true';

  try {
    assert.throws(() => getPreviewCanaryAuthorizationHeaders(), /not present in SKSK_API_KEYS|not bound to shop_preview_canary/);

    const response = res();
    let ran = false;
    requirePreviewCanaryAccess(req({}), response, () => { ran = true; });
    assert.equal(ran, false);
    assert.equal(response.statusCode, 503);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('preview canary auth is disabled outside a pull request preview', () => {
  const saved = {
    previewKey: process.env.SKSK_PREVIEW_CANARY_API_KEY,
    apiKeys: process.env.SKSK_API_KEYS,
    bindings: process.env.SKSK_SHOP_KEY_BINDINGS,
    isPullRequest: process.env.IS_PULL_REQUEST
  };

  process.env.SKSK_PREVIEW_CANARY_API_KEY = 'preview-canary-key';
  process.env.SKSK_API_KEYS = 'preview-canary-key';
  process.env.SKSK_SHOP_KEY_BINDINGS = JSON.stringify({ 'preview-canary-key': PREVIEW_CANARY_SHOP_ID });
  delete process.env.IS_PULL_REQUEST;

  try {
    const response = res();
    let ran = false;
    requirePreviewCanaryAccess(req({}), response, () => { ran = true; });
    assert.equal(ran, false);
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error, 'Preview canary access is disabled outside pull request previews');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

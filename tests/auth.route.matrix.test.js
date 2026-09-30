'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { requireApiAccess } = require('../src/middleware/api.access');

const protectedMounts = [
  '/api/scrape',
  '/api/parts',
  '/api/jobs',
  '/api/diagnose',
  '/api/estimateHeuristic',
  '/api/invoice',
  '/api/translate',
  '/api/fleet',
  '/api/quick-ask',
  '/api/intelligence',
  '/api/buyer',
  '/api/parts-lookup',
  '/api/vehicle'
];

function startMatrixServer() {
  const app = express();
  for (const route of protectedMounts) {
    app.all(route, requireApiAccess, (req, res) => {
      res.status(418).json({ reachedHandler: true, route, principal: req.auth });
    });
  }
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('every protected route rejects no key and wrong key, while a valid shop key crosses auth', async () => {
  const oldRequired = process.env.SKSK_REQUIRE_AUTH;
  const oldKeys = process.env.SKSK_API_KEYS;
  process.env.SKSK_REQUIRE_AUTH = 'true';
  process.env.SKSK_API_KEYS = 'matrix-shop-key';

  const server = await startMatrixServer();
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    for (const route of protectedMounts) {
      const noKey = await fetch(base + route);
      assert.equal(noKey.status, 401, `${route} without key`);

      const wrongKey = await fetch(base + route, {
        headers: { 'X-SKSK-API-Key': 'wrong-key' }
      });
      assert.equal(wrongKey.status, 401, `${route} with wrong key`);

      const validKey = await fetch(base + route, {
        headers: { 'X-SKSK-API-Key': 'matrix-shop-key' }
      });
      assert.equal(validKey.status, 418, `${route} valid key must cross auth boundary`);
      const body = await validKey.json();
      assert.equal(body.reachedHandler, true);
      assert.equal(body.principal?.type, 'shop_key');
      assert.match(body.principal?.id || '', /^shop_key_/);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (oldRequired === undefined) delete process.env.SKSK_REQUIRE_AUTH; else process.env.SKSK_REQUIRE_AUTH = oldRequired;
    if (oldKeys === undefined) delete process.env.SKSK_API_KEYS; else process.env.SKSK_API_KEYS = oldKeys;
  }
});

test('matrix stays aligned with production protected mounts and documents intentionally open routes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');

  for (const route of protectedMounts) {
    const line = server.split('\n').find(value => value.includes(`app.use('${route}'`));
    assert.ok(line, `missing production mount for ${route}`);
    assert.match(line, /requireApiAccess|\.\.\.protectAi/, `${route} must remain auth-protected`);
  }

  for (const route of ['/api/full-estimate']) {
    const line = server.split('\n').find(value => value.includes(`app.use('${route}'`));
    assert.ok(line, `missing reviewed open mount for ${route}`);
    assert.doesNotMatch(line, /requireApiAccess|\.\.\.protectAi/, `${route} open-route policy changed; review explicitly`);
  }
});

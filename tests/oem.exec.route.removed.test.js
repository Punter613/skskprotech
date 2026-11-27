'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const OEM_ROUTE_PATH = path.join(__dirname, '..', 'src', 'routes', 'oem.js');

test('oem router source has no shell execution or legacy oem-data route', () => {
  const source = fs.readFileSync(OEM_ROUTE_PATH, 'utf8');
  const code = source.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /child_process/);
  assert.doesNotMatch(code, /\bexec(File|Sync)?\s*\(/);
  assert.doesNotMatch(code, /\bspawn(Sync)?\s*\(/);
  assert.doesNotMatch(code, /lemon-core/);
  assert.doesNotMatch(code, /oem-data/);
});

test('mounted oem router no longer serves /api/oem-data and keeps knowledge-builder catalog', async () => {
  const app = express();
  app.use(require('../src/routes/oem'));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const get = urlPath => fetch(`http://127.0.0.1:${port}${urlPath}`);
  try {
    const injected = encodeURIComponent('x"; touch /tmp/sksk-pwned; echo "');
    const removed = await get(`/api/oem-data/1HGCM82633A004352/${injected}`);
    assert.equal(removed.status, 404);
    assert.equal(fs.existsSync('/tmp/sksk-pwned'), false);

    const catalog = await get('/api/knowledge-builder/catalog');
    assert.equal(catalog.status, 200);
    const body = await catalog.json();
    assert.equal(body.success, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

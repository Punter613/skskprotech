'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared browser auth bridge owns shop-key storage and one-retry 401 flow', () => {
  const auth = read('public/js/sksk-auth.js');

  assert.match(auth, /skskApiKey/);
  assert.match(auth, /X-SKSK-API-Key/);
  assert.match(auth, /response\.status !== 401/);
  assert.match(auth, /state && state\.retried/);
  assert.match(auth, /Temporary browser bridge only/);
  assert.match(auth, /global\.SKSKAuth = Object\.freeze/);
  assert.match(auth, /setSessionProvider/);
  assert.match(auth, /Authorization/);
  assert.match(auth, /Bearer/);
});

test('session credential is centralized and takes precedence over temporary shop key', () => {
  const auth = read('public/js/sksk-auth.js');
  assert.match(auth, /const token = await sessionToken\(\)/);
  assert.match(auth, /next\.set\('Authorization', 'Bearer ' \+ token\)/);
  assert.match(auth, /next\.delete\(KEY_HEADER\)/);
  assert.match(auth, /const key = getKey\(\)/);
});

test('main, fleet, and lifecycle pages load the shared auth bridge', () => {
  for (const file of ['public/index.html', 'public/fleet.html', 'public/lifecycle.html']) {
    const html = read(file);
    assert.match(html, /<script src="\/js\/sksk-auth\.js"><\/script>/, file);
    assert.match(html, /SKSKAuth\.request\(/, file);
  }
});

test('fleet keeps tenant scoping while auth is additive', () => {
  const fleet = read('public/fleet.html');

  assert.match(fleet, /'x-tenant-id': tenantId/);
  assert.equal((fleet.match(/SKSKAuth\.request\(/g) || []).length, 3);
  assert.doesNotMatch(fleet, /\bfetch\s*\(\s*\`\$\{API_BASE\}\/api\/fleet\//);
});

test('lifecycle no longer owns duplicate shop-key prompt or storage logic', () => {
  const lifecycle = read('public/lifecycle.html');

  assert.doesNotMatch(lifecycle, /sessionStorage\.getItem\('skskApiKey'\)/);
  assert.doesNotMatch(lifecycle, /window\.prompt\('SKSK shop access key'\)/);
  assert.match(lifecycle, /SKSKAuth\.request\(API\+path/);
});

test('main API timeout wrapper delegates through auth without changing public NHTSA lookup', () => {
  const index = read('public/index.html');

  assert.match(index, /return await SKSKAuth\.request\(url,/);
  assert.match(index, /fetch\(\`https:\/\/api\.nhtsa\.gov\/recalls\//);
});

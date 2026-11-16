'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shared browser auth bridge owns shop-key storage and one-retry 401 flow', () => {
  const auth = read('public/js/sksk-auth.js');

  assert.match(auth, /skskApiKey/);
  assert.match(auth, /X-SKSK-API-Key/);
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

test('fleet derives tenant scoping from authenticated identity', () => {
  const fleet = read('public/fleet.html');

  assert.doesNotMatch(fleet, /x-tenant-id|sksk_fleet_tenant|tenantInput/);
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

function authHarness(statuses, enteredKeys = []) {
  const stored = new Map();
  const requests = [];
  let prompts = 0;
  const window = {
    sessionStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key)
    },
    prompt: () => { prompts++; return enteredKeys.shift() ?? null; },
    fetch: async (_url, options) => {
      requests.push(options.headers.get('X-SKSK-API-Key'));
      const next = statuses.shift();
      if (!next) throw new Error('Unexpected retry');
      return {
        status: next.status,
        clone() { return { json: async () => ({ error: next.error }) }; }
      };
    }
  };
  vm.runInNewContext(read('public/js/sksk-auth.js'), { window, Headers });
  return { auth: window.SKSKAuth, requests, promptCount: () => prompts };
}

test('401 prompts once and retries with the entered shop key', async () => {
  const h = authHarness([{ status: 401 }, { status: 200 }], ['new-shop-key']);
  const response = await h.auth.request('/api/fleet/roster');
  assert.equal(response.status, 200);
  assert.equal(h.promptCount(), 1);
  assert.deepEqual(h.requests, [null, 'new-shop-key']);
});

test('missing shop-context 403 clears stale key and reprompts once', async () => {
  const h = authHarness([
    { status: 403, error: 'Authenticated shop context is required.' },
    { status: 200 }
  ], ['replacement-key']);
  h.auth.setKey('stale-key');
  const response = await h.auth.request('/api/fleet/roster');
  assert.equal(response.status, 200);
  assert.equal(h.promptCount(), 1);
  assert.deepEqual(h.requests, ['stale-key', 'replacement-key']);
});

test('tenant override 403 is final and never prompts or retries', async () => {
  const h = authHarness([
    { status: 403, error: 'Tenant override is not authorized.' }
  ], ['must-not-be-used']);
  h.auth.setKey('bound-key');
  const response = await h.auth.request('/api/fleet/roster');
  assert.equal(response.status, 403);
  assert.equal(h.promptCount(), 0);
  assert.deepEqual(h.requests, ['bound-key']);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Supabase browser session adapter is inert without explicit page opt-in', () => {
  const source = read('public/js/sksk-session.js');
  const context = {
    module: { exports: {} },
    exports: {},
    Date,
    JSON,
    String,
    Boolean,
    Math,
    self: {
      document: { querySelector: () => null },
      supabase: { createClient: () => { throw new Error('must not create client without opt-in'); } },
      SKSKAuth: { setSessionProvider: () => { throw new Error('must not install provider without opt-in'); } },
      atob: value => Buffer.from(value, 'base64').toString('binary')
    }
  };
  vm.runInNewContext(source, context, { filename: 'sksk-session.js' });
  const session = context.module.exports;
  assert.equal(session.isConfigured(), false);
  assert.equal(session.createClient(), null);
  const boot = session.boot();
  assert.equal(boot.enabled, false);
  assert.equal(boot.client, null);
});

test('current production pages do not opt in to Supabase browser sessions', () => {
  for (const file of ['public/index.html', 'public/fleet.html', 'public/lifecycle.html']) {
    const html = read(file);
    assert.doesNotMatch(html, /meta\s+name=["']sksk-supabase-url["']/i, file);
    assert.doesNotMatch(html, /meta\s+name=["']sksk-supabase-anon-key["']/i, file);
    assert.doesNotMatch(html, /src=["']\/js\/sksk-session\.js["']/i, file);
  }
});

test('public sharing and email surfaces stay present while auth capability is off', () => {
  const index = read('public/index.html');
  assert.match(index, /navigator\.share/);
  assert.match(index, /location\.href/);
  assert.match(index, /customerEmail/);
});

test('adapter only hands SKSKAuth an access-token provider when explicitly installed', () => {
  const source = read('public/js/sksk-session.js');
  assert.match(source, /setSessionProvider/);
  assert.match(source, /access_token/);
  assert.match(source, /sksk-supabase-url/);
  assert.match(source, /sksk-supabase-anon-key/);
  assert.doesNotMatch(source, /X-SKSK-API-Key/);
});

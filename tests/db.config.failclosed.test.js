'use strict';
// Fail-closed backend DB credential contract (src/db.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveSupabaseConfig, classifySupabaseKey, assertSupabaseConfig } = require('../src/db');

const jwt = role => ['e30', Buffer.from(JSON.stringify({ role, ref: 'testref' })).toString('base64url'), 'sig'].join('.');
const SERVICE = jwt('service_role');
const ANON = jwt('anon');
const URL_OK = 'https://testref.supabase.co';
const SECRET_MARKERS = [SERVICE, ANON, 'sb_secret_zzzz', URL_OK];

function assertNoSecrets(text) {
  for (const marker of SECRET_MARKERS) assert.ok(!String(text).includes(marker), 'error output must not contain credential or URL values');
}

test('key classification', () => {
  assert.equal(classifySupabaseKey(SERVICE), 'service');
  assert.equal(classifySupabaseKey('sb_secret_zzzz'), 'service');
  assert.equal(classifySupabaseKey(ANON), 'anon');
  assert.equal(classifySupabaseKey(jwt('authenticated')), 'anon');
  assert.equal(classifySupabaseKey('sb_publishable_zzzz'), 'publishable');
  assert.equal(classifySupabaseKey('test-key'), 'unrecognized');
  assert.equal(classifySupabaseKey(''), 'missing');
});

test('valid service-role config via SUPABASE_SERVICE_ROLE_KEY (production contract)', () => {
  const r = resolveSupabaseConfig({ RENDER: 'true', SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
  assert.equal(r.configured, true);
  assert.equal(r.source, 'SUPABASE_SERVICE_ROLE_KEY');
  assert.equal(r.key, SERVICE);
});

test('production shape with an unused anon key still uses the service key', () => {
  const r = resolveSupabaseConfig({ NODE_ENV: 'production', SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_ANON_KEY: ANON });
  assert.equal(r.configured, true);
  assert.equal(r.key, SERVICE);
});

test('legacy SUPABASE_KEY alias accepted only as a service-role key', () => {
  assert.equal(resolveSupabaseConfig({ SUPABASE_URL: URL_OK, SUPABASE_KEY: SERVICE }).source, 'SUPABASE_KEY');
  const anonAlias = resolveSupabaseConfig({ SUPABASE_URL: URL_OK, SUPABASE_KEY: ANON });
  assert.equal(anonAlias.configured, false);
  assert.match(anonAlias.error.message, /SUPABASE_KEY is not a service-role credential \(anon\)/);
});

test('conflicting SUPABASE_KEY and SUPABASE_SERVICE_ROLE_KEY fail', () => {
  const r = resolveSupabaseConfig({ SUPABASE_URL: URL_OK, SUPABASE_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
  assert.equal(r.configured, false);
  assert.match(r.error.message, /both set to different values/);
  assertNoSecrets(r.error.message);
});

test('anon-only configuration never falls back to the anon key', () => {
  for (const env of [
    { SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: ANON },
    { RENDER: 'true', SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: ANON },
    { IS_PULL_REQUEST: 'true', SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: ANON }
  ]) {
    const r = resolveSupabaseConfig(env);
    assert.equal(r.configured, false);
    assert.equal(r.error.code, 'SUPABASE_CONFIG_INVALID');
    assert.match(r.error.message, /only SUPABASE_ANON_KEY is set/);
    assertNoSecrets(r.error.message);
  }
});

test('missing credentials fail where persistence is required', () => {
  for (const env of [{ NODE_ENV: 'production' }, { SKSK_REQUIRE_PERSISTENCE: 'true' }, { RENDER: 'true' }, { IS_PULL_REQUEST: 'true' }]) {
    const r = resolveSupabaseConfig(env);
    assert.equal(r.configured, false);
    assert.match(r.error.message, /SUPABASE_SERVICE_ROLE_KEY is not set/);
  }
  assert.throws(() => assertSupabaseConfig({ RENDER: 'true' }), { code: 'SUPABASE_CONFIG_INVALID' });
});

test('missing or invalid SUPABASE_URL fails', () => {
  assert.match(resolveSupabaseConfig({ SUPABASE_SERVICE_ROLE_KEY: SERVICE }).error.message, /SUPABASE_URL is not set/);
  for (const bad of ['not a url', 'http://testref.supabase.co', 'https://user:pass@testref.supabase.co', 'ftp://x']) {
    const r = resolveSupabaseConfig({ SUPABASE_URL: bad, SUPABASE_SERVICE_ROLE_KEY: SERVICE });
    assert.match(r.error.message, /SUPABASE_URL is not a valid https URL/);
    assert.ok(!r.error.message.includes(bad));
  }
  assert.equal(resolveSupabaseConfig({ SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: SERVICE }).configured, true);
});

test('unrecognized or publishable key fails without echoing it', () => {
  for (const key of ['test-key', 'sb_publishable_zzzz']) {
    const r = resolveSupabaseConfig({ SUPABASE_URL: URL_OK, SUPABASE_SERVICE_ROLE_KEY: key });
    assert.equal(r.configured, false);
    assert.ok(!r.error.message.includes(key));
  }
});

test('local dev with nothing configured stays unconfigured (unchanged behavior)', () => {
  const r = resolveSupabaseConfig({});
  assert.equal(r.configured, false);
  assert.equal(r.error, undefined);
});

function runServer(extraEnv) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, PORT: '0', DOTENV_CONFIG_PATH: path.join(__dirname, '__no_such_env__'), ...extraEnv };
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'api', 'server.js')], { env, cwd: path.join(__dirname, '..') });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: 'timeout', out }); }, 15000);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, out }); });
  });
}

test('server refuses to start with anon-only config on Render, without leaking values', async () => {
  const { code, out } = await runServer({ RENDER: 'true', SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: ANON });
  assert.notEqual(code, 0);
  assert.notEqual(code, 'timeout');
  assert.match(out, /SUPABASE_CONFIG_INVALID|only SUPABASE_ANON_KEY is set/);
  assertNoSecrets(out);
});

test('server refuses to start with missing credentials on Render', async () => {
  const { code, out } = await runServer({ RENDER: 'true' });
  assert.notEqual(code, 0);
  assert.notEqual(code, 'timeout');
  assert.match(out, /SUPABASE_SERVICE_ROLE_KEY is not set/);
});

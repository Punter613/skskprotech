'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  evaluatePreviewDatabaseConfig,
  enforcePreviewDatabaseGuard,
  isPreviewEnvironment
} = require('../src/startup/preview.database.guard');

const PROD_URL = 'https://irwhynrausoqjokyaxbf.supabase.co';
const TEST_URL = 'https://bzgdovasolhoslruyfev.supabase.co';
const UNKNOWN_URL = 'https://abcdefghijklmnopqrst.supabase.co';

function fakeJwt(ref) {
  const enc = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ iss: 'supabase', ref, role: 'service_role' })}.signature`;
}

const preview = extra => ({ IS_PULL_REQUEST: 'true', ...extra });

test('preview + production database is BLOCKED', () => {
  const r = evaluatePreviewDatabaseConfig(preview({ SUPABASE_URL: PROD_URL }));
  assert.equal(r.allowed, false);
  assert.match(r.reason, /PRODUCTION/);
});

test('preview + approved test database is ALLOWED', () => {
  const r = evaluatePreviewDatabaseConfig(preview({ SUPABASE_URL: TEST_URL, SUPABASE_SERVICE_ROLE_KEY: fakeJwt('bzgdovasolhoslruyfev') }));
  assert.equal(r.allowed, true);
  assert.equal(r.ref, 'bzgdovasolhoslruyfev');
});

test('preview + unknown database is BLOCKED', () => {
  const r = evaluatePreviewDatabaseConfig(preview({ SUPABASE_URL: UNKNOWN_URL }));
  assert.equal(r.allowed, false);
  assert.match(r.reason, /unapproved/);
});

test('preview + missing URL is BLOCKED', () => {
  for (const value of [undefined, '', '   ']) {
    const r = evaluatePreviewDatabaseConfig(preview({ SUPABASE_URL: value }));
    assert.equal(r.allowed, false);
    assert.match(r.reason, /missing/);
  }
});

test('preview + malformed or spoofed URL is BLOCKED', () => {
  const bad = [
    'not a url',
    'bzgdovasolhoslruyfev.supabase.co',
    'http://bzgdovasolhoslruyfev.supabase.co',
    'https://bzgdovasolhoslruyfev.supabase.co.evil.example',
    'https://evil.example/bzgdovasolhoslruyfev.supabase.co',
    'https://user:pass@bzgdovasolhoslruyfev.supabase.co',
    'https://bzgdovasolhoslruyfev.supabase.co:8443',
    'https://x.bzgdovasolhoslruyfev.supabase.co'
  ];
  for (const SUPABASE_URL of bad) {
    const r = evaluatePreviewDatabaseConfig(preview({ SUPABASE_URL }));
    assert.equal(r.allowed, false, SUPABASE_URL);
  }
});

test('preview + approved URL but production JWT key is BLOCKED', () => {
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_KEY', 'SUPABASE_ANON_KEY']) {
    const r = evaluatePreviewDatabaseConfig(preview({ SUPABASE_URL: TEST_URL, [name]: fakeJwt('irwhynrausoqjokyaxbf') }));
    assert.equal(r.allowed, false, name);
    assert.match(r.reason, /PRODUCTION/);
  }
});

test('production + existing production configuration is ALLOWED (guard is a no-op)', () => {
  const r = evaluatePreviewDatabaseConfig({ SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: fakeJwt('irwhynrausoqjokyaxbf'), RENDER_SERVICE_NAME: 'p613-backend' });
  assert.equal(r.preview, false);
  assert.equal(r.allowed, true);
});

test('preview detection: IS_PULL_REQUEST or a -pr-N Render service name', () => {
  assert.equal(isPreviewEnvironment({ IS_PULL_REQUEST: 'true' }), true);
  assert.equal(isPreviewEnvironment({ IS_PULL_REQUEST: 'TRUE ' }), true);
  assert.equal(isPreviewEnvironment({ RENDER_SERVICE_NAME: 'p613-backend-pr-230' }), true);
  assert.equal(isPreviewEnvironment({ IS_PULL_REQUEST: 'false', RENDER_SERVICE_NAME: 'p613-backend' }), false);
  assert.equal(isPreviewEnvironment({}), false);
});

test('enforce exits 1 on a blocked preview and never logs URLs or keys', () => {
  const key = fakeJwt('irwhynrausoqjokyaxbf');
  const lines = [];
  const log = { log: m => lines.push(m), error: m => lines.push(m) };
  let code = null;
  enforcePreviewDatabaseGuard({ env: preview({ SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: key }), exit: c => { code = c; }, log });
  assert.equal(code, 1);
  const output = lines.join('\n');
  assert.doesNotMatch(output, /https?:\/\//);
  assert.ok(!output.includes(key));
  assert.ok(!output.includes(key.split('.')[1]));
});

test('enforce does not exit outside previews', () => {
  let exited = false;
  enforcePreviewDatabaseGuard({ env: { SUPABASE_URL: PROD_URL }, exit: () => { exited = true; }, log: { log() {}, error() {} } });
  assert.equal(exited, false);
});

function runServer(extraEnv, waitForPattern, timeoutMs = 45000) {
  return new Promise(resolve => {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, PORT: '0', NODE_ENV: 'test', ...extraEnv };
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'api', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let settled = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); child.kill('SIGKILL'); resolve({ ...result, out }); };
    const onData = d => { out += d.toString(); if (waitForPattern && waitForPattern.test(out)) finish({ started: true, code: null }); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => finish({ started: false, code }));
    const timer = setTimeout(() => finish({ started: false, code: 'timeout' }), timeoutMs);
  });
}

test('server process refuses to start a preview pointed at production, before binding', async () => {
  const r = await runServer({ IS_PULL_REQUEST: 'true', SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: fakeJwt('irwhynrausoqjokyaxbf') }, /running inside API framework/);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /REFUSING TO START preview/);
  assert.doesNotMatch(r.out, /running inside API framework/);
});

test('server process starts normally with production configuration outside previews', async () => {
  const r = await runServer({ SUPABASE_URL: PROD_URL, SUPABASE_SERVICE_ROLE_KEY: fakeJwt('irwhynrausoqjokyaxbf') }, /running inside API framework/);
  assert.equal(r.started, true, r.out);
  assert.doesNotMatch(r.out, /PreviewGuard/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const { requireApiAccess, createRateLimiter } = require('../src/middleware/api.access');
const { requireGuestDiagnosisKey, validateTestDiagnosis, createTestDiagnosisQuota } = require('../src/middleware/test.diagnose');

const SAVED = new Map();
const ENV = ['NODE_ENV', 'SKSK_SKIP_AUTH', 'SKSK_GUEST_DIAGNOSE_KEYS', 'SKSK_GUEST_DIAGNOSE_ENABLED',
  'SKSK_API_KEYS', 'SKSK_API_KEY', 'SKSK_SHOP_KEY_BINDINGS', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];

function configure() {
  for (const key of ENV) SAVED.set(key, process.env[key]);
  process.env.NODE_ENV = 'development';
  delete process.env.SKSK_SKIP_AUTH;
  process.env.SKSK_GUEST_DIAGNOSE_ENABLED = 'true';
  process.env.SKSK_GUEST_DIAGNOSE_KEYS = 'demo-test-secret';
  delete process.env.SKSK_API_KEYS;
  delete process.env.SKSK_API_KEY;
  delete process.env.SKSK_SHOP_KEY_BINDINGS;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
}
function restore() {
  for (const [key, value] of SAVED) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

async function withServer(options, run) {
  configure();
  const app = express();
  app.use(express.json());
  const limiter = createRateLimiter({ max: 10, windowMs: 60_000 });
  app.use('/api/test/diagnose', requireGuestDiagnosisKey, validateTestDiagnosis, limiter,
    createTestDiagnosisQuota({ dailyMax: options.dailyMax || 5, perIpMax: options.perIpMax || 5,
      maxInFlight: options.maxInFlight || 2 }),
    (req, res) => {
      assert.equal(req.shopId, undefined);
      assert.equal(req.auth.type, 'guest_diagnose');
      assert.equal(req.skskTesterMode, true);
      if (options.onIntake) options.onIntake(req, res);
      else res.json({ success: true, vin: req.body.vin, vehicle: req.body.vehicle });
    });
  app.use('/api/jobs', requireApiAccess, (req, res) => res.json({ success: true }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, key = 'demo-test-secret') => fetch(base + '/api/test/diagnose', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SKSK-API-Key': key },
    body: JSON.stringify(body)
  });
  try { await run({ base, post }); }
  finally { limiter.close(); await new Promise(resolve => server.close(resolve)); restore(); }
}

const VALID = { vin: 'KNDJC736385765089', symptoms: ['Engine hesitates under load'], obdCodes: ['P0300'] };

test('tester key reaches only isolated diagnosis and never acquires a shop identity', async () => {
  await withServer({}, async ({ base, post }) => {
    const noKey = await post(VALID, '');
    assert.equal(noKey.status, 401);
    const wrongKey = await post(VALID, 'bad-key');
    assert.equal(wrongKey.status, 401);
    const accepted = await post(VALID);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).vin, VALID.vin);
    const jobs = await fetch(base + '/api/jobs', { headers: { 'X-SKSK-API-Key': 'demo-test-secret' } });
    assert.notEqual(jobs.status, 200);
  });
});

test('guest lane stays closed if disabled or its secret collides with a shop key', async () => {
  await withServer({}, async ({ post }) => {
    process.env.SKSK_GUEST_DIAGNOSE_ENABLED = 'false';
    assert.equal((await post(VALID)).status, 503);
    process.env.SKSK_GUEST_DIAGNOSE_ENABLED = 'true';
    process.env.SKSK_API_KEYS = 'demo-test-secret';
    assert.equal((await post(VALID)).status, 503);
  });
});

test('tester intake strips shop, private customer, history and verification fields', async () => {
  await withServer({}, async ({ post }) => {
    for (const addition of [
      { customer: { name: 'Real customer' } }, { jobId: 'SHOP-REAL-JOB' },
      { history: ['Completed work'] }, { dtcEvidence: [{ code: 'P0300', verified: true }] }
    ]) {
      assert.equal((await post({ ...VALID, ...addition })).status, 400);
    }
    const manual = await post({ vehicle: { year: 2017, make: 'Kia', model: 'Sorento' }, symptoms: ['Rough idle'] });
    assert.equal(manual.status, 200);
    assert.deepEqual((await manual.json()).vehicle, { year: 2017, make: 'Kia', model: 'Sorento' });
  });
});

test('tester quotas cap requests and report retry guidance', async () => {
  await withServer({ dailyMax: 2, perIpMax: 2 }, async ({ post }) => {
    assert.equal((await post(VALID)).status, 200);
    assert.equal((await post(VALID)).status, 200);
    const limited = await post(VALID);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('Retry-After')) > 0);
  });
});

test('tester concurrency cap holds while earlier requests are in flight', async () => {
  let unlock;
  const release = new Promise(resolve => { unlock = resolve; });
  let started;
  const firstStarted = new Promise(resolve => { started = resolve; });
  await withServer({ maxInFlight: 1, onIntake(req, res) {
    started();
    release.then(() => res.json({ success: true }));
  } }, async ({ post }) => {
    const first = post(VALID);
    await firstStarted;
    const second = await post(VALID);
    assert.equal(second.status, 429);
    unlock();
    assert.equal((await first).status, 200);
    assert.equal((await post(VALID)).status, 200);
  });
}, { concurrency: false });

test('actual backend wiring keeps tester access separate from lifecycle and shop routes', () => {
  const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
  const route = server.match(/app\.use\('\/api\/test\/diagnose'[\s\S]*?diagnose\);/);
  assert.ok(route);
  assert.match(route[0], /requireGuestDiagnosisKey/);
  assert.match(route[0], /testerDailyQuota/);
  assert.doesNotMatch(route[0], /requireApiAccess|diagnosisLifecycle|estimateLifecycle/);
  const diagnose = fs.readFileSync(path.join(__dirname, '../src/routes/diagnose.js'), 'utf8');
  assert.match(diagnose, /if \(!req\.skskTesterMode\)\s*\{\s*recordGuardCatch/);
  const page = fs.readFileSync(path.join(__dirname, '../public/try.html'), 'utf8');
  assert.match(page, /fetch\('\/api\/test\/diagnose'/);
  assert.doesNotMatch(page, /localStorage\.setItem|sessionStorage\.setItem/);
  const inlineScript = page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new vm.Script(inlineScript));
});

test('preview smoke requires shop authentication for outer and loopback calls', () => {
  const source = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
  assert.match(source, /app\.get\('\/health\/preview-evidence', requireApiAccess,/);
  assert.match(source, /app\.get\('\/health\/preview-unverified-diagnosis', requireApiAccess,/);
  assert.match(source, /const shopKey = Object\.keys\(bindings \|\| \{\}\)\.find\(key => configured\.has\(key\)\)/);
  assert.match(source, /return \{ 'Content-Type': 'application\/json', 'X-SKSK-API-Key': shopKey \}/);
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/ci.yaml'), 'utf8');
  assert.match(workflow, /SKSK_PREVIEW_API_KEY: \$\{\{ secrets\.SKSK_PREVIEW_API_KEY \}\}/);
  assert.match(workflow, /curl -H "X-SKSK-API-Key: \$SKSK_PREVIEW_API_KEY"[^\n]*render-evidence-smoke/);
});

// Execute the actual canary ID expression twice against the guarded lifecycle.
test('repeated preview canary invocations create distinct jobs without overwriting', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
  const expression = source.match(/const jobId = (`SKSK-PREVIEW-UNVERIFIED-[^`]+`);/)?.[1];
  assert.ok(expression);
  const nextId = () => vm.runInNewContext(expression, { require, process: { env: {} } });
  const first = nextId();
  const second = nextId();
  assert.match(first, /^SKSK-PREVIEW-UNVERIFIED-PR-/);
  assert.notEqual(first, second);
  const { createJob, getJob } = require('../src/services/job.lifecycle');
  await createJob({ jobId: first, customer: { name: 'first canary' } }, 'test-canary');
  await createJob({ jobId: second, customer: { name: 'second canary' } }, 'test-canary');
  assert.equal((await getJob(first, 'test-canary')).customer.name, 'first canary');
  assert.equal((await getJob(second, 'test-canary')).customer.name, 'second canary');
  await assert.rejects(createJob({ jobId: first }, 'test-canary'), { code: 'JOB_REVISION_CONFLICT' });
});

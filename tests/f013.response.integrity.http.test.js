'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

// Exercise real job.lifecycle service operations over HTTP. Only the database
// transport and downstream AI response are controlled test boundaries.
const dbPath = require.resolve('../src/db');
const originalDb = require(dbPath);
let guardUnavailable = false;
let failWrites = false;
let writes = 0;
const fakeSupabase = {
  from(table) {
    assert.equal(table, 'service_jobs');
    return {
      async upsert() {
        writes++;
        return { error: failWrites ? new Error('simulated database outage') : null };
      }
    };
  }
};
require.cache[dbPath].exports = {
  ...originalDb,
  supabase: fakeSupabase,
  persistenceRequired: () => true,
  assertPersistenceConfigured: () => {
    if (!guardUnavailable) return;
    const previous = process.env.SKSK_REQUIRE_PERSISTENCE;
    process.env.SKSK_REQUIRE_PERSISTENCE = 'true';
    try { originalDb.assertPersistenceConfigured(); }
    finally {
      if (previous === undefined) delete process.env.SKSK_REQUIRE_PERSISTENCE;
      else process.env.SKSK_REQUIRE_PERSISTENCE = previous;
    }
  }
};
const servicePath = require.resolve('../src/services/job.lifecycle');
delete require.cache[servicePath];
const lifecycle = require('../src/services/job.lifecycle');
const { diagnosisLifecycle, estimateLifecycle } = require('../src/middleware/job.lifecycle.middleware');

const intake = { vehicle: { year: 2016, make: 'Chevrolet', model: 'Malibu' }, symptoms: ['Rough idle'] };
const diagnosis = { primaryCause: 'Cylinder one ignition coil fault', recommendedTests: ['Coil swap'], probability: [] };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/api/diagnose', diagnosisLifecycle, (req, res) => res.json({ success: true, result: diagnosis }));
  app.post('/api/estimateHeuristic', estimateLifecycle, (req, res) => res.json({
    success: true, estimate: { laborHours: 1, partsCost: 80 }
  }));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({
    success: false, error: err.message, code: err.code || 'UNHANDLED'
  }));
  return app;
}

async function request(path, body) {
  const server = makeApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test.beforeEach(() => {
  global.__jobs = {};
  guardUnavailable = false;
  failWrites = false;
  writes = 0;
});

test('F-013 Diagnose: service database write error returns 503, never AI success', async () => {
  failWrites = true;
  const response = await request('/api/diagnose', intake);
  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'PERSISTENCE_WRITE_FAILED');
  assert.equal(response.body.result, undefined);
  assert.ok(writes > 0);
});

test('F-013 Diagnose: actual database configuration guard returns distinct 503', async () => {
  guardUnavailable = true;
  const response = await request('/api/diagnose', intake);
  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'PERSISTENCE_UNAVAILABLE');
  assert.equal(writes, 0);
});

test('F-013 Diagnose: invalid lifecycle input retains 400', async () => {
  const response = await request('/api/diagnose', {});
  assert.equal(response.status, 400);
  assert.equal(response.body.code, 'INVALID_DIAGNOSIS_INPUT');
  assert.equal(writes, 0);
});

test('F-013 Diagnose: healthy required writes produce successful persisted response', async () => {
  const response = await request('/api/diagnose', intake);
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(response.body.jobId);
  assert.ok(writes >= 3);
  const persisted = await lifecycle.getJob(response.body.jobId);
  assert.equal(persisted.status, 'TESTING');
  assert.ok(persisted.diagnosis?.result);
});

test('F-013 Estimate: real unverified lifecycle conflict retains 409', async () => {
  const job = await lifecycle.createJob(intake);
  const response = await request('/api/estimateHeuristic', { jobId: job.jobId });
  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.equal(response.body.status, 'DIAGNOSING');
});

// Estimate persistence success and write-failure cases require a canonical
// VERIFIED_CASE and repairResolution fixture. Do not substitute a forged
// VERIFIED status or bypass the verified estimate snapshot contract.

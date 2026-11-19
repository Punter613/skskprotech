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
let failAtWrite = null;
let writes = 0;
const fakeSupabase = {
  from(table) {
    assert.equal(table, 'service_jobs');
    // Each insert or revision-guarded update is one durable write attempt.
    const attempt = () => {
      writes++;
      return (failWrites || writes === failAtWrite) ? new Error('simulated database outage') : null;
    };
    return {
      async insert() {
        return { error: attempt() };
      },
      update(row) {
        const chain = {
          eq() { return chain; },
          is() { return chain; },
          async select() {
            const error = attempt();
            return error ? { data: null, error } : { data: [{ job_id: row.job_id }], error: null };
          }
        };
        return chain;
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
  app.use('/api/diagnose', diagnosisLifecycle);
  app.post('/api/diagnose', (req, res) => res.json({ success: true, result: diagnosis }));
  app.use('/api/estimateHeuristic', estimateLifecycle);
  app.post('/api/estimateHeuristic', (req, res) => res.json({
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
  failAtWrite = null;
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

test('F-013 Diagnose: post-AI persistence failure is blocked by response bridge', async () => {
  // createJob and intake patch succeed; recordDiagnosis fails after the
  // downstream success payload has been produced.
  failAtWrite = 3;
  const response = await request('/api/diagnose', intake);
  assert.equal(writes, 3, 'failure must occur in the response bridge');
  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'PERSISTENCE_WRITE_FAILED');
  assert.equal(response.body.result, undefined);
  assert.equal(response.body.jobId, undefined);
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

const { buildVerifiedCase } = require('../src/core/evidence/verified.case');
const { buildVerifiedRepairResolution } = require('../src/core/evidence/verified.repair.resolution');

async function verifiedJob() {
  const job = await lifecycle.createJob(intake);
  const evidencePacket = {
    schemaVersion: 1, stage: 'DIAGNOSE',
    vehicle: job.vehicle,
    observations: { customer: ['Rough idle'], mechanic: [], completedWork: [] },
    dtcs: [], measurements: { trust: 'TRUSTED_PRE_TAG_INPUT', values: {} },
    deterministic: { vehicleProfile: { vehicleId: 'CHEVROLET_MALIBU_TEST' } },
    evidence: { oem: [], tsbs: [], sources: [], available: false },
    contradictions: []
  };
  const prepared = await lifecycle.patchJob(job.jobId, {
    status: 'TESTING',
    diagnosis: { result: diagnosis, evidencePacket, revision: 1 },
    tests: [{
      id: 'T1', name: 'coil swap', result: 'misfire moved',
      evidenceRole: 'CONFIRMS', confirmedFault: 'Cylinder one ignition coil fault'
    }]
  });
  const verified = await lifecycle.verifyJob(prepared.jobId, {
    confirmed: true,
    confirmedCause: 'Cylinder one ignition coil fault',
    conclusion: 'Misfire moved with coil',
    evidenceTestIds: ['T1']
  });
  return lifecycle.patchJob(verified.jobId, { verifiedCase: buildVerifiedCase(verified) });
}

function estimateFor(job) {
  return {
    priority: 'medium',
    diagnosis: 'Verified cylinder one ignition coil fault',
    repairResolution: buildVerifiedRepairResolution({
      verifiedCase: job.verifiedCase,
      laborRate: 65, laborRateSource: 'MECHANIC_INPUT', laborHours: 1.5,
      parts: [{ partNumber: 'COIL-1', description: 'Ignition coil', quantity: 1, unitPrice: 80 }]
    })
  };
}

test('F-013 Estimate: required database write failure returns 503, not estimate', async () => {
  const job = await verifiedJob();
  const estimate = estimateFor(job);
  failWrites = true;
  // Exercise the real attachEstimate service via the response bridge.
  const response = await requestEstimate(job.jobId, estimate);
  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(response.body.code, 'PERSISTENCE_WRITE_FAILED');
  assert.equal(response.body.estimate, undefined);
});

test('F-013 Estimate: configuration guard failure returns distinct 503', async () => {
  const job = await verifiedJob();
  const estimate = estimateFor(job);
  guardUnavailable = true;
  const response = await requestEstimate(job.jobId, estimate);
  assert.equal(response.status, 503);
  assert.equal(response.body.code, 'PERSISTENCE_UNAVAILABLE');
  assert.equal(response.body.estimate, undefined);
});

test('F-013 Estimate: healthy persistence returns successful estimate', async () => {
  const job = await verifiedJob();
  const estimate = estimateFor(job);
  const response = await requestEstimate(job.jobId, estimate);
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.estimate.stage, 'ESTIMATED');
  assert.equal((await lifecycle.getJob(job.jobId)).status, 'ESTIMATED');
});

async function requestEstimate(jobId, estimate) {
  // The downstream route supplies an estimate; lifecycle middleware alone
  // must persist it before the response is delivered.
  const app = express();
  app.use(express.json());
  app.use('/api/estimateHeuristic', estimateLifecycle);
  app.post('/api/estimateHeuristic',
    (req, res) => res.json({ success: true, estimate }));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({
    success: false, error: err.message, code: err.code || 'UNHANDLED'
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/estimateHeuristic`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId })
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

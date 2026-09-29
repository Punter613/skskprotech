'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { diagnosisLifecycle } = require('../src/middleware/job.lifecycle.middleware');

function resetJobs() { global.__jobs = {}; }
function jobCount() { return Object.keys(global.__jobs || {}).length; }

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use('/api/diagnose', diagnosisLifecycle);
  app.post('/api/diagnose', (req, res) => res.json({
    success: true,
    result: { primaryCause: 'test candidate', safetyRisk: false, urgency: 'soon' }
  }));
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test.beforeEach(resetJobs);

test('empty diagnosis is rejected before lifecycle job creation', async () => {
  await withServer(async base => {
    const before = jobCount();
    const response = await fetch(`${base}/api/diagnose`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, 'INVALID_DIAGNOSIS_INPUT');
    assert.equal(jobCount(), before);
  });
});

test('bad diagnostic field type is rejected before lifecycle job creation', async () => {
  await withServer(async base => {
    const before = jobCount();
    const response = await fetch(`${base}/api/diagnose`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ symptoms: 'string' })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.error, /symptoms must be an array/);
    assert.equal(jobCount(), before);
  });
});

test('unsafe VIN and vehicle identifier types are rejected without creating jobs', async () => {
  const cases = [
    { vin: 12345 },
    { vin: { a: 1 } },
    { vehicle: { vin: 12345 } },
    { vehicle: { make: 5, model: 'Sorento' } },
    { vehicle: { make: 'Kia', model: 7 } },
    { vehicle: { make: 'Kia', model: 'Sorento', engine: 38 } },
    { vehicle: { make: 'Kia', model: 'Sorento', year: {} } }
  ];
  await withServer(async base => {
    for (const payload of cases) {
      resetJobs();
      const before = jobCount();
      const response = await fetch(`${base}/api/diagnose`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      assert.equal(response.status, 400, JSON.stringify(payload));
      assert.equal(body.code, 'INVALID_DIAGNOSIS_INPUT');
      assert.equal(jobCount(), before, JSON.stringify(payload));
    }
  });
});

test('minimal valid diagnostic inputs still pass the pre-create guard', async () => {
  const cases = [
    { vin: 'KNDJC736385765089' },
    { symptoms: ['clunk on acceleration'] },
    { dtcEvidence: [{ code: 'P0300', source: 'SCAN_TOOL', verified: true }] },
    { vehicle: { year: 2008, make: 'Kia', model: 'Sorento' } },
    { vehicle: { year: '2008', make: 'Kia', model: 'Sorento' } }
  ];
  await withServer(async base => {
    for (const payload of cases) {
      resetJobs();
      const response = await fetch(`${base}/api/diagnose`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.ok(body.jobId);
      assert.equal(jobCount(), 1);
    }
  });
});

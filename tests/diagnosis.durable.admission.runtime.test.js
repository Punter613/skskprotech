'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { durableDiagnosisAdmission } = require('../src/middleware/diagnosis.durable.admission');

async function withServer(run) {
  const calls = [];
  const app = express();
  app.use(express.json());
  // Keep the same order as the production /api/diagnose mount, but use
  // harmless spies instead of running the AI route or writing jobs.
  const auth = (req, res, next) => { calls.push('auth'); next(); };
  const limiter = (req, res, next) => { calls.push('limiter'); next(); };
  const lifecycle = (req, res, next) => { calls.push('lifecycle'); next(); };
  const diagnose = (req, res) => { calls.push('diagnose'); res.json({ legacy: true }); };
  app.use('/api/diagnose', durableDiagnosisAdmission, auth, limiter, lifecycle, diagnose);
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try {
    await run({ url: `http://127.0.0.1:${server.address().port}`, calls });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('durable flag OFF preserves legacy POST middleware chain', async () => {
  const previous = process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
  delete process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
  try {
    await withServer(async ({ url, calls }) => {
      const response = await fetch(`${url}/api/diagnose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { legacy: true });
      assert.deepEqual(calls, ['auth', 'limiter', 'lifecycle', 'diagnose']);
    });
  } finally {
    if (previous === undefined) delete process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
    else process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = previous;
  }
});

test('durable flag ON fails closed before legacy auth, limiter, lifecycle and handler', async () => {
  const previous = process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
  process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = 'true';
  try {
    await withServer(async ({ url, calls }) => {
      const response = await fetch(`${url}/api/diagnose`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.json();
      assert.equal(body.code, 'DURABLE_DIAGNOSIS_NOT_READY');
      assert.deepEqual(calls, [], 'no legacy or durable execution may begin');
    });
  } finally {
    if (previous === undefined) delete process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
    else process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = previous;
  }
});

test('durable admission cannot be enabled by client headers or request body', async () => {
  const previous = process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
  delete process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
  try {
    await withServer(async ({ url, calls }) => {
      const response = await fetch(`${url}/api/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SKSK-Durable-Diagnosis-Enabled': 'true' },
        body: JSON.stringify({ SKSK_DURABLE_DIAGNOSIS_ENABLED: 'true', durable: true })
      });
      assert.equal(response.status, 200);
      assert.deepEqual(calls, ['auth', 'limiter', 'lifecycle', 'diagnose']);
    });
  } finally {
    if (previous === undefined) delete process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
    else process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = previous;
  }
});

test('durable admission does not change non-POST /api/diagnose routes', async () => {
  const previous = process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
  process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = 'true';
  try {
    await withServer(async ({ url, calls }) => {
      const response = await fetch(`${url}/api/diagnose`, { method: 'GET' });
      assert.equal(response.status, 200);
      assert.deepEqual(calls, ['auth', 'limiter', 'lifecycle', 'diagnose']);
    });
  } finally {
    if (previous === undefined) delete process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
    else process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = previous;
  }
});

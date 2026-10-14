'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { durableDiagnosisAdmission } = require('../src/middleware/diagnosis.durable.admission');

function invoke(method, path, enabled) {
  const old = process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
  try {
    if (enabled) process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = 'true';
    else delete process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
    const response = { headers: {}, statusCode: 200, body: null,
      setHeader(k, v) { this.headers[k] = v; },
      status(n) { this.statusCode = n; return this; },
      json(data) { this.body = data; return this; } };
    let nextCalls = 0;
    durableDiagnosisAdmission({ method, path }, response, () => { nextCalls++; });
    return { response, nextCalls };
  } finally {
    if (old === undefined) delete process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED;
    else process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = old;
  }
}

test('durable flag never enables the unfinished POST handler', () => {
  const { response, nextCalls } = invoke('POST', '/', true);
  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'DURABLE_DIAGNOSIS_NOT_READY');
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('legacy diagnosis remains available while durable rollout is disabled', () => {
  assert.equal(invoke('POST', '/', false).nextCalls, 1);
});

test('durable admission does not block unrelated methods or subpaths', () => {
  assert.equal(invoke('GET', '/', true).nextCalls, 1);
  assert.equal(invoke('POST', '/other', true).nextCalls, 1);
});

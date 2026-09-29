'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

function stubModule(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  const previous = require.cache[resolved];
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
  return () => { if (previous) require.cache[resolved] = previous; else delete require.cache[resolved]; };
}

async function withServer(router, run) {
  const app = express(); app.use(express.json()); app.use('/api/diagnose', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

const MODEL_SAYS_FINE = JSON.stringify({
  urgency: 'monitor', safetyRisk: false, primaryCause: 'Brake noise requires confirmation',
  secondaryCauses: [], codeExplanations: {}, probability: [{ cause: 'Pad wear', likelihood: 100 }],
  knownIssues: [], repairSteps: ['Measure pad thickness'], proTips: [], recommendedTests: ['Measure pad thickness'],
  additionalChecks: [], estimatedRepairTime: '0.5 hour', notes: 'Confirm before repair.'
});

function stubs(capture, { patternHit = null } = {}) {
  const realWarmup = require('../src/services/vehicle.warmup');
  return [
    stubModule('../src/services/ai/aiClient', { aiChat: async payload => {
      capture.payload = payload; return { choices: [{ message: { content: MODEL_SAYS_FINE } }], model: 'test-model' };
    }}),
    stubModule('../src/services/vehicle.warmup', {
      resolveVehicleProfile: realWarmup.resolveVehicleProfile,
      waitForVehicleWarmup: async () => ({ status: 'READY' })
    }),
    stubModule('../src/services/vehicle.evidence', {
      collectVehicleEvidence: async () => ({ available: false, oem: { references: [] }, tsbs: { references: [] }, sources: [] }),
      selectRelevantTsbs: () => []
    }),
    stubModule('../src/services/pipeline.engine', { runDiagnosticPipeline: () => ({
      type: 'diagnostic_plan', steps: [], profile: null, vinBuildProfile: null, localSafetyTriggered: false,
      safetyNotes: '', matchedPatterns: [], assemblyData: null, confidence: { percentage: 30, rating: 'LOW' },
      symptomTelemetry: { hasMismatchedSignals: false, categories: {}, overlappingClassesCount: 0 }
    })}),
    stubModule('../src/knowledge/vehicle.risk.table', { getVehicleRiskProfile: () => null }),
    stubModule('../src/knowledge/failure.patterns', { findKnownPatterns: () => (patternHit ? [patternHit] : []) }),
    stubModule('../src/knowledge/procedure.data', { getLocalProcedure: () => null })
  ];
}

async function post(body, opts) {
  const capture = {}, restores = stubs(capture, opts), routePath = require.resolve('../src/routes/diagnose');
  delete require.cache[routePath];
  try {
    const router = require('../src/routes/diagnose'); let out;
    await withServer(router, async base => {
      const response = await fetch(`${base}/api/diagnose`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      out = { status: response.status, body: await response.json(), capture };
    });
    return out;
  } finally {
    delete require.cache[routePath]; restores.reverse().forEach(restore => restore());
  }
}

const base = (vehicleExtra = {}, bodyExtra = {}) => ({
  vin: 'SHORT', mileage: 90000,
  vehicle: { year: 2015, make: 'Honda', model: 'Civic', ...vehicleExtra },
  customerStates: ['squealing when braking'], mechanicNotices: [], dtcEvidence: [], ...bodyExtra
});

function packetFrom(capture) {
  const msg = capture.payload.messages[1].content;
  return JSON.parse(msg.split('\n').slice(1).join('\n'));
}

test('critical measurements: AI sees them and TAG overrides monitor model answer', { concurrency: false }, async () => {
  const { status, body, capture } = await post(base({
    componentData: { brakes: { padThicknessMm: 1.5 }, tires: { treadDepth32nds: 1.5 } }
  }));
  assert.equal(status, 200);
  const values = packetFrom(capture).measurements.values;
  assert.equal(values.brakes.padThickness, 1.5);
  assert.equal(values.tires.treadDepth, 1.5);
  const r = body.result;
  assert.equal(r.tagStatus, 'CHECKED'); assert.equal(r.urgency, 'immediate'); assert.equal(r.safetyRisk, true);
  assert.deepEqual(r.tagOverrides.map(o => `${o.component}.${o.metric}`).sort(), ['brakes.padThickness', 'tires.treadDepth']);
  assert.ok(r.tagOverrides.every(o => o.severity === 'CRITICAL' && o.requiredAction === 'MANDATORY_REPLACE'));
});

test('no measurements: NO_MEASUREMENTS and model answer untouched', { concurrency: false }, async () => {
  const { body, capture } = await post(base());
  assert.equal(body.result.tagStatus, 'NO_MEASUREMENTS'); assert.equal(body.result.urgency, 'monitor');
  assert.equal(body.result.safetyRisk, false); assert.equal(body.result.tagOverrides, undefined);
  assert.deepEqual(packetFrom(capture).measurements.values, {});
});

test('in-spec measurements: CHECKED with no overrides', { concurrency: false }, async () => {
  const { body } = await post(base({ componentData: { brakes: { padThicknessMm: 8 }, tires: { treadDepth32nds: 9 } } }));
  assert.equal(body.result.tagStatus, 'CHECKED'); assert.equal(body.result.urgency, 'monitor');
  assert.equal(body.result.tagOverrides, undefined);
});

test('componentData outside vehicle is ignored', { concurrency: false }, async () => {
  const { body } = await post(base({}, { componentData: { brakes: { padThicknessMm: 1.5 } } }));
  assert.equal(body.result.tagStatus, 'NO_MEASUREMENTS'); assert.equal(body.result.urgency, 'monitor');
});

test('local-pattern early return still gets TAG and never calls AI', { concurrency: false }, async () => {
  const { body, capture } = await post(
    base({ componentData: { tires: { treadDepth32nds: 1.5 } } }),
    { patternHit: { patternName: 'Known pattern', primaryCause: 'Known cause', likelihood: 90, linkProtocol: 'x' } }
  );
  assert.equal(capture.payload, undefined, 'AI must not run on a local-pattern hit');
  assert.equal(body.result.tagStatus, 'CHECKED'); assert.equal(body.result.tagOverrides[0].component, 'tires');
  assert.equal(body.result.safetyRisk, true);
});

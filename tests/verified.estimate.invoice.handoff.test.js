'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVerifiedCase } = require('../src/core/evidence/verified.case');
const { buildVerifiedRepairResolution } = require('../src/core/evidence/verified.repair.resolution');
const {
  buildVerifiedEstimateSnapshot,
  assertVerifiedEstimateSnapshot
} = require('../src/core/evidence/verified.estimate.snapshot');

function makeJob() {
  const vehicle = { year: 2016, make: 'Chevrolet', model: 'Malibu', engine: '2.5L', vin: '1G11A5SA0GF000001', mileage: 100000 };
  const evidencePacket = {
    schemaVersion: 1,
    stage: 'DIAGNOSE',
    vehicle,
    observations: { customer: ['rough idle'], mechanic: [], completedWork: [] },
    dtcs: ['P0301'],
    measurements: { trust: 'TRUSTED_PRE_TAG_INPUT', values: {} },
    deterministic: { vehicleProfile: { vehicleId: 'CHEVROLET_MALIBU_TEST' } },
    evidence: { oem: [], tsbs: [], sources: [], available: false },
    contradictions: []
  };
  const base = {
    jobId: 'SKSK-INVOICE-HANDOFF',
    status: 'VERIFIED',
    customer: { name: 'Jane Customer', phone: '555-0100', email: 'jane@example.com' },
    vehicle,
    diagnosis: {
      result: { primaryCause: 'Ignition coil failure', probability: [] },
      evidencePacket,
      revision: 1
    },
    tests: [{
      id: 'T1',
      name: 'coil swap',
      result: 'misfire moved',
      evidenceRole: 'CONFIRMS',
      confirmedFault: 'Ignition coil failure'
    }],
    verification: {
      confirmed: true,
      confirmedCause: 'Ignition coil failure',
      conclusion: 'Fault followed coil',
      evidenceTestIds: ['T1'],
      diagnosisRevision: 1,
      verifiedAt: '2026-08-15T00:00:00.000Z'
    },
    estimate: null,
    invoice: null
  };
  base.verifiedCase = buildVerifiedCase(base);
  const repairResolution = buildVerifiedRepairResolution({
    verifiedCase: base.verifiedCase,
    laborRate: 65,
    laborRateSource: 'MECHANIC_INPUT',
    laborHours: 1.5,
    parts: [{ partNumber: 'COIL-1', description: 'Ignition coil', quantity: 1, unitPrice: 80 }]
  });
  base.estimate = buildVerifiedEstimateSnapshot(base, {
    priority: 'medium',
    diagnosis: 'Verified fault: Ignition coil failure',
    estimatedHours: 1.5,
    laborCost: 97.5,
    partsCost: 80,
    total: 177.5,
    repairs: ['Repair verified fault: Ignition coil failure'],
    repairSteps: [],
    proTips: [],
    knownIssues: [],
    repairResolution
  });
  base.status = 'ESTIMATED';
  return base;
}


test.beforeEach(() => { global.__jobs = {}; });

test('canonical estimate snapshot binds VERIFIED_CASE and repair resolution fingerprints', () => {
  const job = makeJob();
  assert.equal(job.estimate.stage, 'ESTIMATED');
  assert.equal(job.estimate.verifiedCaseFingerprint, job.verifiedCase.fingerprint);
  assert.equal(job.estimate.repairResolutionFingerprint, job.estimate.repairResolution.fingerprint);
  assert.doesNotThrow(() => assertVerifiedEstimateSnapshot(job.estimate, job));
});


test('generic invoice authority lane stays deleted', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  assert.equal(fs.existsSync(path.join(__dirname, '../src/routes/invoice.js')), false);
  const serverSource = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
  assert.equal(serverSource.includes("app.use('/api/invoice'"), false);
  const lifecycleSource = fs.readFileSync(path.join(__dirname, '../src/services/job.lifecycle.js'), 'utf8');
  assert.equal(lifecycleSource.includes('attachInvoice'), false);
  assert.equal(lifecycleSource.includes('hydrateInvoiceInput'), false);
});

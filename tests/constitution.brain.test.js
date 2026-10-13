'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVerifiedCase, verifiedEstimateInput } = require('../src/core/evidence/verified.case');

function job() {
  return {
    jobId: 'CONSTITUTION-TEST', status: 'VERIFIED',
    vehicle: { year: 2018, make: 'Ford', model: 'F-150' },
    diagnosis: {
      revision: 1,
      result: { primaryCause: 'Ignition coil failure', probability: [{ cause: 'Ignition coil failure', likelihood: 65 }] },
      evidencePacket: {
        schemaVersion: 2, stage: 'DIAGNOSE',
        evidence: { tsbs: [{ bulletinNumber: 'FICTIONAL-1', evidenceType: 'TSB_CANDIDATE', tier: 'SUPPORTS' }] }
      }
    },
    tests: [{
      id: 'physical-test', name: 'Coil swap test', result: 'Misfire followed coil',
      evidenceRole: 'CONFIRMS', confirmedFault: 'Ignition coil failure'
    }],
    verification: {
      confirmed: true, confirmedCause: 'Ignition coil failure',
      conclusion: 'Observed misfire move with swapped coil',
      evidenceTestIds: ['physical-test'], diagnosisRevision: 1
    }
  };
}

test('SUPPORTS-tier TSB cannot substitute for a persisted CONFIRMS test', () => {
  const source = job();
  source.tests = [];
  source.verification.evidenceTestIds = ['FICTIONAL-1'];
  assert.throws(() => buildVerifiedCase(source), /recorded tests|persisted job tests/i);
});

test('TSB labeled CONFIRMS in a packet still cannot establish verification', () => {
  const source = job();
  source.diagnosis.evidencePacket.evidence.tsbs[0].tier = 'CONFIRMS';
  source.tests[0].evidenceRole = 'SUPPORTS';
  assert.throws(() => buildVerifiedCase(source), /classified CONFIRMS/i);
});

test('mechanic conclusion and asserted verification cannot replace selected evidence', () => {
  const source = job();
  source.verification.evidenceTestIds = [];
  assert.throws(() => buildVerifiedCase(source), /confirmation-grade test evidence/i);
});

test('repair or invoice success cannot substitute for vehicle-specific proof', () => {
  const source = job();
  source.repair = { completed: true, successful: true };
  source.invoice = { paid: true };
  source.tests[0].evidenceRole = 'NEUTRAL';
  assert.throws(() => buildVerifiedCase(source), /classified CONFIRMS/i);
});

test('confirmation must identify the same fault as the persisted selected test', () => {
  const source = job();
  source.tests[0].confirmedFault = 'Fuel injector failure';
  assert.throws(() => buildVerifiedCase(source), /same confirmed fault/i);
});

test('valid physical confirmation survives while TSB remains supporting context', () => {
  const verified = buildVerifiedCase(job());
  assert.equal(verified.stage, 'VERIFIED');
  assert.equal(verified.evidencePacket.evidence.tsbs[0].tier, 'SUPPORTS');
  assert.equal(verifiedEstimateInput(verified).diagnosisVerified, true);
});

test('evidence packet cannot be silently rewritten after verified snapshot', () => {
  const verified = JSON.parse(JSON.stringify(buildVerifiedCase(job())));
  verified.evidencePacket.evidence.tsbs[0].tier = 'CONFIRMS';
  assert.throws(() => verifiedEstimateInput(verified), /integrity check failed/i);
});

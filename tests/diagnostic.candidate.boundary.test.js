const test = require('node:test');
const assert = require('node:assert/strict');

const { extractJSON } = require('../src/routes/diagnose');
const {
  candidateFromResult,
  isValidDiagnosticCandidate,
  assertValidDiagnosticResult
} = require('../src/core/evidence/diagnostic.candidate');
const { buildUnverifiedDiagnosis } = require('../src/core/evidence/unverified.diagnosis');
const { buildVerifiedCase } = require('../src/core/evidence/verified.case');

test('Diagnose parser accepts braces and escaped quotes inside JSON strings', () => {
  const parsed = extractJSON('{"primaryCause":"Harness open near {splice} with \\"quoted\\" note","probability":[]}');
  assert.equal(parsed.primaryCause, 'Harness open near {splice} with "quoted" note');
});

test('Diagnose parser accepts fenced structured JSON fallback', () => {
  const parsed = extractJSON('  ```json\n{"primaryCause":"Knock sensor circuit fault","probability":[]}\n```  ');
  assert.equal(parsed.primaryCause, 'Knock sensor circuit fault');
});

test('Diagnose parser rejects malformed structured output', () => {
  assert.equal(extractJSON('{"primaryCause":"broken"'), null);
});

test('canonical diagnostic candidate rejects sentinel and generated failure states', () => {
  assert.equal(isValidDiagnosticCandidate('Manual inspection required'), false);
  assert.equal(isValidDiagnosticCandidate(''), false);
  assert.throws(() => assertValidDiagnosticResult({ primaryCause: 'Manual inspection required' }));
  assert.throws(() => assertValidDiagnosticResult({ primaryCause: 'Real fault', generationFailed: true }));
});

test('canonical diagnostic candidate may come from ranked probability when direct cause is absent', () => {
  const result = { probability: [{ cause: 'Lower candidate', likelihood: 20 }, { cause: 'Wheel bearing fault', likelihood: 80 }] };
  assert.equal(candidateFromResult(result), 'Wheel bearing fault');
  assert.equal(assertValidDiagnosticResult(result), 'Wheel bearing fault');
});

test('unverified diagnosis fails closed on persisted sentinel candidate', () => {
  const job = {
    jobId: 'SKSK-TEST',
    status: 'TESTING',
    intake: {},
    diagnosis: { result: { primaryCause: 'Manual inspection required', probability: [] } },
    tests: []
  };
  assert.throws(() => buildUnverifiedDiagnosis(job), /persisted diagnostic candidate/i);
});

test('VERIFIED_CASE fails closed on persisted sentinel even with confirmation-grade evidence', () => {
  const job = {
    jobId: 'SKSK-TEST',
    status: 'VERIFIED',
    vehicle: {},
    diagnosis: { result: { primaryCause: 'Manual inspection required', probability: [] }, revision: 1 },
    tests: [{
      id: 'T1',
      name: 'Circuit confirmation',
      result: 'Measured circuit failed applicable limit',
      evidenceRole: 'CONFIRMS',
      confirmedFault: 'Knock sensor circuit fault'
    }],
    verification: {
      confirmed: true,
      confirmedCause: 'Knock sensor circuit fault',
      conclusion: 'Physical circuit measurement isolated the fault.',
      evidenceTestIds: ['T1']
    }
  };
  assert.throws(() => buildVerifiedCase(job), /valid persisted diagnostic candidate/i);
});

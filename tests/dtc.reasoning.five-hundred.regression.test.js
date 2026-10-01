'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDtcReasoning, interpretDtc } = require('../src/core/evidence/dtc.reasoning');
const { buildDiagnosticEvidencePacket } = require('../src/core/evidence/diagnostic.evidence.packet');

const FIVE_HUNDRED_FIELD_INPUT = Object.freeze({
  vehicle: Object.freeze({ year: 2006, make: 'Ford', model: 'Five Hundred' }),
  dtcEvidence: Object.freeze([
    Object.freeze({ code: 'P0113', source: 'SCAN_TOOL', verified: true }),
    Object.freeze({ code: 'P0174', source: 'SCAN_TOOL', verified: true })
  ])
});

test('P0113 deterministic meaning never fabricates a bank assignment', () => {
  const item = interpretDtc('P0113');
  assert.equal(item.code, 'P0113');
  assert.equal(item.circuit, 'IAT');
  assert.equal(item.signal, 'HIGH_INPUT');
  assert.equal(item.scope, 'SENSOR_1');
  assert.equal(item.bank, null);
  assert.doesNotMatch(item.assertion, /bank\s*[12]/i);
});

test('Five Hundred field fixture preserves individual assertions before common-cause synthesis', () => {
  const reasoning = buildDtcReasoning(FIVE_HUNDRED_FIELD_INPUT.dtcEvidence.map(record => record.code));
  assert.deepEqual(reasoning.interpretations.map(item => item.code), ['P0113', 'P0174']);

  const iat = reasoning.interpretations.find(item => item.code === 'P0113');
  const lean = reasoning.interpretations.find(item => item.code === 'P0174');
  assert.equal(iat.bank, null);
  assert.equal(lean.bank, 2);
  assert.notEqual(iat.system, lean.system);

  assert.equal(reasoning.commonCauseCandidates.length, 1);
  assert.equal(reasoning.commonCauseCandidates[0].status, 'HYPOTHESIS_ONLY');
  assert.match(reasoning.commonCauseCandidates[0].rationale, /does not prove one common fault/i);
  assert.ok(reasoning.discriminatingTests.some(step => /IAT sensor 1 live data/i.test(step)));
  assert.ok(reasoning.discriminatingTests.some(step => /both banks fuel trims/i.test(step)));
});

test('evidence packet exposes reasoning only for provenance-trusted DTCs', () => {
  const packet = buildDiagnosticEvidencePacket({
    ...FIVE_HUNDRED_FIELD_INPUT,
    dtcEvidence: [
      ...FIVE_HUNDRED_FIELD_INPUT.dtcEvidence,
      { code: 'P0171', source: 'MANUAL_ENTRY', verified: false }
    ]
  });

  assert.deepEqual(packet.dtcs, ['P0113', 'P0174']);
  assert.deepEqual(packet.dtcReasoning.interpretations.map(item => item.code), ['P0113', 'P0174']);
  assert.equal(packet.dtcReasoning.interpretations.some(item => item.code === 'P0171'), false);
});

test('dual-bank lean codes cluster together but remain a hypothesis until tested', () => {
  const reasoning = buildDtcReasoning(['P0171', 'P0174']);
  const cluster = reasoning.clusters.find(item => item.id === 'FUEL_TRIM');
  assert.deepEqual(cluster.codes, ['P0171', 'P0174']);
  assert.deepEqual(cluster.bankScope, [1, 2]);
  assert.equal(cluster.commonCauseStatus, 'EVALUATE_SHARED_CAUSE');
  assert.equal(reasoning.commonCauseCandidates[0].status, 'HYPOTHESIS_ONLY');
});

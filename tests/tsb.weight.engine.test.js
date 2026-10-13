'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { fromTrustedCorpus, applyTsbWeights, scoreTsbForCandidate, MAX_BOOST } = require('../src/brain/tsb.weight.engine');
const vehicle = { year: 2008, make: 'Kia', model: 'Sorento' };
const candidate = { system: 'driveline', rawScore: 0.5, confidence: 0.7, possibleIssues: ['driveshaft failure'] };
const row = { bulletinNumber: 'TEST-001', subject: 'Driveline driveshaft failure' };
test('forged trusted issuer in plain reference has zero authority', () => {
  const forged = { ...row, retrievalScope: { issuer: 'nhtsa.tsb.corpus', ...vehicle } };
  const out = applyTsbWeights([candidate], vehicle, [forged]);
  assert.equal(out[0].tsbBoost, 0);
});
test('forged wrapper with copied vehicle fields has zero authority', () => {
  const forged = { reference: row, vehicle };
  assert.equal(applyTsbWeights([candidate], vehicle, [forged])[0].tsbBoost, 0);
});
test('trusted corpus references contribute bounded ranking only', () => {
  const refs = fromTrustedCorpus([row], vehicle);
  const out = applyTsbWeights([candidate], vehicle, refs)[0];
  assert.ok(out.tsbBoost > 0 && out.tsbBoost <= MAX_BOOST);
  assert.equal(out.confidence, candidate.confidence);
  assert.equal(out.tsbTier, 'SUPPORTS');
});
test('explicit contradictory bulletin scope defeats corpus retrieval', () => {
  const refs = fromTrustedCorpus([{ ...row, year: 2012 }], vehicle);
  assert.equal(refs.length, 0);
});
test('missing vehicle-specific equipment fails closed', () => {
  assert.equal(fromTrustedCorpus([{ ...row, engine: '3.8L' }], vehicle).length, 0);
});
test('different vehicle cannot reuse trusted scope', () => {
  const ref = fromTrustedCorpus([row], vehicle)[0];
  assert.equal(scoreTsbForCandidate(ref, candidate, { ...vehicle, year: 2009 }).raw, 0);
});
test('duplicate bulletin findings do not multiply boosts', () => {
  const one = applyTsbWeights([candidate], vehicle, fromTrustedCorpus([row], vehicle))[0].tsbBoost;
  const two = applyTsbWeights([candidate], vehicle, fromTrustedCorpus([row, row], vehicle))[0].tsbBoost;
  assert.equal(one, two);
});
test('irrelevant bulletin does not influence ranking', () => {
  const out = applyTsbWeights([candidate], vehicle, fromTrustedCorpus([{ bulletinNumber: 'X', subject: 'Cabin trim squeak' }], vehicle));
  assert.equal(out[0].tsbBoost, 0);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateTag, applyTagOverlay } = require('../src/core/orchestrator/tag.overlay');

test('no measurements is explicit and does not invent a safety result', async () => {
  const tag = await evaluateTag({ vin: 'X', componentData: {} }, 'grinding noise');
  assert.equal(tag.status, 'NO_MEASUREMENTS');
  assert.deepEqual(tag.overrides, []);
  const out = applyTagOverlay({ urgency: 'monitor', safetyRisk: false, notes: 'n' }, tag);
  assert.equal(out.urgency, 'monitor');
  assert.equal(out.safetyRisk, false);
  assert.equal(out.tagStatus, 'NO_MEASUREMENTS');
  assert.equal(out.tagOverrides, undefined);
});

test('critical pad thickness forces safety risk and immediate urgency', async () => {
  const tag = await evaluateTag({ componentData: { brakes: { padThicknessMm: 1.5 } } }, 'squeal');
  assert.equal(tag.status, 'CHECKED');
  const out = applyTagOverlay({ urgency: 'monitor', safetyRisk: false, notes: '' }, tag);
  assert.equal(out.safetyRisk, true);
  assert.equal(out.urgency, 'immediate');
  assert.equal(out.tagOverrides[0].component, 'brakes');
  assert.equal(out.tagOverrides[0].metric, 'padThickness');
  assert.equal(out.tagOverrides[0].requiredAction, 'MANDATORY_REPLACE');
  assert.match(out.notes, /TAG safety rule/);
});

test('high severity raises monitor to soon without forcing safetyRisk', async () => {
  const tag = await evaluateTag({ componentData: { brakes: { brakeFluidAgeMonths: 30 } } }, '');
  const out = applyTagOverlay({ urgency: 'monitor', safetyRisk: false }, tag);
  assert.equal(out.urgency, 'soon');
  assert.equal(out.safetyRisk, false);
});

test('overlay never lowers a more urgent diagnosis', async () => {
  const tag = await evaluateTag({ componentData: { brakes: { brakeFluidAgeMonths: 30 } } }, '');
  const out = applyTagOverlay({ urgency: 'immediate', safetyRisk: true }, tag);
  assert.equal(out.urgency, 'immediate');
  assert.equal(out.safetyRisk, true);
});

test('in-spec measurements are checked without creating overrides', async () => {
  const tag = await evaluateTag({ componentData: { brakes: { padThicknessMm: 8 } } }, '');
  assert.equal(tag.status, 'CHECKED');
  assert.deepEqual(tag.overrides, []);
});

test('safety-layer failure is visible instead of silently swallowed', () => {
  const out = applyTagOverlay({ urgency: 'soon' }, { status: 'ERROR', overrides: [], error: 'boom' });
  assert.equal(out.tagStatus, 'ERROR');
  assert.equal(out.tagError, 'boom');
});

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


test('tire treadDepth32nds alias reaches the canonical TAG treadDepth rule', async () => {
  const tag = await evaluateTag({ componentData: { tires: { treadDepth32nds: 1.5 } } }, 'tire inspection');
  assert.equal(tag.status, 'CHECKED');
  assert.equal(tag.overrides.length, 1);
  assert.equal(tag.overrides[0].component, 'tires');
  assert.equal(tag.overrides[0].metric, 'treadDepth');
  assert.equal(tag.overrides[0].severity, 'CRITICAL');
});


test('tagOverrides carry structured unit/comparison/limit for the UI', async () => {
  const tag = await evaluateTag({ componentData: { tires: { treadDepth32nds: 1.5 } } }, '');
  const o = applyTagOverlay({ urgency: 'monitor' }, tag).tagOverrides[0];
  assert.equal(o.unit, '32nds');
  assert.equal(o.comparison, 'below_minimum');
  assert.equal(o.limit, 2);
  assert.equal(o.requiredAction, 'MANDATORY_REPLACE');
});

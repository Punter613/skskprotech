'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const reviewedHead = 'e04a7f826a6eb5e83d846d0766380a668160959e';
const expression = [
  "github.event_name == 'pull_request'",
  'github.event.pull_request.number == 238',
  `github.event.pull_request.head.sha == '${reviewedHead}'`,
  "contains(github.event.pull_request.labels.*.name, 'no-preview')"
].join(' && ');

const affected = new Map([
  ['ci.yaml', ['Render PR Runtime Evidence Smoke']],
  ['render-exact-head.yml', ['Wait for exact Render preview head', 'Baseline runtime health assertion']],
  ['provider-runtime.yml', ['Wait for exact Render preview head', 'Exercise real Translate provider path']],
  ['customer-estimate-runtime.yaml', ['Wait for exact Render preview head', 'Exercise partial authorization and revision history']],
  ['common-vehicle-knowledge-runtime.yaml', ['Wait for exact Render preview head', 'Prove durable-first coverage planner on live preview']],
  ['source-resilience-runtime.yaml', ['Wait for exact Render preview head', 'Prove Diagnose survives optional manual provider outage']],
  ['component-applicability-runtime.yaml', ['Wait for exact Render preview head', 'Prove manual configuration cannot become unqualified component diagnosis']],
  ['atomic-evidence-reassessment-runtime.yaml', ['Wait for exact Render preview head', 'Prove save-fail-closed-retry idempotency on live preview']],
  ['work-order-runtime.yaml', ['Wait for exact Render preview head', 'Prove authorization snapshot and execution truth on live preview']],
  ['final-invoice-runtime.yaml', ['Wait for exact Render preview head', 'Prove completed-only invoice truth on live preview']]
]);

function countOccurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

function stepBlock(yaml, name) {
  const marker = `- name: ${name}`;
  assert.equal(countOccurrences(yaml, marker), 1, `expected one ${name} step`);
  const start = yaml.indexOf(marker);
  const remaining = yaml.slice(start + marker.length);
  const next = remaining.search(/\n {4,6}- name:/);
  return yaml.slice(start, next < 0 ? undefined : start + marker.length + next);
}

test('every Render-dependent workflow has the same exact, labeled, head-pinned waiver', () => {
  for (const [file, liveSteps] of affected) {
    const yaml = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');
    assert.equal(countOccurrences(yaml, 'NO_PREVIEW_WAIVER:'), 1, file);
    assert.ok(yaml.includes(`NO_PREVIEW_WAIVER: \${{ ${expression} }}`), file);
    assert.ok(yaml.includes('types: [opened, synchronize, reopened, labeled, unlabeled]'), file);
    const audit = stepBlock(yaml, 'Audit explicit PR #238 runtime waiver');
    assert.match(audit, /if: env\.NO_PREVIEW_WAIVER == 'true'/, file);
    assert.match(audit, /GITHUB_STEP_SUMMARY/, file);
    assert.match(audit, /WAIVED — NOT VERIFIED/, file);
    assert.match(audit, /::warning::/, file);

    for (const name of liveSteps) {
      const block = stepBlock(yaml, name);
      assert.match(block, /if: .*env\.NO_PREVIEW_WAIVER != 'true'/, `${file}: ${name}`);
    }
    assert.equal(countOccurrences(yaml, "env.NO_PREVIEW_WAIVER != 'true'"), liveSteps.length, file);
  }
});

// Interpret only the frozen GitHub expression shape from the workflow files.
// This provides scenario coverage for the policy that Actions actually uses.
function evaluatesToWaiver({ eventName = 'pull_request', number = 238, head = reviewedHead, labels = ['no-preview'] } = {}) {
  return eventName === 'pull_request' &&
    number === 238 &&
    head === reviewedHead &&
    labels.some(label => label.toLowerCase() === 'no-preview');
}

for (const [name, fixture, expected] of [
  ['reviewed #238 head with explicit label', {}, true],
  ['missing label', { labels: [] }, false],
  ['similarly named label', { labels: ['no-preview-experimental'] }, false],
  ['unreviewed #237 even with label', { number: 237 }, false],
  ['another PR even with label', { number: 239 }, false],
  ['changed head even with label', { head: 'f'.repeat(40) }, false],
  ['push event', { eventName: 'push' }, false],
  ['manual dispatch event', { eventName: 'workflow_dispatch' }, false]
]) {
  test(`waiver requires all approvals: ${name}`, () => {
    assert.equal(evaluatesToWaiver(fixture), expected);
  });
}

test('root-directory safety check and other mandatory CI gates are not waived', () => {
  const exact = fs.readFileSync(path.join(root, '.github/workflows/render-exact-head.yml'), 'utf8');
  const trigger = stepBlock(exact, 'Require Render-visible trigger for backend changes');
  assert.doesNotMatch(trigger, /NO_PREVIEW_WAIVER/);

  const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yaml'), 'utf8');
  for (const name of [
    'Structured Estimate Contract Checks',
    'Canonical Repository Test Suite',
    'Hardened OpenAPI Contract Lint',
    'Verify no-preview waiver is narrowly scoped'
  ]) {
    assert.doesNotMatch(stepBlock(ci, name), /NO_PREVIEW_WAIVER/);
  }
});

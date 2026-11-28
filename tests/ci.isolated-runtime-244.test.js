'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');
const pinnedVariable = 'SKSK_ISOLATED_244_HEAD_SHA';
const dedicatedSecret = 'SKSK_ISOLATED_244_API_KEY';
const isolatedService = 'p613-backend-pr-244';
const expectedEligibility = [
  "github.event_name == 'pull_request'",
  'github.event.pull_request.number == 244',
  "github.event.pull_request.base.ref == 'main'",
  "github.event.pull_request.head.ref == 'ci/isolated-runtime-target-240-review'",
  'github.event.pull_request.head.sha == vars.' + pinnedVariable,
  "vars." + pinnedVariable + " != ''"
].join(' && ');

const workflows = new Map([
  ['ci.yaml', 'Render PR Runtime Evidence Smoke'],
  ['render-exact-head.yml', 'Baseline runtime health assertion'],
  ['provider-runtime.yml', 'Exercise real Translate provider path'],
  ['customer-estimate-runtime.yaml', 'Exercise partial authorization and revision history'],
  ['common-vehicle-knowledge-runtime.yaml', 'Prove durable-first coverage planner on live preview'],
  ['source-resilience-runtime.yaml', 'Prove Diagnose survives optional manual provider outage'],
  ['component-applicability-runtime.yaml', 'Prove manual configuration cannot become unqualified component diagnosis'],
  ['atomic-evidence-reassessment-runtime.yaml', 'Prove save-fail-closed-retry idempotency on live preview'],
  ['dtc-provenance-runtime.yaml', 'Prove mixed DTC provenance on real Diagnose route'],
  ['work-order-runtime.yaml', 'Prove authorization snapshot and execution truth on live preview'],
  ['final-invoice-runtime.yaml', 'Prove completed-only invoice truth on live preview']
]);

function occurrences(source, text) {
  return source.split(text).length - 1;
}

function stepText(source, name, isCi) {
  const indent = isCi ? '    ' : '      ';
  const quoted = indent + '- name: "' + name + '"';
  const plain = indent + '- name: ' + name;
  const startLine = source.includes(quoted) ? quoted : plain;
  const start = source.indexOf(startLine);
  assert.notEqual(start, -1, 'missing step ' + name);
  const next = source.indexOf('\n' + indent + '- name:', start + startLine.length);
  return source.slice(start, next < 0 ? undefined : next);
}

test('all eleven gates use only the externally pinned #244 bootstrap credential', () => {
  const triggers = fs.readdirSync(workflowsDir).filter(file => {
    const source = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    return source.includes("'api/.render-preview-trigger'");
  });
  assert.deepEqual(triggers.filter(file => !workflows.has(file)), []);

  for (const [file, firstLiveStep] of workflows) {
    const source = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    const isCi = file === 'ci.yaml';
    assert.equal(occurrences(source, 'ISOLATED_RUNTIME_244:'), 1, file);
    assert.ok(source.includes('ISOLATED_RUNTIME_244: $' + '{{ ' + expectedEligibility + ' }}'), file);
    assert.equal(occurrences(source, 'NO_PREVIEW_WAIVER_244:'), 0, file);
    assert.equal(occurrences(source, 'ISOLATED_RUNTIME_240:'), 1, file);
    assert.ok(source.includes('https://p613-backend-pr-{0}.onrender.com'), file);

    const selected = stepText(source, 'Select pinned PR #244 isolated bootstrap credential', isCi);
    const identity = stepText(source, 'Verify PR #244 isolated test service identity', isCi);
    const live = stepText(source, firstLiveStep, isCi);
    const audit = stepText(source, 'Audit PR #244 pinned bootstrap runtime success', isCi);
    assert.ok(source.indexOf(selected) < source.indexOf(identity), file);
    assert.ok(source.indexOf(identity) < source.indexOf(live), file);
    assert.ok(source.indexOf(audit) > source.indexOf(live), file);

    assert.match(selected, /if: env\.ISOLATED_RUNTIME_244 == 'true'/, file);
    assert.ok(selected.includes('secrets.' + dedicatedSecret), file);
    assert.match(selected, /if \[ -z "\$ISOLATED_244_API_KEY" \]/, file);
    assert.match(selected, /SKSK_PREVIEW_API_KEY=\$ISOLATED_244_API_KEY/, file);
    assert.doesNotMatch(selected, /secrets\.SKSK_PREVIEW_API_KEY/, file);
    assert.match(selected, /NOT YET VERIFIED/, file);

    assert.match(identity, /health\?\.ok !== true/, file);
    assert.match(identity, /health\?\.preview\?\.commit !== process\.env\.HEAD_SHA/, file);
    assert.ok(identity.includes("health?.preview?.service !== '" + isolatedService + "'"), file);
    assert.match(audit, /env\.ISOLATED_RUNTIME_244 == 'true' && success\(\)/, file);
    assert.match(audit, /RUNTIME VERIFIED AGAINST ISOLATED TEST SERVICE/, file);
    assert.match(audit, /GITHUB_STEP_SUMMARY/, file);
    assert.match(audit, /GITHUB_RUN_ID/, file);
    assert.match(audit, /no waiver was used/, file);
  }
});

function selects244({ eventName = 'pull_request', number = 244, base = 'main',
  branch = 'ci/isolated-runtime-target-240-review', head = 'a'.repeat(40),
  pin = 'a'.repeat(40) } = {}) {
  return eventName === 'pull_request' && number === 244 && base === 'main' &&
    branch === 'ci/isolated-runtime-target-240-review' && head === pin && pin !== '';
}

for (const [name, input, expected] of [
  ['reviewed head and exact PR', {}, true],
  ['pin absent', { pin: '' }, false],
  ['head advanced', { head: 'b'.repeat(40) }, false],
  ['another PR', { number: 240 }, false],
  ['wrong base', { base: 'develop' }, false],
  ['lookalike branch', { branch: 'ci/isolated-runtime-target-240-review-extra' }, false],
  ['push event', { eventName: 'push' }, false]
]) {
  test('bootstrap targeting fails closed: ' + name, () => {
    assert.equal(selects244(input), expected);
  });
}

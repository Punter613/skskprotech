'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '.github', 'workflows');
const pinnedHead = '5a5cf160a3be1adbb236b5860228b58d77cceed7';
const isolatedHost = 'https://p613-isolated-pr-240.onrender.com';
const expectedGate = [
  "github.event_name == 'pull_request'",
  'github.event.pull_request.number == 240',
  "github.event.pull_request.head.sha == '" + pinnedHead + "'",
  "contains(github.event.pull_request.labels.*.name, 'isolated-runtime-test')"
].join(' && ');
const expectedFlag = 'ISOLATED_RUNTIME_240: $' + '{{ ' + expectedGate + ' }}';
const expectedUrl = 'PREVIEW_URL: $' + '{{ ' + expectedGate +
  " && '" + isolatedHost + "' || format('https://p613-backend-pr-{0}.onrender.com', github.event.pull_request.number) }}";

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

function occurrences(source, value) {
  return source.split(value).length - 1;
}

function stepText(source, name, isCi) {
  const indent = isCi ? '    ' : '      ';
  const quoted = indent + '- name: "' + name + '"';
  const plain = indent + '- name: ' + name;
  const start = source.indexOf(quoted) >= 0 ? source.indexOf(quoted) : source.indexOf(plain);
  assert.notEqual(start, -1, 'missing step: ' + name);
  const next = source.indexOf('\n' + indent + '- name:', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test('all eleven workflows use one labeled, exact-head-only isolated target and retain normal default routing', () => {
  const previewTriggerWorkflows = fs.readdirSync(root).filter(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    return source.includes("'api/.render-preview-trigger'");
  });
  assert.deepEqual(
    previewTriggerWorkflows.filter(file => !workflows.has(file)),
    [],
    'every workflow triggered by the Render preview marker must support the isolated target'
  );

  for (const [file, nextLiveStep] of workflows) {
    const yaml = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(occurrences(yaml, 'ISOLATED_RUNTIME_240:'), 1, file);
    assert.equal(occurrences(yaml, 'PREVIEW_URL:'), 1, file);
    assert.ok(yaml.includes(expectedFlag), file + ': eligibility gate differs');
    assert.ok(yaml.includes(expectedUrl), file + ': URL does not use identical gate');
    assert.ok(yaml.includes("types: [opened, synchronize, reopened, labeled, unlabeled]"), file);
    assert.equal(occurrences(yaml, 'NO_PREVIEW_WAIVER_240:'), 0, file);

    const isCi = file === 'ci.yaml';
    const selected = stepText(yaml, 'Select exact-head PR #240 isolated runtime target', isCi);
    const identity = stepText(yaml, 'Verify PR #240 isolated service identity', isCi);
    assert.ok(yaml.indexOf(selected) < yaml.indexOf(identity), file + ': credential selection must come first');
    assert.ok(yaml.indexOf(identity) < yaml.indexOf(stepText(yaml, nextLiveStep, isCi)), file + ': identity must precede live assertions');
    assert.match(selected, /if: env\.ISOLATED_RUNTIME_240 == 'true'/, file);
    assert.match(selected, /secrets\.SKSK_ISOLATED_240_API_KEY/, file);
    assert.match(selected, /if \[ -z "\$ISOLATED_240_API_KEY" \]/, file);
    assert.match(selected, /SKSK_PREVIEW_API_KEY=\$ISOLATED_240_API_KEY/, file);
    assert.doesNotMatch(selected, /secrets\.SKSK_PREVIEW_API_KEY/, file);
    assert.match(selected, /NOT YET VERIFIED/, file);
    assert.match(identity, /health\?\.ok !== true/, file);
    assert.match(identity, /health\?\.preview\?\.commit !== process\.env\.HEAD_SHA/, file);
    assert.match(identity, /health\?\.preview\?\.service !== 'p613-isolated-pr-240'/, file);

    const auditName = isCi
      ? 'Audit PR #240 isolated route runtime success'
      : 'Audit PR #240 isolated test runtime success';
    const audit = stepText(yaml, auditName, isCi);
    assert.ok(yaml.indexOf(audit) > yaml.indexOf(stepText(yaml, nextLiveStep, isCi)), file + ': audit too early');
    assert.match(audit, /env\.ISOLATED_RUNTIME_240 == 'true' && success\(\)/, file);
    assert.match(audit, /RUNTIME VERIFIED AGAINST ISOLATED TEST SERVICE/, file);
    assert.match(audit, /GITHUB_STEP_SUMMARY/, file);
    assert.match(audit, /GITHUB_RUN_ID/, file);
    assert.match(audit, /no runtime waiver was used|No preview-dependent check was waived/, file);
  }
});

function selectedTarget({ eventName = 'pull_request', number = 240, head = pinnedHead, labels = ['isolated-runtime-test'] } = {}) {
  const enabled = eventName === 'pull_request' && number === 240 && head === pinnedHead &&
    labels.includes('isolated-runtime-test');
  return enabled ? isolatedHost : 'https://p613-backend-pr-' + number + '.onrender.com';
}

for (const [name, fixture, expected] of [
  ['exact head with explicit isolated-runtime label', {}, isolatedHost],
  ['missing explicit label', { labels: [] }, 'https://p613-backend-pr-240.onrender.com'],
  ['lookalike label', { labels: ['isolated-runtime-testing'] }, 'https://p613-backend-pr-240.onrender.com'],
  ['changed head', { head: 'f'.repeat(40) }, 'https://p613-backend-pr-240.onrender.com'],
  ['another PR', { number: 241 }, 'https://p613-backend-pr-241.onrender.com'],
  ['push event', { eventName: 'push' }, 'https://p613-backend-pr-240.onrender.com']
]) {
  test('isolated runtime targeting fails closed: ' + name, () => {
    assert.equal(selectedTarget(fixture), expected);
  });
}

test('integration pipeline verifies the removed OEM route and preserved knowledge-builder on real HTTP', () => {
  const yaml = fs.readFileSync(path.join(root, 'ci.yaml'), 'utf8');
  const check = stepText(yaml, 'Verify PR #240 OEM route retirement on isolated runtime', true);
  assert.match(check, /if: env\.ISOLATED_RUNTIME_240 == 'true'/);
  assert.match(check, /api\/oem-data\/1HGCM82633A004352\/oil-change/);
  assert.match(check, /REMOVED_STATUS" != "404"/);
  assert.match(check, /api\/knowledge-builder\/catalog/);
  assert.match(check, /CATALOG_STATUS" != "200"/);
  assert.match(check, /catalog\.success !== true/);
});

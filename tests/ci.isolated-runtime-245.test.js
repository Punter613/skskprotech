'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '.github', 'workflows');
const pinVariable = 'SKSK_ISOLATED_245_HEAD_SHA';
const keySecret = 'SKSK_ISOLATED_245_API_KEY';
const serviceName = 'p613-backend-pr-245';
const eligible = [
  "github.event_name == 'pull_request'",
  'github.event.pull_request.number == 245',
  "github.event.pull_request.base.ref == 'main'",
  "github.event.pull_request.head.ref == 'ci/isolated-runtime-target-241-243'",
  `github.event.pull_request.head.sha == vars.${pinVariable}`,
  `vars.${pinVariable} != ''`
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

function stepText(source, name, isCi) {
  const prefix = isCi ? '    ' : '      ';
  const quoted = prefix + '- name: "' + name + '"';
  const plain = prefix + '- name: ' + name;
  const startLine = source.includes(quoted) ? quoted : plain;
  const start = source.indexOf(startLine);
  assert.notEqual(start, -1, 'missing step ' + name);
  const next = source.indexOf('\n' + prefix + '- name:', start + startLine.length);
  return source.slice(start, next < 0 ? undefined : next);
}

function normalizeStep(source, isCi) {
  const prefix = ' '.repeat(isCi ? 4 : 6);
  return source.split('\n').map(line => line.startsWith(prefix) ? line.slice(prefix.length) : line).join('\n').trimEnd();
}

test('the #245 policy candidate bootstrap is identical and fail-closed in all eleven runtime workflows', () => {
  const baseline = new Map();
  for (const [file, firstLiveStep] of workflows) {
    const yaml = fs.readFileSync(path.join(root, file), 'utf8');
    const isCi = file === 'ci.yaml';
    assert.equal(yaml.split('ISOLATED_RUNTIME_245:').length - 1, 1, file);
    assert.ok(yaml.includes(`ISOLATED_RUNTIME_245: \${{ ${eligible} }}`), file);
    assert.equal(yaml.split('NO_PREVIEW_WAIVER_245:').length - 1, 0, file);
    assert.ok(yaml.includes("format('https://p613-backend-pr-{0}.onrender.com', github.event.pull_request.number)"), file);

    const selected = stepText(yaml, 'Select pinned PR #245 isolated policy bootstrap credential', isCi);
    const identity = stepText(yaml, 'Verify PR #245 isolated policy bootstrap identity', isCi);
    const audit = stepText(yaml, 'Audit PR #245 isolated policy bootstrap runtime success', isCi);
    const live = stepText(yaml, firstLiveStep, isCi);
    assert.ok(yaml.indexOf(selected) < yaml.indexOf(identity), file);
    assert.ok(yaml.indexOf(identity) < yaml.indexOf(live), file);
    assert.ok(yaml.indexOf(audit) > yaml.indexOf(live), file);
    for (const [kind, content] of [['select', selected], ['identity', identity], ['audit', audit]]) {
      const normalized = normalizeStep(content, isCi);
      if (!baseline.has(kind)) baseline.set(kind, normalized);
      assert.equal(normalized, baseline.get(kind), `${file}: ${kind} drift`);
    }

    assert.match(selected, /if: env\.ISOLATED_RUNTIME_245 == 'true'/, file);
    assert.ok(selected.includes('secrets.' + keySecret), file);
    assert.match(selected, /if \[ -z "\$ISOLATED_245_API_KEY" \]/, file);
    assert.match(selected, /refusing shared preview-key fallback/, file);
    assert.match(selected, /SKSK_PREVIEW_API_KEY=%s/, file);
    assert.match(selected, /GITHUB_ENV/, file);
    assert.match(selected, /NOT YET VERIFIED/, file);
    assert.doesNotMatch(selected, /secrets\.SKSK_PREVIEW_API_KEY/, file);
    assert.match(identity, /health\?\.ok !== true/, file);
    assert.match(identity, /health\?\.preview\?\.commit !== process\.env\.HEAD_SHA/, file);
    assert.ok(identity.includes(`health?.preview?.service !== '${serviceName}'`), file);
    assert.match(audit, /env\.ISOLATED_RUNTIME_245 == 'true' && success\(\)/, file);
    assert.match(audit, /RUNTIME VERIFIED AGAINST ISOLATED TEST SERVICE/, file);
    assert.match(audit, /no runtime waiver was used/, file);
    assert.match(audit, /GITHUB_RUN_ID/, file);
  }
});

test('the integration workflow forces real runtime canaries for a policy-only #245 change', () => {
  const ci = fs.readFileSync(path.join(root, 'ci.yaml'), 'utf8');
  const bootstrap = ci.indexOf('if [ "$ISOLATED_RUNTIME_245" = \'true\' ]; then');
  const earlyExit = ci.indexOf('No affected runtime canary lane; Render preview smoke skipped.');
  assert.ok(bootstrap >= 0 && bootstrap < earlyExit);
  assert.match(ci.slice(bootstrap, earlyExit), /EVIDENCE_CHANGED=1/);
  assert.match(ci.slice(bootstrap, earlyExit), /UNVERIFIED_CHANGED=1/);
  assert.match(ci.slice(bootstrap, earlyExit), /TEST_EVIDENCE_CHANGED=1/);
});

function selects245({ event = 'pull_request', pr = 245, base = 'main',
  branch = 'ci/isolated-runtime-target-241-243', head = 'a'.repeat(40),
  pin = 'a'.repeat(40) } = {}) {
  return event === 'pull_request' && pr === 245 && base === 'main' &&
    branch === 'ci/isolated-runtime-target-241-243' && pin !== '' && head === pin;
}

for (const [name, changes, expected] of [
  ['valid exact policy commit', {}, true],
  ['missing pin', { pin: '' }, false],
  ['changed head', { head: 'b'.repeat(40) }, false],
  ['wrong PR', { pr: 241 }, false],
  ['wrong base', { base: 'develop' }, false],
  ['lookalike source branch', { branch: 'ci/isolated-runtime-target-241-243-old' }, false],
  ['push event', { event: 'push' }, false]
]) {
  test(`#245 bootstrap fails closed: ${name}`, () => {
    assert.equal(selects245(changes), expected);
  });
}

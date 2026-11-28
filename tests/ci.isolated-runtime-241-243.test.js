'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '.github', 'workflows');
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

const targets = [
  { pr: 241, branch: 'fix/job-revision-guard', service: 'p613-isolated-pr-241' },
  { pr: 243, branch: 'fix/job-shop-scope-empty', service: 'p613-isolated-pr-243' },
  { pr: 246, branch: 'fix/retire-stripe-procurement', service: 'p613-isolated-pr-246' },
  { pr: 233, branch: 'chore/remove-orphaned-ai-worker-bull', service: 'p613-isolated-pr-233' },
  { pr: 247, branch: 'ci/required-gates-always-trigger', service: 'p613-isolated-pr-247' }
];

function eligibility({ pr, branch }) {
  return [
    "github.event_name == 'pull_request'",
    `github.event.pull_request.number == ${pr}`,
    "github.event.pull_request.base.ref == 'main'",
    `github.event.pull_request.head.ref == '${branch}'`,
    `github.event.pull_request.head.sha == vars.SKSK_ISOLATED_${pr}_HEAD_SHA`,
    `vars.SKSK_ISOLATED_${pr}_HEAD_SHA != ''`,
    "contains(github.event.pull_request.labels.*.name, 'isolated-runtime-test')"
  ].join(' && ');
}

function occurrences(source, value) {
  return source.split(value).length - 1;
}

function step(source, name, isCi) {
  const indent = isCi ? '    ' : '      ';
  const quoted = indent + '- name: "' + name + '"';
  const plain = indent + '- name: ' + name;
  const startLine = source.includes(quoted) ? quoted : plain;
  const start = source.indexOf(startLine);
  assert.notEqual(start, -1, `missing ${name}`);
  const next = source.indexOf('\n' + indent + '- name:', start + startLine.length);
  return source.slice(start, next < 0 ? undefined : next);
}

function normalizeStep(source, isCi) {
  const spaces = isCi ? 4 : 6;
  return source.split('\n').map(line => line.startsWith(' '.repeat(spaces)) ? line.slice(spaces) : line).join('\n').trimEnd();
}

test('all eleven workflows select the five exact-head test-only targets without a waiver', () => {
  const triggerFiles = fs.readdirSync(root).filter(file =>
    fs.readFileSync(path.join(root, file), 'utf8').includes("'api/.render-preview-trigger'"));
  assert.deepEqual(triggerFiles.filter(file => !workflows.has(file)), []);

  const baseline = new Map();
  for (const [file, firstLiveStep] of workflows) {
    const yaml = fs.readFileSync(path.join(root, file), 'utf8');
    const isCi = file === 'ci.yaml';
    assert.equal(occurrences(yaml, 'PREVIEW_URL:'), 1, file);
    assert.ok(yaml.includes("types: [opened, synchronize, reopened, labeled, unlabeled]"), file);
    assert.ok(yaml.includes("format('https://p613-backend-pr-{0}.onrender.com', github.event.pull_request.number)"), file);
    assert.equal(occurrences(yaml, 'NO_PREVIEW_WAIVER_241:'), 0, file);
    assert.equal(occurrences(yaml, 'NO_PREVIEW_WAIVER_243:'), 0, file);
    assert.equal(occurrences(yaml, 'NO_PREVIEW_WAIVER_246:'), 0, file);

    for (const target of targets) {
      assert.equal(occurrences(yaml, `NO_PREVIEW_WAIVER_${target.pr}:`), 0, file);
      assert.equal(occurrences(yaml, `ISOLATED_RUNTIME_${target.pr}:`), 1, file);
      assert.ok(yaml.includes(`ISOLATED_RUNTIME_${target.pr}: \${{ ${eligibility(target)} }}`), file);
      assert.ok(yaml.includes(`${eligibility(target)} && 'https://${target.service}.onrender.com'`), file);
    }

    for (const pr of [246, 233, 247]) {
    const guard = step(yaml, `Reject unpinned PR ${pr} runtime target`, isCi);
    assert.ok(guard.includes(`github.event.pull_request.number == ${pr} && env.ISOLATED_RUNTIME_${pr} != 'true'`), file);
    assert.ok(guard.includes('exit 1'), file);
    assert.ok(yaml.indexOf(guard) < yaml.indexOf('Select pinned PR #241/#243/#246/#233/#247 isolated runtime credential'), file);
    }
    const selected = step(yaml, 'Select pinned PR #241/#243/#246/#233/#247 isolated runtime credential', isCi);
    const identity = step(yaml, 'Verify PR #241/#243/#246/#233/#247 isolated service identity', isCi);
    const audit = step(yaml, 'Audit PR #241/#243/#246/#233/#247 isolated runtime success', isCi);
    const live = step(yaml, firstLiveStep, isCi);
    assert.ok(yaml.indexOf(selected) < yaml.indexOf(identity), file);
    assert.ok(yaml.indexOf(identity) < yaml.indexOf(live), file);
    assert.ok(yaml.indexOf(audit) > yaml.indexOf(live), file);

    for (const [kind, value] of [['select', selected], ['identity', identity], ['audit', audit]]) {
      const normalized = normalizeStep(value, isCi);
      if (!baseline.has(kind)) baseline.set(kind, normalized);
      assert.equal(normalized, baseline.get(kind), `${file}: ${kind} policy drift`);
    }

    assert.match(selected, /case "\$\{ISOLATED_RUNTIME_241\}:\$\{ISOLATED_RUNTIME_243\}:\$\{ISOLATED_RUNTIME_246\}:\$\{ISOLATED_RUNTIME_233\}:\$\{ISOLATED_RUNTIME_247\}" in/, file);
    assert.match(selected, /true:false:false:false:false\) TEST_KEY="\$ISOLATED_241_API_KEY"/, file);
    assert.match(selected, /false:true:false:false:false\) TEST_KEY="\$ISOLATED_243_API_KEY"/, file);
    assert.match(selected, /false:false:true:false:false\) TEST_KEY="\$ISOLATED_246_API_KEY"/, file);
    assert.match(selected, /false:false:false:true:false\) TEST_KEY="\$ISOLATED_233_API_KEY"/, file);
    assert.match(selected, /false:false:false:false:true\) TEST_KEY="\$ISOLATED_247_API_KEY"/, file);
    assert.match(selected, /refusing shared preview-key fallback/, file);
    assert.match(selected, /if \[ -z "\$TEST_KEY" \]/, file);
    assert.match(selected, /SKSK_PREVIEW_API_KEY=%s/, file);
    assert.match(selected, /GITHUB_ENV/, file);
    assert.match(selected, /NOT YET VERIFIED/, file);
    assert.doesNotMatch(selected, /secrets\.SKSK_PREVIEW_API_KEY/, file);
    for (const target of targets) {
      assert.ok(selected.includes(`secrets.SKSK_ISOLATED_${target.pr}_API_KEY`), file);
      assert.ok(identity.includes(target.service), file);
    }
    assert.match(identity, /health\?\.ok !== true/, file);
    assert.match(identity, /health\?\.preview\?\.commit !== process\.env\.HEAD_SHA/, file);
    assert.match(identity, /health\?\.preview\?\.service !== service/, file);
    assert.match(audit, /success\(\)/, file);
    assert.match(audit, /RUNTIME VERIFIED AGAINST ISOLATED TEST SERVICE/, file);
    assert.match(audit, /no runtime waiver was used/, file);
    assert.match(audit, /GITHUB_RUN_ID/, file);
  }
});

function selected({ event = 'pull_request', pr, base = 'main', branch, head = 'a'.repeat(40),
  pin = 'a'.repeat(40), labels = ['isolated-runtime-test'] }) {
  const target = targets.find(candidate => candidate.pr === pr);
  return !!target && event === 'pull_request' && base === 'main' && branch === target.branch &&
    head === pin && pin !== '' && labels.includes('isolated-runtime-test');
}

for (const target of targets) {
  const valid = { pr: target.pr, branch: target.branch };
  for (const [name, change, expected] of [
    ['exact event, pin and label', {}, true],
    ['missing pin', { pin: '' }, false],
    ['advanced head', { head: 'b'.repeat(40) }, false],
    ['wrong PR', { pr: 900 }, false],
    ['wrong base', { base: 'develop' }, false],
    ['lookalike branch', { branch: target.branch + '-extra' }, false],
    ['push event', { event: 'push' }, false],
    ['missing label', { labels: [] }, false],
    ['lookalike label', { labels: ['isolated-runtime-testing'] }, false]
  ]) {
    test(`#${target.pr} runtime selector fails closed: ${name}`, () => {
      assert.equal(selected({ ...valid, ...change }), expected);
    });
  }
}

test('mutual exclusion: a PR can select at most one isolated service', () => {
  for (const target of targets) {
    const fixture = { pr: target.pr, branch: target.branch };
    const matched = targets.filter(candidate => selected({ ...fixture, pr: candidate.pr }));
    assert.equal(matched.length, 1);
    assert.equal(matched[0].service, target.service);
  }
});

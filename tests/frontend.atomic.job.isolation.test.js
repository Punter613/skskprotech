'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/js/atomic-evidence-ui.js'), 'utf8');

function harness() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: '', textContent: '', innerHTML: '', hidden: true, disabled: false,
        dataset: {}, style: {}, closest() { return { insertAdjacentElement() {} }; }
      });
    }
    return elements.get(id);
  };
  const inputs = {
    '.testResult': [{ value: 'Fuel pressure falls below specification', dataset: { name: 'Fuel pressure test', evidenceId: 'evidence-a' } }],
    '.testPass': [{ value: 'false' }],
    '.testEvidenceRole': [{ value: 'CONFIRMS' }],
    '.testConfirmedFault': [{ value: 'Fuel pump failure' }]
  };
  const requests = [];
  const stages = [];
  const statuses = [];
  let renderCount = 0;
  let resolveRequest;
  let rejectRequest;
  const pending = new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; });
  const context = {
    jobId: 'job-a', vehicleEpoch: 1, vehicleKey: 'VEHICLE A',
    savedTests: [], testCount: 0, currentDiagnosisRevision: 1, API: '',
    document: {
      getElementById: element,
      querySelectorAll: selector => inputs[selector] || [],
      createElement: () => ({ style: {} })
    },
    SKSKAuth: { request(url, options) { requests.push({ url, options }); return pending; } },
    meaningfulResult: value => !!value.trim(),
    esc: value => String(value),
    renderVerifyEvidence() { renderCount++; },
    verificationEligibleTests: () => context.savedTests.filter(item => item.evidenceRole === 'CONFIRMS' && item.confirmedFault),
    stage: value => stages.push(value),
    setStatus: (...args) => statuses.push(args),
    captureJobContext: () => ({ jobId: context.jobId, vehicleEpoch: context.vehicleEpoch, vehicleKey: context.vehicleKey }),
    isCurrentJobContext: captured => captured.jobId === context.jobId
      && captured.vehicleEpoch === context.vehicleEpoch && captured.vehicleKey === context.vehicleKey
  };
  element('saveTests').textContent = 'Save Evidence & Continue';
  vm.runInNewContext(source, context, { filename: 'atomic-evidence-ui.js' });

  const saved = { id: 'evidence-a', name: 'Fuel pressure test', result: inputs['.testResult'][0].value,
    evidenceRole: 'CONFIRMS', confirmedFault: 'Fuel pump failure' };
  const success = {
    tests: [saved], savedEvidence: [saved], evidenceSavedCount: 1,
    diagnosisState: 'UNVERIFIED_DIAGNOSIS', diagnosisRevision: 4,
    unverifiedDiagnosis: { mostLikelyCause: 'Fuel pump failure', confidence: { rating: 'LOW' } }
  };
  const failure = {
    error: 'Reassessment provider unavailable', savedEvidence: [saved], reusedEvidence: [],
    evidenceSavedCount: 1, diagnosisStale: true
  };

  function finish(outcome) {
    if (outcome === 'network failure') rejectRequest(new Error('Connection interrupted'));
    else resolveRequest({
      ok: outcome === 'success', status: outcome === 'success' ? 200 : 503,
      text: async () => JSON.stringify(outcome === 'success' ? success : failure)
    });
  }

  function changeJob(kind) {
    if (kind === 'reset') { context.jobId = null; context.vehicleEpoch++; }
    if (kind === 'vehicle edit') { context.vehicleKey = 'VEHICLE B'; context.vehicleEpoch++; }
    if (kind === 'replacement job on the same vehicle') context.jobId = 'job-b';
    context.savedTests = [{ id: 'current-evidence', evidenceRole: 'NEUTRAL' }];
    context.testCount = 1;
    context.currentDiagnosisRevision = 2;
    for (const id of ['candidate', 'testOut', 'unverifiedOut', 'verifyStatus']) {
      element(id).textContent = 'CURRENT JOB';
      element(id).innerHTML = 'CURRENT JOB';
      element(id).dataset.stale = '0';
    }
    for (const id of ['verifyCard', 'estimateCard', 'invoiceCard']) element(id).hidden = true;
    // Keep the same input identity deliberately: stale completion must not clear
    // an input merely because the next job reused the old DOM/evidence ID.
    inputs['.testResult'][0].value = 'Current job observation';
    element('extra').value = 'Current additional finding';
  }

  function snapshot() {
    return JSON.stringify({
      jobId: context.jobId, savedTests: context.savedTests, testCount: context.testCount,
      revision: context.currentDiagnosisRevision, renderCount, stages, statuses, inputs,
      elements: [...elements].filter(([id]) => !['saveTests', 'unverifiedDiagnosis'].includes(id))
    });
  }

  return { context, element, inputs, requests, stages, statuses, finish, changeJob, snapshot };
}

for (const button of ['saveTests', 'unverifiedDiagnosis']) {
  for (const change of ['reset', 'vehicle edit', 'replacement job on the same vehicle']) {
    for (const outcome of ['success', 'HTTP failure with saved evidence', 'network failure']) {
      test(`${button} ignores ${outcome} after ${change}`, async () => {
        const h = harness();
        const label = h.element(button).textContent;
        const action = h.element(button).onclick();
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].url, `/api/jobs/job-a/${button === 'saveTests' ? 'tests/batch' : 'unverified-diagnosis'}`);
        assert.equal(JSON.parse(h.requests[0].options.body).evidence[0].id, 'evidence-a');
        assert.equal(h.element(button).disabled, true);
        h.changeJob(change);
        const before = h.snapshot();
        h.finish(outcome);
        await action;
        assert.equal(h.snapshot(), before, 'old response must not change current job evidence, presentation, inputs, or stage');
        assert.equal(h.element(button).disabled, false, 'button is restored even for stale requests');
        assert.equal(h.element(button).textContent, label);
      });
    }
  }
}

test('current evidence-save response preserves confirmation evidence and advances to Verify', async () => {
  const h = harness();
  const action = h.element('saveTests').onclick();
  h.finish('success');
  await action;
  assert.equal(h.context.savedTests[0].id, 'evidence-a');
  assert.equal(h.context.testCount, 1);
  assert.equal(h.inputs['.testResult'][0].value, '');
  assert.equal(h.element('verifyCard').hidden, false);
  assert.equal(h.element('candidate').dataset.stale, '1');
  assert.equal(h.stages.at(-1), 'Verify');
});

test('current reassessment response renders its revision and preserves confirmation evidence', async () => {
  const h = harness();
  const action = h.element('unverifiedDiagnosis').onclick();
  h.finish('success');
  await action;
  assert.equal(h.context.savedTests[0].id, 'evidence-a');
  assert.equal(h.context.currentDiagnosisRevision, 4);
  assert.equal(h.element('candidate').textContent, 'Revision 4 · Fuel pump failure');
  assert.equal(h.element('candidate').dataset.stale, '0');
  assert.match(h.element('unverifiedOut').innerHTML, /Fuel pump failure/);
  assert.equal(h.inputs['.testResult'][0].value, '');
  assert.equal(h.stages.at(-1), 'Verify');
});

test('current reassessment failure retains saved evidence and marks the old diagnosis stale', async () => {
  const h = harness();
  const action = h.element('unverifiedDiagnosis').onclick();
  h.finish('HTTP failure with saved evidence');
  await action;
  assert.equal(h.context.savedTests[0].id, 'evidence-a');
  assert.equal(h.context.testCount, 1);
  assert.equal(h.inputs['.testResult'][0].value, '');
  assert.equal(h.element('candidate').dataset.stale, '1');
  assert.match(h.element('unverifiedOut').innerHTML, /Reassessment failed closed/);
  assert.match(h.element('testOut').innerHTML, /1 new evidence item was saved/);
});

for (const button of ['saveTests', 'unverifiedDiagnosis']) {
  test(`${button} still reports network failures for the current job`, async () => {
    const h = harness();
    const action = h.element(button).onclick();
    h.finish('network failure');
    await action;
    assert.match(h.element(button === 'saveTests' ? 'testOut' : 'unverifiedOut').innerHTML, /Connection interrupted/);
    assert.equal(h.element(button).disabled, false);
  });
}

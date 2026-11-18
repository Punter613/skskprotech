'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../public/lifecycle.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>', html.indexOf('<script>')));

function harness() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, dataset: {}, listeners: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener(event, listener) { this.listeners[event] = listener; }
    });
    return elements.get(id);
  };
  const rows = [0, 1].map(i => ({ value: `Measured voltage ${i + 1}`, dataset: { name: `Physical test ${i + 1}` } }));
  const selectors = {
    '.testResult': rows,
    '.testPass': rows.map(() => ({ value: 'false' })),
    '.testEvidenceRole': rows.map(() => ({ value: 'CONFIRMS' })),
    '.testConfirmedFault': rows.map(() => ({ value: 'Open circuit' })),
    '.verifyEvidenceCheck:checked': [{ value: 'test-A' }]
  };
  let resolveRequest;
  const pending = new Promise(resolve => { resolveRequest = resolve; });
  const requests = [];
  const context = vm.createContext({
    navigator: {}, location: { hostname: 'localhost' }, AbortController, setTimeout, clearTimeout,
    window: { location: { href: '' }, addEventListener() {}, scrollTo() {} },
    document: { getElementById: get, querySelector: () => null, querySelectorAll: selector => selectors[selector] || [] },
    SKSKAuth: { request(url, options) { requests.push({ url, body: JSON.parse(options.body) }); return pending; } }
  });
  const run = source => vm.runInContext(source, context);
  get('make').value = 'Ford';
  get('vin').value = '1FTFW1ET1EFA00001';
  get('symptoms').value = 'Customer reports no start';
  get('cause').value = 'Open circuit';
  get('conclusion').value = 'Continuity test confirms open circuit';
  run(script);
  run("jobId='job-A';diagnosisVehicleKey=vehicleIdentityKey();savedTests=[{id:'test-A',name:'Continuity',result:'Open circuit measured',evidenceRole:'CONFIRMS',confirmedFault:'Open circuit'}];testCount=1;");
  const snapshot = () => JSON.stringify({
    // Request controls still restore their labels in finally; compare job content.
    elements: [...elements].filter(([id]) => !['translateSymptoms', 'decodeVin'].includes(id)).map(([id, el]) => [id, { value: el.value, textContent: el.textContent, innerHTML: el.innerHTML, hidden: el.hidden, dataset: el.dataset }]),
    state: run('({jobId,lastEstimate,lastDiagnosis,savedTests,testCount,currentDiagnosisRevision,furthestStage})'),
    redirect: context.window.location.href
  });
  return { get, run, requests, snapshot,
    respond(data, status = 200) { resolveRequest({ ok: status < 400, status, text: async () => JSON.stringify(data) }); }
  };
}

const actions = [
  { name: 'fallback evidence save', invoke: "$('saveTests').onclick()", response: { test: { id: 'late-test', evidenceRole: 'CONFIRMS', confirmedFault: 'Open circuit' } } },
  { name: 'fallback reassessment', invoke: "$('unverifiedDiagnosis').onclick()", response: { diagnosisState: 'UNVERIFIED_DIAGNOSIS', diagnosisRevision: 2, unverifiedDiagnosis: { mostLikelyCause: 'Old candidate' } }, prepare: h => h.run('hasUnsavedEvidence=()=>false') },
  { name: 'positive verification', invoke: 'verify(true)', response: { status: 'VERIFIED', verifiedCase: {}, verification: { confirmedCause: 'Open circuit' } } },
  { name: 'negative verification', invoke: 'verify(false)', response: {} },
  { name: 'estimate', invoke: "$('estimate').onclick()", response: { estimate: { diagnosis: 'Open circuit', total: 123 } } },
  { name: 'authorization handoff', invoke: "$('invoice').onclick()", response: { estimate: { documentNumber: 'AUTH-A' } } }
];
const switches = {
  reset: h => h.run('reset()'),
  'vehicle edit': h => { h.get('make').value = 'Honda'; h.get('make').listeners.input(); },
  'replacement job for same vehicle': h => h.run("jobId='job-B'")
};

for (const action of actions) {
  for (const [name, switchJob] of Object.entries(switches)) {
    for (const failed of [false, true]) {
      test(`${action.name}: ignores delayed ${failed ? 'failure' : 'success'} after ${name}`, async () => {
        const h = harness();
        action.prepare?.(h);
        const completion = h.run(action.invoke);
        assert.equal(h.requests.length, 1);
        assert.ok(h.requests[0].url.includes('job-A') || h.requests[0].body.jobId === 'job-A');
        switchJob(h);
        const before = h.snapshot();
        h.respond(failed ? { error: 'Old job failed' } : action.response, failed ? 409 : 200);
        await completion;
        assert.equal(h.snapshot(), before, 'old response must not change current job UI, evidence, authority, or redirect');
        assert.equal(h.requests.length, 1, 'a switched job must not continue a multi-request save');
      });
    }
  }
}

test('current verification still unlocks Estimate and current estimate unlocks authorization', async () => {
  const verification = harness();
  const verifying = verification.run('verify(true)');
  verification.respond(actions[2].response);
  await verifying;
  assert.equal(verification.get('lockedCause').textContent, 'Open circuit');
  assert.equal(verification.get('estimateCard').hidden, false);
  assert.match(verification.get('verifyStatus').textContent, /VERIFIED_CASE persisted/);

  const estimate = harness();
  const estimating = estimate.run("$('estimate').onclick()");
  estimate.respond(actions[4].response);
  await estimating;
  assert.equal(estimate.run('lastEstimate.total'), 123);
  assert.match(estimate.get('estimateOut').innerHTML, /123.00/);
  assert.equal(estimate.get('invoiceCard').hidden, false);
});

test('current authorization uses the captured job ID and current failures stay visible', async () => {
  const h = harness();
  const completing = h.run("$('invoice').onclick()");
  h.respond(actions[5].response);
  await completing;
  assert.match(h.snapshot(), /estimate-center.html\?job=job-A/);

  for (const action of actions) {
    const failure = harness();
    action.prepare?.(failure);
    const completion = failure.run(action.invoke);
    failure.respond({ error: 'Current request failed' }, 409);
    await completion;
    assert.match(failure.snapshot(), /Current request failed/);
  }
});

for (const name of ['reset', 'vehicle edit', 'replacement job for same vehicle']) {
  test(`translation cannot restore old intake context after ${name}`, async () => {
    const h = harness();
    const completing = h.run("$('translateSymptoms').onclick()");
    switches[name](h);
    const before = h.snapshot();
    h.respond({ translated: 'Old translation', keywords: ['old'] });
    await completing;
    assert.equal(h.snapshot(), before);
  });
}

test('translation ignores an edited complaint and VIN decode ignores stale errors', async () => {
  const translation = harness();
  const translating = translation.run("$('translateSymptoms').onclick()");
  translation.get('symptoms').value = 'Different complaint';
  translation.respond({ translated: 'Old translation', keywords: ['old'] });
  await translating;
  assert.equal(translation.get('symptoms').dataset.aiTranslation, undefined);

  const vin = harness();
  const decoding = vin.run("$('decodeVin').onclick()");
  vin.run('reset()');
  const before = vin.get('vinStatus').textContent;
  vin.respond({ error: 'Old decode failed' }, 502);
  await decoding;
  assert.equal(vin.get('vinStatus').textContent, before);
});

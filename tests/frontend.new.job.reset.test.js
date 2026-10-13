'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../public/lifecycle.html'), 'utf8');
const resetBlock = html.match(/function reset\(\)\{[^\n]+\}[\s\S]*?\$\('newJob'\)\.onclick=[^\n]+/);
test('New Job handler does not use a blocking native confirm', () => {
  assert.ok(resetBlock, 'reset and handler present');
  assert.doesNotMatch(resetBlock[0], /\bconfirm\s*\(/);
});
test('New Job requires two taps and clears previous vehicle and evidence fields', () => {
  assert.ok(resetBlock);
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {value:'OLD',textContent:'OLD',innerHTML:'OLD',hidden:false,addEventListener(){},dataset:{aiTranslation:'OLD',aiKeywords:'OLD',aiTranslated:'1'}});
    return elements.get(id);
  };
  const ctx = { $:get, vehicleEpoch:0, diagnosisVehicleKey:'OLD', hideInstallInvite(){}, renderVerifyEvidence(){}, setStatus(){}, stage(){} };
  ctx.document = {querySelectorAll(){return []}};
  vm.runInNewContext(resetBlock[0], ctx);
  get('newJob').onclick();
  assert.equal(get('vin').value, 'OLD', 'first tap must not destroy job');
  get('newJob').onclick();
  assert.equal(ctx.vehicleEpoch,1,'reset invalidates outstanding async vehicle requests');
  assert.equal(ctx.diagnosisVehicleKey,null,'reset clears the diagnosed vehicle identity');
  for (const id of ['vin','year','make','model','codes','symptoms','notes','quickQuestion','extra','cause','conclusion','customerName','customerPhone']) {
    assert.equal(get(id).value, '', id+' should be cleared');
  }
  assert.equal(get('dtcSource').value, 'MANUAL_ENTRY');
  assert.equal(get('jobBadge').textContent, 'NEW JOB');
  assert.equal(get('diagOut').innerHTML, '');
  assert.equal(get('symptoms').dataset.aiTranslation, undefined);
  assert.equal(get('verifyCard').hidden, true);
});

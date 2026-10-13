'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../public/lifecycle.html'),'utf8');
const start=html.indexOf('let vehicleEpoch=0,diagnosisVehicleKey=null;');
const end=html.indexOf('function reset(){',start);
const snippet=html.slice(start,end);
test('vehicle identity changes revoke diagnostic evidence without clearing intake',()=>{
  assert.ok(start>=0&&end>start);
  const els=new Map(),handlers=new Map();
  const $=id=>{
    if(!els.has(id))els.set(id,{value:id==='make'?'Ford':'OLD',textContent:'OLD',innerHTML:'OLD',hidden:false,dataset:{},addEventListener(event,fn){handlers.set(id+':'+event,fn)}});
    return els.get(id);
  };
  const ctx={$,
    renderVerifyEvidence(){},setStatus(){},stage(){},
    // Variables used by the production invalidator.
    jobId:'J1',lastDiagnosis:{primaryCause:'OLD'},lastEstimate:{},testCount:1,savedTests:[{role:'CONFIRMS'}],currentDiagnosisRevision:3,furthestStage:3
  };
  vm.runInNewContext(snippet+';globalThis.probe={vehicleIdentityKey,invalidateVehicleDiagnosis,setDiagnosisKey(v){diagnosisVehicleKey=v},epoch(){return vehicleEpoch}}',ctx);
  ctx.probe.setDiagnosisKey(ctx.probe.vehicleIdentityKey());
  $('make').value='Honda';
  handlers.get('make:input')();
  assert.equal(ctx.jobId,null);
  assert.equal(ctx.lastDiagnosis,null);
  assert.equal(ctx.lastEstimate,null);
  assert.equal(ctx.savedTests.length,0);
  assert.equal($('make').value,'Honda','new vehicle intake must survive');
  assert.equal($('candidate').dataset.stale,'1');
  assert.equal($('verifyCard').hidden,true);
  assert.equal($('estimateCard').hidden,true);
  assert.equal($('jobBadge').textContent,'NEW JOB');
  assert.ok(ctx.probe.epoch()>0);
});
test('in-flight diagnosis and Ask Brain responses are rejected after identity changes',()=>{
  assert.match(html,/requestEpoch!==vehicleEpoch\|\|requestVehicleKey!==vehicleIdentityKey\(\)\)return;jobId=d\.jobId/);
  assert.match(html,/requestEpoch!==vehicleEpoch\|\|requestVehicleKey!==vehicleIdentityKey\(\)\)return;const findings=/);
  assert.match(html,/function reset\(\)\{vehicleEpoch\+\+;diagnosisVehicleKey=null;/);
});

test('programmatic VIN decode invalidates the old vehicle and drops stale responses',()=>{
  assert.match(html,/const decodeEpoch=vehicleEpoch;btn\.disabled=true/);
  assert.match(html,/if\(decodeEpoch!==vehicleEpoch\|\|\$\('vin'\)\.value\.trim\(\)\.toUpperCase\(\)!==vin\)return;/);
  assert.match(html,/\$\('engine'\)\.value=engineLabel;if\(diagnosisVehicleKey!==null&&vehicleIdentityKey\(\)!==diagnosisVehicleKey\)invalidateVehicleDiagnosis\(\)/);
  assert.match(html,/\$\('lockedCause'\)\.textContent='—'/);
  assert.match(html,/,'estimateOut','tests'\]\.forEach/);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/lifecycle.html'),'utf8');
const helper=html.match(/const DIAGNOSE_TIMEOUT_MS=[\s\S]*?(?=\$\('diag'\)\.onclick)/);
assert.ok(helper,'diagnosis timeout helper must exist');
function harness(post){
  const ctx={AbortController,setTimeout,clearTimeout,post,Error};
  vm.runInNewContext(helper[0],ctx);
  return ctx;
}
test('timeout is named, aborts the actual request signal and permits retry',async()=>{
  let attempts=0,aborts=0;
  const ctx=harness((url,payload,opts)=>{
    attempts++;
    assert.equal(url,'/api/diagnose');
    assert.ok(opts.signal,'signal must reach post wrapper');
    if(attempts===2)return Promise.resolve({jobId:'RECOVERED'});
    return new Promise((resolve,reject)=>{
      opts.signal.addEventListener('abort',()=>{aborts++;const err=new Error('aborted');err.name='AbortError';reject(err)},{once:true});
    });
  });
  const first=await vm.runInNewContext('runDiagnoseRequest({},5).then(()=>null,e=>({message:e.message,code:e.code}))',ctx);
  assert.equal(first.code,'DIAGNOSE_TIMEOUT');
  assert.match(first.message,/server may have created a job/i);
  assert.equal(aborts,1,'timeout must abort request, not merely unlock UI');
  const second=await vm.runInNewContext('runDiagnoseRequest({},5)',ctx);
  assert.equal(second.jobId,'RECOVERED');
  assert.equal(attempts,2);
});
test('network failure remains distinguishable from timeout',async()=>{
  const ctx=harness(()=>Promise.reject(new Error('network offline')));
  const error=await vm.runInNewContext('runDiagnoseRequest({},50).then(()=>null,e=>e.message)',ctx);
  assert.equal(error,'network offline');
});
test('lifecycle handler has an in-flight guard, releases it in finally, and preserves epoch checks',()=>{
  const handler=html.match(/\$\('diag'\)\.onclick=async\(\)=>\{[^\n]+/);
  assert.ok(handler);
  assert.match(handler[0],/if\(diagnosisInFlight\)return;diagnosisInFlight=true;\$\('diag'\)\.disabled=true/);
  assert.match(handler[0],/await runDiagnoseRequest\(p\)/);
  assert.match(handler[0],/finally\{diagnosisInFlight=false;\$\('diag'\)\.disabled=false\}/);
  assert.match(handler[0],/requestEpoch!==vehicleEpoch\|\|requestVehicleKey!==vehicleIdentityKey\(\)/);
});
test('post forwards options, including AbortSignal, into SKSKAuth.request',()=>{
  assert.match(html,/async function post\(path,body,options=\{\}\)/);
  assert.match(html,/body:JSON\.stringify\(body\),\.\.\.options/);
});

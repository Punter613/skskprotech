'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','public','estimate-center.html'),'utf8');

test('commercial workspace exposes one continuous persisted job rail',()=>{
  assert.match(html,/1 ESTIMATE/);
  assert.match(html,/2 AUTHORIZE/);
  assert.match(html,/3 WORK/);
  assert.match(html,/4 INVOICE/);
  assert.match(html,/function updateCommercialRail\(data\)/);
  assert.match(html,/data\.workOrderDocuments\|\|\[\]/);
  assert.match(html,/currentEstimates=estimates\.filter\(e=>e\.status!==\'SUPERSEDED\'\)/);
  assert.match(html,/hasEstimate=currentEstimates\.length>0\|\|!!data\.verifiedEstimate/);
  assert.match(html,/terminalStates=new Set\(\[\'COMPLETED\',\'BLOCKED\',\'CANCELLED\'\]\)/);
  assert.match(html,/invoiceEligible=workTerminal&&completedWork/);
  assert.match(html,/invoiced=!!data\.invoice/);
});

test('commercial workspace keeps diagnostic and commercial authority separate',()=>{
  assert.match(html,/Commercial state never creates diagnostic proof/);
  assert.match(html,/Customer authorization permits only the selected scope/);
  assert.match(html,/final billing requires authorized \+ completed work/);
  assert.match(html,/Preliminary estimates never become diagnostic truth/);
});

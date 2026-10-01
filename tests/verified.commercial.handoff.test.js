'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildVerifiedCase } = require('../src/core/evidence/verified.case');
const { buildVerifiedEstimateSnapshot } = require('../src/core/evidence/verified.estimate.snapshot');
const { verifiedOperations } = require('../src/core/evidence/verified.repair.resolution');
const { createJob, patchJob, getJob } = require('../src/services/job.lifecycle');
const { handoffVerifiedEstimate } = require('../src/services/customer.estimate.center');

function resetJobs(){ global.__jobs = {}; }

async function seededVerifiedEstimate(){
  const job = await createJob({ customer:{name:'Acceptance Customer'}, vehicle:{year:2008,make:'Kia',model:'Sorento'} });
  const packet={schemaVersion:1,stage:'DIAGNOSE',vehicle:job.vehicle,observations:{customer:['clunk'],mechanic:[],completedWork:[]},dtcs:[],measurements:{trust:'TRUSTED_PRE_TAG_INPUT',values:{}},deterministic:{vehicleProfile:{}},evidence:{oem:[],tsbs:[],sources:[],available:false},contradictions:[]};
  const verifiedCase=buildVerifiedCase({jobId:job.jobId,status:'VERIFIED',vehicle:job.vehicle,diagnosis:{result:{primaryCause:'Engine mount failure',probability:[]},evidencePacket:packet,revision:1},tests:[{id:'T1',name:'mount load test',result:'excessive movement',evidenceRole:'CONFIRMS',confirmedFault:'Engine mount failure'}],verification:{confirmed:true,confirmedCause:'Engine mount failure',conclusion:'Physical movement isolated to mount',evidenceTestIds:['T1'],diagnosisRevision:1,verifiedAt:new Date().toISOString()}});
  const operations=verifiedOperations(verifiedCase.repairScope); const opId=operations[0].operationId;
  const repairResolution={schemaVersion:1,stage:'REPAIR_RESOLVED',verifiedCaseFingerprint:verifiedCase.fingerprint,repairScope:verifiedCase.repairScope,operations,labor:{operationId:opId,hours:2,hourlyRate:100,hoursSource:'MECHANIC_INPUT',rateSource:'MECHANIC_INPUT'},parts:[{operationId:opId,description:'Engine mount',quantity:1,unitPrice:200,total:200}],partsTotal:200,pricingAuthority:'MECHANIC',diagnosticAuthority:'VERIFIED_CASE'};
  const { fingerprint }=require('../src/core/evidence/verified.case'); repairResolution.fingerprint=fingerprint(repairResolution);
  const estimate=buildVerifiedEstimateSnapshot({...job,verifiedCase},{diagnosis:'Verified fault: Engine mount failure',priority:'high',estimatedHours:2,laborCost:200,partsCost:200,total:400,repairResolution});
  await patchJob(job.jobId,{status:'TESTING'});
  await patchJob(job.jobId,{status:'VERIFIED',verifiedCase});
  await patchJob(job.jobId,{status:'ESTIMATED',estimate});
  return getJob(job.jobId);
}

test.beforeEach(resetJobs);

test('canonical verified estimate hands off once to customer authorization without losing truth fingerprints', async()=>{
  const job=await seededVerifiedEstimate();
  const first=await handoffVerifiedEstimate(job.jobId);
  const second=await handoffVerifiedEstimate(job.jobId);
  assert.equal(first.created,true); assert.equal(second.created,false);
  assert.equal(first.estimate.basis,'VERIFIED_REPAIR');
  assert.equal(first.estimate.sourceVerifiedEstimateFingerprint,job.estimate.fingerprint);
  assert.equal(first.estimate.verifiedCaseFingerprint,job.verifiedCase.fingerprint);
  assert.equal(first.estimate.workItems[0].decision,'PROPOSED');
  assert.equal(first.estimate.totals.identified,400);
  assert.equal((await getJob(job.jobId)).customerEstimateCenter.quickEstimates.length,1);
});

test('main lifecycle UI cannot directly build legacy invoice and routes into authorization center',()=>{
  const lifecycle=fs.readFileSync(path.join(__dirname,'..','public','lifecycle.html'),'utf8');
  const center=fs.readFileSync(path.join(__dirname,'..','public','estimate-center.html'),'utf8');
  assert.doesNotMatch(lifecycle,/post\('\/api\/invoice\/build'/);
  assert.match(lifecycle,/from-verified-estimate/);
  assert.match(lifecycle,/A verified estimate is not permission to perform or bill work/);
  assert.match(center,/URLSearchParams\(window\.location\.search\)\.get\('job'\)/);
});

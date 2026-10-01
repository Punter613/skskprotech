'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lifecycle = require('../src/services/job.lifecycle');
const outcomes = require('../src/services/job.outcome.events');

function resetStores() {
  global.__jobs = {};
  global.__jobOutcomeEvents = {};
}

test.beforeEach(resetStores);

test('shop B cannot read or mutate shop A lifecycle', async () => {
  const a = await lifecycle.createJob({ jobId: 'TENANT-JOB-1', customerName: 'A' }, 'shop-a');
  assert.equal(a.shopId, 'shop-a');
  assert.equal((await lifecycle.getJob(a.jobId, 'shop-a')).jobId, a.jobId);
  assert.equal(await lifecycle.getJob(a.jobId, 'shop-b'), null);
  assert.equal(await lifecycle.patchJob(a.jobId, { status: 'TESTING' }, 'shop-b'), null);
  assert.equal((await lifecycle.getJob(a.jobId, 'shop-a')).status, 'DIAGNOSING');
});

test('shop ownership cannot be reassigned by a scoped patch', async () => {
  const a = await lifecycle.createJob({ jobId: 'TENANT-JOB-2' }, 'shop-a');
  const updated = await lifecycle.patchJob(a.jobId, { shopId: 'shop-b', status: 'TESTING' }, 'shop-a');
  assert.equal(updated.shopId, 'shop-a');
  assert.equal(await lifecycle.getJob(a.jobId, 'shop-b'), null);
});

test('return visits stay inside the owning shop', async () => {
  const a = await lifecycle.createJob({ jobId: 'TENANT-JOB-3' }, 'shop-a');
  const child = await lifecycle.createReturnVisit(a.jobId, {}, 'shop-a');
  assert.ok(child);
  assert.equal(child.shopId, 'shop-a');
  assert.equal((await lifecycle.findReturnVisits(a.jobId, 'shop-a')).length, 1);
  assert.equal((await lifecycle.findReturnVisits(a.jobId, 'shop-b')).length, 0);
});

test('outcome-event service rejects a foreign shop before event storage', async () => {
  await lifecycle.createJob({ jobId: 'TENANT-JOB-4' }, 'shop-a');
  const event = {
    jobId: 'TENANT-JOB-4',
    eventType: 'REPAIR_COMPLETED',
    fingerprint: 'fp-1',
    performedRepair: {}
  };
  await assert.rejects(() => outcomes.recordOutcomeEvent(event, 'shop-b'), /not found/);
  assert.deepEqual(await outcomes.getJobOutcomeEvents('TENANT-JOB-4', 'shop-b'), []);
  assert.deepEqual(global.__jobOutcomeEvents, {});
});


test('successful in-memory outcome transition updates only the owning shop cache key', async () => {
  const job = await lifecycle.createJob({ jobId: 'TENANT-JOB-5' }, 'shop-a');
  await lifecycle.patchJob(job.jobId, { status: 'TESTING' }, 'shop-a');
  await lifecycle.patchJob(job.jobId, { status: 'VERIFIED' }, 'shop-a');
  const event = {
    jobId: job.jobId,
    eventType: 'REPAIR_COMPLETED',
    fingerprint: 'fp-tenant-5',
    performedRepair: {}
  };
  await outcomes.recordOutcomeEvent(event, 'shop-a');
  assert.equal((await lifecycle.getJob(job.jobId, 'shop-a')).status, 'REPAIR_COMPLETED');
  assert.equal(await lifecycle.getJob(job.jobId, 'shop-b'), null);
  assert.equal((await outcomes.getJobOutcomeEvents(job.jobId, 'shop-a')).length, 1);
  assert.equal((await outcomes.getJobOutcomeEvents(job.jobId, 'shop-b')).length, 0);
});


test('patchJob rejects lifecycle stage skips and backward commercial transitions', async () => {
  const job = await lifecycle.createJob({ jobId: 'PATCH-AUTH-1' });
  await assert.rejects(
    () => lifecycle.patchJob(job.jobId, { status: 'INVOICED', invoice: { forged: true } }),
    /Illegal job status transition: DIAGNOSING -> INVOICED/
  );
  assert.equal((await lifecycle.getJob(job.jobId)).status, 'DIAGNOSING');
  assert.equal((await lifecycle.getJob(job.jobId)).invoice, null);

  await lifecycle.patchJob(job.jobId, { status: 'TESTING' });
  await lifecycle.patchJob(job.jobId, { status: 'VERIFIED' });
  await lifecycle.patchJob(job.jobId, { status: 'ESTIMATED' });
  await lifecycle.patchJob(job.jobId, { status: 'INVOICED' });
  await assert.rejects(
    () => lifecycle.patchJob(job.jobId, { status: 'ESTIMATED' }),
    /Illegal job status transition: INVOICED -> ESTIMATED/
  );
  assert.equal((await lifecycle.getJob(job.jobId)).status, 'INVOICED');
});

test('patchJob preserves the intentional evidence-reassessment transition back to TESTING', async () => {
  const job = await lifecycle.createJob({ jobId: 'PATCH-AUTH-2' });
  await lifecycle.patchJob(job.jobId, { status: 'TESTING' });
  await lifecycle.patchJob(job.jobId, { status: 'VERIFIED' });
  await lifecycle.patchJob(job.jobId, { status: 'ESTIMATED' });
  const reassessing = await lifecycle.patchJob(job.jobId, { status: 'TESTING' });
  assert.equal(reassessing.status, 'TESTING');
});

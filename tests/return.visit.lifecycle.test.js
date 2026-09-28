'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createJob, getJob, createReturnVisit, findReturnVisits } = require('../src/services/job.lifecycle');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

test('return visit creates a fresh linked lifecycle without mutating prior history', async () => {
  global.__jobs = {};
  const prior = await createJob({
    customer: { name: 'Return Customer', phone: '555-0100' },
    vehicle: { year: 2008, make: 'Kia', model: 'Sorento', vin: 'KNDJC736385765089', mileage: 120000 },
    customerStates: ['original complaint']
  });
  const before = clone(await getJob(prior.jobId));

  const visit = await createReturnVisit(prior.jobId, {
    mileage: 121250,
    customerStates: ['follow-up complaint']
  });

  assert.notEqual(visit.jobId, prior.jobId);
  assert.equal(visit.status, 'DIAGNOSING');
  assert.deepEqual(visit.relationship, {
    type: 'RETURN_VISIT',
    priorLifecycleNumber: prior.jobId,
    rootLifecycleNumber: prior.jobId,
    createdFromPriorAt: visit.relationship.createdFromPriorAt
  });
  assert.equal(visit.customer.name, prior.customer.name);
  assert.equal(visit.vehicle.vin, prior.vehicle.vin);
  assert.equal(visit.vehicle.mileage, 121250);
  assert.deepEqual(visit.intake.customerStates, ['follow-up complaint']);
  assert.equal(visit.diagnosis, null);
  assert.equal(visit.estimate, null);
  assert.equal(visit.invoice, null);

  const after = clone(await getJob(prior.jobId));
  assert.deepEqual(after, before);

  const children = await findReturnVisits(prior.jobId);
  assert.deepEqual(children.map(job => job.jobId), [visit.jobId]);
});

test('return visit chains retain the original root lifecycle', async () => {
  global.__jobs = {};
  const root = await createJob({ vehicle: { year: 2008, make: 'Kia', model: 'Sorento' } });
  const second = await createReturnVisit(root.jobId, {});
  const third = await createReturnVisit(second.jobId, {});
  assert.equal(third.relationship.priorLifecycleNumber, second.jobId);
  assert.equal(third.relationship.rootLifecycleNumber, root.jobId);
});

test('Estimate Center exposes immutable return-visit workflow', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'estimate-center.html'), 'utf8');
  assert.match(html, /Create Return Visit/);
  assert.match(html, /return-visit/);
  assert.match(html, /historical job is never rewritten/i);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/db');
const lifecyclePath = require.resolve('../src/services/job.lifecycle');

test('an empty shop scope cannot read or patch a shop-owned job', async () => {
  const oldDb = require.cache[dbPath];
  const realDb = require(dbPath);
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
    exports: { ...realDb, supabase: null, persistenceRequired: () => false, assertPersistenceConfigured: () => {} } };
  delete require.cache[lifecyclePath];
  global.__jobs = {};
  const lifecycle = require(lifecyclePath);
  try {
    const owned = await lifecycle.createJob({ customer: { name: 'Shop A customer' } }, 'shop_a');
    // Simulate an unscoped cache entry under the bare job id, as older code paths wrote.
    global.__jobs[owned.jobId] = global.__jobs[`shop_a::${owned.jobId}`];

    assert.equal(await lifecycle.getJob(owned.jobId, ''), null);
    assert.equal(await lifecycle.getJob(owned.jobId, 'shop_b'), null);
    assert.equal(await lifecycle.patchJob(owned.jobId, { customer: { name: 'hijack' } }, ''), null);
    assert.equal((await lifecycle.getJob(owned.jobId, 'shop_a')).customer.name, 'Shop A customer');

    const unscoped = await lifecycle.createJob({ customer: { name: 'Dev job' } }, '');
    assert.equal((await lifecycle.getJob(unscoped.jobId, '')).customer.name, 'Dev job');
    assert.equal(await lifecycle.getJob(unscoped.jobId, 'shop_a'), null);
  } finally {
    if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath];
    delete require.cache[lifecyclePath];
    global.__jobs = {};
  }
});

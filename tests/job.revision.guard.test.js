'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/db');
const lifecyclePath = require.resolve('../src/services/job.lifecycle');

function loadLifecycle(supabase) {
  const oldDb = require.cache[dbPath];
  const oldLifecycle = require.cache[lifecyclePath];
  const realDb = require(dbPath);
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      ...realDb,
      supabase,
      persistenceRequired: () => Boolean(supabase),
      assertPersistenceConfigured: () => {}
    }
  };
  delete require.cache[lifecyclePath];
  global.__jobs = {};
  const lifecycle = require(lifecyclePath);
  return {
    lifecycle,
    restore() {
      if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath];
      if (oldLifecycle) require.cache[lifecyclePath] = oldLifecycle; else delete require.cache[lifecyclePath];
      global.__jobs = {};
    }
  };
}

// Stateful service_jobs double that honors the same filters the lifecycle uses:
// eq('job_id'), eq('payload->>revision', n) and is('payload->revision', null).
function statefulSupabase() {
  const rows = new Map();
  let failNextWrite = false;
  return {
    rows,
    failNextWrite() { failNextWrite = true; },
    from(table) {
      assert.equal(table, 'service_jobs');
      return {
        async insert(row) {
          if (rows.has(row.job_id)) return { error: { code: '23505', message: 'duplicate key' } };
          rows.set(row.job_id, JSON.parse(JSON.stringify(row)));
          return { error: null };
        },
        update(row) {
          const filters = [];
          const chain = {
            eq(column, value) { filters.push({ column, value, kind: 'eq' }); return chain; },
            is(column, value) { filters.push({ column, value, kind: 'is' }); return chain; },
            async select() {
              if (failNextWrite) { failNextWrite = false; return { data: null, error: { message: 'simulated outage' } }; }
              const matched = [...rows.values()].filter(stored => filters.every(f => {
                if (f.column === 'job_id') return stored.job_id === f.value;
                if (f.column === 'payload->>revision') return stored.payload?.revision !== undefined && String(stored.payload.revision) === f.value;
                if (f.column === 'payload->revision' && f.kind === 'is') return stored.payload?.revision === undefined || stored.payload?.revision === null;
                throw new Error(`unexpected filter ${f.column}`);
              }));
              for (const stored of matched) rows.set(stored.job_id, JSON.parse(JSON.stringify(row)));
              return { data: matched.map(r => ({ job_id: r.job_id })), error: null };
            }
          };
          return chain;
        },
        select() {
          let id;
          const chain = {
            eq(column, value) { id = value; return chain; },
            async maybeSingle() {
              const stored = rows.get(id);
              return { data: stored ? { payload: JSON.parse(JSON.stringify(stored.payload)) } : null, error: null };
            }
          };
          return chain;
        }
      };
    }
  };
}

const intake = { customer: { name: 'Revision canary' }, vehicle: { year: 2015, make: 'Ford', model: 'F-150' } };

test('new jobs start at revision 1 and each saved change advances it', async () => {
  const db = statefulSupabase();
  const ctx = loadLifecycle(db);
  try {
    const job = await ctx.lifecycle.createJob(intake, 'shop_a');
    assert.equal(job.revision, 1);
    assert.equal(db.rows.get(job.jobId).payload.revision, 1);
    const patched = await ctx.lifecycle.patchJob(job.jobId, { customer: { name: 'Renamed' } }, 'shop_a');
    assert.equal(patched.revision, 2);
    assert.equal(db.rows.get(job.jobId).payload.revision, 2);
  } finally { ctx.restore(); }
});

test('a stale writer gets JOB_REVISION_CONFLICT instead of silently overwriting', async () => {
  const db = statefulSupabase();
  const ctx = loadLifecycle(db);
  try {
    const job = await ctx.lifecycle.createJob(intake, 'shop_a');
    // Simulate another instance saving a change this process has not seen.
    const stored = db.rows.get(job.jobId);
    stored.payload = { ...stored.payload, revision: 2, tests: [{ id: 'other-instance-test' }] };

    await assert.rejects(
      () => ctx.lifecycle.patchJob(job.jobId, { customer: { name: 'Stale overwrite' } }, 'shop_a'),
      err => err.code === 'JOB_REVISION_CONFLICT' && err.statusCode === 409
    );
    assert.deepEqual(db.rows.get(job.jobId).payload.tests, [{ id: 'other-instance-test' }]);

    // The conflict drops the stale cache entry, so a retry reads the durable row.
    const fresh = await ctx.lifecycle.getJob(job.jobId, 'shop_a');
    assert.equal(fresh.revision, 2);
    assert.deepEqual(fresh.tests, [{ id: 'other-instance-test' }]);
  } finally { ctx.restore(); }
});

test('concurrent writers loaded from the same revision: exactly one wins', async () => {
  const db = statefulSupabase();
  const ctx = loadLifecycle(db);
  try {
    const job = await ctx.lifecycle.createJob(intake, 'shop_a');
    const results = await Promise.allSettled([
      ctx.lifecycle.addTest(job.jobId, { name: 'Coil swap', result: 'Misfire followed coil to cylinder 3', evidenceRole: 'SUPPORTS' }, 'shop_a'),
      ctx.lifecycle.addTest(job.jobId, { name: 'Compression', result: '165 psi all cylinders', evidenceRole: 'NEUTRAL' }, 'shop_a')
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'JOB_REVISION_CONFLICT');
    assert.equal(db.rows.get(job.jobId).payload.tests.length, 1);
  } finally { ctx.restore(); }
});

test('a failed durable write is never served back from the cache', async () => {
  const db = statefulSupabase();
  const ctx = loadLifecycle(db);
  try {
    const job = await ctx.lifecycle.createJob(intake, 'shop_a');
    db.failNextWrite();
    await assert.rejects(
      () => ctx.lifecycle.addTest(job.jobId, { name: 'Coil swap', result: 'Misfire followed coil', evidenceRole: 'SUPPORTS' }, 'shop_a'),
      /Persistent job storage is unavailable/
    );
    const reread = await ctx.lifecycle.getJob(job.jobId, 'shop_a');
    assert.deepEqual(reread.tests, []);
    assert.equal(reread.revision, 1);
  } finally { ctx.restore(); }
});

test('legacy rows without a revision are updated once and then guarded', async () => {
  const db = statefulSupabase();
  const ctx = loadLifecycle(db);
  try {
    const job = await ctx.lifecycle.createJob(intake, 'shop_a');
    const stored = db.rows.get(job.jobId);
    const { revision, ...legacyPayload } = stored.payload;
    stored.payload = legacyPayload;
    ctx.lifecycle.invalidateJobCache(job.jobId, 'shop_a');

    const patched = await ctx.lifecycle.patchJob(job.jobId, { customer: { name: 'Legacy upgrade' } }, 'shop_a');
    assert.equal(patched.revision, 1);
    assert.equal(db.rows.get(job.jobId).payload.revision, 1);
  } finally { ctx.restore(); }
});

test('callers cannot set the revision through a patch, and reads are copies', async () => {
  const db = statefulSupabase();
  const ctx = loadLifecycle(db);
  try {
    const job = await ctx.lifecycle.createJob(intake, 'shop_a');
    const patched = await ctx.lifecycle.patchJob(job.jobId, { revision: 99 }, 'shop_a');
    assert.equal(patched.revision, 2);

    const copy = await ctx.lifecycle.getJob(job.jobId, 'shop_a');
    copy.tests.push({ id: 'unsaved-mutation' });
    const again = await ctx.lifecycle.getJob(job.jobId, 'shop_a');
    assert.deepEqual(again.tests, []);
  } finally { ctx.restore(); }
});

test('duplicate job id on create is a conflict, not an overwrite', async () => {
  const db = statefulSupabase();
  const ctx = loadLifecycle(db);
  try {
    const job = await ctx.lifecycle.createJob(intake, 'shop_a');
    await assert.rejects(
      () => ctx.lifecycle.createJob({ ...intake, jobId: job.jobId }, 'shop_b'),
      err => err.code === 'JOB_REVISION_CONFLICT'
    );
    assert.equal(db.rows.get(job.jobId).payload.shopId, 'shop_a');
  } finally { ctx.restore(); }
});

test('memory-only development mode enforces the same revision rule', async () => {
  const ctx = loadLifecycle(null);
  try {
    const job = await ctx.lifecycle.createJob(intake, 'shop_a');
    const results = await Promise.allSettled([
      ctx.lifecycle.addTest(job.jobId, { name: 'Coil swap', result: 'Misfire followed coil', evidenceRole: 'SUPPORTS' }, 'shop_a'),
      ctx.lifecycle.addTest(job.jobId, { name: 'Compression', result: '165 psi all cylinders', evidenceRole: 'NEUTRAL' }, 'shop_a')
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected')[0].reason.code, 'JOB_REVISION_CONFLICT');
    const current = await ctx.lifecycle.getJob(job.jobId, 'shop_a');
    assert.equal(current.tests.length, 1);
    assert.equal(current.revision, 2);
  } finally { ctx.restore(); }
});

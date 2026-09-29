'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function stubDb(exports) {
  const dbPath = require.resolve('../src/db');
  const lifecyclePath = require.resolve('../src/services/job.lifecycle');
  const oldDb = require.cache[dbPath];
  const oldLifecycle = require.cache[lifecyclePath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports };
  delete require.cache[lifecyclePath];
  return {
    lifecycle: require('../src/services/job.lifecycle'),
    restore() {
      if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath];
      if (oldLifecycle) require.cache[lifecyclePath] = oldLifecycle; else delete require.cache[lifecyclePath];
    }
  };
}

test('production persistence failure is surfaced instead of reporting an in-memory success', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const fake = {
    from() {
      return { upsert: async () => ({ error: { message: 'database unavailable' } }) };
    }
  };
  const ctx = stubDb({
    supabase: fake,
    persistenceRequired: () => true,
    assertPersistenceConfigured: () => {}
  });
  try {
    await assert.rejects(
      () => ctx.lifecycle.createJob({ customer: { name: 'Persistence canary' } }),
      /Persistent job storage is unavailable/
    );
  } finally {
    ctx.restore();
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test('development keeps the explicit memory fallback when Supabase is unavailable', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const ctx = stubDb({
    supabase: null,
    persistenceRequired: () => false,
    assertPersistenceConfigured: () => {}
  });
  try {
    const job = await ctx.lifecycle.createJob({ customer: { name: 'Local dev' } });
    assert.equal(job.status, 'DIAGNOSING');
  } finally {
    ctx.restore();
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  }
});

test('database probe performs a real service_jobs query', async () => {
  const dbPath = require.resolve('../src/db');
  const supabasePath = require.resolve('@supabase/supabase-js');
  const oldDb = require.cache[dbPath];
  const oldSupabase = require.cache[supabasePath];
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_KEY;
  let queried = false;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_KEY = 'test-key';
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      createClient: () => ({
        from(table) {
          assert.equal(table, 'service_jobs');
          return {
            select() {
              return {
                async limit(n) {
                  queried = true;
                  assert.equal(n, 1);
                  return { data: [], error: null };
                }
              };
            }
          };
        }
      })
    }
  };
  delete require.cache[dbPath];
  try {
    const db = require('../src/db');
    const result = await db.probeDatabase();
    assert.equal(result.ok, true);
    assert.equal(queried, true);
  } finally {
    if (oldDb) require.cache[dbPath] = oldDb; else delete require.cache[dbPath];
    if (oldSupabase) require.cache[supabasePath] = oldSupabase; else delete require.cache[supabasePath];
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_KEY; else process.env.SUPABASE_KEY = previousKey;
  }
});

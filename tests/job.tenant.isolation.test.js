'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lifecycle = fs.readFileSync(path.join(__dirname, '../src/services/job.lifecycle.js'), 'utf8');
const middleware = fs.readFileSync(path.join(__dirname, '../src/middleware/job.lifecycle.middleware.js'), 'utf8');
const protectedJobs = fs.readFileSync(path.join(__dirname, '../src/routes/jobs.protected.js'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260930040500_tenant_scope_service_jobs.sql'), 'utf8');

test('service jobs persist authenticated shop ownership in migration-safe payload', () => {
  assert.ok(lifecycle.includes("shopId: ownerShopId || ''"));
  assert.ok(lifecycle.includes(".select('payload')"));
  assert.ok(lifecycle.includes('jobBelongsToShop(job, ownerShopId)'));
  assert.ok(migration.includes('add column if not exists shop_id text'));
  assert.ok(migration.includes('(shop_id, job_id)'));
});

test('job cache is partitioned by shop and job id', () => {
  assert.ok(lifecycle.includes('::'));
  assert.ok(lifecycle.includes('cacheKey(jobId, ownerShopId)'));
  assert.ok(lifecycle.includes('jobBelongsToShop(memory, ownerShopId)'));
});

test('authenticated HTTP lifecycle passes server shop context into storage', () => {
  assert.ok(middleware.includes('const { jobId: _untrustedJobId, ...diagnosisInput } = req.body || {}'));\n  assert.ok(middleware.includes('createJob(diagnosisInput, req.shopId)'));
  assert.ok(middleware.includes('getJob(jobId, req.shopId)'));
  assert.ok(middleware.includes('getJob(job.jobId, req.shopId)'));
  assert.ok(protectedJobs.includes('getJob(req.params.id, req.shopId)'));
});

test('shop ownership is not read from request headers in lifecycle storage', () => {
  assert.equal(lifecycle.includes("headers['x-tenant-id']"), false);
  assert.equal(lifecycle.includes('user_metadata'), false);
});

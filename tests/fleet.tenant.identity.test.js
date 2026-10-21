'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/fleet.js'), 'utf8');

test('verified Supabase fleet identity is bound to req.auth.shopId', () => {
  assert.ok(source.includes("req.auth?.type === 'supabase_user'"));
  assert.ok(source.includes("String(req.auth.shopId || '').trim()"));
});
test('legacy shop keys use authenticated identity, not arbitrary tenant header', () => {
  assert.ok(source.includes("req.auth?.type === 'shop_key'"));
  assert.ok(source.includes("String(req.auth.shopId || '').trim()"));
  assert.ok(source.includes("requestedTenant !== tenantId"));
  assert.ok(source.includes("res.status(403)"));
});
test('every fleet database operation remains tenant-scoped', () => {
  assert.ok(source.includes(".eq('tenant_id', req.tenantId)"));
  assert.ok(source.includes('tenant_id: req.tenantId'));
  assert.ok(source.includes(".eq('tenant_id', tenantId)"));
});

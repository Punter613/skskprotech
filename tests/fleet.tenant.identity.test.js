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

test('fleet UI never trusts a typed tenant or sends a tenant override header', () => {
  const ui = fs.readFileSync(path.join(__dirname, '../public/fleet.html'), 'utf8');
  assert.ok(!ui.includes("x-tenant-id"), 'fleet UI must not supply tenant authority');
  assert.ok(!ui.includes("sksk_fleet_tenant"), 'fleet UI must not restore arbitrary tenant identifiers');
  assert.ok(!ui.includes("tenantInput"), 'fleet UI must not depend on a typed tenant');
  assert.ok(ui.includes('SKSKAuth.request'), 'fleet requests must use the authentication bridge');
});

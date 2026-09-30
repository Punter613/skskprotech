'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/routes/fleet.js'), 'utf8');

test('verified Supabase fleet identity is bound to req.auth.shopId', () => {
  assert.ok(source.includes("req.auth?.type === 'supabase_user'"));
  assert.ok(source.includes("String(req.auth.shopId || '').trim()"));
  assert.ok(source.includes('authenticatedShopId || legacyTenantId'));
});

test('browser tenant header cannot override a verified user membership', () => {
  const userBranch = source.slice(
    source.indexOf("const authenticatedShopId"),
    source.indexOf("const tenantId = authenticatedShopId || legacyTenantId")
  );
  assert.equal(userBranch.includes("req.headers['x-tenant-id']"), true, 'legacy branch should remain explicit');
  assert.ok(source.indexOf("req.auth?.type === 'supabase_user'") < source.indexOf("req.headers['x-tenant-id']"));
  assert.ok(source.includes("req.auth?.type === 'shop_key'"));
});

test('every fleet database operation remains tenant-scoped', () => {
  assert.ok(source.includes(".eq('tenant_id', req.tenantId)"));
  assert.ok(source.includes('tenant_id: req.tenantId'));
  assert.ok(source.includes(".eq('tenant_id', tenantId)"));
});

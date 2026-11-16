'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const db = require('../src/db');
const { requireApiAccess } = require('../src/middleware/api.access');
const fleet = require('../src/routes/fleet');

test('fleet HTTP authentication and cross-shop roster isolation', async () => {
  const keys = ['NODE_ENV','SKSK_SKIP_AUTH','SKSK_API_KEYS','SKSK_API_KEY','SKSK_SHOP_KEY_BINDINGS'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const original = db.supabase;
  const rows = [];
  db.supabase = { from(table) {
    assert.equal(table, 'fleet_vehicles');
    const filters = {};
    let payload;
    return {
      select() { return this; },
      eq(k,v) { filters[k] = v; return this; },
      order() { return Promise.resolve({ data: rows.filter(r => Object.entries(filters).every(([k,v]) => r[k] === v)), error: null }); },
      upsert(value) { payload = value; return this; },
      single() {
        if (payload) {
          const idx = rows.findIndex(r => r.tenant_id === payload.tenant_id && r.vin === payload.vin);
          if (idx < 0) rows.push(payload); else rows[idx] = payload;
          return Promise.resolve({ data: payload, error: null });
        }
        return Promise.resolve({ data: null, error: { message: 'missing' } });
      }
    };
  }};
  process.env.NODE_ENV = 'production';
  process.env.SKSK_API_KEYS = 'fleet-alpha,fleet-beta';
  process.env.SKSK_SHOP_KEY_BINDINGS = JSON.stringify({'fleet-alpha':'shop_alpha','fleet-beta':'shop_beta'});
  delete process.env.SKSK_SKIP_AUTH;
  delete process.env.SKSK_API_KEY;
  const app = express();
  app.use(express.json());
  app.use('/api/fleet', requireApiAccess, fleet);
  const server = http.createServer(app);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port + '/api/fleet/';
    async function call(route, key, method = 'GET', body, extra = {}) {
      const response = await fetch(base + route, {
        method, headers: { 'Content-Type':'application/json', ...(key ? {'X-SKSK-API-Key':key} : {}), ...extra },
        ...(body ? {body:JSON.stringify(body)} : {})
      });
      return { status: response.status, data: await response.json() };
    }
    const vin = '1HGCM82633A004352';
    assert.equal((await call('roster')).status, 401);
    assert.equal((await call('roster', 'wrong')).status, 401);
    delete process.env.SKSK_SHOP_KEY_BINDINGS;
    assert.equal((await call('roster', 'fleet-alpha')).status, 503);
    process.env.SKSK_SHOP_KEY_BINDINGS = JSON.stringify({'fleet-alpha':'shop_alpha','fleet-beta':'shop_beta'});
    assert.equal((await call('roster', 'fleet-alpha', 'GET', null, {'x-tenant-id':'shop_beta'})).status, 403);
    assert.equal((await call('add', 'fleet-alpha', 'POST', {vin})).status, 200);
    assert.equal((await call('roster', 'fleet-alpha')).data.roster.length, 1);
    assert.equal((await call('roster', 'fleet-beta')).data.roster.length, 0);
    assert.equal((await call('add', 'fleet-beta', 'POST', {vin})).status, 200);
    assert.equal(rows.length, 2);
    process.env.SKSK_SHOP_KEY_BINDINGS = JSON.stringify({'fleet-beta':'shop_beta','fleet-alpha':'shop_alpha'});
    assert.equal((await call('roster', 'fleet-alpha')).data.roster.length, 1);
    assert.equal((await call('roster', 'fleet-beta')).data.roster.length, 1);
    assert.deepEqual(rows.map(r=>r.tenant_id).sort(), ['shop_alpha','shop_beta']);
    assert.equal((await call('bulk-estimate', 'fleet-beta', 'POST', {vins:[vin]}, {'x-tenant-id':'shop_alpha'})).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.supabase = original;
    for (const [k,v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

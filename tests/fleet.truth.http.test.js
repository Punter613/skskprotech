'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

async function post(app, route, body, headers = {}) {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('bulk-estimate returns unverified AI forecast without modifying fleet row', async () => {
  const dbPath = require.resolve('../src/db');
  const estimatorPath = require.resolve('../src/services/estimator');
  const fleetPath = require.resolve('../src/routes/fleet');
  const db = require(dbPath);
  const estimator = require(estimatorPath);
  const originalDb = db.supabase;
  const originalEstimate = estimator.processSingleEstimate;
  const originalFleetCache = require.cache[fleetPath];
  const vin = '1HGCM82633A004352';
  const row = { tenant_id: 'shop_a', vin, year_make_model: '2018 Honda Accord',
    mileage: 90000, status: 'WARNING', next_predicted_failure: { primary_risk_component: 'Brake system' } };
  let updateCalls = 0;
  try {
    db.supabase = { from(table) {
      assert.equal(table, 'fleet_vehicles');
      const filters = {};
      return {
        select() { return this; },
        eq(k, v) { filters[k] = v; return this; },
        single: async () => ({ data: filters.vin === vin && filters.tenant_id === row.tenant_id ? { ...row } : null, error: null }),
        update() { updateCalls++; throw new Error('Unverified estimate attempted authoritative write'); },
        upsert() { updateCalls++; throw new Error('Unverified estimate attempted authoritative upsert'); },
        insert() { updateCalls++; throw new Error('Unverified estimate attempted authoritative insert'); },
        delete() { updateCalls++; throw new Error('Unverified estimate attempted authoritative delete'); }
      };
    }};
    estimator.processSingleEstimate = async () => ({
      calculated_severity: 'OK',
      predictive_horizon: { primary_risk_component: 'All Systems Stable' }
    });
    delete require.cache[fleetPath];
    const fleet = require(fleetPath);
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => { req.auth = { type: 'shop_key', shopId: 'shop_a' }; next(); });
    app.use('/api/fleet', fleet);
    const result = await post(app, '/api/fleet/bulk-estimate', { vins: [vin], notes: 'test' });
    assert.equal(result.status, 200);
    assert.equal(result.data.results[0].status, 'Success');
    assert.equal(result.data.results[0].assessment.verificationStatus, 'UNVERIFIED');
    assert.equal(result.data.results[0].assessment.source, 'AI_ESTIMATE');
    assert.equal(result.data.results[0].assessment.calculatedSeverity, 'OK');
    assert.deepEqual(result.data.results[0].assessment.predictiveHorizon, { primary_risk_component: 'All Systems Stable' });
    assert.equal(updateCalls, 0);
    assert.equal(row.status, 'WARNING');
    assert.deepEqual(row.next_predicted_failure, { primary_risk_component: 'Brake system' });
  } finally {
    db.supabase = originalDb;
    estimator.processSingleEstimate = originalEstimate;
    delete require.cache[fleetPath];
    if (originalFleetCache) require.cache[fleetPath] = originalFleetCache;
  }
});

test('Stripe checkout webhook acknowledges verified event without modifying vehicle rows', async () => {
  const stripePath = require.resolve('stripe');
  const dbPath = require.resolve('../src/db');
  const webhookPath = require.resolve('../src/routes/webhooks');
  const stripeCache = require.cache[stripePath];
  const webhookCache = require.cache[webhookPath];
  const db = require(dbPath);
  const originalDb = db.supabase;
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const originalStripeKey = process.env.STRIPE_SECRET_KEY;
  let mutations = 0;
  try {
    require.cache[stripePath] = {
      id: stripePath, filename: stripePath, loaded: true,
      exports: class Stripe {
        constructor() {
          this.webhooks = { constructEvent: (raw, signature, secret) => {
            assert.ok(Buffer.isBuffer(raw));
            assert.equal(signature, 'test-signed');
            assert.equal(secret, 'test-webhook-secret');
            return { type: 'checkout.session.completed', data: { object: {
              metadata: { tenant_id: 'shop_a', procurement_manifest: '[{"part":"brakes"}]' }
            } } };
          } };
        }
      }
    };
    process.env.STRIPE_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.STRIPE_SECRET_KEY = 'sk_test_fixture_only';
    db.supabase = { from() { mutations++; throw new Error('Payment attempted fleet mutation'); } };
    delete require.cache[webhookPath];
    const webhook = require(webhookPath);
    const app = express();
    app.use('/api/payments', webhook);
    const result = await post(app, '/api/payments/webhook', { id: 'evt_test' }, { 'stripe-signature': 'test-signed' });
    assert.equal(result.status, 200);
    assert.equal(result.data.received, true);
    assert.equal(mutations, 0);
  } finally {
    db.supabase = originalDb;
    if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalStripeKey;
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    delete require.cache[webhookPath];
    if (webhookCache) require.cache[webhookPath] = webhookCache;
    if (stripeCache) require.cache[stripePath] = stripeCache;
    else delete require.cache[stripePath];
  }
});

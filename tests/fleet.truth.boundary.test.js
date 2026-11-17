'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fleet = fs.readFileSync(path.join(__dirname, '../src/routes/fleet.js'), 'utf8');
const webhook = fs.readFileSync(path.join(__dirname, '../src/routes/webhooks.js'), 'utf8');

test('fleet bulk-estimate cannot write AI predictions into authoritative fleet vehicle fields', () => {
  const bulk = fleet.slice(fleet.indexOf("router.post('/bulk-estimate'"));
  assert.ok(bulk.includes("verificationStatus: 'UNVERIFIED'"));
  assert.ok(bulk.includes("source: 'AI_ESTIMATE'"));
  assert.ok(bulk.includes('processSingleEstimate'));
  assert.ok(!bulk.includes(".from('fleet_vehicles')\n            .update("),
    'bulk estimate must not update fleet vehicles from unverified AI output');
  assert.ok(!bulk.includes('status: rawResult.calculated_severity'));
  assert.ok(!bulk.includes('next_predicted_failure: rawResult.predictive_horizon'));
});

test('Stripe checkout confirmation cannot clear vehicle condition', () => {
  assert.ok(webhook.includes('stripe.webhooks.constructEvent'));
  assert.ok(webhook.includes("res.status(200).json({ received: true })"));
  assert.ok(!webhook.includes(".from('fleet_vehicles')"));
  assert.ok(!webhook.includes('All Systems Stable'));
  assert.ok(!webhook.includes("status: 'OK'"));
});

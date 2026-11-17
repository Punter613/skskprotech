'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

const webhookSource = fs.readFileSync(path.join(__dirname, '../src/routes/webhooks.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
const webhookRouter = require('../src/routes/webhooks');
const endpoint = '/api/payments/webhook/webhook';

function signature(body, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
  return 't=' + timestamp + ',v1=' + digest;
}

async function withServer(run) {
  const app = express();
  // Match the production mount and raw-body middleware order.
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), webhookRouter);
  app.use(express.json());
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const url = 'http://127.0.0.1:' + server.address().port + endpoint;
    await run(async (body, header) => fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(header ? { 'stripe-signature': header } : {})
      },
      body
    }));
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

test('missing either Stripe credential fails closed without stopping the HTTP server', async () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;
  const priorSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
  try {
    await withServer(async post => {
      for (const [key, secret] of [[undefined, undefined], ['sk_test_123', undefined], [undefined, 'whsec_test']]) {
        if (key === undefined) delete process.env.STRIPE_SECRET_KEY;
        else process.env.STRIPE_SECRET_KEY = key;
        if (secret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
        else process.env.STRIPE_WEBHOOK_SECRET = secret;
        const response = await post(body, signature(body, 'whsec_test'));
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: 'Stripe webhook not configured' });
      }
    });
  } finally {
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
    if (priorSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = priorSecret;
  }
});

test('configured webhook rejects invalid signature and acknowledges valid signature without writes', async () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;
  const priorSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const body = JSON.stringify({ id: 'evt_test', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test' } } });
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  try {
    await withServer(async post => {
      const invalid = await post(body, signature(body, 'wrong_secret'));
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), { error: 'Invalid webhook signature' });
      const valid = await post(body, signature(body, 'whsec_test'));
      assert.equal(valid.status, 200);
      assert.deepEqual(await valid.json(), { received: true });
    });
  } finally {
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
    if (priorSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = priorSecret;
  }
});

test('source tripwire: no mock credentials, side-effect writes, or raw-body mount regressions', () => {
  assert.doesNotMatch(webhookSource, /mock[_-]/i);
  assert.doesNotMatch(webhookSource, /STRIPE_(?:WEBHOOK_)?SECRET(?:_KEY)?\s*\|\|/);
  assert.doesNotMatch(webhookSource, /\.from\s*\(|\.insert\s*\(|\.upsert\s*\(|\.update\s*\(/);
  assert.match(webhookSource, /stripe\.webhooks\.constructEvent\(req\.body, sig, webhookSecret\)/);
  assert.match(serverSource, /app\.use\('\/api\/payments\/webhook', express\.raw\(\{ type: 'application\/json' \}\), webhookRouter\)/);
  assert.ok(serverSource.indexOf("app.use('/api/payments/webhook'") < serverSource.indexOf('app.use(express.json('));
  assert.match(webhookSource, /router\.post\('\/webhook'/);
});

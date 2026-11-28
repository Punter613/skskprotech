'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bootstrap = `
const Module = require('node:module');
const load = Module._load;
Module._load = function(id, parent, ...rest) {
  if (id === 'dotenv') return { config() {} };
  if (id === '../src/services/db_keepawake') return { startKeepAwakeLoop() {} };
  if (id === '../src/workers/aiWorker') return {};
  if (id === 'bull') return class { process() {} on() {} };
  if (id === 'stripe') {
    const Stripe = load.call(this, id, parent, ...rest);
    return class extends Stripe {
      constructor(...args) {
        super(...args);
        this.checkout.sessions.create = async () => {
          console.error('UNEXPECTED_CHECKOUT_CREATION');
          throw new Error('Checkout forbidden in regression');
        };
      }
    };
  }
  return load.call(this, id, parent, ...rest);
};
const http = require('node:http');
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function(port, cb) {
  return listen.call(this, 0, '127.0.0.1', () => {
    console.log('TEST_PORT=' + this.address().port);
    if (cb) cb();
  });
};
require('./api/server.js');
`;

async function withServer(configured, run) {
  const env = {
    PATH: process.env.PATH || '', NODE_ENV: 'test', PORT: '0',
    SKSK_REQUIRE_AUTH: 'true', SKSK_API_KEYS: 'synthetic-shop-key',
    SKSK_SHOP_KEY_BINDINGS: '{"synthetic-shop-key":"shop_test"}',
    ...(configured ? { STRIPE_SECRET_KEY: 'sk_test_synthetic', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic' } : {})
  };
  const child = spawn(process.execPath, ['-e', bootstrap], { cwd: root, env });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const closed = new Promise(resolve => child.once('close', resolve));
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timeout: ' + output)), 15000);
      function check() {
        const match = output.match(/TEST_PORT=([0-9]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      }
      child.stdout.on('data', check);
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited: ' + output)); });
      check();
    });
    await run((route, body, headers = {}) => fetch('http://127.0.0.1:' + port + route, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers },
      body, signal: AbortSignal.timeout(5000)
    }));
  } finally {
    child.kill('SIGKILL');
    await closed;
    assert.doesNotMatch(output, /UNEXPECTED_CHECKOUT_CREATION/);
  }
}

for (const configured of [false, true]) {
  test('actual server retires procurement, Stripe configured=' + configured, async () => {
    await withServer(configured, async post => {
      for (const headers of [{}, { 'x-tenant-id': 'synthetic' }, { 'x-sksk-api-key': 'synthetic-shop-key' }]) {
        const response = await post('/api/payments/procure-parts', JSON.stringify({ orderItems: [{ component: 'fixture', price_cents: 100 }] }), headers);
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { success: false, error: 'Not found' });
      }
      const body = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = secret => 't=' + timestamp + ',v1=' + crypto.createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
      const endpoint = '/api/payments/webhook/webhook';
      const invalid = await post(endpoint, body, { 'stripe-signature': sign('wrong') });
      assert.equal(invalid.status, configured ? 400 : 503);
      const valid = await post(endpoint, body, { 'stripe-signature': sign('whsec_synthetic') });
      assert.equal(valid.status, configured ? 200 : 503);
      if (configured) assert.deepEqual(await valid.json(), { received: true });
    });
  });
}

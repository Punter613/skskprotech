'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { durableHttpAdmission } = require('../src/middleware/durable.diagnosis.http');
const { executeDurableDiagnosis } = require('../src/services/durable.diagnosis.execute');

test('claim, terminal failure, and duplicate replay preserve identical bytes without second execution', async () => {
  const previous = { auth: process.env.SKSK_REQUIRE_AUTH, enabled: process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED };
  process.env.SKSK_REQUIRE_AUTH = 'true';
  process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED = 'true';
  try {
    let stored = null, executions = 0, claims = 0;
    const rpcClient = { rpc: async (name, args) => {
      assert.equal(args.p_shop, 'shop_A');
      if (name === 'claim_diagnosis_operation') {
        claims++;
        return { data: [{ disposition: stored ? 'PROCESSING' : 'CLAIMED',
          operation_id: '00000000-0000-0000-0000-000000000001',
          generation: 1, linked_job_id: 'DJ-test' }], error: null };
      }
      if (name === 'finish_diagnosis_operation') {
        assert.equal(args.p_terminal, 'FAILED');
        stored = { disposition: 'FAILED', http_status: args.p_http_status,
          response_bytes: args.p_response_bytes, response_content_type: 'application/json' };
        return { data: true, error: null };
      }
      if (name === 'read_diagnosis_operation') return { data: [stored], error: null };
      throw new Error('Unexpected RPC: ' + name);
    } };
    const handler = durableHttpAdmission({
      rpcClient,
      execute: (req, res, claim) => executeDurableDiagnosis(req, res, claim, rpcClient,
        async (_request, capture) => {
          executions++;
          capture.status(500).json({ success: false, error: 'diagnostic provider unavailable' });
        })
    });
    const request = () => ({ method: 'POST', path: '/',
      auth: { type: 'supabase_user', id: 'user_1', userId: '1', shopId: 'shop_A' },
      shopId: 'shop_A', body: { symptoms: ['intermittent stall'] },
      get: name => name === 'Idempotency-Key' ? 'durable-integration-key-123' : undefined });
    const response = () => ({ statusCode: 200, headers: {}, bytes: null,
      setHeader(name, value) { this.headers[name] = value; },
      status(value) { this.statusCode = value; return this; },
      send(value) { this.bytes = value; return this; },
      json(value) { this.bytes = Buffer.from(JSON.stringify(value)); return this; } });
    const first = response(), second = response();
    await handler(request(), first, () => assert.fail('legacy fallback'));
    await handler(request(), second, () => assert.fail('legacy fallback'));
    assert.equal(first.statusCode, 500);
    assert.equal(second.statusCode, 500);
    assert.deepEqual(first.bytes, second.bytes);
    assert.equal(executions, 1);
    assert.equal(claims, 2);
  } finally {
    for (const [key, env] of [['auth', 'SKSK_REQUIRE_AUTH'], ['enabled', 'SKSK_DURABLE_DIAGNOSIS_ENABLED']]) {
      if (previous[key] === undefined) delete process.env[env]; else process.env[env] = previous[key];
    }
  }
});

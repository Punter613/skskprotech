'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodePgBytea, replayDurableResponse } = require('../src/services/durable.diagnosis.replay');
test('stored bytea round-trips UTF-8 and exact JSON whitespace', () => {
  const source = Buffer.from(' { "ok": true, "symbol": "⚒" }\n');
  const encoded = String.fromCharCode(92) + 'x' + source.toString('hex');
  assert.deepEqual(decodePgBytea(encoded), source);
  const res = { headers: {}, statusCode: null, body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; },
    send(body) { this.body = body; return this; } };
  replayDurableResponse(res, { http_status: 201, response_bytes: encoded, response_content_type: 'application/json' });
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers['Content-Type'], 'application/json');
  assert.deepEqual(res.body, source);
});
test('malformed bytea or response metadata never produces a replay', () => {
  for (const bad of ['hello', String.fromCharCode(92) + 'x0', String.fromCharCode(92) + 'xzz', null]) {
    assert.throws(() => decodePgBytea(bad), { code: 'DURABLE_RESPONSE_ENCODING' });
  }
  assert.throws(() => replayDurableResponse({}, { http_status: 200, response_bytes: '', response_content_type: 'text/html' }), { code: 'DURABLE_RESPONSE_METADATA' });
});

test('replay rejects bodyless statuses and corrupt JSON before writing headers', () => {
  const encoded = String.fromCharCode(92) + 'x' + Buffer.from('{"ok":true}').toString('hex');
  for (const status of [100, 204, 205, 304, 600]) {
    const res = { status() { assert.fail('must not write response'); } };
    assert.throws(() => replayDurableResponse(res, {
      http_status: status, response_bytes: encoded, response_content_type: 'application/json'
    }), { code: 'DURABLE_RESPONSE_METADATA' });
  }
  for (const body of ['not-json', '[]', '{"incomplete":']) {
    const res = { status() { assert.fail('must not write response'); } };
    assert.throws(() => replayDurableResponse(res, {
      http_status: 500,
      response_bytes: String.fromCharCode(92) + 'x' + Buffer.from(body).toString('hex'),
      response_content_type: 'application/json'
    }), { code: 'DURABLE_RESPONSE_ENCODING' });
  }
});

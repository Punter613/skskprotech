'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitize, requestId } = require('../src/middleware/observability');

test('observability redacts credentials and customer identifiers recursively', () => {
  const value = sanitize({
    authorization: 'Bearer secret',
    apiKey: 'secret',
    nested: { vin: '1HGBH41JXMN109186', phone: '555-0100', email: 'shop@example.com' },
    safe: 'ok'
  });
  assert.equal(value.authorization, '[redacted]');
  assert.equal(value.apiKey, '[redacted]');
  assert.equal(value.nested.vin, '[redacted]');
  assert.equal(value.nested.phone, '[redacted]');
  assert.equal(value.nested.email, '[redacted]');
  assert.equal(value.safe, 'ok');
});

test('request ids accept safe caller correlation ids and reject unsafe values', () => {
  assert.equal(requestId('shop-request-123'), 'shop-request-123');
  assert.match(requestId('bad id with spaces'), /^req_[0-9a-f-]{36}$/i);
});

test('server wires request telemetry before routes and structured error telemetry at terminus', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../api/server'), 'utf8');
  const telemetry = source.indexOf('app.use(requestTelemetry)');
  const diagnose = source.indexOf("app.use('/api/diagnose'");
  assert.ok(telemetry >= 0 && telemetry < diagnose);
  assert.match(source, /errorTelemetry\(err, req, res, next\)/);
});

test('global client error handler redacts internal messages outside development', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(require.resolve('../api/server'), 'utf8');
  const handler = source.match(/app\.use\(\(err, req, res, next\) => \{([\s\S]*?)return errorTelemetry\(err, req, res, next\);/);
  assert.ok(handler, 'global error handler must be present');
  assert.match(handler[1], /error:\s*process\.env\.NODE_ENV\s*===\s*'development'\s*\?\s*\(err\.message\s*\|\|\s*'Request error'\)\s*:\s*'Request error'/);
  assert.doesNotMatch(handler[1], /:\s*err\.message\s*[,}]/, 'production must not expose err.message');
});

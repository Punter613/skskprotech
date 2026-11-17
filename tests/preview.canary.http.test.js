'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');

const A = 'fixture-incoming-secret-A-unique-8b72';
const B = 'fixture-internal-secret-B-unique-9e41';

function containsSecret(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return serialized.includes(A) || serialized.includes(B);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

test('preview evidence HTTP gate, execution and secrecy (stubbed upstreams)', { timeout: 45000 }, async () => {
  const port = await freePort();
  const child = fork(path.join(__dirname, 'fixtures/preview.canary.server.js'), [], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', IS_PULL_REQUEST: 'true' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  let logs = '';
  const calls = [];
  const messages = [];
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { logs += data.toString(); });
  child.on('message', msg => {
    messages.push(msg);
    if (msg.type === 'call') calls.push(msg);
  });
  const awaitMessage = async (type, offset = 0) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const found = messages.slice(offset).find(m => m.type === type);
      if (found) return found;
      if (child.exitCode !== null) throw new Error('Fixture process exited before expected event');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Fixture did not report expected event');
  };
  const configure = async internal => {
    const offset = messages.length;
    child.send({ type: 'config', internal });
    await awaitMessage('configured', offset);
  };
  const request = async (authorization, expected, stage) => {
    const headers = authorization ? { Authorization: 'Bearer ' + authorization } : {};
    const response = await fetch('http://127.0.0.1:' + port + '/health/preview-evidence', { headers });
    const body = await response.text();
    const serialized = JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers), body });
    assert.equal(containsSecret(serialized), false, 'Credential must not appear in HTTP output');
    assert.equal(response.status, expected);
    if (stage) assert.equal(JSON.parse(body).stage, stage);
    assert.equal(containsSecret(logs), false, 'Credential must not appear in captured logs');
    return JSON.parse(body);
  };
  try {
    await awaitMessage('ready');
    const baseline = calls.length;
    await request(null, 401);
    assert.equal(calls.length, baseline);
    await request('unrecognized-tenant-key', 401);
    assert.equal(calls.length, baseline);
    await request('fixture-wrong-tenant-secret-D', 403);
    assert.equal(calls.length, baseline, 'Wrong tenant must not run upstreams');
    // Exercise the second REAL HTTP route. All rejections must occur before
    // job creation, persistence, or any internal request.
    for (const [credential, expected] of [
      [null, 401],
      ['unrecognized-tenant-key', 401],
      ['fixture-wrong-tenant-secret-D', 403]
    ]) {
      const headers = credential ? { Authorization: 'Bearer ' + credential } : {};
      const response = await fetch('http://127.0.0.1:' + port + '/health/preview-unverified-diagnosis', { headers });
      const body = await response.text();
      assert.equal(response.status, expected);
      assert.equal(containsSecret(JSON.stringify({ body, headers: Object.fromEntries(response.headers) })), false);
      assert.equal(calls.length, baseline, 'Rejected unverified canary must not call stubbed upstreams');
    }
    assert.equal(messages.filter(m => m.type === 'lifecycle-write').length, 0, 'Rejected requests must not write jobs');
    assert.equal(containsSecret(logs), false);
    // A is a verified synthetic user session for the dedicated canary tenant.
    // B is a distinct shop API key for outbound calls; never interchange them.
    await configure('missing');
    const missing = await request(A, 502, 'preview-evidence-smoke');
    assert.equal(typeof missing.error, 'string');
    assert.equal(calls.length, baseline, 'Missing internal credential must not run upstreams');
    await configure('invalid');
    await request(A, 502, 'preview-evidence-smoke');
    assert.equal(calls.length, baseline, 'Invalid internal credential must not run upstreams');
    // Unverified route must reject broken canary provisioning before creating a job.
    // This uses the real server route and the real canaryCredential validation.
    for (const mode of ['missing', 'invalid']) {
      await configure(mode);
      const response = await fetch('http://127.0.0.1:' + port + '/health/preview-unverified-diagnosis', {
        headers: { Authorization: 'Bearer ' + A }
      });
      const body = await response.text();
      assert.equal(response.status, 503, mode + ' canary config must fail closed');
      assert.equal(JSON.parse(body).stage, 'preview-unverified-diagnosis-smoke');
      assert.equal(containsSecret(JSON.stringify({ body, headers: Object.fromEntries(response.headers) })), false);
      assert.equal(calls.length, baseline, 'Bad config must not reach stubbed upstreams');
      assert.equal(containsSecret(logs), false);
    }
    const countOffset = messages.length;
    child.send({ type: 'counts' });
    const beforeAuthorized = await awaitMessage('counts', countOffset);
    assert.equal(beforeAuthorized.lifecycleWrites, 0, 'Unauthorized and bad-config requests must perform zero lifecycle writes');
    await configure('valid');
    const result = await request(A, 200);
    assert.equal(result.ok, true);
    assert.equal(result.decode.vehicle.marker, 'decode-marker');
    assert.equal(result.quickAsk.repairDiagnosisSource, 'quick-ask-marker');
    assert.equal(result.quickAsk.referenceTitles[0], 'stub-reference');
    assert.equal(calls.length, baseline + 2);
    assert.deepEqual(calls.map(c => c.route), ['decode', 'quick-ask']);
    assert.equal(calls.every(c => c.authenticated), true);
    assert.equal(calls.find(c => c.route === 'quick-ask').consumed, true);
    assert.equal(containsSecret(logs), false, 'Credential must not appear in final logs');
    // Authorized execution of the second real HTTP route, with stubbed internals.
    const authorizedResponse = await fetch('http://127.0.0.1:' + port + '/health/preview-unverified-diagnosis', {
      headers: { Authorization: 'Bearer ' + A }
    });
    const authorizedBody = await authorizedResponse.text();
    assert.equal(authorizedResponse.status, 200, authorizedBody);
    assert.equal(JSON.parse(authorizedBody).ok, true);
    assert.equal(containsSecret(authorizedBody), false);
    const internalCalls = messages.filter(m => m.type === 'internal-unverified');
    assert.deepEqual(internalCalls.map(m => m.route), ['fallback', 'estimate']);
    assert.equal(internalCalls.every(m => m.authenticated), true);
    const writeOperations = messages.filter(m => m.type === 'lifecycle-write').map(m => m.operation);
    assert.deepEqual(writeOperations, ['createJob', 'recordDiagnosis', 'patchJob']);
    assert.equal(containsSecret(logs), false);
    assert.equal(containsSecret(messages), false, 'Credential must not appear in serialized IPC events');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited.catch(() => {});
    }
  }
});

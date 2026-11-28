'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { parseOptions, statistics, runBenchmark } = require('../scripts/stress-sksk-50');

async function withServer(handler, run) {
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const result = await handler(req, JSON.parse(body));
    res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.data));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function config(url, args) {
  return parseOptions(['--url', url, ...args]);
}

test('rejects non-local targets, unsupported engines, invalid VINs, excessive runs, and unsafe lifecycle', () => {
  assert.throws(() => parseOptions(['--url', 'https://example.com']), /loopback/);
  assert.throws(() => parseOptions(['--url', 'http://192.168.1.2:3000']), /loopback/);
  assert.throws(() => parseOptions(['--url', 'http://127.0.0.1:3000/api']), /loopback/);
  assert.throws(() => parseOptions(['--engine', 'unknown']), /Engine/);
  assert.throws(() => parseOptions(['--vin', 'NOT-A-VIN']), /VIN/);
  assert.throws(() => parseOptions(['--runs', '501']), /runs/);
  assert.throws(() => parseOptions(['--concurrency', '10']), /concurrency/);
  assert.throws(() => parseOptions(['--engine', 'current', '--lifecycle']), /confirm-isolated/);
  assert.equal(parseOptions(['--engine', 'current', '--lifecycle', '--confirm-isolated-test-server']).lifecycle, true);
});

test('nearest-rank latency statistics are deterministic', () => {
  assert.deepEqual(statistics([50, 10, 40, 30, 20]), {
    count: 5, min: 10, mean: 30, p50: 30, p95: 50, p99: 50, max: 50
  });
  assert.equal(statistics([]).p95, null);
});

test('legacy fixed 10 and random 50 classify simulated fallback without claiming real AI', async () => {
  let count = 0;
  await withServer(async (req, body) => {
    assert.equal(req.url, '/api/full-estimate');
    assert.equal(body.vin.length, 17);
    count++;
    return { data: { success: true, duration_ms: 12,
      estimate: { diagnosis: 'AI simulation: Manual inspection required', repairs: ['Diagnostic inspection required'] },
      meta: { ai_used: true }, parts: [], tsb_count: 0, guide: 'manual inspection' } };
  }, async url => {
    const fixed = await runBenchmark(config(url, ['--runs', '10']), () => {});
    assert.equal(fixed.summary.passed, 10);
    assert.equal(fixed.summary.fallbackCount, 10);
    assert.equal(fixed.summary.reportedAiUsedCount, 10);
    assert.equal(fixed.summary.serverMs.mean, 12);
    const random = await runBenchmark(config(url, ['--mode', 'random', '--runs', '50']), () => {});
    assert.equal(random.summary.passed, 50);
    assert.equal(random.summary.fallbackCount, 50);
    assert.equal(random.rows.length, 50);
  });
  assert.equal(count, 60);
});

test('bounded concurrency never exceeds requested in-flight count', async () => {
  let pending = 0;
  let peak = 0;
  await withServer(async () => {
    pending++;
    peak = Math.max(peak, pending);
    await new Promise(resolve => setTimeout(resolve, 15));
    pending--;
    return { data: { success: true, duration_ms: 15, estimate: { diagnosis: 'Check ignition circuit' }, meta: {} } };
  }, async url => {
    const result = await runBenchmark(config(url, ['--mode', 'concurrent', '--runs', '50', '--concurrency', '5']));
    assert.equal(result.summary.passed, 50);
    assert.equal(result.summary.failed, 0);
    assert.equal(result.summary.fallbackCount, 0);
    assert.ok(result.summary.throughputPerSecond > 0);
    assert.ok(result.rows.every(row => Number.isFinite(row.wallMs)));
  });
  assert.ok(peak > 1, `peak was ${peak}`);
  assert.ok(peak <= 5, `peak was ${peak}`);
});

test('HTTP errors and missing success fields are reported per run, never as successes', async () => {
  let count = 0;
  await withServer(async () => {
    count++;
    if (count === 1) return { status: 503, data: { success: false, error: 'Unavailable' } };
    return { data: { success: true } };
  }, async url => {
    const result = await runBenchmark(config(url, ['--runs', '2']));
    assert.equal(result.summary.failed, 2);
    assert.deepEqual(result.summary.failureKinds, { http_503: 1, schema: 1 });
  });
});

test('current default tests diagnose only and never writes fabricated verification', async () => {
  const endpoints = [];
  await withServer(async req => {
    endpoints.push(req.url);
    return { data: { success: true, jobId: 'job-1', result: { primaryCause: 'Ignition fault' } } };
  }, async url => {
    const result = await runBenchmark(config(url, ['--engine', 'current', '--runs', '10']));
    assert.equal(result.summary.passed, 10);
    assert.equal(result.summary.lifecycleCompleted, 0);
    assert.ok(result.rows.every(row => row.note.includes('DIAGNOSE only')));
  });
  assert.deepEqual(new Set(endpoints), new Set(['/api/diagnose']));
});

test('current isolated lifecycle measures each stage and uses the returned test ID', async () => {
  const paths = [];
  await withServer(async (req, body) => {
    paths.push(req.url);
    if (req.url === '/api/diagnose') return { data: { success: true, jobId: 'job123', result: { primaryCause: 'Ignition coil circuit' } } };
    if (req.url === '/api/jobs/job123/tests') {
      assert.equal(body.evidenceRole, 'CONFIRMS');
      assert.equal(body.confirmedFault, 'Ignition coil circuit');
      return { status: 201, data: { success: true, test: { id: 'test456' } } };
    }
    if (req.url === '/api/jobs/job123/verify') {
      assert.deepEqual(body.evidenceTestIds, ['test456']);
      return { data: { success: true, verifiedCase: { fingerprint: 'sample-only' } } };
    }
    if (req.url === '/api/estimateHeuristic') {
      assert.equal(body.jobId, 'job123');
      return { data: { success: true, estimate: { diagnosis: 'Inspect coil', total: 160,
        aiTrace: { provider: 'none', fallbackReason: 'no key', totalRouteLatencyMs: 22 } } } };
    }
    return { status: 404, data: { success: false, error: 'Unknown path' } };
  }, async url => {
    const result = await runBenchmark(config(url, ['--engine', 'current', '--runs', '1',
      '--lifecycle', '--confirm-isolated-test-server']));
    assert.equal(result.summary.passed, 1);
    assert.equal(result.summary.lifecycleCompleted, 1);
    assert.equal(result.rows[0].estimateTotal, 160);
    assert.equal(result.rows[0].serverEstimateMs, 22);
    assert.ok(Object.values(result.rows[0].steps).every(Number.isFinite));
  });
  assert.deepEqual(paths, ['/api/diagnose', '/api/jobs/job123/tests', '/api/jobs/job123/verify', '/api/estimateHeuristic']);
});

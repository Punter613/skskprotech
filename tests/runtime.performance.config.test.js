'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function workflow(name) {
  return fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', name), 'utf8');
}

test('customer estimate runtime allows measured free-tier cold-start headroom', () => {
  const source = workflow('customer-estimate-runtime.yaml');
  const matches = [...source.matchAll(/--max-time\s+(\d+)/g)].map(match => Number(match[1]));
  assert.ok(matches.includes(45), 'expected business-operation timeout of at least 45 seconds');
});

test('exact-head final health check is not capped at the old 15 second threshold', () => {
  const source = workflow('render-exact-head.yml');
  assert.match(source, /--max-time\s+30/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../src/routes/diagnose');
test('diagnostic execution is reusable without installing legacy lifecycle middleware', () => {
  assert.equal(typeof router.executeDiagnosis, 'function');
  const route = router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.post);
  assert.ok(route);
  assert.equal(route.route.stack[0].handle, router.executeDiagnosis);
});

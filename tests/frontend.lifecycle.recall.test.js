'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'estimate-center.html'), 'utf8');

test('lifecycle recall renders Work Order execution truth', () => {
  assert.match(html, /workOrderDocuments/);
  assert.match(html, /AUTHORIZED \+ COMPLETED/);
  assert.match(html, /completionNote/);
  assert.match(html, /Remaining/);
});

test('final completed-work invoice is printable from lifecycle recall', () => {
  assert.match(html, /Print Final Invoice/);
  assert.match(html, /function printFinalInvoice/);
  assert.match(html, /Only work that was explicitly authorized and recorded COMPLETED is billed/);
  assert.match(html, /Invoice fingerprint/);
});

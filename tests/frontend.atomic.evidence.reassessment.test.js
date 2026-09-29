'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lifecyclePath = path.join(__dirname, '..', 'public', 'lifecycle.html');
const atomicUiPath = path.join(__dirname, '..', 'public', 'js', 'atomic-evidence-ui.js');

test('lifecycle loads the atomic evidence override after the legacy inline handlers', () => {
  const html = fs.readFileSync(lifecyclePath, 'utf8');
  const legacyIndex = html.indexOf("$('unverifiedDiagnosis').onclick");
  const atomicScriptIndex = html.indexOf('/js/atomic-evidence-ui.js');
  assert.ok(legacyIndex >= 0, 'legacy handler remains for compatibility fallback');
  assert.ok(atomicScriptIndex > legacyIndex, 'atomic override must load after legacy handler');
});

test('atomic lifecycle UI saves unsaved evidence inside reassessment and handles fail-closed stale state', () => {
  const js = fs.readFileSync(atomicUiPath, 'utf8');
  assert.match(js, /tests\/batch/);
  assert.match(js, /unverified-diagnosis/);
  assert.match(js, /Save Evidence \+ Get Unverified Diagnosis/);
  assert.match(js, /unsaved test findings are persisted first in the same action/i);
  assert.match(js, /diagnosisStale === true/);
  assert.match(js, /prior diagnosis STALE; reassessment failed/);
  assert.match(js, /The mechanic evidence is preserved/);
  assert.match(js, /stableId/);
  assert.match(js, /evidenceReusedCount/);
});


test('Brain retrieval expands from mechanic observations and diagnostic candidates', () => {
  const html = fs.readFileSync(lifecyclePath, 'utf8');
  assert.match(html, /const mechanicContext=\$\('notes'\)\.value\.trim\(\)/);
  assert.match(html, /const diagnosticContext=lastDiagnosis/);
  assert.match(html, /lastDiagnosis\.secondaryCauses/);
  assert.match(html, /lastDiagnosis\.probability/);
  assert.match(html, /retrievalQuery=\[query,customerQuery,mechanicContext,translatedContext,keywordContext,codeContext,diagnosticContext\]/);
});

test('unverified UI labels causal grouping as unverified', () => {
  const js = fs.readFileSync(atomicUiPath, 'utf8');
  assert.match(js, /Possible cause chain · UNVERIFIED/);
  assert.match(js, /Pressure \/ upstream candidates/);
  assert.match(js, /Possible leak points/);
  assert.match(js, /Observed consequences/);
});

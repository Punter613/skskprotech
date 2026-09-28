'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'lifecycle.html'), 'utf8');
const redirects = fs.readFileSync(path.join(__dirname, '..', 'public', '_redirects'), 'utf8');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'server.js'), 'utf8');

test('public root enters the verified lifecycle UI', () => {
  assert.match(redirects, /^\/ \/lifecycle\.html 200/m);
  assert.match(html, /1 INTAKE/);\n  assert.match(html, /Run Diagnosis/);
  assert.match(html, /TEST/);
  assert.match(html, /VERIFY/);
  assert.match(html, /ESTIMATE/);
  assert.match(html, /INVOICE/);
});

test('frontend captures engine trim and sends only verified DTC context through automatic retrieval', () => {
  assert.match(html, /<label>Engine \/ Trim<\/label><input id="engine"/);
  const enginePayloadUses = html.match(/engine:\$\('engine'\)\.value\.trim\(\)/g) || [];
  assert.equal(enginePayloadUses.length, 2);
  assert.match(html, /function verifiedDtcContext\(\)/);
  assert.match(html, /filter\(item=>item\.verified===true&&item\.source==='SCAN_TOOL'\)/);
  assert.match(html, /const codeContext=verifiedDtcContext\(\)/);
  assert.match(html, /query:retrievalQuery/);
});

test('frontend requires explicit DTC provenance and sends provenance objects to Diagnose', () => {
  assert.match(html, /id="dtcSource"/);
  assert.match(html, /value="MANUAL_ENTRY" selected>Typed \/ not verified/);
  assert.match(html, /value="SCAN_TOOL">Read from scan tool — verified/);
  assert.match(html, /value="CUSTOMER_REPORTED">Customer reported/);
  assert.match(html, /value="PLACEHOLDER">Placeholder \/ test data/);
  assert.match(html, /Only codes explicitly marked <b>Read from scan tool — verified<\/b> enter diagnostic ranking/);
  assert.match(html, /function dtcEvidenceFromForm\(\)/);
  assert.match(html, /const verified=source==='SCAN_TOOL'/);
  assert.match(html, /dtcEvidence:dtcEvidenceFromForm\(\)/);
  assert.doesNotMatch(html, /codes:list\(\$\('codes'\)\.value\)/);
  assert.match(html, /kept in the job audit trail but excluded from diagnostic ranking/);
});

test('lifecycle restores explicit VIN decode autofill and shared customer-language normalization', () => {
  assert.match(html, /id="decodeVin"[^>]*>🔍 Decode/);
  assert.match(html, /post\('\/api\/vehicle\/decode',\{vin\}\)/);
  assert.match(html, /\$\('year'\)\.value=v\.year\|\|''/);
  assert.match(html, /\$\('make'\)\.value=v\.make\|\|''/);
  assert.match(html, /\$\('model'\)\.value=v\.model\|\|''/);
  assert.match(html, /\$\('engine'\)\.value=engineLabel/);
  assert.match(html, /id="translateSymptoms"[^>]*>🔄 Translate to Tech/);
  assert.match(html, /post\('\/api\/translate',\{text:raw\}\)/);
  assert.match(html, /el\.dataset\.aiTranslation=d\.translated\|\|''/);
  assert.match(html, /el\.dataset\.aiKeywords=JSON\.stringify/);
  assert.doesNotMatch(html, /\$\('symptoms'\)\.value=d\.translated/);
  assert.match(serverSource, /app\.use\('\/api\/translate'/);
  assert.match(serverSource, /app\.use\('\/api\/vehicle'/);
});

test('normalizer keywords narrow both diagnosis evidence and Customer States fallback Quick Ask', () => {
  assert.match(html, /function translatedSymptomContext\(\)/);
  assert.match(html, /keywords:translated\.keywords/);
  assert.match(html, /const retrievalQuery=\[query,translatedContext,keywordContext,codeContext\]/);
  assert.match(html, /symptoms:lines\(\$\('symptoms'\)\.value\)/);
});

test('Run Diagnosis stays primary while read-only Brain assistance is secondary', () => {
  assert.match(html, /id="diag" class="btn primary major"/);
  assert.doesNotMatch(html, /id="quickAsk" class="btn knowledge major"/);
  assert.match(html, /id="quickAsk" class="btn knowledge compact"[^>]*>🧠 Ask Brain/);
});

test('unverified diagnosis fallback is downstream of saved mechanic evidence and remains explicitly locked', () => {
  const testCardIndex = html.indexOf('id="testCard"');
  const saveIndex = html.indexOf('id="saveTests"');
  const fallbackIndex = html.indexOf('id="unverifiedDiagnosis"');
  const verifyCardIndex = html.indexOf('id="verifyCard"');
  assert.ok(testCardIndex >= 0 && saveIndex > testCardIndex, 'test save must live in Confirmation Tests');
  assert.ok(fallbackIndex > saveIndex, 'unverified reassessment must come after evidence-save controls');
  assert.ok(verifyCardIndex > fallbackIndex, 'fallback must appear before explicit VERIFY card');
  assert.match(html, /⚠️ Unable to Complete Verification Testing\?/);
  assert.match(html, /Get an Unverified Diagnosis/);
  assert.match(html, /hasUnsavedEvidence\(\)/);
  assert.match(html, /Save the new mechanic evidence before requesting reassessment/);
  assert.match(html, /This diagnosis has not been physically verified\. It does not authorize a repair and does not unlock Estimate\./);
  assert.match(html, /\/api\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/unverified-diagnosis/);
  assert.match(html, /d\.diagnosisState!==['"]UNVERIFIED_DIAGNOSIS['"]/);
  assert.match(html, /\$\('estimateCard'\)\.hidden=true/);
});

test('frontend exposes evidence meaning separately from measurement status', () => {
  assert.match(html, /class="testEvidenceRole"/);
  assert.match(html, /value="NEUTRAL">Observed \/ neutral — rerank only/);
  assert.match(html, /value="SUPPORTS">Supports hypothesis — not verification/);
  assert.match(html, /value="REFUTES">Refutes hypothesis/);
  assert.match(html, /value="CONFIRMS">CONFIRMS a specific fault — VERIFY eligible/);
  assert.match(html, /class="testConfirmedFault"/);
  assert.match(html, /Required only when Evidence meaning = CONFIRMS/);
});

test('additional mechanic finding is persisted as neutral reranking evidence', () => {
  assert.match(html, /Additional findings are stored as NEUTRAL evidence by default/);
  assert.match(html, /name:'Additional mechanic finding',result:extra,passed:null,evidenceRole:'NEUTRAL',confirmedFault:''/);
});

test('frontend exposes explicit verify action before estimate unlock', () => {
  assert.match(html, /id="verify"[^>]*disabled>✅ VERIFY FAULT — Unlock Estimate/);
  assert.match(html, /\/api\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/tests/);
  assert.match(html, /\/api\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/verify/);
  assert.match(html, /d\.status!==['"]VERIFIED['"]\|\|!d\.verifiedCase/);
});

test('frontend does not prefill the diagnostic hypothesis as the confirmed fault', () => {
  assert.match(html, /\$\('candidate'\)\.textContent=`Revision 1 · \$\{cause\}`/);
  assert.match(html, /\$\('cause'\)\.value=''/);
  assert.doesNotMatch(html, /\$\('cause'\)\.value=cause/);
  assert.match(html, /Current diagnostic candidate — hypothesis only/);
});

test('new evidence invalidates stale candidate UI and reassessment refreshes diagnosis revision', () => {
  assert.match(html, /New evidence recorded — diagnosis reassessment pending/);
  assert.match(html, /New evidence was saved after the last diagnostic revision/);
  assert.match(html, /currentDiagnosisRevision=Math\.max\(1,Number\(d\.diagnosisRevision\)/);
  assert.match(html, /\$\('candidate'\)\.textContent=`Revision \$\{currentDiagnosisRevision\} · \$\{u\.mostLikelyCause/);
});

test('frontend only offers CONFIRMS evidence for positive VERIFY', () => {
  assert.match(html, /function verificationEligibleTests\(\)/);
  assert.match(html, /toUpperCase\(\)===['"]CONFIRMS['"]/);
  assert.match(html, /String\(t\?\.confirmedFault\|\|''\)\.trim\(\)/);
  assert.match(html, /No confirmation-grade evidence yet/);
  assert.match(html, /\$\('verify'\)\.disabled=!eligible\.length/);
  assert.match(html, /\$\('verifyCard'\)\.hidden=!eligible\.length/);
  assert.match(html, /Select at least one CONFIRMS test tied to this exact fault/);
  assert.match(html, /Neutral\/supporting\/refuting observations never unlock Estimate/);
});

test('Quick Ask presents focused service-manual pointers rather than scraped text dumps', () => {
  assert.match(html, /Service Manual Reference/);
  assert.match(html, /Matched keywords:/);
  assert.match(html, /Open service-manual reference/);
  assert.match(html, /External service-manual reference/);
  assert.match(html, /No focused service-manual reference found for these keywords/);
  assert.doesNotMatch(html, /\$\{m\.snippet\?/);
  assert.doesNotMatch(html, /\$\{esc\(m\.source\|\|d\.repairDiagnosisSource/);
});

test('Quick Ask visibly warns when a bounded retrieval source may be partial', () => {
  assert.match(html, /scanWarnings=.*scan bound/);
  assert.match(html, /Retrieval bound reached\./);
  assert.match(html, /status warn/);
});

test('Render PR preview can call its own API without opening CORS to arbitrary Render apps', () => {
  assert.match(serverSource, /\^p613-backend-pr-\\d\+\\\.onrender\\\.com\$/);
  assert.doesNotMatch(serverSource, /hostname\.endsWith\(['"]\.onrender\.com['"]\)/);
});

test('verified estimate follows the same persisted job into customer authorization, not direct billing', () => {
  assert.match(html, /post\(['"]\/api\/estimateHeuristic['"],\{jobId/);
  assert.match(html, /estimate-center\/\$\{encodeURIComponent\(jobId\)\}\/from-verified-estimate/);
  assert.doesNotMatch(html, /\/api\/invoice\/build/);
  assert.match(html, /A verified estimate is not permission to perform or bill work/);
});

test('not verified keeps estimate locked', () => {
  assert.match(html, /Not verified\. Continue testing; estimate remains locked\./);
  assert.match(html, /\$\('estimateCard'\)\.hidden=true/);
});

test('technician workspace shows one focused stage and keeps Brain outside diagnostic authority progression', () => {
  assert.match(html, /data-workspace-card="Diag"/);
  assert.match(html, /data-workspace-card="Brain"/);
  assert.match(html, /data-workspace-card="Test"/);
  assert.match(html, /data-workspace-card="Verify"/);
  assert.match(html, /data-workspace-card="Estimate"/);
  assert.match(html, /data-workspace-card="Invoice"/);
  assert.match(html, /function showWorkspace\(name\)/);
  assert.match(html, /workspaceCard\.workspaceActive/);
  assert.match(html, /Authority: <strong>READ-ONLY KNOWLEDGE<\/strong>/);
  assert.match(html, /Brain is a read-only mechanic aid\. It never advances diagnostic authority\./);
  assert.match(html, /if\(name==='Brain'\)return showWorkspace\('Brain'\)/);
  assert.match(html, /const authorityOrder=\['Diag','Test','Verify','Estimate','Invoice'\]/);
});

test('workspace transitions follow technician actions instead of accumulating cards', () => {
  assert.match(html, /showWorkspace\('Brain'\);out\.innerHTML='<div class="status">Searching SKSK knowledge/);
  assert.match(html, /stage\('Test'\)/);
  assert.match(html, /stage\('Verify'\)/);
  assert.match(html, /stage\('Estimate'\)/);
  assert.match(html, /stage\('Invoice'\)/);
  assert.doesNotMatch(html, /testCard'\)\.scrollIntoView/);
  assert.doesNotMatch(html, /verifyCard'\)\.scrollIntoView/);
  assert.doesNotMatch(html, /estimateCard'\)\.scrollIntoView/);
  assert.doesNotMatch(html, /invoiceCard'\)\.scrollIntoView/);
});

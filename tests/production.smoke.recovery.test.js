'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const smoke=fs.readFileSync(path.join(__dirname,'../.github/workflows/production-safety-smoke.yml'),'utf8');
test('production smoke is non-destructive and checks health database auth boundary and retired API',()=>{
 for(const term of ['/health','database.ok','/api/diagnose','/api/full-estimate','401','410']) assert.ok(smoke.includes(term),term);
 assert.equal(/X-SKSK-API-Key|Authorization: Bearer/.test(smoke),false,'smoke must not contain production credentials');
});
test('recovery runbook preserves auth and data safety',()=>{
 const doc=fs.readFileSync(path.join(__dirname,'../docs/PRODUCTION_RECOVERY.md'),'utf8');
 for(const term of ['last known-good','Do not disable it','Never mass-delete','rotate']) assert.ok(doc.includes(term),term);
});

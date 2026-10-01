'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const smoke=fs.readFileSync(path.join(__dirname,'../.github/workflows/production-safety-smoke.yml'),'utf8');
test('production smoke is non-destructive and checks health database auth boundary and retired API',()=>{
 for(const term of ['/health','database.ok','/api/diagnose','/api/full-estimate','401','404','estimate-shaped success']) assert.ok(smoke.includes(term),term);
 assert.ok(smoke.includes("secrets.SKSK_TEST_API_KEY"),'test credential must come from GitHub Secrets');
 assert.ok(smoke.includes("X-SKSK-API-Key: $SKSK_TEST_API_KEY"),'authenticated smoke must send the secret only at runtime');
 assert.equal(/X-SKSK-API-Key:(?!\s*\$SKSK_TEST_API_KEY)\s*\S/.test(smoke),false,'no literal API credential may be committed');
});
test('recovery runbook preserves auth and data safety',()=>{
 const doc=fs.readFileSync(path.join(__dirname,'../docs/PRODUCTION_RECOVERY.md'),'utf8');
 for(const term of ['last known-good','Do not disable it','Never mass-delete','rotate']) assert.ok(doc.includes(term),term);
});

test('authenticated smoke uses isolated auth probe without provider spend',()=>{
 assert.ok(smoke.includes('$BASE_URL/health/auth-test'),'test key must target the isolated auth probe');
 assert.ok(smoke.includes('Expected authenticated test probe to return 200'),'valid test probe must require HTTP 200');
 assert.equal(/X-SKSK-API-Key: \$SKSK_TEST_API_KEY[^\n]*\/api\/diagnose/.test(smoke),false,'test key must not authorize the diagnose route');
 assert.equal(/\/api\/diagnose[^\n]*X-SKSK-API-Key: \$SKSK_TEST_API_KEY/.test(smoke),false,'test key must not be posted to diagnose');
});

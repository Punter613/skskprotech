'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('production privacy baseline documents sensitive classes and non-destructive retention boundary',()=>{
 const doc=fs.readFileSync(path.join(__dirname,'../docs/DATA_PRIVACY_RETENTION.md'),'utf8');
 for(const term of ['Customer PII','Vehicle identifiers','Credentials','Learning/evaluation data','Do not silently delete existing production records']) assert.ok(doc.includes(term),term);
});

test('structured request telemetry does not log request bodies',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/middleware/observability.js'),'utf8');
 assert.equal(/req\.body/.test(source),false);
 for(const term of ['authorization','vin','phone','email']) assert.ok(source.toLowerCase().includes(term),term);
});

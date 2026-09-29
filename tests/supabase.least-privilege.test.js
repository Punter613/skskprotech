'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../db/migrations/011_supabase_least_privilege.sql'),'utf8').toLowerCase();

test('direct database roles are closed by default',()=>{
  for(const role of ['anon','authenticated']){
    assert.ok(sql.includes('all on all tables in schema public from '+role));
    assert.ok(sql.includes('all on all sequences in schema public from '+role));
    assert.ok(sql.includes('execute on all functions in schema public from '+role));
  }
  assert.ok(sql.includes('alter default privileges'));
});

test('service role is not revoked by the migration',()=>{
  assert.equal(/from\s+service_role/.test(sql),false);
});

'use strict';
const test=require('node:test'); const assert=require('node:assert/strict'); const fs=require('node:fs'); const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../db/migrations/010_supabase_security_hardening.sql'),'utf8').toLowerCase();
test('supabase security migration removes known high-confidence advisor findings',()=>{
 assert.ok(sql.includes('security_invoker = true'));
 assert.ok(sql.includes('alter table public.scraped_manuals enable row level security'));
 assert.ok(sql.includes("auth.jwt() -> 'app_metadata'"));
 assert.equal(sql.includes("auth.jwt() -> 'user_metadata'"),false);
 for(const fn of ['set_created_month','fleet_vehicles_touch_updated_at','calculate_tax_setaside','job_outcome_events_append_only','update_updated_at_column','record_job_outcome_event']) assert.ok(sql.includes('alter function public.'+fn),fn);
});
test('migration is non-destructive to production records',()=>{
 assert.equal(/drop\s+table|truncate\s+|delete\s+from/.test(sql),false);
});

-- Security hardening.
-- Restored verbatim from production supabase_migrations.schema_migrations
-- (project irwhynrausoqjokyaxbf, version 20260929225103, name supabase_security_hardening) on 2026-11-18.
-- Already applied in production; statement text and order unchanged, one statement per line.
alter view public.tax_summary set (security_invoker = true);
alter view public.quarterly_tax_summary set (security_invoker = true);
alter function public.set_created_month() set search_path = '';
alter function public.fleet_vehicles_touch_updated_at() set search_path = '';
alter function public.job_outcome_events_append_only() set search_path = '';
alter function public.update_updated_at_column() set search_path = '';
alter function public.calculate_tax_setaside() set search_path = public;
alter function public.record_job_outcome_event(text,text,text,text,text,text,jsonb,text,jsonb,text,text,integer,text) set search_path = public;
alter table public.scraped_manuals enable row level security;
drop policy if exists tenant_read_policy on public.tenants;
create policy tenant_read_policy on public.tenants for select to authenticated using (id = nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid);

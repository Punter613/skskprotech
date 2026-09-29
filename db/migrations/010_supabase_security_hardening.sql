-- Production security hardening for existing public objects.
-- Safe, non-destructive changes: preserve data and view definitions.

-- Views must evaluate permissions/RLS as the caller, not the view owner.
alter view public.tax_summary set (security_invoker = true);
alter view public.quarterly_tax_summary set (security_invoker = true);

-- Fix mutable function search paths. Empty search_path prevents object-shadowing;
-- functions that reference relations explicitly receive public.
alter function public.set_created_month() set search_path = '';
alter function public.fleet_vehicles_touch_updated_at() set search_path = '';
alter function public.job_outcome_events_append_only() set search_path = '';
alter function public.update_updated_at_column() set search_path = '';
alter function public.calculate_tax_setaside() set search_path = public;
alter function public.record_job_outcome_event(text,text,text,text,text,text,jsonb,text,jsonb,text,text,integer,text) set search_path = public;

-- This cache table is exposed through PostgREST and must never be left without RLS.
-- Existing service-role backend access bypasses RLS; no public policy is added here.
alter table public.scraped_manuals enable row level security;

-- Never authorize tenant access from user-editable user_metadata.
-- app_metadata is server-controlled. This keeps the current tenant-id contract while
-- moving the trust boundary to a non-user-editable claim.
drop policy if exists tenant_read_policy on public.tenants;
create policy tenant_read_policy
  on public.tenants
  for select
  to authenticated
  using (
    id = nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
  );

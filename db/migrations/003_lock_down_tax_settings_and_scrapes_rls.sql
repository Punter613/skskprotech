-- 003_lock_down_tax_settings_and_scrapes_rls.sql
-- tax_settings and scrapes had RLS disabled — anon key could read/write
-- every row. Neither table is referenced anywhere in the codebase yet, so
-- there's no real tenant/user model to scope policies against. Service-
-- role-only closes the exposure now; refine to a real per-tenant policy
-- once either table is actually wired to a feature.

alter table public.tax_settings enable row level security;
create policy "tax_settings_service_role_all"
  on public.tax_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.scrapes enable row level security;
create policy "scrapes_service_role_all"
  on public.scrapes
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

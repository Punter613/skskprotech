-- 002_fleet_vehicles.sql
-- Backs src/routes/fleet.js — /api/fleet/roster, /add, /bulk-estimate
-- Already run by hand in the Supabase SQL editor and confirmed live
-- (fleet_vehicles now shows RLS enabled in schema snapshots). Tracked
-- here so the schema history lives in the repo, not just in Supabase.

create table if not exists public.fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  vin text not null check (char_length(vin) = 17),
  year_make_model text,
  mileage integer default 0,
  status text default 'Healthy',
  next_predicted_failure jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tenant_id, vin)
);

create index if not exists fleet_vehicles_tenant_idx on public.fleet_vehicles (tenant_id);

create or replace function public.fleet_vehicles_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists fleet_vehicles_set_updated_at on public.fleet_vehicles;
create trigger fleet_vehicles_set_updated_at
  before update on public.fleet_vehicles
  for each row execute function public.fleet_vehicles_touch_updated_at();

alter table public.fleet_vehicles enable row level security;

create policy "fleet_vehicles_service_role_all"
  on public.fleet_vehicles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

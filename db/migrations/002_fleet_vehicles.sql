-- Run this once in your Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to run even if unsure whether it already exists - IF NOT EXISTS guards everything.
--
-- Backs /api/fleet/roster and /api/fleet/bulk-estimate (src/routes/fleet.js) and the
-- new /api/fleet/vehicles add-a-unit route. Did not exist before - both fleet endpoints
-- would have thrown a Supabase table-not-found error on first real call.

create table if not exists fleet_vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,             -- matches the x-tenant-id header fleet.js requires
  vin text not null,
  year_make_model text,
  mileage integer default 0,
  status text default 'Healthy',       -- 'Healthy' | 'Needs Service' | etc, set by bulk-estimate
  next_predicted_failure jsonb,        -- written by bulk-estimate from processSingleEstimate()
  created_at timestamptz not null default now()
);

create unique index if not exists idx_fleet_vehicles_tenant_vin
  on fleet_vehicles (tenant_id, vin);

create index if not exists idx_fleet_vehicles_tenant_status
  on fleet_vehicles (tenant_id, status);

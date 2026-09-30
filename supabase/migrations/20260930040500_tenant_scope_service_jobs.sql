-- Bind service lifecycle records to an authenticated shop.
-- Existing rows remain nullable during the shared-key migration; verified-user
-- HTTP paths always write and query a concrete shop_id.
alter table if exists public.service_jobs
  add column if not exists shop_id text;

create index if not exists service_jobs_shop_job_idx
  on public.service_jobs (shop_id, job_id);

comment on column public.service_jobs.shop_id is
  'Server-resolved shop/tenant owner. Never sourced from user-editable metadata.';

-- Run this once in your Supabase SQL editor (Project → SQL Editor → New query).
-- Safe to run even if unsure whether it already exists - IF NOT EXISTS guards everything.

create table if not exists scraped_manuals (
  vehicle_key text primary key,      -- e.g. "2019|ford|f-150|5.0l" - built by db.js buildVehicleCacheKey()
  year text,
  make text,
  model text,
  engine text,
  data jsonb not null,               -- the raw scraped manual result (items, urls, snippets, etc)
  scraped_at timestamptz not null default now()
);

create index if not exists idx_scraped_manuals_make_model
  on scraped_manuals (make, model, year);

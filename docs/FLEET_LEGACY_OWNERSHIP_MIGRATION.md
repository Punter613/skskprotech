# Fleet legacy ownership migration — PR #220

## Why this is required
Historically, the Fleet UI accepted a freely typed account name and sent it as `x-tenant-id`. Existing `fleet_vehicles.tenant_id` values may therefore be arbitrary labels. The hardened API derives tenant identity only from a verified Supabase membership or server-configured shop key. Do **not** restore header-based authorization to preserve legacy access.

## Safe migration process (not executed by this PR)
1. Export and back up `fleet_vehicles`, preserving original `tenant_id`, VIN, and row ID; limit access to the export.
2. Inventory distinct historical tenant IDs and their record counts in an administrator-only environment. Never infer ownership from the label, VIN, email, or API-key position.
3. Require a verified shop administrator to prove control of the historical fleet and the destination authenticated shop; record the evidence and approval in an auditable mapping `legacy_tenant_id -> verified_shop_id`.
4. Before applying a mapping, check destination collisions on `(tenant_id, vin)`. Resolve duplicates individually without overwriting records or forecasts.
5. Run a reviewed, transactional, scoped update by approved source tenant and destination shop. Record affected row IDs and counts; verify counts and rollback on any discrepancy.
6. Verify the destination account can list its records and an unrelated authenticated shop cannot. Retain the original mapping and backup for rollback.
7. Rotate or replace transitional shop keys with stable server-side shop bindings before changing key order. The current `shop_key_N` identity is positional and **not** a durable tenant identifier.

## Release boundary
This document is a plan only: no production database writes or automatic tenant reassignment. Existing legacy fleets may not appear under the new authenticated identity until migration. Do not merge or enable shop access until an owner-approved compatibility decision and real HTTP runtime evidence are recorded.

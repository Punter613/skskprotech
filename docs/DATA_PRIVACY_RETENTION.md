# SKSK ProTech Data Privacy & Retention Baseline

## Purpose
SKSK stores automotive service data to operate the shop workflow. Production data must be collected for a defined operational purpose, exposed only to authorized shop contexts, and removed when it is no longer needed.

## Data classes
| Class | Examples | Handling |
| --- | --- | --- |
| Credentials | API keys, bearer tokens, cookies, passwords | Never log or persist in customer/job records. Keep only in approved secret storage. |
| Customer PII | name, phone, email | Persist only when required for the service job. Never include in telemetry. |
| Vehicle identifiers | VIN, plate-like identifiers | Treat as customer-linked data. Do not include in telemetry or public URLs. |
| Service records | complaint, diagnosis, estimate, work order, invoice | Tenant/shop scoped; retain only for operational/legal business needs. |
| Learning/evaluation data | feedback, outcomes, guard catches | Do not automatically train or deploy from raw customer records. De-identify before an approved learning workflow. |
| Operational telemetry | request ID, route, status, duration, deploy commit | Must exclude request bodies, credentials, VIN, phone, email and customer names. |

## Production rules
1. Collect the minimum data needed for the requested shop workflow.
2. Do not put credentials or customer identifiers in logs, metrics, query strings, or public error responses.
3. Request correlation uses opaque request IDs.
4. Raw feedback does not automatically become model training data.
5. Deletion/retention actions must be auditable and tenant-scoped.
6. Backups and exports are part of the retention surface and must be considered when implementing deletion.
7. Do not silently delete existing production records. Retention automation requires an approved duration for each business-record class.

## Retention implementation boundary
SKSK intentionally does not guess statutory or shop-policy retention periods. Until durations are approved, production records remain subject to manual, authorized deletion rather than an automatic destructive TTL.

Before enabling automated retention:
- choose retention periods for customer/service, financial/tax, security, and de-identified learning records;
- document any legal/accounting hold requirements;
- implement tenant-scoped deletion with a dry-run/count mode;
- test backup/export behavior;
- record deletion results without logging deleted PII.

## Incident response
If sensitive data appears in telemetry or a public response: stop the exposure, preserve only the minimum incident evidence, rotate affected credentials, identify the affected records/time window, correct the source, and verify the fix before closing the incident.

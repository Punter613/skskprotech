# SKSK ProTech — invitation testing key

This is an **opt-in, diagnose-only** access path for external testers, including
the Muse benchmark. It is **not** a shop key and must never be added to
`SKSK_API_KEYS`, `SKSK_API_KEY`, or `SKSK_SHOP_KEY_BINDINGS`.

## Tester instructions

1. Open `https://skskprotech.pages.dev/try.html` after the backend and Pages
   frontend have deployed this change.
2. Paste the invitation key supplied privately by SKSK's owner.
3. Enter a real or synthetic VIN (or year, make, and model), symptoms, optional
   mechanic observations, and optional OBD codes. Press **Run diagnosis**.

For API-based testers:

```bash
curl -sS -X POST 'https://skskprotech.pages.dev/api/test/diagnose' \
  -H 'Content-Type: application/json' \
  -H 'X-SKSK-API-Key: YOUR_INVITE_KEY' \
  -d '{
    "vehicle": {"year": 2017, "make": "Kia", "model": "Sorento"},
    "symptoms": ["Engine stumbles at idle"],
    "obdCodes": ["P0300"],
    "mileage": 85000
  }'
```

An HTTP 200 with `success:true` contains `result` and `traceLog`. An HTTP 401
means the invite key is missing or wrong; 503 means guest mode is off or not
configured; 429 means a rate/concurrency/daily limit was reached. A 500 may
indicate AI-provider exhaustion, unavailable evidence, or a diagnostic failure.
Do not treat a 200 as a confirmed mechanical repair.

## Owner setup (Render backend service)

Set these variables **only on the intended Render service** using its secret
environment configuration. Never put a real key into Pages assets, Git, public
issues, or browser URL parameters.

| Variable | Recommended value | Purpose |
|---|---|---|
| `SKSK_GUEST_DIAGNOSE_ENABLED` | `true` | Explicit activation switch; false by default |
| `SKSK_GUEST_DIAGNOSE_KEYS` | Random 32-byte opaque value, e.g. base64url | Guest-only keys, comma-separated for rotation |
| `SKSK_TEST_DIAGNOSE_DAILY_MAX` | `50` | Shared daily budget (UTC day, per process) |
| `SKSK_TEST_DIAGNOSE_PER_IP_MAX` | `8` | Requests per client IP per day |
| `SKSK_TEST_DIAGNOSE_MAX_IN_FLIGHT` | `3` | Simultaneous guest requests per instance |

The guest endpoint also enforces six requests per minute per guest key. These
budgets are process-local, **not a durable distributed limit**. Do not turn this
into an unrestricted public feature without central quota storage, stronger
abuse protection, and explicit spending controls. To immediately turn it off,
set `SKSK_GUEST_DIAGNOSE_ENABLED=false` and deploy the environment change.

### Security boundary

- Guest keys cannot authenticate `/api/diagnose`, `/api/jobs`, `/api/fleet`,
  `/api/estimateHeuristic`, verification, work orders, or billing routes.
- Guest requests deliberately bypass `diagnosisLifecycle` and do not create
  any persisted customer job or estimate. Learning-guard writes are also
  disabled in tester mode. Read-only evidence retrieval and in-memory caches
  still operate.
- Input is limited to VIN or basic vehicle identity, symptoms, mechanic
  observations, mileage, and unverified OBD codes. There are no customer names,
  phone numbers, existing job IDs, or ownership overrides.
- Test keys are entered into the page by testers and held in memory; they are
  not embedded in published frontend code or stored in local/session storage.
- All output is an unverified test-first diagnostic hypothesis. Physical
  confirmation remains necessary before authorizing a repair.

### Verification before deployment

Run `npm run test:guest` and the access/diagnostic contract suites. Boot the
exact PR commit on a Render preview with a preview-specific guest key. Verify
`GET /health`, authenticated POST `/api/test/diagnose`, missing/bad key 401,
unauthorized access to `/api/jobs`, invalid input 400, and shared quota 429.
Record those exact HTTP results and the deployed commit in the PR before
merging to `main`.

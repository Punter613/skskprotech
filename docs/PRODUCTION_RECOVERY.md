# Production Recovery Runbook

## Verify before changing anything
1. Check `/health` and confirm the database probe is healthy.
2. Record the current Render deploy commit and request ID from any failing response.
3. Check whether the failure is application, provider, database, authentication, or deployment specific.
4. Do not create repair authorization or verified evidence as part of recovery testing.

## Application rollback
- Identify the last known-good commit whose exact-head gates passed.
- Prefer Render rollback/redeploy of that known-good artifact when the current deploy is bad.
- Re-run the production safety smoke after rollback.
- Do not roll back database schema independently if the application requires the newer schema.

## Environment/auth recovery
- Keep secrets in Render/Supabase secret storage, never Git.
- If a credential may be exposed, rotate it rather than logging or copying it into an issue.
- `SKSK_REQUIRE_AUTH` is an access-control switch, not a debugging convenience. Do not disable it on an exposed production service merely to make a smoke test pass.
- Validate malformed requests so recovery tests do not spend AI provider tokens.

## Database recovery
- Preserve production data before destructive action.
- Use reviewed migrations for schema changes.
- For a failed migration, prefer a tested forward fix unless a rollback is known safe for both schema and data.
- Never mass-delete customer/service records as an incident shortcut.

## Recovery acceptance
Production is recovered only when health/persistence are healthy, required authentication behavior is intact, retired endpoints remain retired, relevant runtime gates pass, and no safety invariant was bypassed.

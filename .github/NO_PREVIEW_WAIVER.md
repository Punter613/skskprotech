# Explicit Render preview waiver: PR #238 only

This is a **one-PR, one-head exception** to the normal live Render merge gate in
`AGENTS.md`. It is not an automatic fallback when a preview returns 404 or fails
to deploy.

| Requirement | Exact value |
| --- | --- |
| Pull request | #238 |
| Reviewed head | `e04a7f826a6eb5e83d846d0766380a668160959e` |
| Maintainer-controlled GitHub label | `no-preview` |
| Scope | Render-dependent HTTP steps only |
| Status when applied | **WAIVED — NOT RUN, NOT VERIFIED** |

Every listed condition must be true for a runtime step to be waived. The waiver
is evaluated from GitHub's pull-request metadata, not from HTTP status, a
repository file, or a user-supplied environment variable. GitHub's issue/PR
timeline records who applied or removed the label. Each affected Actions job
writes its own warning and step summary naming the reviewed head and the reason.

## Why this narrow exception exists

Five Render preview services were suspended because they inherited production
Supabase service-role credentials. Render PR preview creation remains Manual.
PR #238 changes backend credential validation and refuses invalid startup
configurations; its local spawned-process tests exercised boot and refusal
without connecting to Supabase. No live Render preview test has occurred.

The exception **does not** cover #237's preview-specific guard (which needs a
real Render preview), later edits to #238, any other PR, production deploy
verification, or any deterministic test, lint, build, and contract gate.
Workflows continue failing on missing or stale previews whenever the explicit
conditions are not satisfied.

## Use and retirement

1. Review this policy and every changed workflow on a separate draft PR first.
2. After approval and merge of the waiver implementation, a maintainer may
   apply `no-preview` to #238. Its head must still match the pinned SHA.
3. Re-run Actions and verify every affected job records **WAIVED**, while all
   non-runtime checks pass. Keep the absence of live Render evidence explicit
   in the #238 PR record.
4. If the #238 head changes, remove the label and decide whether a new
   reviewed exception is justified; never broaden the allowlist automatically.
5. Remove the exception from `AGENTS.md` and the ten workflows after #238 has
   merged or been closed. Resume normal exact-head preview requirements.

No Render auto-deploy setting, preview suspension, Supabase credential, or
production behavior is changed by this CI-only policy.

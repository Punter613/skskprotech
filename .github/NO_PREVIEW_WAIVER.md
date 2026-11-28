# Explicit Render preview waivers: separately pinned PRs

Each waiver is a **one-PR, one-head exception** to the normal live Render merge gate in
`AGENTS.md`. Neither is an automatic fallback when a preview returns 404 or fails
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

The #238 exception **does not** cover #237's preview-specific guard (which has
its own separate, independently pinned rule below), later edits to #238, any
other PR, production deploy verification, or any deterministic test, lint,
build, and contract gate.
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

## PR #237: isolated startup guard proof, not full application runtime

This is a **second, independent one-PR, one-head exception**. The historical
#238 exception above is unchanged and does not authorize #237.

| Requirement | Exact value |
| --- | --- |
| Pull request | #237 |
| Reviewed head | `1b51331dfaa5f48626455ee81e9f930e63fa55aa` |
| Maintainer-controlled GitHub label | `no-preview` |
| Scope | Only Render-dependent HTTP steps in the ten affected workflows |
| Observed live proof | Startup guard accepted test ref and rejected production URL, exit 1 |
| Status when applied | **STARTUP GUARD VERIFIED — FULL APPLICATION RUNTIME NOT VERIFIED** |

**Evidence:** [PR #237 isolated Render log record](https://github.com/Punter613/skskprotech/pull/237#issuecomment-6999629745).
The guard source was byte-identical at reviewed `e2db5b6` and deployed
`1b51331`, blob `fe14660047932b27d218f9c79e0ceedd43cef791`.
The standalone `p613-isolated-pr-237` service on Render logged
`[PreviewGuard] Preview database approved (ref bzgdovasolhoslruyfev).`
with a deliberately invalid non-production key. With `IS_PULL_REQUEST=false`
and a production URL paired with a fabricated, invalid JWT, Render logged
`[PreviewGuard] REFUSING TO START preview: SUPABASE_URL points at the PRODUCTION project (ref irwhynrausoqjokyaxbf).`
and `Exited with status 1`. The approved test configuration was restored,
verified live, and the standalone service was suspended; auto-deploy remains off.
No actual production key was used.

This verifies the guard's positive and negative startup decisions **on Render**,
including the service-name detection when the explicit preview flag is false.
It does **not** verify Supabase authentication, tenant isolation on writes,
schema readiness, route behavior, workers, provider calls, or the full application
runtime. The five legacy preview services remain suspended and no write-capable
canaries may run against a production database.

### Use and retirement for #237

1. Review and merge the CI-only waiver PR as an explicit policy adoption; its
   own preview-dependent runtime jobs are **not** waived. Record that distinction
   in that PR's review and merge history.
2. The owner applies `no-preview` to PR #237 **only if its head still equals
   `1b51331dfaa5f48626455ee81e9f930e63fa55aa`**. A label is necessary but
   not sufficient: the exact PR number and SHA are enforced by every workflow.
3. Trigger fresh `pull_request` workflow runs after the waiver merges to main
   (if needed, close and reopen #237 without modifying its head). Re-running
   old runs can reuse the old workflow and old event payload. Confirm the new
   runs evaluate this policy, that each affected job logs a warning and summary,
   and that all
   deterministic checks to pass. A green waived job is not live HTTP verification.
4. Any change to PR #237's head invalidates the waiver automatically. Re-review
   evidence and policy rather than updating the SHA silently.
5. Retire this exception after #237 merges or closes. Keep the historical
   evidence record, but remove the workflow conditions and policy exception.

No general endpoint override, failure-triggered skip, database secret, production
deployment, or preview resumption is authorized by this policy.

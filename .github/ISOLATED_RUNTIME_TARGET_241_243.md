# PR #241 and #243 isolated runtime verification — policy candidate

This policy selects a real, test-only backend for two previously reviewed
job-lifecycle PRs. It is **not a waiver**. All eleven existing CI workflows
retain their HTTP assertions and the old default-preview failure behavior.

## Per-PR eligibility, independently enforced in all eleven workflows

| PR | Source branch | Exact-head repository variable | Dedicated Actions secret | Render service |
| --- | --- | --- | --- | --- |
| #241 | `fix/job-revision-guard` | `SKSK_ISOLATED_241_HEAD_SHA` | `SKSK_ISOLATED_241_API_KEY` | `p613-isolated-pr-241` |
| #243 | `fix/job-shop-scope-empty` | `SKSK_ISOLATED_243_HEAD_SHA` | `SKSK_ISOLATED_243_API_KEY` | `p613-isolated-pr-243` |

Each selection requires a `pull_request` event, exactly its own PR number,
base `main`, the exact source branch, a **nonempty** head-SHA repository pin
equal to the event head, and an explicit `isolated-runtime-test` label.
Selectors are mutually exclusive. The only permitted alternative URL is the
ordinary `p613-backend-pr-N.onrender.com`; a mismatched selector does **not**
turn a failed 404 into success. Pins are external variables because a SHA
cannot be embedded into a commit that defines its own selection rule.

When selected, the workflow requires the corresponding dedicated secret and
exports it through `$GITHUB_ENV` before HTTP assertions. A missing secret,
inconsistent selector, inaccessible `/health`, wrong commit, wrong service
name, or failing live assertion is a hard failure. It must never fall back to
the shared `SKSK_PREVIEW_API_KEY`. Before real assertions, `/health` must have
`ok=true`, `preview.commit` equal to the event head, and `preview.service`
equal to the exact service in the table. Only a successful final audit emits
**RUNTIME VERIFIED AGAINST ISOLATED TEST SERVICE** with the Actions run URL.
Neither `NO_PREVIEW_WAIVER_241` nor `NO_PREVIEW_WAIVER_243` exists.

## Bootstrap and deployment hold

1. Review this policy's eleven workflow diffs and static negative targeting
   tests separately from the application PRs. Keep the policy PR draft until
   its own exact-head runtime bootstrap is complete, following #244's pattern.
   Its own CI needs a separately pinned, dedicated test-only target before
   its workflow changes can merge; do not treat its absent conventional
   preview as a waiver. If the PR number is not yet known, reserve it with a
   docs-only draft before finalizing the bootstrap selector.
2. Do not set either #241/#243 pin or apply either label while the policy is
   unmerged. After merge, confirm **each target PR merge ref actually contains
   the new workflow selectors** before scheduling runs; #242 showed that
   GitHub merge-ref regeneration is asynchronous.
3. Incorporate the latest `main` into #241 and #243 without force-pushing.
   Preserve the already reviewed application changes and both test-script
   wirings. These backend changes also need an `api/`-visible preview trigger
   for the existing root-directory guard. Re-run the deterministic suite and
   re-review each final head independently; the old SHA pins cannot authorize
   a new head.
4. Provision one isolated Render service per PR on its final reviewed head.
   Set Auto-Deploy **off**, `IS_PULL_REQUEST=true`, require persistence and
   authentication, allow only the preapproved **test** Supabase project, and
   use no inherited production environment group. The merged #237 startup
   guard must refuse mismatched production database configuration before
   binding. Give each service its own named, individually revocable test
   `sb_secret_` key and dedicated shop API key. Set its matching Actions
   secret separately; do not recycle #240/#244 credentials or disclose values.
   If Groq-dependent lanes require a key, use a separate test-project key.
5. Verify `GET /health` reports `ok=true`, the exact new commit, exact service
   name, and healthy test database **before** applying the label. Record the
   observation without secret values on the corresponding PR.
6. After the precondition and merge-ref policy check pass, set the respective
   pinned head variable and apply one label at a time. Inspect the Actions
   **step lists before conclusions**, requiring selector, identity, every
   deterministic check, all real HTTP gates, and the successful strong audit.
   Add dedicated runtime evidence of #241's write-conflict behavior and
   #243's no-cross-shop scope behavior; generic green canaries are not a
   substitute for those materially changed paths.
7. Record exact heads, runtime evidence, and complete run links. Landing each
   application PR requires its own separate owner confirmation. Because both
   edit `job.lifecycle.js`, the second must incorporate the first and receive
   a fresh exact-head review and runtime verification.

**Preserve:** production Render stays Manual Deploy; suspended legacy previews
stay suspended. This policy does not create a credential, enable a service,
activate a label, waive runtime work, or authorize a merge by itself.

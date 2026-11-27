# PR #244 isolated CI bootstrap — review record

PR #244 introduces the separate CI policy needed for PR #240's real, isolated
runtime verification. The policy PR must itself run real HTTP gates before it
can be merged. The default `p613-backend-pr-244` preview does not exist, so the
policy is evaluated against a **new test-only service of that exact name**.
This is a credential selector, not a skipped gate or a runtime waiver.

## Exact-head bootstrap eligibility

Every one of the eleven workflows selects the dedicated credential only when
**all** of these match:

- GitHub event: `pull_request`, number **244**, base branch `main`.
- PR source branch: `ci/isolated-runtime-target-240-review`.
- PR head SHA: exactly the nonempty GitHub repository variable
  `SKSK_ISOLATED_244_HEAD_SHA`.
- Credential: repository Actions secret `SKSK_ISOLATED_244_API_KEY`, containing
  a dedicated test-only shop API key installed on `p613-backend-pr-244`.

The head SHA cannot be a literal in its own workflow commit: adding that literal
would change the commit SHA again. The repository variable is the external,
reviewed exact-head pin. Set it to the **final candidate commit** before moving
PR #244's head to that commit, and verify the variable in repository settings.
Never use the shared `SKSK_PREVIEW_API_KEY` for this bootstrap; a missing
dedicated secret fails immediately when the pin matches. A wrong or missing
pin leaves the normal preview target and real gates mandatory.

The service must use the already approved **test** Supabase project only,
without production or inherited environment-group credentials. Configure
`IS_PULL_REQUEST=true`, enforce persistence, and keep Render Auto-Deploy off.
The startup guard introduced by merged PR #237 must reject any production
database configuration before binding. Do not put credentials in repository
files, workflow output, review comments, or service logs.

## Verification before merge

1. Review the full candidate workflow diff and static policy tests separately
   from PR #240. Do not advance PR #244's docs-only head yet.
2. Deploy `p613-backend-pr-244` at precisely the reviewed policy commit with
   only test credentials. Check `/health`: `ok=true`, `preview.commit` equals
   the candidate SHA, and `preview.service` is `p613-backend-pr-244`.
3. Record the same SHA in `SKSK_ISOLATED_244_HEAD_SHA` and configure the new
   Actions secret. Then fast-forward PR #244 to that exact commit.
4. Confirm PR #244's regenerated merge ref contains the policy before relying
   on runs. Inspect the step lists first; require all eleven live HTTP gates,
   deterministic tests, and a successful final audit reading
   **RUNTIME VERIFIED AGAINST ISOLATED TEST SERVICE**.
5. Review the results and obtain a separate merge decision. After merge,
   verify PR #240's merge ref incorporates the policy before any #240 event.

The separate PR #240 selector remains pinned in source to
`5a5cf160a3be1adbb236b5860228b58d77cceed7` and requires its explicit
`isolated-runtime-test` label. This bootstrap does not broaden that selector.
Production and the five suspended previews stay untouched throughout.

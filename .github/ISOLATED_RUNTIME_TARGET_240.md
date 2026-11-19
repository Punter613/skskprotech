# PR #240 isolated runtime verification — policy draft

This is a **runtime target selection, not a waiver**. All eleven Render-dependent
workflows retain their mandatory HTTP checks. Ten dedicated runtime workflows
exercise their established routes; the integration pipeline also asserts that
the removed OEM route returns 404 and the knowledge-builder catalog returns 200.

## Activation requirements

- PR number **240** at exact head
  `5a5cf160a3be1adbb236b5860228b58d77cceed7`.
- Explicit maintainer-applied label `isolated-runtime-test`.
- Fixed target `https://p613-isolated-pr-240.onrender.com`. No PR input,
  variable, or untrusted URL can substitute another host.
- GitHub Actions secret `SKSK_ISOLATED_240_API_KEY`: a new test-only key that
  the isolated service recognizes. Missing secret is a hard failure, never
  fallback to the ordinary `SKSK_PREVIEW_API_KEY`.
- Independent Render service named `p613-isolated-pr-240`, deployed from the
  **same exact head**. Its environment must contain the approved test Supabase
  project only, with no production secrets or inherited production environment
  group. The startup guard from merged PR #237 must be present.
- The service remains unactivated until its environment and the policy diff
  have received separate review and owner approval.

When any eligibility condition is missing, the workflow uses the conventional
`p613-backend-pr-N.onrender.com` target and requires all ordinary runtime gates.
No HTTP 404, timeout, wrong service, absent key, or missing commit can grant a
pass. This policy adds no `NO_PREVIEW_WAIVER_240` variable.

## Evidence and sequencing

1. The reviewed #240 OEM deletion/test files remain unchanged from `c7e039b`.
   The prepared branch merges main `24c0e8a`, preserving the startup guard
   test registration alongside the OEM regression test registration, and
   includes the required `api/.render-preview-trigger`.
2. Publish this policy in its own PR and review the exact workflow diff and
   static targeting test. Confirm the target PR's merge ref contains the merged
   policy **before** applying the label or triggering another run.
3. Independently configure, deploy, and audit the isolated service with test
   credentials. Capture the startup-guard refusal on deliberately incorrect
   test configuration before restoring the approved test configuration.
   Never expose actual keys in logs or comments.
4. Apply the exact `isolated-runtime-test` label only after the live service
   reports the pinned commit and `p613-isolated-pr-240` identity.
5. Inspect each Actions job's step list before reading outcomes. The selection
   step must be present, and each run must complete its real HTTP checks.
   Only a successful final step reports
   **RUNTIME VERIFIED AGAINST ISOLATED TEST SERVICE**, with an Actions run link.
6. Require all deterministic checks and all ten dedicated runtime gates to pass. Record
   the eleven run links, observations, and review approval on PR #240 before a
   separate merge decision.

If #240's branch head changes for any reason, the pin expires and the normal
live-preview policy resumes until a newly reviewed policy explicitly pins the
new head.

**Untouched:** production `p613-backend` remains Manual Deploy. The original
previews remain suspended. No waiver, production credential reuse, service
activation, or merge is authorized by this document.

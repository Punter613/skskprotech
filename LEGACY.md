# Legacy and Transitional Path Retirement

This file is the deletion schedule for transitional SKSK paths. Temporary compatibility is allowed only when its replacement and exit condition are explicit.

The canonical lifecycle is:

**Intake → Diagnose → Test → Verify → Estimate → Authorize → Work Order → Completed Work → Final Invoice → Outcome**

See INTENT.md for the permanent truth rules.

## Milestone A — Trust boundary locked

Exit criteria:
- malformed/unparseable Diagnose output fails closed;
- one canonical diagnostic-candidate assertion protects Diagnose handoff, VERIFY, unverified-diagnosis construction, and VERIFIED_CASE creation;
- exact historical placeholder/sentinel exploits remain permanent regressions;
- reassessment parsing follows the same fail-closed JSON boundary;
- exact-head runtime gates are green.

Rule: no diagnostic compatibility path may bypass these assertions.

## Milestone B — Commercial truth locked

Exit criteria:
- Work Orders can contain only persisted customer-authorized scope;
- completion requires recorded execution evidence;
- Final Invoice contains only authorized + completed scope;
- cancelled, blocked, ready, in-progress, merely estimated, or unauthorized lines cannot become final-invoice truth;
- invoice/payment state cannot create or upgrade diagnostic verification;
- runtime gates cover the complete authorization → execution → final-invoice handoff.

Rule: commercial truth may inherit diagnostic truth but can never manufacture it.

## Milestone C — One production spine

After Milestones A and B have exact-head runtime proof, inventory every route/module that duplicates the canonical lifecycle. Each retained duplicate must have an owner, replacement, compatibility reason, and deletion test.

Known transitional artifacts to review first:
- any legacy Diagnose/Estimate/Invoice entry point that can reach production state without traversing the canonical lifecycle services.

Completed in Milestone C:
- removed public/js/sksk-frontend.js after repository search proved there was no supported page/runtime caller; the file still called the retired /api/full-estimate path;
- stopped tracking generated lemon scraper binaries at bin/lemon_scraper and tools/lemon_scraper/bin/lemon_scraper; source/build automation remains canonical and .gitignore prevents recommit;
- retired the parallel /api/intelligence analyze/estimate/predict/economic/batch/health/stats orchestrator lane after repository search found no supported browser caller. In particular, /api/intelligence/estimate could run diagnostic -> estimate -> parts without persisted TEST -> VERIFY. The /api/intelligence namespace now retains only learning/audit feedback and guard-catch endpoints, which do not create lifecycle authority.

- retired the generic /api/invoice builder and its direct attachInvoice/hydrateInvoiceInput persistence bridge. The public invoice action now sends the user to Lifecycle, where Final Invoice is created only from authorized + completed Work Orders. Diagnose and /api/estimateHeuristic remain because they are the current canonical persisted Diagnose and VERIFIED-only Estimate handoff.

- deleted the /api/full-estimate tombstone and production mount after production smoke, recovery regression, auth policy, and operational scripts were migrated away from depending on its 410 behavior. Production smoke now requires 404 and CI locks the mount absent; no compatibility shim remains.

Deletion condition: no supported page, runtime canary, external tester workflow, or production integration requires the old path, and the replacement has exact-head runtime coverage.

## Milestone D — Delete, do not archive in production

Remove obsolete routes, shims, dead browser clients, duplicate state transitions, and their compatibility exceptions. Preserve history in Git and documentation rather than keeping executable museum pieces.

For each deletion:
1. prove no supported caller remains;
2. delete the path and its allowlist/exception;
3. make CI fail if the retired path is reintroduced accidentally;
4. exercise the canonical replacement on the exact PR head.

## Change rule

A new transitional path must be added to this file in the same PR that creates it, with its replacement and deletion milestone. “Temporary” without an exit condition is not an accepted architecture state.

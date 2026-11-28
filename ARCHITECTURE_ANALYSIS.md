# SKSK ProTech — Architecture, As Built

**This document replaces the previous ARCHITECTURE_ANALYSIS.md in full.** The previous version documented a retired product: it presented `/api/full-estimate` as a current route, described a parallel intelligence lane as the "main entry point," and sourced its frontend endpoints from a file that no longer exists. Anyone who built from it would have built on routes that are deleted and guarded against return. Do not use any earlier version of this document as a map.

**Basis.** A full read-only analysis of `main` at head `0e191268` (November 16, 2026): every mount in `api/server.js`, the diagnose path end to end, the lifecycle services, and an importer search across the tree. Updated for two merges that landed after that analysis: PR #221 (response integrity) and PR #222 (fleet truth boundary). Main head at the time of this writing: `233f5fcf07`. Where the underlying analysis could not establish a fact, this document says so instead of guessing.

**How to check this document.** Read `api/server.js`. The mount list below is the whole live surface; if a route is not in that file, it is not running. CI also asserts the negative space: production smoke requires `/api/full-estimate` to answer 404, and tests lock the generic invoice lane deleted.

---

## 1. Process and boot

- `package.json`: `main: api/server.js`, `start: node api/server.js`, Node ≥ 18. The server listens directly; it does not export the app.
- Global middleware, in order: request telemetry (`src/middleware/observability`) → CORS (allowlist: `skskprotech.pages.dev`, the Render backend origin, localhost:3000, PR-preview origins) → security headers → **Stripe webhook mounted before the body parsers** with `express.raw` (signature verification needs the raw body) → JSON (2 MB) and urlencoded parsers.
- A Cloudflare Pages Function (`functions/api/[[path]].js`) proxies `/api/*` to the Render backend — it is the production request path's front door.
- `/health` probes the database through `src/db.js` and reports Stripe/Groq configuration from env presence.
- Caveat: several mounts and boot items are fail-soft. The webhook and payments mounts sit in try/catch blocks that only warn on require failure, and the AI worker is required in a try/catch at boot. "The server started" proves less than it appears to.
- PR previews register an additional canary endpoint (`/health/preview-unverified-diagnosis`, only when `IS_PULL_REQUEST==='true'`) that seeds a job, attempts to push it to an estimate, and asserts a 409 with `physicallyVerified===false`.

## 2. The complete live route surface

| Mount | Guards | Target |
|---|---|---|
| `POST /api/payments/webhook` | raw body | `src/routes/webhooks.js` (see §8 for its effective path) |
| `/api/scrape` | API key | `src/routes/scrape.js` — fabricates its result (§9) |
| `/api/parts` | API key | `src/routes/parts.js` — fabricates its result (§9) |
| `/api/jobs` | API key | `src/routes/jobs.protected.js` — internally mounts the jobs router, work orders, final invoice, estimate center, atomic reassessment |
| `/api/diagnose` | API key + AI rate limit + `diagnosisLifecycle` | `src/routes/diagnose.js` |
| `/api/estimateHeuristic` | API key + `estimateLifecycle` | `src/routes/estimate.authorized.js` → delegates to `src/routes/estimate.js` |
| `/api/translate` | API key + AI rate limit | `src/routes/translate.js` |
| `/api/parts-lookup` | API key | `src/routes/partsLookup.js` — in practice returns empty lists (§9) |
| `/api/fleet` | API key + server-bound tenant inside | `src/routes/fleet.js` |
| `/api/vehicle` | API key | `src/routes/vehicle.js` |
| `/api/quick-ask` | API key + AI rate limit | `src/routes/quick.ask.js` |
| *(no prefix)* | — | `src/routes/oem.js` — mounts `/api/knowledge-builder` and `/api/oem-data/:vin/:procedure` from inside the router (§9) |
| `/api/intelligence` | API key + AI rate limit | `src/routes/intelligence.routes.js` — records feedback; never promotes (§7) |
| `/api/buyer` | API key | `src/routes/buyer.js` — broken on every valid request (§9) |
| `/api/payments/procure-parts` | — | Retired (SEC-01); returns 404 |

**Explicitly absent.** There is no `/api/full-estimate`, no generic `/api/estimate`, no `/api/invoice`, no `/api/auth` mount. The retired intelligence sub-lane (`/api/intelligence/analyze|estimate|predict|economic|batch`) is gone for the reason it was retired: it could run diagnose→estimate without persisted TEST→VERIFY. Only the feedback and guard-catch endpoints remain under `/api/intelligence`.

**The durable-diagnosis code from PRs #217/#218 does not exist on `main`** — a code search for `diagnosis.durable` returns zero hits. It is not "unmounted"; it was never merged. Do not design against it here.

**Static/frontend.** Explicit `GET /fleet` → `public/fleet.html`, `GET /lifecycle` → `public/lifecycle.html`, then `express.static(public/)`, so `/` serves `public/index.html`. See §10 for what those pages actually do.

**External calls on live paths.** Groq (diagnose via the provider router with Gemini fallback; the fleet estimator calls Groq directly), Gemini (fallback), Supabase (jobs, fleet, feedback, manual/TSB corpus), Stripe (checkout + webhook), NHTSA vPIC (VIN decode) and NHTSA recalls (called directly from the homepage's browser code).

## 3. The lifecycle spine — the working product

One direction, no shortcuts:

**Intake → Diagnose → Test → Verify → Estimate → Authorize → Work Order → Completed Work → Final Invoice → Outcome**

Core files: `src/services/job.lifecycle.js` (the state machine), `src/middleware/job.lifecycle.middleware.js` (`diagnosisLifecycle` / `estimateLifecycle`), `src/routes/jobs.protected.js`, `src/routes/jobs.js`.

### 3.1 The VERIFY gate

Test evidence carries a role: NEUTRAL, SUPPORTS, REFUTES, CONFIRMS. The gate in `job.lifecycle.js`:

- A CONFIRMS test must name the exact fault the physical evidence confirms; `addTest()` throws otherwise.
- Placeholder results are rejected against an explicit set (`?`, `unknown`, `tbd`, `pending`, `n/a`, `probably`, `not tested`, …). A typed `?` is not a test.
- `verifyJob()` requires: status TESTING, a valid diagnostic candidate, at least one test, `confirmed===true`, a non-empty confirmed cause **and** a conclusion, evidence test IDs that all resolve to tests persisted on that job, every selected test verification-eligible (CONFIRMS + meaningful result + named fault), and every selected test's fault an exact normalized match to the confirmed cause.
- SUPPORTS unlocks nothing. On success the job becomes VERIFIED and any unverified diagnosis is marked superseded.

### 3.2 The verified case

On verification, `src/routes/jobs.js` builds a verified case via `src/core/evidence/verified.case.js` (`buildVerifiedCase`) carrying a `fingerprint`. Downstream consumers assert integrity against it: estimate snapshots (`verified.estimate.snapshot.js`) and the repair resolution (`verified.repair.resolution.js`) fail closed on tampering.

### 3.3 Work orders and the final invoice

`src/services/final.work.invoice.js` declares `FINAL_INVOICE_POLICY = 'BILL_COMPLETED_AUTHORIZED_WORK_ONLY'`. A completed line whose authorization snapshot is missing, not `AUTHORIZED`, or lacks a decision timestamp throws. The invoice requires at least one persisted work order and at least one AUTHORIZED + COMPLETED line, prices lines from the authorized snapshots, and refuses to persist if totals don't balance to the snapshots. Deferred, declined, cancelled, blocked, and in-progress scope cannot become billable. An invoice cannot mint a diagnosis; it can only bill what was authorized and finished.

### 3.4 Atomic evidence reassessment

`src/services/atomic.evidence.reassessment.js` is the constitution-compliant way AI touches an existing job: per-job mutation lock; batches capped at 20; every item needs a stable ID (retry-safe, fingerprint-checked), a name, a meaningful result, and a valid role, with CONFIRMS requiring a named fault. The batch persists first, the prior diagnosis is marked **stale**, then reassessment runs; if reassessment fails after the evidence saved, the route fails closed with a 409 and the explicit statement that the prior diagnosis "will not be presented as current." Reassessment output stays `UNVERIFIED_DIAGNOSIS` with `estimateReady:false`. If you are adding AI to a durable surface, copy this pattern, not the fleet pattern of §8.

### 3.5 Response integrity (fixed — PR #221)

The lifecycle middleware wraps `res.json` on the diagnose and estimate paths to persist before responding. The original defect (campaign finding F-013): on any persistence failure the wrapper caught the error, logged it "non-fatal," and sent the original success payload — a mechanic could be shown a diagnosis that was never recorded. **That is fixed on `main`.** The bridge now fails closed: a required-persistence failure returns an error (503 for persistence write/configuration failures, with a machine-readable code; legitimate coded client errors keep their status and code; anything else is a 500) and never the success payload. The repair landed with an HTTP-level regression suite that exercises the mounted middleware with failure injection on both the diagnose and estimate paths. A follow-up HTTP test for the coded-409 passthrough at the bridge is in PR #223 — in flight, not yet on `main`.

### 3.6 Tenant security (PR #220)

Fail-closed API authentication (`src/middleware/api.access.js`): a key must appear in the configured key list **and** have a shop binding; the binding is strict-parsed JSON, and invalid configuration fails closed. Shop identity is bound server-side from the verified credential; a caller-supplied tenant override is denied with 403. Isolation was verified bidirectionally (A→B and B→A) before merge. The lifecycle cache is partitioned by shop, and ownership is never read from headers on the jobs/fleet surface. One route predates this pattern and still trusts a raw tenant header — see §8.


## 4. The diagnose path, as actually executed

`src/routes/diagnose.js`, in order:

1. **DTC provenance resolution** (`src/core/evidence/dtc.provenance.js`) — only verified scan-tool codes are trusted; typed/unverified codes are excluded from reasoning and from explanations.
2. **VIN profile resolution** (NHTSA vPIC via `src/services/vin.js`, plus stored evidence warmup).
3. **`runDiagnosticPipeline`** (`src/services/pipeline.engine.js`) — a deterministic adapter. Be precise: its `localSafetyTriggered` output is a hardwired constant `false`, its safety notes are empty, and its confidence is a constant `{30, 'LOW'}`. The one thing it genuinely computes is the vehicle risk profile. Diagnose contains real code that would consume a local safety flag; that code can never fire, because the only supplier returns `false`. **There is no deterministic local-safety layer on this path.**
4. **TAG overlay pre-evaluation** (`src/core/orchestrator/tag.overlay.js`) — real: mechanic measurements are normalized (`src/core/measurement/measurement-normalizer.js`) and the overlay can override model urgency; it never invents a safety result and never lowers urgency.
5. **Deterministic pattern short-circuit** — `findKnownPatterns` consults a hardcoded table of **13** patterns (`src/knowledge/failure.patterns.js`, likelihoods 45–96). On a hit the route returns immediately and never calls the AI: the pattern name becomes the primary cause, urgency is `immediate`, and the pattern's likelihood rides in the probability array. Mitigations: the result still enters the lifecycle as TESTING, and the VERIFY gate stands between it and any estimate. The defect is presentational: a table match on symptoms/codes is shown to the person holding the wrench as a named cause with an up-to-96 likelihood and no measurement behind it.
6. **Vehicle evidence collection** — TSBs (NHTSA corpus, ranked by `src/brain/tsb.weight.engine.js` — the one live file in `src/brain/`), OEM references, stored manuals (`src/services/vehicle.evidence.js` and the lemon/manual machinery).
7. **Evidence packet assembly** (`src/core/evidence/diagnostic.evidence.packet.js`), then one large prompt and a **single provider call** via `aiChat` (`src/services/ai/aiClient.js`; Groq primary, Gemini fallback per the provider router).
8. **Post-response guards, in order:** JSON extraction → candidate validation (`diagnostic.candidate.js`) → diagnostic stage guard (strips repair actions pre-VERIFY) → completed-work guard → code-explanation filtering to trusted DTCs only.
9. The route itself stores nothing; persistence happens in the lifecycle middleware wrapped around it (§3.5).

Note what is **not** on this path: `SKSKOrchestrator` is never imported by `diagnose.js`. There is no specialist-selection stage and no economic-analysis stage in the live flow. Those belong to the dormant generation (§11).

## 5. The two estimate lanes — they do not have the same truth strength

**Lane 1 — the authorized lane** (`/api/estimateHeuristic` → `src/routes/estimate.authorized.js` → `src/routes/estimate.js`). No jobId → 409 `DIAGNOSIS_REQUIRED`. Job not verified → 409. Then `verifiedEstimateInput(job.verifiedCase)` produces canonical input and the handler **overwrites** `req.body`: vehicle, VIN, mileage, observations, DTCs, and diagnostic tests all come from the verified case's evidence packet. `estimate.js` re-derives truth a second time (the packet must exist and be at stage DIAGNOSE), forces the model output onto the verified cause (`forceVerifiedTruth`: the verified fault, `confirmed:true`, `likelihood:100` — the model does not rename the diagnosis), and computes repair money deterministically (`buildVerifiedRepairResolution` + `assertRepairResolutionIntegrity`). What the request body still controls is labeled: labor rate (tagged `MECHANIC_INPUT`/`SYSTEM_DEFAULT`), hours, parts.

**Lane 2 — the lifecycle lane** (`estimateLifecycle` + `hydrateEstimateInput` in the lifecycle service). This lane merges the other way: any non-empty incoming vehicle, customer, symptom, code, or test data **overrides the persisted job's**. The status gate holds — a non-VERIFIED job gets a 409 before the route runs, and `attachEstimate` re-checks status in the service — so an unverified job cannot be estimated here. But a verified job can be estimated against different supplied data, because the merge prefers the request. The verified case's fingerprint discipline does not bind this lane's inputs. (Relatedly, `attachEstimate` throws a plain `Error` for non-VERIFIED jobs; the 409 contract exists only because the middleware pre-checks.)

**Compounding caveat (F-011, still open).** The persisted evidence packet that anchors the verified case is built by `packetFromDiagnosisRequest` from the **request-body vehicle** — while a VIN-resolved profile is computed in the same handler, for the response, and is not used for the packet. Lane 1's canonical rebuild is only as good as this packet.

**The third estimate surface** is the customer estimate center (`src/routes/customer.estimate.center.js`): quick estimates as deliberately labeled preliminary documents (`decision:'PROPOSED'`, preliminary disclaimer), with a fingerprint-gated handoff into the verified flow. A quick estimate creates no diagnostic truth. This is the sanctioned escape hatch — a price before anyone is under the car is a different kind of document from an estimate after a confirming test, and the code keeps them different.

## 6. Evidence core and evidence collection

Live and load-bearing:

- `src/core/evidence/` — `dtc.provenance`, `dtc.reasoning` (bounded deterministic code meanings), `diagnostic.evidence.packet`, `diagnostic.candidate`, `verified.case`, `verified.estimate.snapshot`, `verified.repair.resolution`, `confirmed.repair.case`, `component.applicability`, `source.resilience`, `unverified.diagnosis`.
- Live guards that live under `src/core/orchestrator/` despite the directory name: `completed.work.guard` (strips already-completed work), `diagnostic.stage.guard` (strips repair actions pre-VERIFY), `repair.authorization.guard` (the authorization predicate), `tag.overlay`. These four are spine machinery. The other files in that directory are the dormant generation (§11).
- Evidence collection: `src/services/vehicle.evidence.js`, `vehicle.warmup.js`, `nhtsa.tsb.corpus.js`, `tsb.harvester.js`, the lemon/manual services (`lemon.js`, `lemon.worker.js`, `manual.evidence.reuse.js`, `manual.navigation.seeds.js`, `lemon.path.resolver.js`), the targeted-evidence worker (`src/workers/lemonTargetedWorker.js`), and `scripts/scrape-lemon-targeted-evidence.js` — a "script" that is actually a library imported by live services. Offline collectors (`tools/knowledge-scraper/`, the Rust `tools/lemon_scraper/`) are intentionally outside the request path.

## 7. The learning loop — gated, real, and barely consumed

- Feedback recorded through `/api/intelligence` (`src/core/learning/mechanic.feedback.loop.js`) is hard-set `trustedForTraining:false` — by design, with the reason stated in the code.
- The **only** path to `trustedForTraining:true` is `recordConfirmedOutcome()`, which re-verifies eligibility against a valid, non-superseded confirmed-repair case bound to a job fingerprint. That path originates in the lifecycle outcome lane (`src/routes/jobs.js`), never in the feedback routes.
- Guard catches become training examples only after a mechanic verifies them; a `correct=false` verification trains nothing.
- **Actual consumers of the trusted corpus:** Quick Ask's confirmed-repair retrieval and the knowledge builder's coverage counting. The diagnose path does not consume it, and the loop's own dataset accessor (`getTrainingDataset`) has no production caller. Trusted examples are never VERIFIED_CASE truth.
- Plain statement: the verified-outcome corpus currently compounds into a retrieval sidebar and a coverage metric — not into diagnostic reasoning. That is an unfilled moat, not a leak.

## 8. Fleet and commerce — boundaries as they now stand

**Fleet roster** (`src/routes/fleet.js`) is ordinary tenant-scoped CRUD under the PR #220 identity rules, served by `public/fleet.html`. Fleet as a product was never fully built; treat the module as unfinished, not regressed.

**Bulk-estimate (fixed — PR #222).** `POST /api/fleet/bulk-estimate` calls `processSingleEstimate` (`src/services/estimator.js`), which calls Groq directly with a foreman prompt built from year/make/model, mileage, status, and caller notes — no DTCs, no tests, no evidence packet. Before PR #222, the parsed result was written straight onto the vehicle row (`status` and `next_predicted_failure`). **That write is removed.** The forecast is now returned to the caller as an explicitly `UNVERIFIED` assessment and nothing is persisted. A missing Groq key fails loudly (an earlier version of this file fabricated diagnostic data when the key was missing; that was changed to throw before this analysis). Note the naming collision: `src/services/estimator.js` is the fleet forecaster; it has nothing to do with the verified estimate lane of §5.

**Stripe webhook (fixed — PR #222).** `src/routes/webhooks.js` verifies the Stripe signature (that part was always real) and acknowledges. Before PR #222, a `checkout.session.completed` event with tenant metadata reset **every** vehicle of that tenant to `status:'OK'` / "All Systems Stable." **That update is removed entirely.** A payment confirms a commercial transaction; it is not vehicle evidence and it no longer touches fleet state. Open question carried from the analysis: the webhook's effective path is `/api/payments/webhook/webhook` (the router is mounted at `/api/payments/webhook` and defines `/webhook` inside itself). Whether Stripe's dashboard is configured with that doubled path cannot be determined from the repo.

**Payments route (retired — SEC-01).** The unused procurement checkout router and its fallback mount were removed. The separate signed webhook is unchanged.

## 9. Known defects and hazards still open on `main`

Stated at proven scope, post-merge:

- **Pattern-table presentation (§4 step 5).** A hardcoded match is presented with a named cause and up-to-96 likelihood before any measurement. Storage honesty (TESTING) holds; presentation honesty does not.
- **Pipeline stub (§4 step 3).** `localSafetyTriggered` is a constant `false`. Readers of `diagnose.js` will reasonably believe a deterministic local-safety layer exists. It does not.
- **Lifecycle estimate lane input binding (§5, Lane 2).** Request data overrides the verified job's own data wherever non-empty.
- **F-011 — evidence packet identity (§5).** The persisted packet is built from the request-body vehicle, not the VIN-resolved profile.
- **F-003 — cache consistency.** `persist()` writes the process-local cache before the database upsert, and reads serve the cache first: the same process will read back an uncommitted diagnosis as if it happened, and a restart exposes the older durable state. PR #221 fixed the response-side lie; the ordering underneath remains.
- **F-001 — database tenancy.** The lifecycle never writes the `shop_id` column, and reads filter by `job_id` alone with a JavaScript ownership check that is vacuous when no shop is supplied. Frozen census from the campaign: the production database has **no `shop_id` column at all**, and 939 of 967 jobs carry no ownership in any field. An ownership reconciliation policy is adopted (no backfill without legitimacy evidence; disagreements quarantine; unresolved jobs block ownership-sensitive operations); **no migration is authorized yet.** The end-state requirement is recorded: ownership enforced in database predicates, missing shop context fails closed.
- **Fabricated results on mounted routes (MEDIUM).** `POST /api/parts/search` returns hard-coded keyword prices with invented availability strings ("In Stock (Local Store)", "Low Inventory (2 left)") as `success:true`. `POST /api/scrape` marks a job done after a timer with a hard-coded $97.50 estimate regardless of input; no scraper runs. Neither persists diagnostic truth — the only reason these are not critical. `src/routes/partsLookup.js` calls retailer endpoints that in practice fail or return nothing and caches the empty results; the route almost never returns data.
- **Buyer route (MEDIUM).** `src/routes/buyer.js` requires the `SKSKOrchestrator` **class** and calls `.process()` on it. The class has no static `process`; every request that passes the route's own validation throws a TypeError and returns 500. The route has never successfully served a request in this form.
- **OEM route (MEDIUM).** `GET /api/oem-data/:vin/:procedure` builds a shell command by string interpolation — including the raw `procedure` route parameter — and runs it via `child_process.exec()`, behind only the generic clean-input middleware. It persists nothing and fails to `{found:false}`, but the construction is unsafe as written. The router is also mounted with no prefix; its internal `/api/...` paths are the only thing preventing shadowing.
- **Error surface (LOW).** The error handler returns `err.message` to clients in both its dev and non-dev branches.


## 10. Frontend reality

The shipped frontend is static HTML + vanilla JS under `public/`. There is no React or TypeScript frontend in the running system (`src/components/RepairGuide.jsx`, `src/api/*.ts`, `src/types/api.d.ts` have no build step and no consumer — §11).

- **`public/index.html`** (served at `/`, branded "AI LIVE") is the front door, and it cannot complete the lifecycle it starts. The string `jobId` appears nowhere in the file: its diagnose handler renders the result and discards the job the server created, and its estimate handler posts to `/api/estimateHeuristic` with no jobId, which the authorized lane answers with 409 `DIAGNOSIS_REQUIRED` — every time, by construction. Its one honest control is the invoice button, which refuses to fake an invoice and redirects to `/lifecycle` with an explanation.
- **`public/lifecycle.html`** (served at `/lifecycle`) is the actual lifecycle product: jobId-aware, drives `/api/jobs/*` and the estimate center, loads the lifecycle JS modules and the atomic-evidence UI.
- **`public/fleet.html`**, **`public/estimate-center.html`**, **`public/knowledge-builder.html`** are live pages backed by their routes. Shared auth/session bridge in `public/js/sksk-auth.js` / `sksk-session.js`; PWA shell via `public/sw.js` and `manifest.json`.

A newcomer who starts at `/` meets the broken estimator first and the working product one undiscoverable URL later. That is a known product defect (§9's list is server-side; this one is the face).

## 11. Dormant and museum inventory

Classes from the underlying analysis: **DORMANT** = wired only to broken/unreachable callers. **MUSEUM** = referenced only by dead code, docs, or nothing. Every verdict rests on an importer search.

**Dormant — the orchestrator generation.**
- `src/core/orchestrator/main.orchestrator.js` (`SKSKOrchestrator`, ~16 KB) — imported by exactly one route, the broken buyer route (§9).
- `src/core/orchestrator/deterministic.orchestrator.js` — referenced by the orchestrator cluster and tests; no working request path.
- `src/core/economic/economic.engine.js` — 13.6 KB of cost-of-failure modeling; imported by the orchestrator cluster only. Its one test proves a usage-metric edge case, not the engine.
- `src/core/evidence/evidence.verifier.js` — no spine consumer; called legacy-style by intelligence routes for non-fatal feedback recording.
- The specialist-router layer under `src/services/ai/` beyond the `aiClient` entry and provider routing that diagnose actually traverses. (The provider internals were not read line-by-line in the underlying pass; the Groq↔Gemini fallback behavior itself is proven by the provider test files.)

**Museum.**
- `src/brain/`: `failure.scorer.js`, `grounding.guard.js`, `symptom.matcher.js`, `symptom.mapping.js`, `tsb.weight.engine.placeholder.js` — referenced only by each other and docs. **Exception: `src/brain/tsb.weight.engine.js` is LIVE** (NHTSA corpus ranking, covered by `verify:brain`). Diagnose's grounding is done by prompt rules plus the candidate/stage guards, not by `grounding.guard.js`.
- `src/core/assembler/` (labor, parts, protocol assemblers) and the knowledge files only they consume: `src/knowledge/labor.matrix.js`, `parts.accuracy.js`, `repair.intelligence.library.js`, `vin.telemetry.js`, `constants.js` — a complete dead chain.
- `src/services/procedure_lookup.js` (zero callers; diagnose uses `procedure.data.js` directly), `src/services/translateSymptom.js` (no route caller).
- `src/components/RepairGuide.jsx`, `src/api/client.ts`, `src/api/formHandler.ts`, `src/types/api.d.ts` — a React/TS layer nothing builds or loads.
- `.boneyard/` (11 executable one-off patch scripts plus debris) and root `stress.test.js` / `stresstest.js` — all persist despite LEGACY.md's rule ("preserve history in Git rather than keeping executable museum pieces") and despite MASTER_PLAN.md's own delete list naming them.

None of the museum is dangerous. All of it is weight, and it is the material the retired documents described as the product. The deletion schedule with per-item reference evidence lives in the deep analysis of November 16, 2026; deletions are the owner's decision, item by item.

## 12. Tests and CI

- Exactly **94** `*.test.js` files in `tests/` (plus a manual script and an in-process HTTP helper that contain no tests). All use `node:test` + `node:assert/strict`, run via curated groups in `test:ci` — not one glob — with **`npm run verify:brain` first** in the chain. That ordering is the constitution made executable.
- 16 workflow files in `.github/workflows/`: the integration pipeline, the Render exact-head runtime gate, production-safety smoke, provider runtime, and per-subsystem runtime gates (atomic evidence, DTC provenance, final invoice, work order, customer estimate, component applicability, common-vehicle knowledge, source resilience, and others).
- Strongest suites exercise real HTTP through an in-process app: `lifecycle.http.test.js` (the full Diagnose → test → VERIFY → estimate flow), `diagnostic.evidence.packet.route`, `fleet.tenant.http`, `customer.estimate.center` — and, since PR #221, the F-013 response-integrity HTTP suite with failure injection. PR #222 likewise landed behavioral HTTP tests for the fleet/webhook boundary alongside its source-pattern guards.
- **Overclaim flags, named plainly** (the fix is to correct the title or deepen the test, never to delete the file):
  - `persistence.integrity.test.js` — its title claims the end-to-end outcome; its assertions prove a service-layer rejection only (stubbed DB, no HTTP, no mounted middleware). It passed while the F-013 defect was fully present. The HTTP suite from PR #221 is the corrective at the layer the title claims.
  - `confirmed.repair.outcome.supabase.test.js` — no Supabase client in its requires, despite the name.
  - `lemon.live-latency.test.js` — measures no live latency; proves stored-only behavior.
  - `frontend.verified.lifecycle.test.js` / `tag.status.ui.test.js` — "end to end" language over static-source (fs/vm) assertions; no browser, no server.
  - `production.smoke.recovery.test.js` — asserts the smoke script's text, makes no production call.
  - `privacy.retention`, `runtime.performance.config`, `supabase.least-privilege`, `supabase.security.migration` — document/SQL/config **text** assertions, not running behavior.
- No test in the suite touches the deployed system. Route-level truth is not deployed-production truth; the exact-head runtime gates exist to cover part of that gap against PR previews.

## 13. Status and open questions

**Product status.** SKSK has never been launched and has no external users; the production database's job counts are the builder's own testing. ProTech (the lifecycle spine) is where the work has gone. Fleet was never fully built. Buyer arrived in the latest versions and has never worked. An AI receptionist is a design idea only — there is no receptionist module.

**Merged since the underlying analysis.** PR #224 — the authenticated atomic unverified-diagnosis fix (the atomic-evidence UI now routes its requests through the shared `SKSKAuth.request` bridge instead of raw `fetch`). It is on `main` and is current behavior.

**In flight (not on `main`, not current behavior).** PR #223 — an HTTP regression test for the coded-409 passthrough at the response bridge. It is unmerged at the time of this writing; nothing in this document depends on it.

**Open questions the code could not establish** (carried from the underlying analysis; do not treat silence as an answer):
- Whether Stripe is configured with the webhook's doubled effective path (`/api/payments/webhook/webhook`) — §8.
- Procurement checkout is retired (SEC-01); Stripe configuration remains relevant to the signed webhook.
- Whether anything in the deployed frontend still calls `/api/scrape` or `/api/parts` — the current pages' calls were inventoried and none do, but the Pages-served JS bundles were not audited line-by-line; that check is the stated precondition for removing those mounts.
- The exposed-key history item recorded in CLEANUP.md — **resolved as to credential validity (owner-attested):** the owner reports the SSH key was revoked months before November 2026 and no associated keys or tokens remain issued. The repository has not independently verified revocation. The key material remains in Git history; history removal is a separate optional hardening action. See CLEANUP.md.
- Runtime behavior generally: the underlying analysis ran no server and probed no deployed endpoint. "Broken" verdicts here are structural certainties from the code as written; deployed flag states and provider behavior are outside what a code read can claim.

---

*This document describes the system as verified on November 16, 2026, updated for PRs #220–#222. When the code changes, this document must change with it — a map that disagrees with `api/server.js` is worse than no map.*
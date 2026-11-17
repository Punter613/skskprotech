> Knowledge-engine invariants are governed by [KNOWLEDGE_CONSTITUTION.md](./KNOWLEDGE_CONSTITUTION.md).

SKSK ProTech

An Automotive Intelligence Platform

Evidence. Reasoning. Safety. Human Judgment.


---

What is SKSK?

SKSK ProTech is not another AI chatbot for mechanics.

It is an automotive decision-support platform designed to help mechanics, fleet managers, service advisors, and shop owners make better repair decisions through structured reasoning, deterministic evidence rules, and verified repair knowledge.

The mission is simple:

> Give every mechanic an extra set of eyes.



The mechanic always makes the final decision.

The AI assists.


---

Why This Exists

Most automotive software stores information.

Diagnostic scanners read trouble codes.

Estimating software creates invoices.

Shop management systems organize customers.

SKSK is designed to answer a different question:

> "Given everything we know about this vehicle, what is the safest and most likely path forward?"



Instead of replacing existing tools, SKSK is intended to become the intelligence layer that works alongside them.


---

Project History

Phase 1 — AI Estimator

The project began as a simple AI estimate generator.

One endpoint.

One AI provider.

One prompt.

Generate labor.

Generate parts.

Return an estimate.

It worked.

Then the build kept going.


---

Phase 2 — Growth

Features were added rapidly:

Diagnostics

Parts Lookup

TSB Search

Fleet

Buyer Tools

Pricing

Invoices

Payments

There were no users asking for any of this. SKSK has never been launched — every feature above was added by the builder, ahead of any audience, and several of them never matured. The Buyer route is mounted but errors on every valid request. The parts routes return placeholder or empty results. Fleet was never fully built. What actually runs today is described in the Current Development Status section below, and in full in ARCHITECTURE_ANALYSIS.md.

The application continued to function, but the architecture became increasingly difficult to maintain.

Logic became duplicated.

Routes expanded.

Business logic spread across unrelated files.

The software outgrew its original design.


---

Phase 3 — Evidence-Governed Lifecycle

The platform now has a canonical truth spine:

Intake → Diagnose → Test → Verify → Estimate → Authorize → Work Order → Completed Work → Final Invoice → Outcome

Diagnostic candidates fail closed at persistence and at every later trust boundary. VERIFY requires explicit confirmation-grade physical evidence. Commercial records inherit truth; they never manufacture diagnostic proof.

Transitional paths are now deletion debt, not permanent architecture. LEGACY.md records their retirement milestones and INTENT.md records the principles that must survive implementation changes.


---

Core Philosophy

Artificial Intelligence should assist decisions.

Artificial Intelligence should not own decisions.

On the live diagnose path, the repair process follows this structure:

Vehicle Information + Customer Complaint
        │
        ▼
DTC Provenance — only verified scan-tool codes are trusted;
typed or unverified codes are excluded
        │
        ▼
Evidence Packet — observations, measurements, stored-manual
and TSB evidence, trusted codes, provenance
        │
        ▼
AI Diagnostic Candidate — one provider call, treated as a
candidate, never as a conclusion
        │
        ▼
Output Guards — candidate validation, stage guard (no repair
actions before VERIFY), completed-work guard, explanations
filtered to trusted codes only
        │
        ▼
Job Recorded as TESTING — not verified, not estimable
        │
        ▼
Mechanic Performs Physical Tests
        │
        ▼
VERIFY — a CONFIRMS test must name the exact fault the
physical evidence confirms; placeholders do not count
        │
        ▼
Verified Case → Estimate → Authorization → Work Order →
Completed Work → Final Invoice → Outcome

The mechanic remains responsible for the repair.

The AI provides a structured second opinion.


---

Deterministic Boundaries

Safety-critical truth in SKSK is not left to the AI — but be precise about which deterministic machinery actually runs, because an earlier generation of this codebase planned more of it than was ever wired in.

What runs today:

• DTC provenance. Only verified scan-tool codes are trusted. Typed, guessed, or unprovenanced codes are excluded from reasoning and from explanations.

• Placeholder rejection. A test result of "?", "unknown", "tbd", "probably", or "not tested" is not evidence, anywhere in the system.

• The VERIFY gate. Verification requires a persisted CONFIRMS test whose named fault exactly matches the confirmed cause. SUPPORTS-tier evidence cannot unlock anything.

• The TAG measurement overlay. Real measurements (brake, tire, fluid, and similar) are normalized deterministically and can override the model's urgency — the overlay never invents a measurement result and never lowers urgency.

• Deterministic repair money. Once a case is verified, the repair resolution and pricing are computed deterministically from the verified case. The model does not price the job and does not get to rename the diagnosis.

• Fail-closed persistence. If a required write to the database fails, the mechanic gets an error — never a success screen for work that was not recorded.

What does NOT run, whatever older documents say:

• There is no "Deterministic Orchestrator" evaluating safety rules around the AI. That cluster exists in the tree but is dormant — its only route consumer is the broken Buyer route.

• The diagnose pipeline's local-safety output is a hardwired constant (`localSafetyTriggered: false`). The code that would consume a local safety flag exists; the flag is never set. Nobody should rely on a deterministic local-safety layer that does not exist.

• A hardcoded table of 13 known failure patterns can answer a diagnose request without a model call. The result is stored as TESTING and cannot pass VERIFY without a real confirming test — but the response presents the pattern's likelihood (as high as 96) before any measurement exists. The gate holds; the presentation runs ahead of the evidence, and that is a known defect, not a feature.


---

Platform Architecture

SKSK is not organized into the eleven "engines" older drafts of this README described. That tree never existed. The as-built structure is:

The lifecycle spine (the working product)

• Job lifecycle service — the state machine: intake, diagnosis, tests, VERIFY gate, outcomes. Jobs are tenant-scoped; shop identity is bound server-side from the authenticated credential, never taken from a header or the request body.

• Lifecycle middleware — wraps the diagnose and estimate routes, persists the diagnosis, builds the evidence packet, and enforces fail-closed response behavior.

• Protected jobs router — mounts job CRUD, work orders, the final invoice, the customer estimate center, and the atomic evidence-reassessment path under one authenticated surface.

• The evidence core (`src/core/evidence/`) — DTC provenance, evidence packets, diagnostic candidates, the fingerprinted verified case, verified estimate snapshots, deterministic repair resolution, confirmed-repair cases, component applicability.

• Two estimate lanes — and they are not equal. The authorized lane rebuilds the estimate entirely from the fingerprinted verified case; the request body cannot substitute its own vehicle, codes, or tests. The lifecycle lane merges request data over the job's data when the request supplies it; its status gate is the same (no VERIFY, no estimate), but its input binding is weaker. ARCHITECTURE_ANALYSIS.md documents both, plainly.

The evidence-collection machinery (live, load-bearing)

• Stored-manual and TSB evidence: the lemon/manual corpus services, the NHTSA TSB corpus with bounded relevance ranking, VIN decode via NHTSA vPIC, and vehicle evidence warmup. This machinery is real, gated, and feeds the diagnose path.

The live route surface

• Diagnose, jobs, estimates, work orders, final invoice, estimate center, atomic reassessment, fleet roster, vehicle decode, translate, Quick Ask (retrieval-only), knowledge builder (read-only coverage), intelligence (feedback recording), and — only when a Stripe secret is configured — payments and the Stripe webhook.

• There is no `/api/full-estimate`, no generic `/api/estimate`, no `/api/invoice`. Those lanes were retired because they could bypass TEST → VERIFY, and CI asserts they stay deleted.

The fleet and commerce boundary (as of the latest merges)

• Fleet bulk-estimate still calls an AI model for a forecast — but the forecast is returned to the caller labeled UNVERIFIED and is never written onto the vehicle record. A prediction is a suggestion, not a status.

• A Stripe payment event never touches vehicle condition. The webhook verifies the signature, acknowledges, and does nothing else to fleet state.

Dormant and museum code (present in the tree, not on any working request path)

• The orchestrator cluster and the economic engine — dormant. Their only route consumer is the Buyer route, which is broken.

• Most of `src/brain/` — dead, except `tsb.weight.engine.js`, which is live in the NHTSA corpus ranking and covered by `verify:brain`.

• The assembler chain and the knowledge files only it consumed, a React/TypeScript frontend layer that nothing builds or loads, and archived one-off scripts. Git preserves all of it; none of it is the product.

Known-broken live surfaces, stated plainly

• The Buyer route returns 500 on every valid request.

• The parts search route returns hard-coded heuristic prices and invented availability as if they were live stock data. The scrape route returns a hard-coded result. Neither persists anything; both are slated for removal or a real provider, per LEGACY.md discipline.

• The homepage (`public/index.html`) starts a diagnosis and then discards the job ID, so its own Estimate button fails by construction. The working lifecycle product is `public/lifecycle.html`. The homepage's invoice button, to its credit, refuses to fake an invoice and sends the user to the lifecycle page.

The full as-built map — every mount, every subsystem, what is live, dormant, museum, or hazardous — is in ARCHITECTURE_ANALYSIS.md.


---

Knowledge, Not Just AI

Language models improve every year.

The lasting value of SKSK is not the model itself.

The value comes from building a structured automotive knowledge system containing:

Verified repair outcomes

Historical diagnostics

Technician feedback

Stored OEM/manual procedures

TSB evidence

Failure patterns


How learning actually works today — no stronger than the code:

Feedback recorded through the intelligence routes is stored hard-marked as NOT trusted for training. The only path to trusted status is a confirmed repair outcome recorded through the lifecycle outcome lane, and eligibility is re-verified against the confirmed-repair case before anything is promoted.

Trusted examples are consumed today by Quick Ask retrieval and by the knowledge builder's coverage counts. The diagnose path does not yet consume the trusted corpus. The loop exists, the gate is real, and the compounding the design intends has barely begun. That is the honest state of the moat: plumbed, gated, and mostly write-only for now.


---

Current Development Status

SKSK has never been launched. It has no external users. The job counts in the production database are the builder's own testing, not adoption. The sequence was deliberate: build the spine first, while nobody is watching, so the first stranger's mechanic never gets a screen that lies to him.

The evidence-governed lifecycle is the canonical direction, and its core boundaries are now enforced in code, not just documented:

• Tenant security (PR #220, merged): fail-closed API authentication and server-bound shop identity across the jobs and fleet surfaces. Cross-tenant access is denied and was verified in both directions before merge.

• Response integrity (PR #221, merged): if a required persistence write fails, the diagnose and estimate responses fail closed with an error. The system no longer shows a success payload for a diagnosis that was never recorded.

• Fleet truth boundary (PR #222, merged): AI forecasts no longer write vehicle status, and payment events no longer clear fleet condition.

Open items, stated plainly:

• The lifecycle still does not write a durable shop_id column; the production database does not have one, and most historical jobs carry no ownership in any field. An ownership reconciliation policy is adopted; no migration has been authorized.

• The lifecycle writes its in-process cache before the database write completes, and reads serve the cache first. The response-integrity fix stops the mechanic from being told an unrecorded diagnosis succeeded; the cache-ordering issue underneath it is still open.

• The persisted evidence packet is built from the request-body vehicle, while the VIN-resolved profile is computed separately. The packet should carry the resolved vehicle; today it can carry the customer-supplied one.

• PR #224 (the authenticated atomic unverified-diagnosis fix) has merged: the atomic-evidence UI now sends its requests through the shared authenticated bridge, so the unverified-diagnosis flow works from the lifecycle page. One pull request remains in flight and is NOT on main: PR #223 (an HTTP regression test for coded-error passthrough at the response bridge). Until it merges, it is not current behavior.

New work should strengthen the canonical lifecycle rather than create another parallel path. A replacement earns deletion of the old path through tests plus exact-head runtime proof. Git history preserves the past; production code should converge on one clear spine.


---

Long-Term Vision

SKSK is designed to become an automotive intelligence platform capable of supporting:

Independent repair shops

Mobile mechanics

Fleet maintenance

Vehicle buyers

Service advisors

White-label commercial deployments


Future capabilities include:

Predictive maintenance

Mechanic feedback network

Evidence-based confidence scoring

Fleet analytics

Offline edge deployment

Structured repair intelligence

An AI receptionist exists today only as a design idea — probabilities used silently for scheduling, never spoken to the customer as findings. It is not a built module, and it is listed here, in the future tense, where it belongs.


---

Design Principles

Every major design decision follows these principles:

1. Human judgment always has final authority.


2. AI assists; it does not replace expertise.


3. Safety rules override AI recommendations.


4. Evidence is more valuable than confidence.


5. Commercial records must never invent diagnostic truth.


6. Knowledge is accumulated from verified repair outcomes.


7. Every module should have one clear responsibility.


8. Transitional paths require an explicit deletion milestone.


9. The system is a lantern, not a leash.




---

Repository Notice

INTENT.md defines the permanent human, safety, evidence, and commercial-truth boundaries.

LEGACY.md defines the retirement schedule for transitional paths.

ARCHITECTURE_ANALYSIS.md describes the system as it is actually built. Where any older document disagrees with it, the older document is wrong.

Duplicate production paths are not a destination. The repository is converging on one evidence-governed lifecycle while preserving history in Git rather than in executable museum pieces.


---

Project Vision

Most automotive software answers:

> "What happened?"



SKSK is designed to answer:

> "What is the safest, most evidence-supported decision we can make next?"




---

Built by someone who's spent years turning wrenches, solving problems, and learning that sometimes the most valuable tool in the shop isn't another scanner—it's an extra set of eyes.
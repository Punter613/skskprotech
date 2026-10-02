# SKSK ProTech Knowledge Constitution

## Purpose

SKSK ProTech is a truth-management system for automotive diagnostics.

Models, providers, routes, databases, interfaces, and learning algorithms may change. The rules that govern what SKSK is allowed to treat as diagnostic knowledge must remain explicit, reviewable, and enforceable.

This document is the engineering contract for the knowledge engine.

> **AI proposes. Evidence records. Truth verifies. The spine decides. History remembers.**

## Constitutional distinction

A diagnostic episode is historical record. A knowledge claim is a proposition evaluated from one or more episodes and other admissible evidence.

```text
DiagnosticEpisode != KnowledgeClaim

DiagnosticEpisode = historical record
Evidence          = observations and measurements
KnowledgeClaim    = proposition under evaluation
KnowledgeState    = current standing of that claim
Outcome           = what happened afterward
```

Episodes are not rewritten when SKSK's understanding changes. Claims are expected to change as evidence accumulates.

---

## Law 1 — Evidence history is append-only

Evidence may be appended, challenged, corrected, or superseded. It may never be silently rewritten.

A correction creates new history identifying the original evidence, actor, timestamp, reason, and replacement or qualification. The original event remains auditable.

```text
History is append-only.
Errors are corrected by new history.
Original evidence is never silently rewritten.
Current truth is a projection over that history.
```

**Forbidden:** destructive edits that make prior evidence appear never to have existed; replacing an observation merely because later evidence disagrees with it.

## Law 2 — Knowledge is provisional

No knowledge claim is immortal.

Every claim remains subject to promotion, challenge, demotion, supersession, and retirement when admissible evidence changes.

The canonical knowledge states are reversible:

```text
CANDIDATE <-> SUPPORTED <-> VERIFIED <-> ESTABLISHED_PATTERN
```

A state records current standing, not eternal truth. State transitions must retain their reasons and supporting/refuting provenance.

## Law 3 — Source prestige does not equal truth

```text
Frequency != truth.
Authority != vehicle-specific proof.
Repair success != causal proof.
AI confidence != verification.
Evidence earns promotion.
```

Source quality affects admissibility, provenance, and prior weight. It does not bypass evidence gates.

A forum report may create a candidate. An OEM bulletin may establish applicability and a known pattern. Neither, by itself, proves the cause on the vehicle being diagnosed.

Repeated copies of one claim are not independent evidence.

## Law 4 — Learning happens through diagnostic episodes

SKSK does not learn merely from repairs. It learns from diagnostic episodes.

A diagnostic episode can contain:

```text
vehicle identity and applicability
mileage / operating context
presentation and symptoms
DTCs
candidate hypotheses
tests and measurements
supporting evidence
refuting evidence
confirmation
repair / action
immediate outcome
follow-up outcome
recurrence / comeback
```

A repair is an event inside an episode, not the learning unit.

## Law 5 — Negative evidence is first-class evidence

Disproven hypotheses, passed tests, failed tests, rejected causes, contradictory measurements, unsuccessful repairs, and non-recurrence are retained when their provenance is valid.

SKSK must be able to learn not only what survived testing, but what was ruled out, why it was ruled out, and which test separated competing hypotheses.

Missing proof is not negative evidence.

## Law 6 — The diagnostic spine owns truth

```text
AI proposes.
Evidence records.
Truth verifies.
The spine decides.
```

AI output may create or rank hypotheses and propose tests. It cannot promote itself to VERIFIED.

Mechanic opinion, customer authorization, estimates, work orders, invoices, source popularity, or commercial state cannot create diagnostic proof.

Deterministic safety and applicability rules override model recommendations.

Only persisted evidence satisfying the diagnostic truth boundary may unlock verification.

## Law 7 — Beliefs have history

SKSK must retain why a claim gained or lost standing.

A future system must be able to answer:

- Why did we believe this?
- What evidence promoted it?
- What evidence contradicted it?
- Why was it demoted, superseded, or retired?
- Which applicability boundaries changed?

Knowledge-state transitions are themselves auditable events. New understanding changes the current projection; it does not rewrite prior belief history.

## Law 8 — Uncertainty must survive the system

```text
Unknown remains unknown.
Missing evidence is not negative evidence.
Absence of contradiction is not confirmation.
Confidence is not verification.
Repeated claims are not independent evidence.
```

No summarizer, provider, learning cycle, ranking algorithm, persistence layer, or UI may silently strengthen uncertainty.

If SKSK cannot establish a proposition, the system must preserve that uncertainty.

---

## Promotion and demotion contract

Promotion is evidence-gated, never popularity-gated.

- **CANDIDATE -> SUPPORTED:** admissible evidence materially supports the claim, while the claim remains unverified.
- **SUPPORTED -> VERIFIED:** vehicle-specific evidence satisfies the verification boundary for the asserted cause.
- **VERIFIED -> ESTABLISHED_PATTERN:** multiple sufficiently independent verified episodes establish a repeatable, applicability-bounded pattern with adequate outcome history.

Demotion is equally legitimate.

- New contradictory evidence may weaken SUPPORTED or VERIFIED claims.
- Failed outcomes may challenge the causal interpretation of an episode.
- Contradictory verified episodes may narrow, demote, supersede, or retire an ESTABLISHED_PATTERN.
- A previously established pattern must remain challengeable.

Promotion and demotion both require recorded reasons and provenance.

## Source hierarchy

Source tier determines how information may enter reasoning. It does not determine truth.

1. **Gold:** SKSK ProTech and Fleet diagnostic episodes with verified evidence and outcomes.
2. **Verified industry:** OEM service information, TSBs, recalls, safety investigations, and authoritative technical data.
3. **Strong supporting:** legitimate professional diagnostic case material with documented reasoning/tests.
4. **Weak supporting:** forums, owner reports, complaints, social discussion, and anecdotal material.
5. **Untrusted/raw:** unattributed or generated material, including AI-generated claims.

Weak or raw sources may generate candidates. They cannot independently promote diagnostic truth.

## Information gain

The long-term diagnostic objective is not merely to rank the most likely cause. SKSK should help identify the next admissible test that most usefully reduces uncertainty.

Future test ranking may consider:

- diagnostic separation power
- applicability
- cost
- time
- invasiveness and safety risk
- historical discriminatory value
- quality and independence of supporting evidence

Information-gain ranking remains advisory. It does not bypass the truth boundary.

## Truth Verification Suite

Changes capable of affecting diagnostic truth must eventually pass:

```bash
npm run verify:brain
```

The suite is a constitutional release gate, not a model-quality vanity benchmark. It must test at least:

- unsupported promotion
- missing proof
- valid confirmation
- contradictory evidence
- promotion and demotion
- evidence contamination / poisoning
- popularity attacks and duplicated-source attacks
- false repair confirmation
- deterministic authority over AI recommendations
- uncertainty preservation
- commercial-state contamination
- provider/model hallucination
- established-pattern challenge and retirement
- immutable episode/evidence history
- knowledge drift against verified reference cases

A build fails when a protected invariant is violated, even if conventional unit and integration tests pass.

## Implementation order

1. Formalize truth states, evidence states, provenance, promotion, demotion, supersession, and retirement.
2. Introduce `DiagnosticEpisode` as the canonical learning record without prematurely replacing the production lifecycle spine.
3. Build `verify:brain` adversarially against this constitution.
4. Expand automated learning only after those gates protect the knowledge boundary.

The prohibited order is:

```text
Build learning first.
Build truth later.
```

SKSK defines truth first and builds learning second.

---

## Permanent invariant

> **No hypothesis becomes truth because it is popular. No mechanic, AI, document, repair, estimate, or invoice becomes truth by assertion. Evidence earns promotion; verified outcomes earn durable learning; contradictory evidence can take that standing away.**

Any future implementation that cannot preserve this invariant must change before this constitution does.

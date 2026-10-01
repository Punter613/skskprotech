# SKSK ProTech — Permanent Intent

This file is a bridge between the human purpose of SKSK ProTech and the code that implements it. These principles are not branding. They are release constraints.

## The permanent rules

- **Human judgment is final.** A qualified person owns the decision. Software may organize evidence, expose contradictions, and recommend the next test; it does not take ownership away from the human.
- **AI assists; it does not own.** Model output is a hypothesis or aid unless the system has independent evidence that promotes it.
- **Safety rules override the model.** Deterministic safety, authorization, evidence, tenant, and lifecycle boundaries win whenever model output conflicts with them.
- **Evidence and verified outcomes matter more than confidence.** Confidence scores, rankings, fluent explanations, and repeated model agreement are not physical proof.
- **Commercial records must never invent diagnostic truth.** Customer authorization proves permission. Completed work proves recorded execution. An estimate, Work Order, invoice, payment, or other commercial record cannot create a verified diagnosis.
- **The system is a lantern, not a leash.** SKSK should make the evidence easier to see and the next decision easier to reason about without pretending to replace the person responsible for the vehicle.

## Executable consequences

A malformed or invalid diagnostic candidate fails closed. It must not enter TEST/VERIFY as a manufactured successful diagnosis.

VERIFY requires persisted physical evidence explicitly classified as confirmation evidence and bound to the confirmed fault. AI confidence alone can never unlock VERIFY.

Estimate and repair authorization inherit diagnostic truth; they do not manufacture it. Customer authorization controls commercial scope, not mechanical truth.

Final invoice truth comes only from work that was both authorized and recorded as completed. Cancelled, blocked, merely estimated, or unfinished work must not become completed invoice truth.

Invoices and payments are downstream ledger artifacts. They must never feed backward as diagnostic proof or create a VERIFIED_CASE.

New evidence can overturn an earlier hypothesis. The system must preserve that distinction rather than protecting the model's first answer.

A regression across any of these trust boundaries is a **release blocker**. Do not merge around it, soften the assertion, or replace an exact-head runtime failure with a static-only pass.

## Legacy retirement rule

Transitional paths are temporary liabilities. Keep them only while a replacement still needs production proof.

For every legacy or duplicate path retained:
1. name its replacement;
2. identify the compatibility reason it still exists;
3. give it a deletion milestone;
4. add evidence that tells us when the replacement has earned deletion of the old path.

The target is one clear lifecycle spine:

**Intake → Diagnose → Test → Verify → Estimate → Authorize → Work Order → Completed Work → Final Invoice → Outcome**

Do not preserve a second path merely because it is familiar.

## Stewardship

The longer-form legacy material carries the full human story, judgment, and lessons behind SKSK. This repository carries a deliberately smaller set of those ideas as executable constraints.

Future maintainers may change providers, frameworks, databases, interfaces, and product names. They should not silently change these truth boundaries.

When convenience and these principles conflict, choose the evidence boundary and make the tradeoff visible.

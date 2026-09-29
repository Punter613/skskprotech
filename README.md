# SKSK ProTech

**Automotive intelligence built around evidence, reasoning, safety, and human judgment.**

> **Your extra set of eyes.**

SKSK ProTech is not an AI chatbot that tells a mechanic what to replace. It is a decision-support platform that helps technicians move from a customer complaint to an evidence-supported repair while keeping diagnostic authority explicit.

The mechanic makes the final decision. AI assists.

---

## The Current Technician Workflow

SKSK organizes a repair around a controlled lifecycle:

```text
INTAKE → BRAIN → TEST → VERIFY → ESTIMATE → AUTHORIZE+
```

### 1. Intake

Capture vehicle identity, mileage, Customer States, mechanic observations, and DTC provenance.

Only DTCs explicitly identified as **read from a scan tool — verified** may enter diagnostic ranking, deterministic matching, or automatic DTC-focused retrieval. Typed, customer-reported, and placeholder codes remain in the audit trail without being promoted to diagnostic evidence.

### 2. Brain

**Ask the Brain** is a read-only mechanic aid.

It can use the current case context—including the customer complaint, mechanic observations, translated retrieval terms, verified DTC context, and current diagnostic candidates—to search for:

- eligible confirmed repair outcomes
- focused service-manual references
- published TSB evidence

These sources remain separate. A TSB match is not converted into diagnostic probability, and a service-manual pointer does not confirm a fault.

Brain does **not** advance diagnostic authority, authorize a repair, or unlock Estimate.

### 3. Test

SKSK turns diagnostic hypotheses into confirmation steps.

Mechanic observations and measurements are persisted as evidence. New evidence makes the previous AI candidate stale until reassessment succeeds, preventing an older diagnosis from silently surviving contradictory or newer findings.

### 4. Verify

Verification requires physical evidence explicitly classified as **CONFIRMS** and tied to a named fault.

An AI-generated hypothesis—even a high-confidence one—cannot substitute for that confirmation.

### 5. Estimate

Estimate stays locked until the diagnostic lifecycle reaches verified repair truth.

The platform is designed to prevent a plausible diagnosis from quietly becoming an authorized repair.

### 6. Authorize+

The downstream work-order and invoice lifecycle preserves the distinction between diagnosis, verification, customer authorization, completed work, and final billing.

---

## Unverified Diagnosis and Cause Chains

Real vehicles can have more than one fault, and one fault can contribute to another.

SKSK therefore avoids flattening every similar symptom into a single candidate. The unverified diagnosis layer can preserve concurrent candidates and organize plausible relationships such as:

```text
upstream condition
      ↓
component fault / leak point
      ↓
observed consequence
```

For example, a crankcase-ventilation fault may be considered alongside a valve-cover leak and an independent oil-filter-housing leak when the observed consequence is oil contacting a hot exhaust surface.

Those relationships are labeled **HYPOTHESIS_ONLY** until physical evidence confirms the individual fault. Cause-chain reasoning does not unlock VERIFY or Estimate.

True aliases can be normalized without erasing distinct faults.

---

## Evidence Authority Model

SKSK intentionally separates different levels of knowledge:

| Information | What it can do |
| --- | --- |
| Customer statement | Establish symptoms and context |
| Mechanic observation | Add case evidence and influence reassessment |
| AI diagnostic candidate | Guide testing as an unverified hypothesis |
| Confirmed repair history | Inform read-only common-pattern retrieval |
| Service-manual reference | Point the technician toward applicable procedures |
| Published TSB | Provide published vehicle/service evidence |
| Physical CONFIRMS evidence tied to a named fault | Make the fault eligible for explicit verification |
| Explicit verification | Advance repair authority toward Estimate |

The core rule is simple:

> **Evidence is more valuable than confidence.**

---

## Atomic Evidence Reassessment

Test evidence and diagnostic reassessment are designed to behave as one controlled workflow.

When new mechanic evidence is submitted:

1. the evidence is validated and persisted;
2. the prior diagnosis is marked stale;
3. SKSK reassesses the persisted case;
4. a fresh unverified diagnosis revision is issued only if reassessment succeeds.

If reassessment fails, the mechanic evidence remains saved and the prior diagnosis stays visibly stale. SKSK fails closed rather than presenting an outdated candidate as current.

Stable evidence IDs also make mobile retries idempotent so a retry does not silently duplicate the same test result.

---

## Why SKSK Exists

Most automotive software stores information.

Diagnostic scanners read trouble codes. Estimating software creates estimates and invoices. Shop-management systems organize customers and work.

SKSK is designed around a different question:

> **Given what we actually know about this vehicle, what should we test, verify, and decide next?**

Instead of replacing existing shop tools, SKSK is intended to become the intelligence layer that works alongside them.

---

## Core Architecture

The platform is organized around specialized responsibilities, including:

- Diagnostics
- Estimates and pricing
- Parts intelligence
- VIN intelligence
- Fleet and buyer tools
- Knowledge and evidence retrieval
- Economic analysis
- deterministic safety / TAG evaluation
- repair lifecycle and verified outcomes

The diagnostic pipeline combines deterministic controls, provider-assisted reasoning, validation, evidence verification, economic analysis, and structured output.

AI providers are replaceable components. The durable value is the evidence and repair-intelligence system around them.

---

## Deterministic Safety

Safety-critical recommendations are not left entirely to model output.

Deterministic controls can evaluate known constraints before AI reasoning and validate output afterward. The same philosophy applies to diagnostic authority: AI may propose a candidate, but it cannot manufacture the physical evidence required to verify that candidate.

This boundary matters for systems such as brakes, steering, tires, cooling, lubrication, and electrical safety—and for ordinary repairs where replacing the wrong part is expensive even when it is not immediately dangerous.

---

## Knowledge, Not Just AI

The long-term knowledge layer is built from structured automotive evidence such as:

- verified repair outcomes
- historical diagnostics
- technician observations and test results
- OEM/service-manual references
- published TSB evidence
- component and parts relationships
- labor and pricing history
- failure patterns
- economic analysis

Completed work can improve future recommendations only when it meets the eligibility rules for verified repair knowledge.

---

## Project Evolution

### Phase 1 — AI Estimator

SKSK began as a simple AI estimate generator: one endpoint, one provider, one prompt, and a generated estimate.

### Phase 2 — Growth

Diagnostics, parts lookup, TSB search, fleet tools, buyer tools, pricing, invoices, payments, and other capabilities expanded the project beyond its original architecture.

### Phase 3 — Controlled Migration

The repository moved toward specialized engines and explicit contracts without deleting working functionality before its replacement was proven.

### Phase 4 — Evidence-Governed Lifecycle

The current direction connects intake, read-only knowledge retrieval, testing, atomic reassessment, explicit physical verification, estimates, authorization, completed work, and verified repair outcomes into one evidence-governed lifecycle.

---

## Design Principles

1. Human judgment has final authority.
2. AI assists; it does not replace expertise.
3. Safety and authority boundaries are deterministic where they need to be.
4. Evidence is more valuable than confidence.
5. Unverified hypotheses must remain visibly unverified.
6. Distinct concurrent faults must not be collapsed merely because they share a symptom.
7. New evidence must invalidate stale reasoning before a fresh diagnosis is trusted.
8. Verified repair outcomes—not guesses—build durable repair knowledge.
9. Architecture evolves through tested migration rather than destructive rewrites.
10. Every module should have a clear responsibility.

---

## Long-Term Vision

SKSK is being built as an automotive intelligence platform for independent repair shops, mobile mechanics, fleets, service advisors, vehicle buyers, and commercial deployments.

The direction includes deeper repair intelligence, multi-provider reasoning, predictive maintenance, fleet analytics, mechanic feedback, evidence-based confidence, and offline/edge capability—while preserving the same core rule:

> **The system can help decide what to investigate. The evidence determines what is verified.**

---

## Repository Notice

The repository is under active development and may still contain legacy routes, transitional modules, compatibility layers, or temporarily overlapping functionality.

That overlap is intentional when it protects working behavior during migration. Production functionality is not intentionally removed until its replacement has been tested.

---

## Project Vision

Most automotive software answers:

> **What happened?**

SKSK is designed to help answer:

> **What is the safest, most evidence-supported decision we can make next?**

Built from the perspective that sometimes the most valuable tool in the shop is not another scanner—it is **an extra set of eyes**.

# 🛠️ SKSK ProTech - Core Backend Engine

SKSK ProTech is a high-speed, enterprise-grade auto estimation and field service pipeline built for mobile mechanics and independent shops. It takes raw technician field notes and vehicle data, refines it through an automated data loop, and spits out client-ready invoices and field diagnostics in seconds.

**Production Server:** `https://p613-backend.onrender.com`  
**Runtime Environment:** Node.js (v26+) / Termux Mobile Workshop / Render Cloud

---

## 🟢 Where We Are (Current Status)

The core architecture is officially fully operational, debugged, and running live in production. Instead of hitting multiple slow endpoints, the app utilizes a unified **one-shot estimation pipeline** (`POST /api/full-estimate`) that completes a massive multi-system data sequence in under 7 seconds:

*   **Federal VIN Decoding:** Directly interfaces with the NHTSA VPIC API to instantly resolve 17-character VIN strings into exact Year, Make, Model, and Engine factory configurations.
*   **Factory Manual Scrape:** Automatically scans and indexes specialized repair sheets and Technical Service Bulletins (TSBs) via the `lemon-manuals` crawler, utilizing a local storage caching architecture.
*   **The AI Shop Foreman:** Leverages the Groq LLaMA-3 framework to analyze customer complaints, mechanic findings, and active OBD-II trouble codes to calculate realistic shop labor times, strict priority levels, and deep-dive diagnostic evaluations.
*   **3-Tier Cost Matrix:** Automatically breaks down part search requests into an actionable commercial tier array:
    *   *Economy Tier:* Everyday aftermarket pricing (AutoZone/Retail).
    *   *OEM Tier:* Factory certified specification matching (eBay Motors API).
    *   *Premium Performance:* Severe-duty component routing (NAPA Commercial Hub).
*   **Shaffer Field Guides:** Generates precise, mobile-optimized step-by-step repair documentation on demand, complete with critical tool sizes, safety protocols, and torque specifications.
*   **Pristine Text Parsing:** Utilizes a non-regex array line-splitting engine to reliably handle markdown text conversions without risking syntax crashes.

---

## 🚀 The Potential (Future Roadmap)

With the core structural pipes running wide open, SKSK ProTech is primed to scale from a backend framework into a full commercial shop management platform:

1.  **Frontend Dashboard Integration:** Mapping the unified JSON outputs directly into clean, high-contrast, touch-friendly UI cards on the mobile screen for immediate technician view.
2.  **Voice-to-Text Ingestion:** Integrating audio stream transcription so a field mechanic can dictate "pads are down to 2mm, rotor has a lip" directly into the phone microphone while under the wheel well, immediately trigger-firing the estimation pipeline.
3.  **Stripe Commercial Checkout:** Activating the built-in Stripe payment gateway pathways (`/api/payments`) to allow mechanics to collect immediate client authorization deposits and process digital field invoices on-site.
4.  **Diagnostic Parameter Isolation:** Fine-tuning the AI foreman's internal prompt parameters to hard-separate unrelated vehicle sub-systems (ensuring electrical engine misfires don't cross-contaminate mechanical brake pad friction wear reports).
5.  **Multi-Shop Scaling:** Adapting the Supabase database tenant architecture to support multiple independent service trucks running off the same centralized engine layer.

## 🛠️ System Maintenance & Build Log

### [2026-06-21] – P613 Pipeline Ignition & Optimization
* **Render Build Command Overhaul:** Swapped build string to execute Node installations before running the Rust compiler.
* **Database Driver Alignment:** Migrated `src/db.js` from a raw PG pool to the official `@supabase/supabase-js` SDK client.
* **Diagnostic Dashboard Deployed:** Launched the `index.html` dark-mode diagnostic cockpit with cache-proof polling loops.

---

## 🚚 Next Up on the Assembly Line: SKSKFLEET

The foundational P613 retail pipeline is locked down, pressurized, and stable. The next production cycle introduces **SKSKFLEET**—a high-margin, multi-tenant B2B platform engineered for regional fleet managers, logistics networks, and commercial transit lines.

### 🧱 Architectural Pillars (In the Pipe)
* **Multi-Tenant Control Harness (`tenant_id`):** Segregates database infrastructure at the core level. One backend service network, multiple isolated front-end corporate spaces with role-based checkpoint permissions (`fleet_manager`, `mechanic`, `driver`).
* **Active Operations Roster UI:** A clean, data-dense logistics HUD tracking fleet assets by Unit ID, VIN, and current mileage, with high-visibility vehicle state markers (`OK` / `Needs Service` / `Critical`).
* **AI-Predictive Failure Analytics:** Extends the active multi-repair signal engine to calculate failure horizons. Cross-references vehicle model TSB histories, mileage milestones, and active fault codes to predict parts degradation windows before a truck drops a line on a delivery run.
* **Bulk Aggregator Optimization:** Allows operators to select 5–50 fleet vehicles simultaneously to run full-stack parallel VIN decodes, manual scrapers, AI computations, and live supplier checks in a single batch.
* **Fleet-Scale Parts Procurement:** Leverages the live `/api/parts-lookup` cache matrix to calculate high-volume parts runs (bulk filters, brake lines, ignition sets), instantly serving up the cheapest local pickup options versus online distributor lead times.
* **White-Label Invoicing & Branding:** Dynamically serves distinct colorways, custom company logos, and custom layout parameters matched to the logged-in corporate domain.

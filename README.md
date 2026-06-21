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

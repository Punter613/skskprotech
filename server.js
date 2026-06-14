// ========================================
// ZOD VALIDATION
// ========================================
const DiagnosticSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional().default(""),
    email: z.string().optional().default("")
  }),
  vehicle: z.any(), // Accept string OR object
  obdCodes: z.array(z.string()).optional().default([]),
  customerStates: z.array(z.string()).optional().default([]),
  mechanicNotices: z.array(z.string()).optional().default([]),
  laborRate: z.number().optional().default(DEFAULT_LABOR_RATE)
});

// ========================================
// 1. DIAGNOSE PHASE
// ========================================
app.post('/api/diagnose', async (req, res) => {
  try {
    const parsed = DiagnosticSchema.parse(req.body);
    const vehicle = normalizeVehicle(parsed.vehicle);

    const jobRecord = {
      customer: parsed.customer,
      vehicle,
      obd_codes: parsed.obdCodes,
      customer_states: parsed.customerStates,
      mechanic_notices: parsed.mechanicNotices,
      labor_rate: parsed.laborRate,
      state: "diagnosed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let saved = jobRecord;
    if (supabase) {
      const { data, error } = await supabase.from("jobs").insert(jobRecord).select().single();
      if (!error) saved = data;
    }

    res.json({ success: true, job: saved });
  } catch (err) {
    console.error("[DIAGNOSE FAIL]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// 2. ESTIMATE PHASE
// ========================================
app.post('/api/estimate', async (req, res) => {
  try {
    const { jobId, incomingPayload } = req.body;

    let payload = incomingPayload;

    if (jobId && supabase) {
      const { data } = await supabase.from("jobs").select("*").eq("id", jobId).single();
      payload = {
        customer: data.customer,
        vehicle: data.vehicle,
        obdCodes: data.obd_codes,
        customerStates: data.customer_states,
        mechanicNotices: data.mechanic_notices,
        laborRate: data.labor_rate
      };
    }

    const validated = DiagnosticSchema.parse(payload);
    const prompt = buildPrompt(validated);

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    const raw = await aiRes.json();
    let text = raw.choices?.[0]?.message?.content || "";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    const ai = JSON.parse(text);

    // BUSINESS CALCULATIONS
    const laborTotal = Number((ai.laborHours * ai.laborRate).toFixed(2));
    const partsTotal = ai.parts.reduce((s, p) => s + Number(p.cost || 0), 0);
    const shopSupplies = Number((partsTotal * (ai.shopSuppliesPercent / 100)).toFixed(2));
    const subtotal = laborTotal + partsTotal + shopSupplies;
    const tax = Number((subtotal * 0.28).toFixed(2));
    const grandTotal = subtotal;

    const estimate = {
      ...ai,
      laborTotal,
      partsTotal,
      shopSupplies,
      subtotal,
      tax,
      grandTotal,
      customer: validated.customer,
      vehicle: normalizeVehicle(validated.vehicle)
    };

    if (jobId && supabase) {
      await supabase.from("jobs").update({
        estimate,
        state: "estimated",
        updated_at: new Date().toISOString()
      }).eq("id", jobId);
    }

    res.json({ success: true, estimate });
  } catch (err) {
    console.error("[ESTIMATE FAIL]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// 3. INVOICE PHASE
// ========================================
app.post('/api/invoice', async (req, res) => {
  try {
    const { jobId, estimate } = req.body;

    let est = estimate;

    if (!est && jobId && supabase) {
      const { data } = await supabase.from("jobs").select("estimate").eq("id", jobId).single();
      est = data.estimate;
    }

    if (!est) return res.status(400).json({ success: false, error: "No estimate found." });

    const invoice = {
      ...est,
      type: "invoice",
      timestamp: new Date().toISOString(),
      taxSetaside: Number((est.subtotal * 0.28).toFixed(2)),
      takeHomePay: Number((est.subtotal * 0.72).toFixed(2)),
      balance: 0,
      footer: "Thank you for choosing SKSK ProTech!"
    };

    if (jobId && supabase) {
      await supabase.from("jobs").update({
        invoice,
        state: "completed",
        updated_at: new Date().toISOString()
      }).eq("id", jobId);
    }

    res.json({ success: true, invoice });
  } catch (err) {
    console.error("[INVOICE FAIL]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});// ========================================
// STRIPE (Disabled but wired)
// ========================================
if (STRIPE_ENABLED) {
  app.post("/api/pay", async (req, res) => {
    try {
      const { amount, payment_method_id } = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        payment_method: payment_method_id,
        confirm: true
      });

      res.json({ success: true, paymentIntent });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// ========================================
// SERVER START
// ========================================
app.listen(PORT, () => {
  console.log(`🔥Brian — **perfect.**  
You want Stripe **ready but OFF**, so the backend will:

### ✔ Include Stripe wiring  
### ✔ Include Stripe config  
### ✔ Include Stripe helper functions  
### ✔ Include Stripe route placeholders  
### ❌ BUT Stripe will NOT activate unless you flip one boolean  

This is the safest setup.

---

# ⭐ I will now generate your **FULL BACKEND REPLACEMENT**  
### Using:
- **Option 1** (new multi‑repair engine)  
- **Vehicle format C** (accept both string + object)  
- **Vehicle storage V3** (store raw + structured)  
- **Stripe ready but disabled**  

And I will deliver it in **3 clean copy‑paste sections**, exactly as you requested.

---

# 🚀 SECTION 1 — CORE ENGINE + NORMALIZERS + PROMPT BUILDER  
### (Copy/paste this as the TOP of your backend file)

````js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');

const app = express();

// ========================================
// CORS & JSON
// ========================================
app.use(cors({ origin: '*', methods: ['GET','POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// ========================================
// ENVIRONMENT
// ========================================
const PORT = process.env.PORT || 4000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_LABOR_RATE = Number(process.env.DEFAULT_LABOR_RATE || 65);

// Stripe is wired but OFF unless you flip this:
const STRIPE_ENABLED = false;
let stripe = null;
if (STRIPE_ENABLED) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log("💳 Stripe ready (but disabled by config)");
}

// ========================================
// SUPABASE
// ========================================
const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// ========================================
// VEHICLE NORMALIZER (Accepts string OR object)
// ========================================
function normalizeVehicle(v) {
  if (!v) return { raw: "Unknown Vehicle", year: "", make: "", model: "" };

  // If string → parse best we can
  if (typeof v === "string") {
    const parts = v.split(" ");
    return {
      raw: v,
      year: parts[0] || "",
      make: parts[1] || "",
      model: parts.slice(2).join(" ") || ""
    };
  }

  // If object → build raw string
  if (typeof v === "object") {
    const raw = `${v.year || ""} ${v.make || ""} ${v.model || ""}`.trim();
    return {
      raw,
      year: v.year || "",
      make: v.make || "",
      model: v.model || ""
    };
  }

  return { raw: "Unknown Vehicle", year: "", make: "", model: "" };
}

// ========================================
// MULTI‑REPAIR EVIDENCE ENGINE
// ========================================
function analyzeEvidence({ obdCodes = [], customerStates = [], mechanicNotices = [] }) {
  const text = [...obdCodes, ...customerStates, ...mechanicNotices]
    .join(" ")
    .toLowerCase();

  const signals = [
    {
      kw: ["torn cv boot", "axle clicking", "cv axle"],
      repair: "CV Axle Replacement",
      hours: 1.5,
      parts: [{ name: "CV axle shaft assembly", cost: 125 }]
    },
    {
      kw: ["valve cover leaking", "oil on exhaust"],
      repair: "Valve Cover Gasket Replacement",
      hours: 2.0,
      parts: [{ name: "Valve cover gasket set", cost: 35 }]
    },
    {
      kw: ["wheel bearing noise", "growling wheel"],
      repair: "Wheel Bearing Replacement",
      hours: 1.5,
      parts: [{ name: "Wheel bearing hub assembly", cost: 85 }]
    }
  ];

  for (const sig of signals) {
    if (sig.kw.some(k => text.includes(k))) {
      return {
        jobType: "Repair",
        detected: sig
      };
    }
  }

  return {
    jobType: "Diagnosis",
    detected: null
  };
}

// ========================================
// PROMPT BUILDER (Ultra‑Detailed JSON)
// ========================================
function buildPrompt(payload) {
  const vehicle = normalizeVehicle(payload.vehicle);
  const evidence = analyzeEvidence(payload);

  const forcedParts = evidence.detected?.parts || [];
  const forcedHours = evidence.detected?.hours || null;

  return `
You are an ASE‑certified mobile mechanic estimator with 20+ years of field experience.
MANDATORY LABOR RATE: $${payload.laborRate || DEFAULT_LABOR_RATE}/hour.

VEHICLE:
- Raw: ${vehicle.raw}
- Year: ${vehicle.year}
- Make: ${vehicle.make}
- Model: ${vehicle.model}

DIAGNOSTIC INPUTS:
- OBD Codes: ${payload.obdCodes.join(", ") || "None"}
- Customer States: ${payload.customerStates.join("; ") || "None"}
- Mechanic Findings: ${payload.mechanicNotices.join("; ") || "None"}

FORCED ENGINE DECISION:
- Job Type: ${evidence.jobType}
- Forced Parts: ${forcedParts.length ? forcedParts.map(p => p.name).join(", ") : "AI must determine"}
- Forced Hours: ${forcedHours || "AI must determine"}

RETURN JSON ONLY IN THIS EXACT STRUCTURE:

{
  "jobType": "Diagnosis" | "Repair",
  "shortDescription": "One sentence summary",
  "laborRate": ${payload.laborRate || DEFAULT_LABOR_RATE},
  "laborHours": number,
  "parts": [
    { "name": "string", "cost": number }
  ],
  "shopSuppliesPercent": 7,
  "workSteps": ["step 1", "step 2", "step 3"],
  "warnings": ["warning 1", "warning 2"],
  "notes": ["note 1", "note 2"],
  "tips": ["tip 1", "tip 2"],
  "customerSummary": "Customer‑friendly explanation",
  "primaryConcern": "Restated customer concern",
  "diagnosticNotes": "Tech‑facing notes",
  "engineMeta": "Internal reasoning summary"
});

// ========================================
// STRIPE (Disabled but wired)
// ========================================
if (STRIPE_ENABLED) {
  app.post("/api/pay", async (req, res) => {
    try {
      const { amount, payment_method_id } = req.body;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        payment_method: payment_method_id,
        confirm: true
      });

      res.json({ success: true, paymentIntent });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// ========================================
// SERVER START
// ========================================
app.listen(PORT, () => {
  console.log(`🔥 SKSK ProTech Backend Online — Port ${PORT}`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');

const app = express();

const PORT = process.env.PORT || 4000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_LABOR_RATE = Number(process.env.DEFAULT_LABOR_RATE || 65);
const TAX_RATE = Number(process.env.TAX_RATE || 0.07);
const SHOP_SUPPLIES_RATE = Number(process.env.SHOP_SUPPLIES_RATE || 0.07);

const STRIPE_ENABLED = false;
let stripe = null;
if (STRIPE_ENABLED) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  console.log('💳 Stripe ready (disabled by config)');
}

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const allowedOrigins = [
  'https://skskprotech.pages.dev',
  'https://www.skskprotech.pages.dev',
  'http://localhost:3000',
  'http://localhost:4000'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

function normalizeVehicle(v) {
  if (!v) return { raw: 'Unknown Vehicle', year: '', make: '', model: '' };

  if (typeof v === 'string') {
    const parts = v.trim().split(/s+/);
    return {
      raw: v,
      year: parts[0] || '',
      make: parts[1] || '',
      model: parts.slice(2).join(' ') || ''
    };
  }

  if (typeof v === 'object') {
    const raw = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim();
    return {
      raw,
      year: String(v.year || ''),
      make: String(v.make || ''),
      model: String(v.model || '')
    };
  }

  return { raw: 'Unknown Vehicle', year: '', make: '', model: '' };
}

function analyzeEvidence({ obdCodes = [], customerStates = [], mechanicNotices = [] }) {
  const text = [...obdCodes, ...customerStates, ...mechanicNotices].join(' ').toLowerCase();

  const signals = [
    {
      kw: ['torn cv boot', 'axle clicking', 'cv axle'],
      repair: 'CV Axle Replacement',
      hours: 1.5,
      parts: [{ name: 'CV axle shaft assembly', cost: 125 }]
    },
    {
      kw: ['valve cover leaking', 'oil on exhaust'],
      repair: 'Valve Cover Gasket Replacement',
      hours: 2.0,
      parts: [{ name: 'Valve cover gasket set', cost: 35 }]
    },
    {
      kw: ['wheel bearing noise', 'growling wheel'],
      repair: 'Wheel Bearing Replacement',
      hours: 1.5,
      parts: [{ name: 'Wheel bearing hub assembly', cost: 85 }]
    }
  ];

  for (const sig of signals) {
    if (sig.kw.some(k => text.includes(k))) {
      return { jobType: 'Repair', detected: sig };
    }
  }

  return { jobType: 'Diagnosis', detected: null };
}

function buildPrompt(payload) {
  const vehicle = normalizeVehicle(payload.vehicle);
  const evidence = analyzeEvidence(payload);
  const forcedParts = evidence.detected?.parts || [];
  const forcedHours = evidence.detected?.hours || null;

  return `
You are an ASE-certified mobile mechanic estimator with 20+ years of field experience.
MANDATORY LABOR RATE: $${payload.laborRate || DEFAULT_LABOR_RATE}/hour.

VEHICLE:
- Raw: ${vehicle.raw}
- Year: ${vehicle.year}
- Make: ${vehicle.make}
- Model: ${vehicle.model}

DIAGNOSTIC INPUTS:
- OBD Codes: ${payload.obdCodes.join(', ') || 'None'}
- Customer States: ${payload.customerStates.join('; ') || 'None'}
- Mechanic Findings: ${payload.mechanicNotices.join('; ') || 'None'}

FORCED ENGINE DECISION:
- Job Type: ${evidence.jobType}
- Forced Parts: ${forcedParts.length ? forcedParts.map(p => p.name).join(', ') : 'AI must determine'}
- Forced Hours: ${forcedHours || 'AI must determine'}

Return JSON only with these keys:
{
  "jobType": "Diagnosis" | "Repair",
  "shortDescription": "One sentence summary",
  "laborRate": number,
  "laborHours": number,
  "parts": [{ "name": "string", "cost": number }],
  "shopSuppliesPercent": 7,
  "workSteps": ["step 1", "step 2", "step 3"],
  "warnings": ["warning 1", "warning 2"],
  "notes": ["note 1", "note 2"],
  "tips": ["tip 1", "tip 2"],
  "customerSummary": "Customer-friendly explanation",
  "primaryConcern": "Restated customer concern",
  "diagnosticNotes": "Tech-facing notes",
  "engineMeta": "Internal reasoning summary",
  "disclaimer": "Estimates may change after inspection"
}
`;
}

const DiagnosticSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional().default(''),
    email: z.string().optional().default('')
  }),
  vehicle: z.any(),
  obdCodes: z.array(z.string()).optional().default([]),
  customerStates: z.array(z.string()).optional().default([]),
  mechanicNotices: z.array(z.string()).optional().default([]),
  laborRate: z.number().optional().default(DEFAULT_LABOR_RATE)
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'skskprotech', stripeEnabled: STRIPE_ENABLED });
});

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
      state: 'diagnosed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let saved = jobRecord;
    if (supabase) {
      const { data, error } = await supabase.from('jobs').insert(jobRecord).select().single();
      if (!error && data) saved = data;
    }

    res.json({ success: true, job: saved });
  } catch (err) {
    console.error('[DIAGNOSE FAIL]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/estimate', async (req, res) => {
  try {
    const { jobId, incomingPayload } = req.body;
    let payload = incomingPayload;

    if (jobId && supabase) {
      const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
      if (!error && data) {
        payload = {
          customer: data.customer,
          vehicle: data.vehicle,
          obdCodes: data.obd_codes || [],
          customerStates: data.customer_states || [],
          mechanicNotices: data.mechanic_notices || [],
          laborRate: data.labor_rate || DEFAULT_LABOR_RATE
        };
      }
    }

    const validated = DiagnosticSchema.parse(payload);
    const prompt = buildPrompt(validated);

    if (!GROQ_API_KEY) {
      return res.status(500).json({ success: false, error: 'Missing GROQ_API_KEY' });
    }

    const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Return JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`Groq API error ${aiRes.status}: ${errText}`);
    }

    const raw = await aiRes.json();
    const text = raw.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty AI response');

    const ai = JSON.parse(text);

    const laborHours = Number(ai.laborHours || 0);
    const laborRate = Number(ai.laborRate || validated.laborRate || DEFAULT_LABOR_RATE);
    const laborTotal = Number((laborHours * laborRate).toFixed(2));
    const parts = Array.isArray(ai.parts) ? ai.parts : [];
    const partsTotal = Number(parts.reduce((s, p) => s + Number(p.cost || 0), 0).toFixed(2));
    const shopSupplies = Number((partsTotal * SHOP_SUPPLIES_RATE).toFixed(2));
    const subtotal = Number((laborTotal + partsTotal + shopSupplies).toFixed(2));
    const tax = Number((subtotal * TAX_RATE).toFixed(2));
    const grandTotal = Number((subtotal + tax).toFixed(2));

    const estimate = {
      ...ai,
      laborRate,
      laborHours,
      laborTotal,
      parts,
      partsTotal,
      shopSupplies,
      subtotal,
      tax,
      grandTotal,
      customer: validated.customer,
      vehicle: normalizeVehicle(validated.vehicle)
    };

    if (jobId && supabase) {
      await supabase.from('jobs').update({
        estimate,
        state: 'estimated',
        updated_at: new Date().toISOString()
      }).eq('id', jobId);
    }

    res.json({ success: true, estimate });
  } catch (err) {
    console.error('[ESTIMATE FAIL]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/invoice', async (req, res) => {
  try {
    const { jobId, estimate } = req.body;
    let est = estimate;

    if (!est && jobId && supabase) {
      const { data } = await supabase.from('jobs').select('estimate').eq('id', jobId).single();
      est = data?.estimate;
    }

    if (!est) return res.status(400).json({ success: false, error: 'No estimate found.' });

    const invoice = {
      ...est,
      type: 'invoice',
      timestamp: new Date().toISOString(),
      taxSetaside: Number((est.subtotal * TAX_RATE).toFixed(2)),
      takeHomePay: Number((est.subtotal - (est.subtotal * TAX_RATE)).toFixed(2)),
      balance: 0,
      footer: 'Thank you for choosing SKSK ProTech!'
    };

    if (jobId && supabase) {
      await supabase.from('jobs').update({
        invoice,
        state: 'completed',
        updated_at: new Date().toISOString()
      }).eq('id', jobId);
    }

    res.json({ success: true, invoice });
  } catch (err) {
    console.error('[INVOICE FAIL]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

if (STRIPE_ENABLED) {
  app.post('/api/pay', async (req, res) => {
    try {
      const { amount, payment_method_id } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        payment_method: payment_method_id,
        confirm: true
      });
      res.json({ success: true, paymentIntent });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

app.listen(PORT, () => {
  console.log(`🔥 SKSK ProTech Backend Online — Port ${PORT}`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');

const app = express();

// ========================================
// CORS & MIDDLEWARE
// ========================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));
app.options('*', cors());
app.use(express.json());

// ========================================
// CONFIG & ENVIRONMENT VARIABLES
// ========================================
const PORT = process.env.PORT || 4000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const DEFAULT_LABOR_RATE = Number(process.env.DEFAULT_LABOR_RATE || 65);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;

if (!GROQ_API_KEY) console.warn('⚠️ GROQ_API_KEY missing. AI generation features will fail.');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) console.warn('⚠️ Supabase credentials missing. Persistent database syncing disabled.');

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) 
  : null;

let stripe = null;
if (STRIPE_SECRET_KEY) {
  stripe = require('stripe')(STRIPE_SECRET_KEY);
  console.log('💳 Stripe payment engine online');
}

// ========================================
// DETECTIVE EVIDENCE OVERRIDE ENGINE
// ========================================
function analyzeEvidence({ obdCodes = [], customerStates = [], mechanicNotices = [] }) {
  let confidence = 0;
  let suggestedJobType = "Diagnosis";
  let detectedRepair = null;

  const codesArr = Array.isArray(obdCodes) ? obdCodes : [];
  const statesArr = Array.isArray(customerStates) ? customerStates : [];
  const noticesArr = Array.isArray(mechanicNotices) ? mechanicNotices : [];

  const findingsText = [
    ...codesArr,
    ...statesArr,
    ...noticesArr
  ].join(" ").toLowerCase();

  const repairSignals = [
    { kw: "torn cv boot", repair: "CV axle replacement", hours: 1.5, parts: [{ name: "CV axle shaft assembly", cost: 125 }] },
    { kw: "axle clicking", repair: "CV axle replacement", hours: 1.5, parts: [{ name: "CV axle shaft assembly", cost: 125 }] },
    { kw: "cv axle", repair: "CV axle replacement", hours: 1.5, parts: [{ name: "CV axle shaft assembly", cost: 125 }] },
    { kw: "valve cover leaking", repair: "Valve cover gasket replacement", hours: 2.0, parts: [{ name: "Valve cover gasket set", cost: 35 }] },
    { kw: "oil on exhaust", repair: "Valve cover gasket replacement", hours: 2.0, parts: [{ name: "Valve cover gasket set", cost: 35 }] },
    { kw: "wheel bearing noise", repair: "Wheel bearing replacement", hours: 1.5, parts: [{ name: "Wheel bearing hub assembly", cost: 85 }] }
  ];

  for (const sig of repairSignals) {
    if (findingsText.includes(sig.kw)) {
      confidence += 60;
      detectedRepair = sig;
    }
  }

  if (noticesArr.length > 0) confidence += 20;
  if (codesArr.length > 0) confidence += 10;
  if (statesArr.length > 0) confidence += 5;

  if (confidence >= 60) suggestedJobType = "Repair";

  return { confidence, suggestedJobType, detectedRepair };
}

// ========================================
// AI KNOWLEDGE SYSTEM PROMPT BUILDER
// ========================================
function buildPrompt({ customer, vehicle, obdCodes, customerStates, mechanicNotices, laborRate }) {
  const effectiveRate = laborRate || DEFAULT_LABOR_RATE;
  const codesStr = Array.isArray(obdCodes) && obdCodes.length > 0 ? obdCodes.join(', ') : 'None';
  const statesStr = Array.isArray(customerStates) && customerStates.length > 0 ? customerStates.join('; ') : 'None';
  const noticesStr = Array.isArray(mechanicNotices) && mechanicNotices.length > 0 ? mechanicNotices.join('; ') : 'None';

  const evidence = analyzeEvidence({ obdCodes, customerStates, mechanicNotices });

  const forcedJobType = evidence.suggestedJobType;
  const forcedParts = evidence.detectedRepair ? evidence.detectedRepair.parts : [];
  const forcedHours = evidence.detectedRepair ? evidence.detectedRepair.hours : null;

  const forcedPartsText = forcedParts.length
    ? forcedParts.map(p => `${p.name} (~$${p.cost})`).join(', ')
    : 'AI must map appropriate structural components.';

  const forcedHoursText = forcedHours
    ? `Use exactly ${forcedHours} labor hours for this system replacement profile.`
    : 'Select typical professional mobile mechanic labor tracking values.';

  return `You are an expert mobile mechanic estimator with 20+ years of complex field diagnostic experience.
MANDATORY LABOR RATE: $${effectiveRate}/hour. Never alter this value.

You must integrate three incoming diagnostic parameter streams:
1. OBD-II Trouble Codes (Objective sensor diagnostics)
2. Customer States (Subjective notes - treat with skepticism)
3. Mechanic Findings (High weight physical field data)

AUTOMATED ENGINE SUGGESTION FOR INTERACTION:
- Target Category Selection: "${forcedJobType}"
- Parts Recommendation Profile: ${forcedPartsText}
- Labor Hour Constraints: ${forcedHoursText}

MANUFACTURER SPECIFIC LAYOUT RULES:
- Ford V8 Engines (e.g., 5.4L Triton): Cyl #1 Front Passenger Side. Passenger Side = Bank 1 (Cyl 1-4). Driver Side = Bank 2 (Cyl 5-8). Ensure code matching (P0171 Lean Bank 1 / P0302 Cyl 2) corresponds properly to the physical engine block layout before outputting text.

JSON FORMAT REQUIRED (Strictly structured array, no markdown backticks, no wrapping text):
{
  "jobType": "${forcedJobType}",
  "shortDescription": "One line summary of vehicle condition",
  "laborHours": 1.5,
  "laborRate": ${effectiveRate},
  "workSteps": [
    "Step 1 with diagnostic parameters",
    "Step 2 with technical confirmation specs"
  ],
  "parts": [
    {"name": "Part Name Layout", "cost": 45}
  ],
  "shopSuppliesPercent": 7,
  "timeline": "Same day" | "1-2 hours",
  "notes": "Technical summary profile of matched inputs",
  "tips": ["Pro tips for technician access or field testing"],
  "warnings": [
    "MOST LIKELY (XX%): Structural breakdown details",
    "COMMON (XX%): Alternative condition details"
  ]
}`;
}

// ========================================
// VALIDATION SCHEMAS
// ========================================
const DiagnosticSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional().default(''),
    email: z.string().optional().default('')
  }),
  vehicle: z.string().optional().default('Unknown Vehicle'),
  obdCodes: z.array(z.string()).optional().default([]),
  customerStates: z.array(z.string()).optional().default([]),
  mechanicNotices: z.array(z.string()).optional().default([]),
  laborRate: z.number().optional().default(65)
});

// ========================================
// DATA CONTROL PIPELINE ROUTES
// ========================================

// 1. DIAGNOSE PHASE (Normalize inputs & log baseline transaction)
app.post('/api/diagnose', async (req, res) => {
  try {
    const parsed = DiagnosticSchema.parse(req.body);
    
    const jobRecord = {
      customer: parsed.customer,
      vehicle: parsed.vehicle,
      obd_codes: parsed.obdCodes,
      customer_states: parsed.customerStates,
      mechanic_notices: parsed.mechanicNotices,
      labor_rate: parsed.laborRate,
      state: 'diagnosed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let savedData = jobRecord;
    if (supabase) {
      const { data, error } = await supabase.from('jobs').insert(jobRecord).select().single();
      if (error) throw error;
      savedData = data;
    }

    res.json({ success: true, job: savedData });
  } catch (err) {
    console.error('[DIAGNOSE PIPELINE FAIL]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. ESTIMATE PHASE (Execute AI Evaluation & Calculate Financials)
app.post('/api/estimate', async (req, res) => {
  try {
    const { jobId, incomingPayload } = req.body;
    let targetPayload = incomingPayload;

    // Pull from database historical entry if tracking via explicit Id
    if (jobId && supabase) {
      const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
      if (error || !data) return res.status(404).json({ success: false, error: 'Target workflow record missing' });
      targetPayload = {
        customer: data.customer,
        vehicle: data.vehicle,
        obdCodes: data.obd_codes,
        customerStates: data.customer_states,
        mechanicNotices: data.mechanic_notices,
        laborRate: data.labor_rate
      };
    }

    const validated = DiagnosticSchema.parse(targetPayload);
    const prompt = buildPrompt(validated);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Automotive data output processor. Return valid JSON objects only.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.1
      })
    });

    if (!response.ok) throw new Error(`Groq Gateway Failure Status: ${response.status}`);
    const rawData = await response.json();
    const rawContent = rawData.choices?.[0]?.message?.content;
    
    let cleanText = rawContent.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : cleanText;
    
    const aiEstimate = JSON.parse(cleanJson);

    // Business Logic Engine Calculations
    const finalRate = Number(aiEstimate.laborRate || validated.laborRate);
    const laborHours = parseFloat(aiEstimate.laborHours || 0);
    const laborCost = Number((laborHours * finalRate).toFixed(2));
    
    const partsList = (aiEstimate.parts || []).map(p => ({ name: p.name || 'Component part', cost: Math.round(Number(p.cost || 0)) }));
    const partsCost = partsList.reduce((sum, p) => sum + p.cost, 0);
    
    const supplyPercent = aiEstimate.shopSuppliesPercent ?? 7;
    const shopSupplies = Number((partsCost * (supplyPercent / 100)).toFixed(2));
    const subtotal = Number((laborCost + partsCost + shopSupplies).toFixed(2));
    
    const structuralEstimate = {
      ...aiEstimate,
      laborRate: finalRate,
      laborHours,
      laborCost,
      parts: partsList,
      partsCost,
      shopSuppliesPercent: supplyPercent,
      shopSupplies,
      subtotal,
      grandTotal: subtotal
    };

    let updatedDbRecord = null;
    if (jobId && supabase) {
      const { data, error } = await supabase.from('jobs')
        .update({
          estimate: structuralEstimate,
          state: 'estimated',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId).select().single();
      if (!error) updatedDbRecord = data;
    }

    res.json({ success: true, estimate: structuralEstimate, job: updatedDbRecord });
  } catch (err) {
    console.error('[ESTIMATE PIPELINE FAIL]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. INVOICE PHASE (Lock financial parameters & compile final customer summary)
app.post('/api/invoice', async (req, res) => {
  try {
    const { jobId, estimate } = req.body;
    let invoiceTargetEstimate = estimate;

    if (!invoiceTargetEstimate && jobId && supabase) {
      const { data, error } = await supabase.from('jobs').select('estimate').eq('id', jobId).single();
      if (!error && data) invoiceTargetEstimate = data.estimate;
    }

    if (!invoiceTargetEstimate) return res.status(400).json({ success: false, error: 'No baseline estimate structure located.' });

    const invoicePayload = {
      type: 'invoice',
      timestamp: new Date().toISOString(),
      shortDescription: invoiceTargetEstimate.shortDescription,
      jobType: invoiceTargetEstimate.jobType,
      laborHours: invoiceTargetEstimate.laborHours,
      laborRate: invoiceTargetEstimate.laborRate,
      laborCost: invoiceTargetEstimate.laborCost,
      parts: invoiceTargetEstimate.parts,
      partsCost: invoiceTargetEstimate.partsCost,
      shopSupplies: invoiceTargetEstimate.shopSupplies,
      subtotal: invoiceTargetEstimate.subtotal,
      grandTotal: invoiceTargetEstimate.grandTotal,
      taxSetaside: Number((invoiceTargetEstimate.subtotal * 0.28).toFixed(2)),
      takeHomePay: Number((invoiceTargetEstimate.subtotal * 0.72).toFixed(2)),
      workSteps: invoiceTargetEstimate.workSteps,
      balance: 0,
      footer: 'Thank you for choosing SKSK ProTech!'
    };

    let updatedDbRecord = null;
    if (jobId && supabase) {
      const { data, error } = await supabase.from('jobs')
        .update({
          invoice: invoicePayload,
          state: 'completed',// 2. ESTIMATE PHASE (Execute AI Evaluation & Calculate Financials)
app.post('/api/estimate', async (req, res) => {
  try {
    const { jobId, incomingPayload } = req.body;
    let targetPayload = incomingPayload;

    // Pull from database historical entry if tracking via explicit Id
    if (jobId && supabase) {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error || !data) {
        return res
          .status(404)
          .json({ success: false, error: 'Target workflow record missing' });
      }

      targetPayload = {
        customer: data.customer,
        vehicle: data.vehicle,
        obdCodes: data.obd_codes,
        customerStates: data.customer_states,
        mechanicNotices: data.mechanic_notices,
        laborRate: data.labor_rate
      };
    }

    const validated = DiagnosticSchema.parse(targetPayload);
    const prompt = buildPrompt(validated);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Automotive data output processor. Return valid JSON objects only.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`Groq Gateway Failure Status: ${response.status}`);
    }

    const rawData = await response.json();
    const rawContent = rawData.choices?.[0]?.message?.content || '';

    let cleanText = rawContent
      .trim()
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : cleanText;

    const aiEstimate = JSON.parse(cleanJson);

    // Business Logic Engine Calculations
    const finalRate = Number(aiEstimate.laborRate || validated.laborRate);
    const laborHours = parseFloat(aiEstimate.laborHours || 0);
    const laborCost = Number((laborHours * finalRate).toFixed(2));

    const partsList = (aiEstimate.parts || []).map(p => ({
      name: p.name || 'Component part',
      cost: Math.round(Number(p.cost || 0))
    }));
    const partsCost = partsList.reduce((sum, p) => sum + p.cost, 0);

    const supplyPercent = aiEstimate.shopSuppliesPercent ?? 7;
    const shopSupplies = Number((partsCost * (supplyPercent / 100)).toFixed(2));
    const subtotal = Number((laborCost + partsCost + shopSupplies).toFixed(2));

    const structuralEstimate = {
      ...aiEstimate,
      laborRate: finalRate,
      laborHours,
      laborCost,
      parts: partsList,
      partsCost,
      shopSuppliesPercent: supplyPercent,
      shopSupplies,
      subtotal,
      grandTotal: subtotal
    };

    let updatedDbRecord = null;
    if (jobId && supabase) {
      const { data, error } = await supabase
        .from('jobs')
        .update({
          estimate: structuralEstimate,
          state: 'estimated',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .select()
        .single();

      if (!error) updatedDbRecord = data;
    }

    res.json({ success: true, estimate: structuralEstimate, job: updatedDbRecord });
  } catch (err) {
    console.error('[ESTIMATE PIPELINE FAIL]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. INVOICE PHASE (Lock financial parameters & compile final customer summary)
app.post('/api/invoice', async (req, res) => {
  try {
    const { jobId, estimate } = req.body;
    let invoiceTargetEstimate = estimate;

    if (!invoiceTargetEstimate && jobId && supabase) {
      const { data, error } = await supabase
        .from('jobs')
        .select('estimate')
        .eq('id', jobId)
        .single();

      if (!error && data) invoiceTargetEstimate = data.estimate;
    }

    if (!invoiceTargetEstimate) {
      return res
        .status(400)
        .json({ success: false, error: 'No baseline estimate structure located.' });
    }

    const invoicePayload = {
      type: 'invoice',
      timestamp: new Date().toISOString(),
      shortDescription: invoiceTargetEstimate.shortDescription,
      jobType: invoiceTargetEstimate.jobType,
      laborHours: invoiceTargetEstimate.laborHours,
      laborRate: invoiceTargetEstimate.laborRate,
      laborCost: invoiceTargetEstimate.laborCost,
      parts: invoiceTargetEstimate.parts,
      partsCost: invoiceTargetEstimate.partsCost,
      shopSupplies: invoiceTargetEstimate.shopSupplies,
      subtotal: invoiceTargetEstimate.subtotal,
      grandTotal: invoiceTargetEstimate.grandTotal,
      taxSetaside: Number((invoiceTargetEstimate.subtotal * 0.28).toFixed(2)),
      takeHomePay: Number((invoiceTargetEstimate.subtotal * 0.72).toFixed(2)),
      workSteps: invoiceTargetEstimate.workSteps,
      balance: 0,
      footer: 'Thank you for choosing SKSK ProTech!'
    };

    let updatedDbRecord = null;
    if (jobId && supabase) {
      const { data, error } = await supabase
        .from('jobs')
        .update({
          invoice: invoicePayload,
          state: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .select()
        .single();

      if (!error) updatedDbRecord = data;
    }

    res.json({ success: true, invoice: invoicePayload, job: updatedDbRecord });
  } catch (err) {
    console.error('[INVOICE PIPELINE FAIL]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. STRIPE CHARGE ENGINE
app.post('/api/pay', async (req, res) => {
  try {
    if (!stripe) {
      return res
        .status(400)
        .json({ success: false, error: 'Stripe transaction services offline.' });
    }

    const { amount, payment_method_id } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convert dollars to cents
      currency: 'usd',
      payment_method: payment_method_id,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' }
    });

    res.json({ success: true, paymentIntent });
  } catch (err) {
    console.error('[PAYMENT ENGINE FAIL]', err);
    res.status(500).json({
      success: false,
      error: 'Payment gateway rejected capture',
      details: err.message
    });
  }
});

// ========================================
// START PIPELINE CONTROLLER ENGINE
// ========================================
app.listen(PORT, () => {
  console.log(`🔥 SKSK ProTech Pipeline Controller Engine Online: Port ${PORT}`);
});

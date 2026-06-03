// server.js
// SKSK ProTech – Single-file, production-ready Express + Supabase (+ Stripe-ready)

// -------------------------
// Environment & Dependencies
// -------------------------
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

// -------------------------
// Config
// -------------------------
const app = express();
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;

// Supabase client
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Stripe client (optional)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// -------------------------
// Middleware
// -------------------------
app.use(cors());
app.use(bodyParser.json());

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'SKSK ProTech API' });
});

// -------------------------
// Utility: Diagnostic Normalization
// -------------------------
function normalizeDiagnostic(diagnostic = {}) {
  const codes = Array.isArray(diagnostic.codes)
    ? diagnostic.codes
    : typeof diagnostic.codes === 'string'
      ? diagnostic.codes.split(',').map(c => c.trim()).filter(Boolean)
      : [];

  const symptoms = Array.isArray(diagnostic.symptoms)
    ? diagnostic.symptoms
    : typeof diagnostic.symptoms === 'string'
      ? diagnostic.symptoms.split(',').map(s => s.trim()).filter(Boolean)
      : [];

  return {
    ...diagnostic,
    codes,
    symptoms
  };
}

// -------------------------
// Core: Estimate Builder
// -------------------------
function buildEstimateFromPayload(payload = {}) {
  const {
    customer = {},
    vehicle = {},
    state,
    diagnostic = {},
    mechanic = {}
  } = payload;

  const normalizedDiagnostic = normalizeDiagnostic(diagnostic);
  const { codes } = normalizedDiagnostic;

  const estimate = {
    customer,
    vehicle,
    mechanic,
    state,
    diagnostic: normalizedDiagnostic,
    labor: [],
    parts: [],
    totals: {}
  };

  // Example ABS/ESC logic – customize as needed
  if (codes.includes('C1206')) {
    estimate.labor.push({
      description: 'Diagnose ABS/ESC system (C1206)',
      hours: 1.0,
      rate: 65,
      total: 65
    });
  }

  if (codes.includes('C1233') || codes.includes('C1234')) {
    estimate.labor.push({
      description: 'Inspect wheel speed sensor wiring',
      hours: 1.0,
      rate: 65,
      total: 65
    });
  }

  // You can add more rules here based on codes, symptoms, vehicle, etc.

  const laborTotal = estimate.labor.reduce((sum, l) => sum + (l.total || 0), 0);
  const partsTotal = estimate.parts.reduce((sum, p) => sum + (p.total || 0), 0);
  const subtotal = laborTotal + partsTotal;
  const taxRate = 0.07; // adjust or make configurable
  const tax = subtotal * taxRate;

  estimate.totals = {
    laborTotal,
    partsTotal,
    taxRate,
    tax,
    grandTotal: subtotal + tax
  };

  return estimate;
}

// -------------------------
// Core: Invoice Builder
// -------------------------
function buildInvoiceFromEstimate(estimate = {}) {
  const {
    customer = {},
    vehicle = {},
    mechanic = {},
    diagnostic = {},
    labor = [],
    parts = [],
    totals = {}
  } = estimate;

  return {
    type: 'invoice',
    timestamp: new Date().toISOString(),
    customer,
    vehicle,
    mechanic,
    diagnosticSummary: {
      codes: diagnostic.codes || [],
      symptoms: diagnostic.symptoms || [],
      confirmedIssue: diagnostic.confirmedIssue || 'Issue resolved'
    },
    lineItems: {
      labor,
      parts
    },
    totals: {
      ...totals,
      paid: totals.grandTotal || 0,
      balance: 0
    },
    footer: 'Thank you for choosing SKSK ProTech!'
  };
}

// -------------------------
// Supabase Helpers
// -------------------------
async function saveJobRecord(job) {
  if (!supabase) return { error: 'Supabase not configured', data: null };

  const { data, error } = await supabase
    .from('jobs')
    .insert(job)
    .select()
    .single();

  return { data, error };
}

async function updateJobRecord(id, updates) {
  if (!supabase) return { error: 'Supabase not configured', data: null };

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  return { data, error };
}

async function getJobRecord(id) {
  if (!supabase) return { error: 'Supabase not configured', data: null };

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

// -------------------------
// Routes: Diagnose → Estimate → Invoice
// -------------------------

// POST /api/diagnose
// Accepts raw diagnostic payload, normalizes it, and optionally stores a job record
app.post('/api/diagnose', async (req, res) => {
  try {
    const payload = req.body || {};
    const { customer = {}, vehicle = {}, mechanic = {}, diagnostic = {}, state } = payload;

    const normalizedDiagnostic = normalizeDiagnostic(diagnostic);

    const jobRecord = {
      customer,
      vehicle,
      mechanic,
      diagnostic: normalizedDiagnostic,
      state: state || 'diagnosed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let saved = { data: jobRecord, error: null };
    if (supabase) {
      saved = await saveJobRecord(jobRecord);
      if (saved.error) {
        console.error('Supabase save error:', saved.error);
      }
    }

    res.json({
      success: true,
      job: saved.data || jobRecord
    });
  } catch (err) {
    console.error('Error in /api/diagnose:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/estimate
// Builds an estimate from payload (or existing job) and updates job record
app.post('/api/estimate', async (req, res) => {
  try {
    const payload = req.body || {};
    const { jobId } = payload;

    let basePayload = payload;

    if (jobId && supabase) {
      const { data: job, error } = await getJobRecord(jobId);
      if (error) {
        console.error('Supabase get job error:', error);
      } else if (job) {
        basePayload = {
          ...job,
          diagnostic: job.diagnostic,
          customer: job.customer,
          vehicle: job.vehicle,
          mechanic: job.mechanic,
          state: job.state
        };
      }
    }

    const estimate = buildEstimateFromPayload(basePayload);

    let updatedJob = null;
    if (supabase && jobId) {
      const { data, error } = await updateJobRecord(jobId, {
        estimate,
        state: 'estimated',
        updated_at: new Date().toISOString()
      });
      if (error) {
        console.error('Supabase update job error:', error);
      } else {
        updatedJob = data;
      }
    }

    res.json({
      success: true,
      estimate,
      job: updatedJob
    });
  } catch (err) {
    console.error('Error in /api/estimate:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/invoice
// Converts an estimate into an invoice and updates job record
app.post('/api/invoice', async (req, res) => {
  try {
    const payload = req.body || {};
    const { jobId, estimate: estimateFromClient } = payload;

    let estimate = estimateFromClient;

    if (!estimate && jobId && supabase) {
      const { data: job, error } = await getJobRecord(jobId);
      if (error) {
        console.error('Supabase get job error:', error);
      } else if (job && job.estimate) {
        estimate = job.estimate;
      }
    }

    if (!estimate) {
      return res.status(400).json({ success: false, error: 'No estimate provided or found' });
    }

    const invoice = buildInvoiceFromEstimate(estimate);

    let updatedJob = null;
    if (supabase && jobId) {
      const { data, error } = await updateJobRecord(jobId, {
        invoice,
        state: 'completed',
        updated_at: new Date().toISOString()
      });
      if (error) {
        console.error('Supabase update job error:', error);
      } else {
        updatedJob = data;
      }
    }

    res.json({
      success: true,
      invoice,
      job: updatedJob
    });
  } catch (err) {
    console.error('Error in /api/invoice:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// -------------------------
// Optional: Stripe-ready route (disabled until key is set)
// -------------------------
app.post('/api/pay', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({ success: false, error: 'Stripe not configured' });
    }

    const { amount, currency = 'usd', payment_method_id } = req.body || {};
    if (!amount || !payment_method_id) {
      return res.status(400).json({ success: false, error: 'Missing amount or payment_method_id' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      payment_method: payment_method_id,
      confirm: true
    });

    res.json({ success: true, paymentIntent });
  } catch (err) {
    console.error('Error in /api/pay:', err);
    res.status(500).json({ success: false, error: 'Payment failed', details: err.message });
  }
});

// -------------------------
// Start Server
// -------------------------
app.listen(PORT, () => {
  console.log(`SKSK ProTech API running on port ${PORT}`);
});

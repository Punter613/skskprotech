require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.use(express.static('.')); // serve index.html from root

// In‑memory store for demo; replace with Supabase/DB later
const invoices = new Map();

/**
 * Simple tax map by state (demo only).
 */
const TAX_BY_STATE = {
  OH: 0.0725,
  PA: 0.06,
  MI: 0.06,
  NY: 0.08875,
};

/**
 * Core estimate engine.
 * In production, this is where you'd call Groq / LLM with a structured prompt.
 * Here we simulate deterministic logic so you can wire UI → API → invoice.
 */
function buildEstimateFromPayload(payload) {
  const { customer = {}, vehicle = {}, state, diagnostic = {}, mechanic = {} } = payload;

  const baseLaborRate = 120; // $/hr
  const baseShopSuppliesRate = 0.05; // 5% of labor+parts
  const taxRate = TAX_BY_STATE[state] || 0.07;

  // Very simple heuristic for demo:
  const symptomText = (diagnostic.symptoms || '').toLowerCase();
  const findingsText = (mechanic.findings || '').toLowerCase();
  const codes = diagnostic.codes || [];

  let laborHours = 1.0;
  let partsTotal = 150;

  // Adjust labor/parts based on hints
  if (symptomText.includes('grinding') || findingsText.includes('cv')) {
    laborHours = 2.5;
    partsTotal = 220;
  }
  if (codes.includes('P0301') || codes.includes('P0300')) {
    laborHours += 1.0;
    partsTotal += 80;
  }
  if (symptomText.includes('no start') || symptomText.includes('won\'t start')) {
    laborHours += 1.5;
  }

  const laborTotal = laborHours * baseLaborRate;
  const subtotal = laborTotal + partsTotal;
  const shopSupplies = subtotal * baseShopSuppliesRate;
  const taxable = subtotal + shopSupplies;
  const tax = taxable * taxRate;
  const grandTotal = taxable + tax;

  // Customer‑facing copy
  const customerSummary = [
    `Based on your vehicle's symptoms, diagnostic data, and technician findings, this estimate reflects the expected labor, parts, and shop supplies required to correct the concern.`,
    `If additional issues are discovered during teardown or inspection, we will contact you before performing any extra work.`
  ].join(' ');

  const primaryConcern = diagnostic.symptoms
    ? diagnostic.symptoms
    : 'Primary concern as reported by customer and verified by technician.';

  const disclaimer = 'This is an estimate, not a final invoice. Actual costs may vary after teardown and inspection.';

  // Tech‑facing copy
  const diagnosticNotes = [
    `Customer‑reported symptoms: ${diagnostic.symptoms || 'N/A'}`,
    `OBD‑II codes: ${(codes && codes.length) ? codes.join(', ') : 'None provided'}`,
    `Mechanic findings: ${mechanic.findings || 'N/A'}`,
    '',
    `Engine: heuristic demo engine (replace with LLM pipeline).`,
    `Multi‑repair detection: heuristic based on symptoms + codes.`,
  ].join('\n');

  const engineMeta = `Engine: SKSK ProTech demo · Labor rate: $${baseLaborRate}/hr · Tax: ${(taxRate * 100).toFixed(2)}%`;

  return {
    customer: {
      name: customer.name || '',
      phone: customer.phone || '',
    },
    vehicle: {
      year: vehicle.year || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
    },
    state: state || '',
    estimate: {
      laborHours,
      laborTotal,
      partsTotal,
      shopSupplies,
      tax,
      grandTotal,
    },
    copy: {
      customerSummary,
      primaryConcern,
      disclaimer,
    },
    tech: {
      diagnosticNotes,
      engineMeta,
    },
  };
}

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'sksk-protech-ai-estimator', time: new Date().toISOString() });
});

/**
 * Generate estimate (core pipeline entrypoint)
 * Request JSON:
 * {
 *   customer: { name, phone },
 *   vehicle: { year, make, model },
 *   state: "OH",
 *   diagnostic: { symptoms, codes: [] },
 *   mechanic: { findings }
 * }
 */
app.post('/api/generate-estimate', (req, res) => {
  try {
    const payload = req.body || {};
    const result = buildEstimateFromPayload(payload);

    // Create a simple invoice record
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const invoiceRecord = {
      id,
      createdAt: new Date().toISOString(),
      ...result,
    };
    invoices.set(id, invoiceRecord);

    res.json({
      invoiceId: id,
      ...result,
    });
  } catch (err) {
    console.error('Error in /api/generate-estimate:', err);
    res.status(500).json({ error: 'Failed to generate estimate' });
  }
});

/**
 * Store diagnostic session (stub for now)
 * You can later persist this to Supabase or another DB.
 */
app.post('/api/diagnostic', (req, res) => {
  // For now, just echo back
  res.json({
    status: 'stored',
    payload: req.body || {},
    note: 'Replace with DB persistence (Supabase, Postgres, etc.)',
  });
});

/**
 * Fetch invoice by ID
 */
app.get('/api/invoice/:id', (req, res) => {
  const id = req.params.id;
  const invoice = invoices.get(id);
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  res.json(invoice);
});

// Start server
app.listen(PORT, () => {
  console.log(`SKSK ProTech AI Estimator listening on port ${PORT}`);
});

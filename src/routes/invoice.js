// services/invoiceBuilder.js
// Maps Groq estimate output + parts data into a clean invoice structure

const express = require('express');
const router = express.Router();

function buildInvoice({ estimate, customerInfo, vehicleInfo, laborRate, notes }) {
  const now = new Date();
  const invoiceNumber = `SKSK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 9000) + 1000}`;

  const est = estimate || {};

  // ─── Real shape from /api/estimateHeuristic: repairs is string[], one lump partsCost ───
  const repairStrings = Array.isArray(est.repairs) ? est.repairs : [];
  const hours = Number(est.estimatedHours) || 1;
  const rate = Number(laborRate) || 65;
  const laborTotal = Number(est.laborCost) || (hours * rate);
  const partsTotal = Number(est.partsCost) || 0;

  const laborLines = repairStrings.length
    ? repairStrings.map((desc, i) => ({
        lineNumber: i + 1,
        type: 'LABOR',
        description: desc,
        hours: parseFloat((hours / repairStrings.length).toFixed(2)),
        rate,
        amount: parseFloat((laborTotal / repairStrings.length).toFixed(2))
      }))
    : [{
        lineNumber: 1,
        type: 'LABOR',
        description: est.diagnosis || 'Diagnostic labor',
        hours,
        rate,
        amount: parseFloat(laborTotal.toFixed(2))
      }];

  const partsLines = partsTotal > 0 ? [{
    lineNumber: laborLines.length + 1,
    type: 'PARTS',
    description: 'Parts (see estimate for details)',
    quantity: 1,
    unitPrice: parseFloat(partsTotal.toFixed(2)),
    amount: parseFloat(partsTotal.toFixed(2))
  }] : [];

  const subtotal = laborTotal + partsTotal;
  const taxRate = 0.075; // 7.5% — adjust per state
  const taxAmount = parseFloat((partsTotal * taxRate).toFixed(2)); // Tax on parts only
  const total = parseFloat((subtotal + taxAmount).toFixed(2));

  return {
    invoiceNumber,
    status: 'ESTIMATE',
    createdAt: now.toISOString(),
    dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),

    customer: {
      name: customerInfo?.name || 'Customer',
      phone: customerInfo?.phone || '',
      email: customerInfo?.email || ''
    },

    vehicle: {
      year: vehicleInfo?.year || '',
      make: vehicleInfo?.make || '',
      model: vehicleInfo?.model || '',
      trim: vehicleInfo?.trim || '',
      vin: vehicleInfo?.vin || ''
    },

    diagnosis: {
      primary: est.diagnosis || '',
      priority: (est.priority || 'medium').toUpperCase()
    },

    lineItems: [...laborLines, ...partsLines],

    totals: {
      laborTotal: parseFloat(laborTotal.toFixed(2)),
      partsTotal: parseFloat(partsTotal.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxRate,
      taxAmount,
      total,
      laborHours: hours
    },

    notes: {
      knownIssues: est.knownIssues || [],
      proTips: est.proTips || [],
      extra: notes || ''
    },

    repairProcedure: est.repairSteps || [],

    footer: 'This is an estimate. Final charges may vary based on parts availability and additional findings during repair. Authorization required before work begins.'
  };
}

router.post('/build', (req, res) => {
  try {
    const invoiceData = buildInvoice(req.body || {});
    return res.json(invoiceData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// services/invoiceBuilder.js
// Maps Groq estimate output + parts data into a clean invoice structure

function buildInvoice({ estimateData, partsData, customerInfo, vehicleInfo, laborRate }) {
  const now = new Date();
  const invoiceNumber = `SKSK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 9000) + 1000}`;

  // ─── Pull repair line items ───────────────────────────────────────────────
  const laborLines = (estimateData?.repairs || []).map((repair, i) => ({
    lineNumber: i + 1,
    type: 'LABOR',
    description: repair.title,
    detail: repair.description,
    hours: repair.laborHours || 0,
    rate: laborRate || 65,
    amount: repair.laborCost || ((repair.laborHours || 0) * (laborRate || 65))
  }));

  // ─── Pull parts line items ────────────────────────────────────────────────
  // Prefer live eBay tier prices if available, fall back to estimate
  const partsLines = (estimateData?.parts || []).map((part, i) => {
    // Find matching tier data from partsData if available
    const livePart = partsData?.find(p =>
      p.partType?.toLowerCase().includes(part.name?.toLowerCase()) ||
      part.name?.toLowerCase().includes(p.partType?.toLowerCase())
    );

    const unitPrice = livePart?.tiers?.[1]?.price  // OEM tier price
      || part.estimatedCost?.oem
      || part.estimatedCost?.economy
      || 0;

    return {
      lineNumber: laborLines.length + i + 1,
      type: 'PARTS',
      description: part.name,
      oemPartNumber: part.oemPartNumber || null,
      quantity: part.quantity || 1,
      unitPrice: parseFloat(unitPrice.toFixed(2)),
      amount: parseFloat((unitPrice * (part.quantity || 1)).toFixed(2)),
      source: livePart?.tiers?.[1]?.live ? 'eBay Motors — Live' : 'Estimated',
      link: livePart?.tiers?.[1]?.link || null
    };
  });

  // ─── Calculate totals ─────────────────────────────────────────────────────
  const laborTotal = laborLines.reduce((sum, l) => sum + l.amount, 0);
  const partsTotal = partsLines.reduce((sum, p) => sum + p.amount, 0);
  const subtotal = laborTotal + partsTotal;
  const taxRate = 0.075; // 7.5% — adjust per state
  const taxAmount = parseFloat((partsTotal * taxRate).toFixed(2)); // Tax on parts only
  const total = parseFloat((subtotal + taxAmount).toFixed(2));

  // ─── Build final invoice ──────────────────────────────────────────────────
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
      primary: estimateData?.diagnosis?.primary || '',
      priority: estimateData?.diagnosis?.priority || 'MEDIUM',
      probability: estimateData?.diagnosis?.probability || 0
    },

    lineItems: [...laborLines, ...partsLines],

    totals: {
      laborTotal: parseFloat(laborTotal.toFixed(2)),
      partsTotal: parseFloat(partsTotal.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxRate,
      taxAmount,
      total,
      laborHours: estimateData?.totals?.laborHours || 0
    },

    notes: {
      knownIssues: estimateData?.knownIssues || [],
      whileYoureInThere: estimateData?.whileYoureInThere || [],
      proTips: estimateData?.proTips || []
    },

    repairProcedure: estimateData?.repairProcedure || [],

    footer: 'This is an estimate. Final charges may vary based on parts availability and additional findings during repair. Authorization required before work begins.'
  };
}

module.exports = { buildInvoice };

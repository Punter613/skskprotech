// services/invoiceBuilder.js
// SKSK ProTech - Hardened Invoice Engine (v1)

function buildInvoice({
  estimateData = {},
  partsData = [],
  customerInfo = {},
  vehicleInfo = {},
  laborRate = 65
}) {
  const now = new Date();

  const invoiceNumber =
    `SKSK-${now.getTime()}-${Math.floor(Math.random() * 100000)}`;

  // ─────────────────────────────────────────────
  // SAFE DEFAULTS (prevents AI/API crashes)
  // ─────────────────────────────────────────────
  estimateData.parts = estimateData.parts || [];
  estimateData.repairs = estimateData.repairs || [];

  // ─────────────────────────────────────────────
  // LABOR LINES
  // ─────────────────────────────────────────────
  const laborLines = estimateData.repairs.map((repair, i) => {
    const hours = repair.laborHours || 0;
    const rate = laborRate;

    return {
      lineNumber: i + 1,
      type: "LABOR",
      description: repair.title || "Repair Work",
      detail: repair.description || "",
      hours,
      rate,
      amount: repair.laborCost ?? parseFloat((hours * rate).toFixed(2))
    };
  });

  // ─────────────────────────────────────────────
  // PARTS LINES
  // ─────────────────────────────────────────────
  const partsLines = estimateData.parts.map((part, i) => {
    const match = partsData.find(p => {
      const a = (p.partType || "").toLowerCase();
      const b = (part.name || "").toLowerCase();
      return a.includes(b) || b.includes(a);
    });

    const oemTier = match?.tiers?.find(t => t.tier === "OEM");

    const unitPrice =
      oemTier?.price ??
      part.estimatedCost?.oem ??
      part.estimatedCost?.economy ??
      0;

    const safePrice = Number(unitPrice || 0);
    const qty = part.quantity || 1;

    return {
      lineNumber: laborLines.length + i + 1,
      type: "PARTS",
      description: part.name || "Part",
      oemPartNumber: part.oemPartNumber || null,
      quantity: qty,
      unitPrice: parseFloat(safePrice.toFixed(2)),
      amount: parseFloat((safePrice * qty).toFixed(2)),
      source: match ? "Live Data" : "Estimated",
      link: oemTier?.link || null
    };
  });

  // ─────────────────────────────────────────────
  // TOTALS
  // ─────────────────────────────────────────────
  const laborTotal = laborLines.reduce((s, l) => s + l.amount, 0);
  const partsTotal = partsLines.reduce((s, p) => s + p.amount, 0);

  const subtotal = laborTotal + partsTotal;

  const taxRate = 0.075;
  const taxableAmount = partsTotal;

  const taxAmount = parseFloat((taxableAmount * taxRate).toFixed(2));
  const total = parseFloat((subtotal + taxAmount).toFixed(2));

  // ─────────────────────────────────────────────
  // FINAL INVOICE
  // ─────────────────────────────────────────────
  return {
    invoiceNumber,
    status: "ESTIMATE",
    createdAt: now.toISOString(),
    dueDate: new Date(now.getTime() + 30 * 86400000).toISOString(),

    customer: {
      name: customerInfo.name || "Customer",
      phone: customerInfo.phone || "",
      email: customerInfo.email || ""
    },

    vehicle: {
      year: vehicleInfo.year || "",
      make: vehicleInfo.make || "",
      model: vehicleInfo.model || "",
      trim: vehicleInfo.trim || "",
      vin: vehicleInfo.vin || ""
    },

    diagnosis: {
      primary: estimateData?.diagnosis?.primary || "",
      priority: estimateData?.diagnosis?.priority || "MEDIUM",
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

    footer:
      "This is an estimate. Final cost may change based on inspection, labor, or parts availability."
  };
}

module.exports = { buildInvoice };
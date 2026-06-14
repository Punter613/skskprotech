const router = require('express').Router();
const { generateInvoicePdf } = require('../services/pdf');

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const invoiceId = b.invoiceNumber ? `INV-${b.invoiceNumber}` : `INV-${Date.now()}`;

    const data = {
      invoiceId,
      customer: b.customer || {},
      vin: b.vin || '',
      vehicle: b.vehicle || {},
      total: Number(b.total || 0),
      notes: b.notes || '',
      details: b.details || {}
    };

    // Optional Supabase save
    try {
      const db = require('../services/db');
      if (db) {
        await db.from('invoices').insert({ invoice_id: invoiceId, data });
      }
    } catch(e) { /* db optional */ }

    const file = await generateInvoicePdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceId}.pdf"`);
    res.send(file);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

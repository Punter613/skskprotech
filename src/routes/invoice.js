const router = require('express').Router();
const db = require('../services/db');
const { decodeVin } = require('../services/vin');
const { generateInvoicePdf } = require('../services/pdf');

router.post('/', async (req, res, next) => {
  try {
    const invoiceId = `INV-${Date.now()}`;
    const body = req.body || {};
    const vinDecoded = await decodeVin(body.vin);

    const data = {
      invoiceId,
      customer: body.customer || {},
      vin: body.vin || '',
      vinDecoded,
      vehicle: body.vehicle || {},
      total: Number(body.total || 0),
      details: body.details || body
    };

    await db.from('invoices').insert({
      invoice_id: invoiceId,
      data
    });

    const file = await generateInvoicePdf(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceId}.pdf"`);
    res.send(file);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

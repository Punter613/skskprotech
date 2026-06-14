#!/data/data/com.termux/files/usr/bin/bash
set -e

cat > src/services/db.js <<'JS'
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = url && key ? createClient(url, key) : null;

module.exports = supabase;
JS

cat > src/routes/diagnose.js <<'JS'
const router = require('express').Router();
const db = require('../services/db');
const { decodeVin } = require('../services/vin');

router.post('/', async (req, res, next) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const input = req.body || {};
    const vinDecoded = await decodeVin(input.vin);

    const result = {
      jobType: 'Diagnosis',
      vin: input.vin || '',
      vinDecoded,
      notes: input.notes || [],
      codes: input.codes || [],
      symptoms: input.symptoms || []
    };

    await db.from('diagnostics').insert({
      input,
      result
    });

    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
JS

cat > src/routes/estimate.js <<'JS'
const router = require('express').Router();
const db = require('../services/db');
const { decodeVin } = require('../services/vin');

router.post('/', async (req, res, next) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const incoming = req.body || {};
    const vinDecoded = await decodeVin(incoming.vin);

    const estimate = {
      labor: Number(incoming.labor || 100),
      parts: Number(incoming.parts || 50),
      total: Number(incoming.labor || 100) + Number(incoming.parts || 50),
      vin: incoming.vin || '',
      vinDecoded
    };

    await db.from('estimates').insert({
      total: estimate.total,
      details: estimate
    });

    res.json({ success: true, estimate });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
JS

cat > src/routes/invoice.js <<'JS'
const router = require('express').Router();
const db = require('../services/db');
const { decodeVin } = require('../services/vin');
const { generateInvoicePdf } = require('../services/pdf');

router.post('/', async (req, res, next) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

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
JS

git add -A
git commit -m "Remove perl dependency from Supabase fix"
git push

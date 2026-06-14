#!/data/data/com.termux/files/usr/bin/bash
set -e

mkdir -p src/routes src/services

cat > src/services/db.js <<'JS'
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

module.exports = supabase;
JS

cat > src/services/vin.js <<'JS'
function decodeVinBasic(vin) {
  if (!vin || typeof vin !== 'string') return null;
  const clean = vin.trim().toUpperCase();
  if (clean.length !== 17) return null;

  return {
    vin: clean,
    year: '',
    make: '',
    model: '',
    trim: '',
    source: 'basic-stub'
  };
}

async function decodeVin(vin) {
  return decodeVinBasic(vin);
}

module.exports = { decodeVinBasic, decodeVin };
JS

cat > src/services/pdf.js <<'JS'
const PDFDocument = require('pdfkit');

function generateInvoicePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('SKSK PROTECH INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Invoice ID: ${data.invoiceId || 'N/A'}`);
    doc.text(`Customer: ${data.customer?.name || data.customer || 'N/A'}`);
    doc.text(`Phone: ${data.customer?.phone || 'N/A'}`);
    doc.text(`Email: ${data.customer?.email || 'N/A'}`);
    doc.text(`VIN: ${data.vin || 'N/A'}`);
    doc.text(`Decoded Year: ${data.vinDecoded?.year || data.vehicle?.year || 'N/A'}`);
    doc.text(`Decoded Make: ${data.vinDecoded?.make || data.vehicle?.make || 'N/A'}`);
    doc.text(`Decoded Model: ${data.vinDecoded?.model || data.vehicle?.model || 'N/A'}`);
    doc.text(`Total: $${Number(data.total || 0).toFixed(2)}`);
    doc.moveDown();
    doc.text('Details:');
    doc.fontSize(10).text(JSON.stringify(data.details || {}, null, 2));
    doc.end();
  });
}

module.exports = { generateInvoicePdf };
JS

cat > src/routes/diagnose.js <<'JS'
const router = require('express').Router();
const db = require('../services/db');
const { decodeVin } = require('../services/vin');

router.post('/', async (req, res, next) => {
  try {
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

cat > src/routes/payments.js <<'JS'
const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/charge', async (req, res, next) => {
  try {
    const { amount } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount || 0) * 100),
      currency: 'usd'
    });

    res.json({ success: true, clientSecret: paymentIntent.client_secret });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
JS

cat > server.js <<'JS'
const express = require('express');
const path = require('path');

const diagnose = require('./src/routes/diagnose');
const estimate = require('./src/routes/estimate');
const invoice = require('./src/routes/invoice');
const payments = require('./src/routes/payments');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/diagnose', diagnose);
app.use('/api/estimate', estimate);
app.use('/api/invoice', invoice);
app.use('/api/payments', payments);

app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: err.message || 'Server error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on ${port}`));
JS

cat > index.html <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="theme-color" content="#0f172a" />
  <link rel="manifest" href="/manifest.json">
  <title>SKSK ProTech</title>
</head>
<body>
  <div id="app">
    <h1>SKSK ProTech</h1>
    <p>Mobile Mechanic AI</p>
    <button id="btnEstimate">Estimate</button>
    <button id="btnDiagnose">Diagnose</button>
    <button id="btnInvoice">Invoice PDF</button>
    <button id="btnShare">Share</button>
  </div>

  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
    }
  </script>
</body>
</html>
HTML

cat > sw.js <<'JS'
const VERSION = 'v1.0.0';
const CACHE = `sksk-${VERSION}`;
const ASSETS = ['/', '/index.html', '/manifest.json', '/server.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return resp;
    }).catch(() => caches.match('/index.html')))
  );
});
JS

git add -A
git commit -m "Update app files and routes"
git push

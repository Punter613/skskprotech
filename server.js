const { buildSystemPrompt, buildUserMessage } = require('./services/groqPrompt');
const { lookupParts } = require('./services/partsLookup');
const { buildInvoice } = require('./services/invoiceBuilder');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const path = require('path');
const cors = require('cors');

const diagnose = require('./src/routes/diagnose');
const estimateHeuristic = require('./src/routes/estimate');
const invoice = require('./src/routes/invoice');
const oemRouter = require('./src/routes/oem');
const authenticateHeuristic = require('./src/middleware/authenticateHeuristic');
const { startKeepAwakeLoop } = require('./src/services/db_keepawake');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/api/payments', require('./src/routes/webhooks'));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/scrape', require('./src/routes/scrape'));
app.use('/api/parts', require('./src/routes/parts'));
app.use('/api/full-estimate', require('./src/routes/full-estimate'));
app.use('/api/buyer', require('./src/routes/buyer'));
app.use('/api/jobs', require('./src/routes/jobs'));
app.use('/api/diagnose', diagnose);
app.use('/api/estimateHeuristic', authenticateHeuristic, estimateHeuristic);
app.use('/api/invoice', invoice);
app.use('/api/translate', require('./src/routes/translate'));
app.use('/api/parts-lookup', require('./src/routes/partsLookup'));
app.use('/api/fleet', require('./src/routes/fleet'));
app.use(oemRouter);

if (process.env.STRIPE_SECRET_KEY) {
  try {
    app.use('/api/payments', require('./src/routes/payments'));
    console.log('[Payments] Stripe payments loaded');
  } catch (err) {
    console.warn('[Payments] Failed to load:', err.message);
  }
} else {
  console.log('[Payments] STRIPE_SECRET_KEY not set - payments disabled');
  app.use('/api/payments', (req, res) => {
    res.status(503).json({ success: false, error: 'Payments not configured' });
  });
}

app.use('/fleet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'fleet.html'));
});

app.use(express.static(path.join(__dirname)));

app.get('/health', async (req, res) => {
  const health = { ok: true, timestamp: new Date().toISOString() };
  try {
    const db = require('./src/db');
    health.db = db.supabase ? 'connected' : 'not configured';
  } catch {
    health.db = 'error';
  }
  health.stripe = process.env.STRIPE_SECRET_KEY ? 'configured' : 'not configured';
  health.groq = process.env.GROQ_API_KEY ? 'configured' : 'not configured';
  res.json(health);
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('[Error]', err.stack || err.message || err);
  const isDev = process.env.NODE_ENV === 'development';
  const message = isDev
    ? (err.message || 'Server error')
    : (err.statusCode ? err.message : 'Internal server error');

  res.status(err.statusCode || 500).json({
    success: false,
    error: message,
    ...(isDev && { stack: err.stack })
  });
});

startKeepAwakeLoop();

require('./src/workers/aiWorker');
console.log('🤖 Background AI Worker summoned to the shop floor. Listening for jobs...');

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`[Server] SKSK ProTech running on port ${port}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Health check: http://localhost:${port}/health`);
});

const gracefulShutdown = () => {
  console.log('[Server] Graceful shutdown triggered, draining connections...');
  server.close(() => {
    console.log('[Server] Process clean terminate complete.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

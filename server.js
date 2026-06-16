require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');

const diagnose = require('./src/routes/diagnose');
const estimate = require('./src/routes/estimate');
const invoice = require('./src/routes/invoice');
const oemRouter = require('./src/routes/oem');
const { startKeepAwakeLoop } = require('./src/services/db_keepawake');

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

function asyncHandler(fn) {
  return (req, res, next) => {
    const timeoutMs = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 30000;
    const timer = setTimeout(() => {
      res.status(504).json({ success: false, error: 'Request timeout' });
    }, timeoutMs);

    Promise.resolve(fn(req, res, next))
      .finally(() => clearTimeout(timer))
      .catch(next);
  };
}

app.use('/api/diagnose', diagnose);
app.use('/api/estimate', estimate);
app.use('/api/invoice', invoice);
app.use('/api/translate', require('./src/routes/translate'));
app.use(oemRouter);

if (process.env.STRIPE_SECRET_KEY) {
  try {
    const payments = require('./src/routes/payments');
    app.use('/api/payments', payments);
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

express.static(path.join(__dirname));
app.use(express.static(path.join(__dirname)));

app.get('/health', async (req, res) => {
  const health = { ok: true, timestamp: new Date().toISOString() };
  try {
    const db = require('./src/services/db');
    health.db = db ? 'connected' : 'not configured';
  } catch {
    health.db = 'error';
  }
  health.stripe = process.env.STRIPE_SECRET_KEY ? 'configured' : 'not configured';
  health.groq = process.env.GROQ_API_KEY ? 'configured' : 'not configured';
  res.json(health);
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

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

startKeepAwakeLoop();

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`[Server] SKSK ProTech running on port ${port}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Health check: http://localhost:${port}/health`);
});

process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully');
  server.close(() => process.exit(0));
});

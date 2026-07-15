require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');

const { startKeepAwakeLoop } = require('./src/services/db_keepawake');

const app = express();

// ─── MIDDLEWARE ───
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
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

// ─── MODULAR INTELLIGENCE ROUTES (New Architecture) ───
app.use('/api/intelligence', require('./src/routes/intelligence.routes'));
app.use('/api/full-estimate', require('./src/routes/full-estimate'));
app.use('/api/fleet', require('./src/routes/fleet'));
app.use('/api/buyer', require('./src/routes/buyer'));

// ─── LEGACY COMPATIBILITY ROUTES (Refactored to use new Core) ───
app.use('/api/estimateHeuristic', require('./src/routes/estimate'));
app.use('/api/diagnose', require('./src/routes/diagnose'));

// ─── SUPPORTING INFRASTRUCTURE ───
app.use('/api/scrape', require('./src/routes/scrape'));
app.use('/api/parts-lookup', require('./src/routes/partsLookup'));
app.use('/api/invoice', require('./src/routes/invoice'));
app.use('/api/translate', require('./src/routes/translate'));

// 🚨 STRIPE & PAYMENTS
const webhookRouter = require('./src/routes/webhooks');
app.use('/api/payments', webhookRouter);

if (process.env.STRIPE_SECRET_KEY) {
  try {
    app.use('/api/payments', require('./src/routes/payments'));
    console.log('[Payments] Stripe payments loaded');
  } catch (err) {
    console.warn('[Payments] Failed to load:', err.message);
  }
}

// ─── STATIC ASSETS ───
app.use(express.static(path.join(__dirname)));
app.use('/fleet', express.static(path.join(__dirname, 'public/fleet.html')));

// ─── SYSTEM ENDPOINTS ───
app.get('/health', async (req, res) => {
  const health = {
    ok: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  };
  try {
    const db = require('./src/db');
    health.db = db.supabase ? 'connected' : 'not configured';
  } catch {
    health.db = 'error';
  }
  health.groq = process.env.GROQ_API_KEY ? 'configured' : 'not configured';
  res.json(health);
});

// ─── ERROR HANDLING ───
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack || err.message || err);
  const isDev = process.env.NODE_ENV === 'development';
  res.status(err.statusCode || 500).json({
    success: false,
    error: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack })
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// ─── INITIALIZATION ───
startKeepAwakeLoop();
require('./src/workers/aiWorker');
console.log('🤖 Background AI Worker active.');

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`[Server] SKSK Rebuilt Platform running on port ${port}`);
});

const gracefulShutdown = () => {
  server.close(() => {
    console.log('[Server] Clean terminate complete.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');

// Service Initializations
const { startKeepAwakeLoop } = require('./src/services/db_keepawake');

const app = express();

// 1. GLOBAL CORS & SECURITY CONFIGURATION
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

// 2. 🚨 STRIPE WEBHOOK EVENT PROCESSING CORE (CRITICAL PLACEMENT)
// This must be placed BEFORE global body parsers to preserve the raw request stream
const webhookRouter = require('./src/routes/webhooks');
app.use('/api/webhooks', webhookRouter); 

// 3. GLOBAL BODY PARSERS (For all other standard routes)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 4. ROUTE INFRASTRUCTURE & DEPENDENCIES
const diagnose = require('./src/routes/diagnose');
const estimateHeuristic = require('./src/routes/estimate'); 
const invoice = require('./src/routes/invoice');
const oemRouter = require('./src/routes/oem');
const scrapeRouter = require('./src/routes/scrape');
const partsRouter = require('./src/routes/parts');
const fullEstimateRouter = require('./src/routes/full-estimate');
const jobsRouter = require('./src/routes/jobs');
const partsLookupRouter = require('./src/routes/partsLookup');
const fleetRouter = require('./src/routes/fleet');
const verifyToken = require('./src/middleware/auth');

// Production Spec Routing Lanes
app.use('/api/diagnose', diagnose);
app.use('/api/estimateHeuristic', verifyToken, estimateHeuristic);
app.use('/api/invoice', invoice);
app.use('/api/scrape', scrapeRouter);
app.use('/api/parts', partsRouter);
app.use('/api/full-estimate', fullEstimateRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/translate', require('./src/routes/translate'));
app.use('/api/parts-lookup', partsLookupRouter);
app.use('/api/fleet', fleetRouter);
app.use(oemRouter);

// 5. DYNAMIC PAYMENTS GATEWAY CONFIGURATION
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

// 6. STATIC ASSETS & SITE INFRASTRUCTURE
app.use(express.static(path.join(__dirname)));
app.use('/fleet', express.static(path.join(__dirname, 'public/fleet.html')));

// 7. SYSTEM HEALTH CHECK
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

// 8. CATCH-ALL 404 ROUTE (MUST BE PLACED AFTER ALL VALID ROUTE DEFINITIONS)
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// 9. CENTRALIZED ERROR HANDLING MIDDLEWARE
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

// 10. BACKGROUND WORKERS & PROCESS LIFECYCLE MANAGEMENT
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

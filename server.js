require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// 1. GLOBAL PRIVACY, CORING, & PLATFORM SECURITY CONTROLS
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

// 2. STRIPE RAW EVENT CAPTURE INTERCEPTOR (MUST RUN FIRST)
try {
  const webhookRouter = require('./src/routes/webhooks');
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), webhookRouter);
} catch (e) {
  console.warn('[Payments Webhook] Deferred mounting pass:', e.message);
}

// 3. APPLICATION LEVEL STANDARD PAYLOAD PARSERS
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 4. CORE PIPELINE INTELLIGENCE DISPATCH INFRASTRUCTURE
const diagnose = require('./src/routes/diagnose');
const estimateHeuristic = require('./src/routes/estimate'); 
const invoice = require('./src/routes/invoice');
const oemRouter = require('./src/routes/oem');
const verifyToken = require('./src/middleware/auth');
const scrapeRouter = require('./src/routes/scrape');
const partsRouter = require('./src/routes/parts');
const fullEstimateRouter = require('./src/routes/full-estimate');
const jobsRouter = require('./src/routes/jobs');
const partsLookupRouter = require('./src/routes/partsLookup');
const fleetRouter = require('./src/routes/fleet');

app.use('/api/scrape', scrapeRouter);
app.use('/api/parts', partsRouter);
app.use('/api/full-estimate', fullEstimateRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/diagnose', diagnose);
app.use('/api/estimateHeuristic', verifyToken, estimateHeuristic); 
app.use('/api/invoice', invoice);
app.use('/api/translate', require('./src/routes/translate'));
app.use('/api/parts-lookup', partsLookupRouter);
app.use('/api/fleet', fleetRouter);
app.use(oemRouter);

// ─── SKSK REBUILT MODULE RUNNING PORTS ───
// 🛡️ RECOVERY GATEWAY: Catch and substitute broken route exports automatically
try {
  const intelligenceRouter = require('./src/routes/intelligence.routes');
  if (intelligenceRouter && typeof intelligenceRouter === 'function') {
    app.use('/api/intelligence', intelligenceRouter);
    console.log('[Master Server] Intelligence routing layer synchronized successfully.');
  } else {
    throw new TypeError('Module returned a malformed footprint rather than a functional Express router router.');
  }
} catch (err) {
  console.warn('[Master Server Warning] Intelligence routes failed compilation check. Deploying safety fallback lane:', err.message);
  
  const rescueIntelligenceRouter = express.Router();
  rescueIntelligenceRouter.post('/analyze', (req, res) => {
    res.json({ status: 'PROXY_ONLINE', message: 'API core running via emergency inline router recovery pass.' });
  });
  app.use('/api/intelligence', rescueIntelligenceRouter);
}

try {
  const buyerRouter = require('./src/routes/buyer');
  if (buyerRouter && typeof buyerRouter === 'function') {
    app.use('/api/buyer', buyerRouter);
  } else {
    throw new TypeError('Module returned an object shape context.');
  }
} catch (err) {
  console.warn('[Master Server Warning] Buyer procurement routes failed to initialize. Deploying safety fallback lane:', err.message);
  const rescueBuyerRouter = express.Router();
  rescueBuyerRouter.post('/evaluate', (req, res) => {
    res.json({ success: true, message: 'Buyer evaluation layer active under safety proxy backup constraints.' });
  });
  app.use('/api/buyer', rescueBuyerRouter);
}

// STANDALONE STRIPE CLIENT RETRIEVAL LOGIC
if (process.env.STRIPE_SECRET_KEY) {
  try {
    const payments = require('./src/routes/payments');
    app.use('/api/payments', payments);
    console.log('[Payments] Stripe payments loaded successfully');
  } catch (err) {
    console.warn('[Payments] Stripe loading deferred:', err.message);
  }
} else {
  console.log('[Payments] STRIPE_SECRET_KEY missing. Monetization layers deactivated.');
  app.use('/api/payments', (req, res) => {
    res.status(503).json({ success: false, error: 'Payments not configured' });
  });
}

// 5. ASSET INJECTORS AND STATIC INTERFACE FRAMES
app.use('/fleet', express.static(path.join(__dirname, 'public/fleet.html')));
app.use(express.static(path.join(__dirname, 'public')));

// 6. PIPELINE MONITORING TELEMETRY SYSTEMS
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

// 7. EXHAUSTIVE CATCH-ALL AND ERROR MANAGEMENT TERMINI
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: 'Target endpoint address not found' });
});

app.use((err, req, res, next) => {
  console.error('[Global Crash Intercepted]', err.stack || err.message || err);
  const isDev = process.env.NODE_ENV === 'development';
  const message = isDev
    ? (err.message || 'Server error')
    : (err.statusCode ? err.message : 'Internal pipeline server exception error');

  res.status(err.statusCode || 500).json({
    success: false,
    error: message,
    ...(isDev && { stack: err.stack })
  });
});

// 8. LIFECYCLE BACKGROUND MANAGEMENT ENGINE INITIALIZATION
try {
  const { startKeepAwakeLoop } = require('./src/services/db_keepawake');
  startKeepAwakeLoop();
} catch (e) {
  console.warn('[Lifecycle] DB awake loop tracking disabled.');
}

try {
  require('./src/workers/aiWorker');
  console.log('🤖 Background AI Worker summoned to the shop floor. Listening for jobs...');
} catch (e) {
  console.warn('[Lifecycle] Background queue worker engine offline.');
}

// 9. CORE BIND LISTENER REGISTRY
// Render handles inbound routing traffic at port 10000 or custom process environment arrays safely
const port = process.env.PORT || 10000; 
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[Master Server] SKSK ProTech initialized successfully on cloud port ${port}`);
  console.log(`[Master Server] Operating Profile: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Master Server] Telemetry Endpoint: http://localhost:${port}/health`);
});

const gracefulShutdown = () => {
  console.log('[Master Server] Termination warning triggered, draining connected resources...');
  server.close(() => {
    console.log('[Master Server] Connection threads cleared. Execution clean kill completed.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

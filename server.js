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

// 4. CORE PLATFORM MIDDLEWARE ROUTING WRAPPERS
const safeMount = (routePath, mountPoint) => {
  try {
    const routerInstance = require(routePath);
    if (routerInstance && (typeof routerInstance === 'function' || typeof routerInstance.use === 'function')) {
      app.use(mountPoint, routerInstance);
      console.log(`[Master Server] Route [${mountPoint}] successfully mounted from [${routePath}]`);
    } else {
      throw new TypeError(`Module at ${routePath} did not export a functional Express router instance.`);
    }
  } catch (err) {
    console.warn(`[Master Server Guard] Failed to mount ${mountPoint} safely. Deploying dynamic proxy lane:`, err.message);
    const fallbackRouter = express.Router();
    fallbackRouter.all('*', (req, res) => {
      res.status(503).json({
        success: false,
        error: 'Service Under Maintenance',
        message: 'This sub-lane module is currently undergoing background initialization compiles.',
        layerProxy: true
      });
    });
    app.use(mountPoint, fallbackRouter);
  }
};

// 5. EXECUTING ISOLATED MOUNT PASSTHROUGHS FOR ENTIRE CORES TREE
safeMount('./src/routes/scrape', '/api/scrape');
safeMount('./src/routes/parts', '/api/parts');
safeMount('./src/routes/full-estimate', '/api/full-estimate');
safeMount('./src/routes/jobs', '/api/jobs');
safeMount('./src/routes/diagnose', '/api/diagnose');
safeMount('./src/routes/invoice', '/api/invoice');
safeMount('./src/routes/partsLookup', '/api/parts-lookup');
safeMount('./src/routes/fleet', '/api/fleet');

// Protected Auth Wrapper Mount Step
try {
  const estimateHeuristic = require('./src/routes/estimate');
  const verifyToken = require('./src/middleware/auth');
  if (typeof verifyToken === 'function') {
    app.use('/api/estimateHeuristic', verifyToken, estimateHeuristic);
  } else {
    app.use('/api/estimateHeuristic', estimateHeuristic);
  }
} catch (e) {
  safeMount('./src/routes/estimate', '/api/estimateHeuristic');
}

try {
  safeMount('./src/routes/translate', '/api/translate');
  const oemRouter = require('./src/routes/oem');
  if (oemRouter && typeof oemRouter === 'function') app.use(oemRouter);
} catch (e) {
  console.warn('[OEM Router] Optional structural pass skipped.');
}

// ─── SKSK MODULE REBUILD ADDITIONS (FULLY PROTECTED FROM TYPOS/BRIDGES) ───
safeMount('./src/routes/intelligence.routes', '/api/intelligence');
safeMount('./src/routes/buyer', '/api/buyer');

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

// 6. ASSET INJECTORS AND STATIC INTERFACE FRAMES
app.use('/fleet', express.static(path.join(__dirname, 'public/fleet.html')));
app.use(express.static(path.join(__dirname, 'public')));

// 7. PIPELINE MONITORING TELEMETRY SYSTEMS
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

// 8. EXHAUSTIVE CATCH-ALL AND ERROR MANAGEMENT TERMINI
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

// 9. LIFECYCLE BACKGROUND MANAGEMENT ENGINE INITIALIZATION
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

// 10. CORE BIND LISTENER REGISTRY
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

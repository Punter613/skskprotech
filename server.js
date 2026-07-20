require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();

// 1. GLOBAL PRIVACY, CORING, & PLATFORM SECURITY CONTROLS

// Build a flexible allowed origin list: core defaults + env overrides
const baseAllowedOrigins = [
  'https://pages.dev',
  'http://localhost:3000',
  'http://localhost:10000',
  'https://p613-backend.onrender.com', // Render frontend / diagnostic terminal
];

if (process.env.CORS_ORIGIN) {
  // Allow comma-separated additional origins from env
  const extra = process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean);
  baseAllowedOrigins.push(...extra);
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin / non-browser requests (like curl, internal calls)
    if (!origin) return callback(null, true);
    if (baseAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} not allowed by SKSK CORS policy`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-ID',
    'X-Target-VIN',
    'Accept'
  ],
  credentials: true,
  exposedHeaders: ['X-Tenant-ID', 'X-Target-VIN']
}));

// Handle preflight OPTIONS requests across all routes explicitly
app.options('*', cors());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// 2. STRIPE RAW EVENT CAPTURE INTERCEPTOR (MUST RUN FIRST)
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  try {
    const webhookRouter = require('./src/routes/webhooks');
    return webhookRouter(req, res, next);
  } catch (e) {
    console.warn('[Payments Webhook Proxy] Layer deferred:', e.message);
    return res.status(503).json({ success: false, error: 'Webhooks temporarily unavailable' });
  }
});

// 3. APPLICATION LEVEL STANDARD PAYLOAD PARSERS
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 4. BULLETPROOF LAZY-LOADING ROUTE INTERCEPTOR UTILITY
// FIXED: Completely prevents compile-time or syntax-time sub-file bugs from crashing server boot sequences
const lazyRoute = (moduleRelativePath) => {
  return (req, res, next) => {
    try {
      const targetModule = require(moduleRelativePath);
      if (typeof targetModule === 'function' || typeof targetModule.use === 'function') {
        return targetModule(req, res, next);
      } else if (targetModule && typeof targetModule.router === 'function') {
        return targetModule.router(req, res, next);
      } else {
        throw new TypeError('Module did not export a functional Express middleware handler block.');
      }
    } catch (err) {
      console.error(`[Lazy Router Intercept Crash] File target [${moduleRelativePath}] failed to execute:`, err.message);
      return res.status(503).json({
        success: false,
        error: 'Module Compilation Exception',
        message: 'This specific endpoint is undergoing active background structure updates.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  };
};

// 5. REGISTER ISOLATED GATEWAY LAYERS CLEANLY
app.use('/api/scrape', lazyRoute('./src/routes/scrape'));
app.use('/api/parts', lazyRoute('./src/routes/parts'));
app.use('/api/full-estimate', lazyRoute('./src/routes/full-estimate'));
app.use('/api/jobs', lazyRoute('./src/routes/jobs'));
app.use('/api/diagnose', lazyRoute('./src/routes/diagnose'));
app.use('/api/invoice', lazyRoute('./src/routes/invoice'));
app.use('/api/parts-lookup', lazyRoute('./src/routes/partsLookup'));
app.use('/api/fleet', lazyRoute('./src/routes/fleet'));
app.use('/api/translate', lazyRoute('./src/routes/translate'));

// Protected Auth Lane Lazy Bridge
app.use('/api/estimateHeuristic', (req, res, next) => {
  try {
    const verifyToken = require('./src/middleware/auth');
    const estimateHeuristic = require('./src/routes/estimate');
    if (typeof verifyToken === 'function') {
      return verifyToken(req, res, () => estimateHeuristic(req, res, next));
    }
    return estimateHeuristic(req, res, next);
  } catch (e) {
    console.error('[Heuristic Auth Intercept Crash]:', e.message);
    return res.status(503).json({ success: false, error: 'Authorization pipeline offline' });
  }
});

// Structural OEM Late Binding Proxy Pass
app.use((req, res, next) => {
  try {
    const oemRouter = require('./src/routes/oem');
    if (typeof oemRouter === 'function') return oemRouter(req, res, next);
  } catch (e) {}
  return next();
});

// SKSK MODULE REBUILD ADDITIONS (FULLY SANDBOXED AND INSULATED)
app.use('/api/intelligence', lazyRoute('./src/routes/intelligence.routes'));
app.use('/api/buyer', lazyRoute('./src/routes/buyer'));

// STANDALONE STRIPE CLIENT RETRIEVAL LOGIC
app.use('/api/payments', (req, res, next) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ success: false, error: 'Payments not configured' });
  }
  try {
    const payments = require('./src/routes/payments');
    return payments(req, res, next);
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Payments routing failure' });
  }
});

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
// Render default expected port fallback mapping
const port = process.env.PORT || 10000; 
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[Master Server] SKSK ProTech initialized successfully on cloud port ${port}`);
  console.log(`[Master Server] Operating Profile: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Master Server] Telemetry Endpoint: http://localhost:${port}/health`);
});

const gracefulShutdown = () => {
  console.log('[Master Server] Termination warning triggered, draining connected resources...');
  server.close(() => {
    console.log('[Master Server] Process clean kill completed.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

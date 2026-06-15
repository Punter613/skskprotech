require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');

const diagnose = require('./src/routes/diagnose');
const estimate = require('./src/routes/estimate');
const invoice = require('./src/routes/invoice');

const app = express();

// CORS - allow the frontend origin
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security & parsing middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Request timeout wrapper
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

// API routes
app.use('/api/diagnose', diagnose);
app.use('/api/estimate', estimate);
app.use('/api/invoice', invoice);
app.use('/api/translate', require('./src/routes/translate'));
// Payments route (only loaded if Stripe key is configured)
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
  // Return graceful error for payment endpoints
  app.use('/api/payments', (req, res) => {
    res.status(503).json({ success: false, error: 'Payments not configured' });
  });
}

// Static files
app.use(express.static(path.join(__dirname)));

// Health check with DB status
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

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack || err.message || err);

  // Don't leak error details in production
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

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`[Server] SKSK ProTech running on port ${port}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully');
  server.close(() => process.exit(0));
});

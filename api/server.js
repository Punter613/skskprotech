#!/usr/bin/env node
require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const port = process.env.PORT || 5000;

// Stripe webhooks require raw body; mount webhook route before JSON parser if you have one
const rawBodyMiddleware = (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => { req.rawBody = data; next(); });
};

// Use raw body only for /api/webhooks if needed
app.use('/api/webhooks', rawBodyMiddleware);

// JSON parser for other routes
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount intelligence routes
app.use('/api/intelligence', require('../src/routes/intelligence.routes'));

// Serve a simple web client from /web (if present)
app.use('/', express.static(path.join(__dirname, '..', 'web')));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`SKSK API server listening on port ${port}`);
});
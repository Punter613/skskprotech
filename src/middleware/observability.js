'use strict';

const crypto = require('crypto');

const SENSITIVE_KEY = /authorization|api[-_]?key|token|secret|password|cookie|vin|phone|email/i;

function requestId(value) {
  const candidate = String(value || '').trim();
  if (/^[A-Za-z0-9._:-]{8,128}$/.test(candidate)) return candidate;
  return 'req_' + crypto.randomUUID();
}

function sanitize(value, depth = 0) {
  if (depth > 4) return '[depth-limited]';
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitize(item, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 500) return value.slice(0, 500) + '…';
    return value;
  }
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(item, depth + 1);
  }
  return output;
}

function write(level, event, fields = {}) {
  const record = sanitize({
    ts: new Date().toISOString(),
    level,
    event,
    service: process.env.RENDER_SERVICE_NAME || 'sksk-api',
    commit: process.env.RENDER_GIT_COMMIT || null,
    ...fields
  });
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function requestTelemetry(req, res, next) {
  const id = requestId(req.get('X-Request-ID'));
  const startedAt = Date.now();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    write(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http_request', {
      requestId: id,
      method: req.method,
      path: req.originalUrl?.split('?')[0] || req.path,
      statusCode: res.statusCode,
      durationMs
    });
  });
  next();
}

function errorTelemetry(err, req, res, next) {
  write('error', 'unhandled_request_error', {
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl?.split('?')[0] || req.path,
    error: {
      name: err?.name || 'Error',
      code: err?.code || null,
      message: err?.message || 'Unknown error'
    }
  });
  if (res.headersSent) return next(err);
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    requestId: req.requestId || null
  });
}

module.exports = { requestTelemetry, errorTelemetry, write, sanitize, requestId };

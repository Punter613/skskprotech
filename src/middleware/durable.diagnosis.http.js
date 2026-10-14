'use strict';

// HTTP boundary for durable diagnosis. A separate pipeline executor must be
// installed before rollout; this middleware NEVER falls through to legacy writes.
const crypto = require('node:crypto');
const { claimOrRead } = require('../services/durable.diagnosis.admission');
const { replayDurableResponse } = require('../services/durable.diagnosis.replay');
const { authorizedDurableShop } = require('./durable.shop.access');

function durableHttpAdmission({ rpcClient, execute } = {}) {
  // An explicit executor is required until deployment wiring and transport validation pass.
  const executor = execute;
  return async function durableHttpAdmissionMiddleware(req, res, next) {
    if (req.method !== 'POST' || req.path !== '/') return next();
    if (process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED !== 'true') return next();
    res.setHeader('Cache-Control', 'no-store');
    if (!authorizedDurableShop(req)) return res.status(403).json({ success: false, code: 'DURABLE_SHOP_AUTH_REQUIRED' });
    // Never attempt a claim without a wired terminal persistence executor.
    if (typeof executor !== 'function' || !rpcClient?.rpc) {
      return res.status(503).json({ success: false, code: 'DURABLE_DIAGNOSIS_NOT_READY' });
    }
    // Ownership comes exclusively from verified authentication, never intake.
    // Reject ambiguous caller-provided identifiers before claiming a job.
    const body = req.body;
    const reserved = ['shopId', 'shop_id', 'p_shop', 'jobId'];
    if (body && typeof body === 'object' && !Array.isArray(body) &&
        (reserved.some(field => Object.prototype.hasOwnProperty.call(body, field)) ||
         (body.intake && typeof body.intake === 'object' &&
          reserved.some(field => Object.prototype.hasOwnProperty.call(body.intake, field))))) {
      return res.status(400).json({ success: false, code: 'DURABLE_UNTRUSTED_IDENTITY' });
    }
    const key = req.get('Idempotency-Key');
    if (typeof key !== 'string' || key.length < 16 || key.length > 200) {
      return res.status(400).json({ success: false, code: 'DURABLE_INVALID_KEY' });
    }
    // The server chooses the job ID; the caller never supplies ownership.
    const jobId = 'DJ-' + crypto.randomUUID();
    try {
      const admission = await claimOrRead(req, rpcClient, { key, jobId, body: req.body });
      if (admission.action === 'PENDING') {
        res.setHeader('Retry-After', '3');
        return res.status(202).json({ success: false, code: 'DURABLE_OPERATION_PENDING' });
      }
      if (admission.action === 'REPLAY') {
        return replayDurableResponse(res, admission.row);
      }
      // Only an injected executor can run the AI and atomically finish SQL.
      return await executor(req, res, admission);
    } catch (error) {
      const status = error.code === 'DURABLE_IDEMPOTENCY_CONFLICT' || error.code === 'DURABLE_FINGERPRINT_VERSION' ? 409
        : error.code === 'DURABLE_SHOP_AUTH_REQUIRED' ? 403
        : error.code === 'DURABLE_INVALID_KEY' || error.code === 'DURABLE_INVALID_BODY' ? 400 : 503;
      return res.status(status).json({ success: false, code: error.code || 'DURABLE_UNAVAILABLE' });
    }
  };
}

module.exports = { durableHttpAdmission };

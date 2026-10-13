'use strict';

// Issue #216: server-owned rollout gate. Until the durable HTTP handler,
// membership resolver and recovery path are integrated, enabling the flag
// explicitly fails closed. Never use request headers/body as rollout controls.
function durableDiagnosisAdmission(req, res, next) {
  if (req.method !== 'POST' || req.path !== '/') return next();
  if (process.env.SKSK_DURABLE_DIAGNOSIS_ENABLED !== 'true') return next();

  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    success: false,
    code: 'DURABLE_DIAGNOSIS_NOT_READY',
    error: 'Durable diagnosis rollout is not available'
  });
}

module.exports = { durableDiagnosisAdmission };

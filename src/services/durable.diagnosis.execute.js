'use strict';

// Execute the shared diagnostic handler without allowing its HTTP response to
// escape before the generation-fenced terminal write succeeds.
const { executeDiagnosis } = require('../routes/diagnose');
const { applyDiagnosisConfigurationBoundary, validateDiagnoseInput } = require('../middleware/job.lifecycle.middleware');
const { finishDurableDiagnosis } = require('./durable.diagnosis.finish');

async function executeDurableDiagnosis(req, res, claim, rpcClient, diagnose = executeDiagnosis) {
  const invalid = validateDiagnoseInput(req.body);
  let status = invalid ? 400 : 200;
  let captured = invalid ? { success: false, code: 'INVALID_DIAGNOSIS_INPUT', error: invalid } : null;
  const capture = {
    status(code) { status = code; return this; },
    json(payload) { captured = payload; return payload; }
  };
  try {
    if (!invalid) await diagnose(req, capture);
    if (!captured || typeof captured !== 'object') throw new Error('Diagnosis did not return a JSON result');
  } catch (err) {
    status = 500;
    captured = { success: false, code: 'DURABLE_DIAGNOSIS_EXECUTION_FAILED', error: 'Diagnosis failed' };
  }
  if (captured.success && captured.result) {
    try {
      captured = await applyDiagnosisConfigurationBoundary(req, captured);
    } catch (err) {
      status = 500;
      captured = { success: false, code: 'DURABLE_EVIDENCE_GUARD_FAILED', error: 'Diagnosis evidence validation failed' };
    }
  }
  // The diagnostic handler may return a JSON failure without setting an HTTP
  // error status. Never persist that failure as a successful TESTING job.
  if (captured.success !== true && status >= 200 && status < 300) status = 500;
  if (captured.success === true && !captured.result) {
    status = 500;
    captured = { success: false, code: 'DURABLE_RESULT_MISSING', error: 'Diagnosis returned no result' };
  }
  // A 2xx status must represent an actual successful diagnostic result.
  // Conversely, a success payload cannot be paired with an HTTP error.
  if (captured.success === true && (status < 200 || status >= 300)) {
    status = 500;
    captured = { success: false, code: 'DURABLE_STATUS_MISMATCH', error: 'Diagnosis response status inconsistent' };
  }
  const response = { ...captured, jobId: claim.jobId, invoiceNumber: claim.jobId };
  const bytes = Buffer.from(JSON.stringify(response));
  await finishDurableDiagnosis(req, rpcClient, claim, {
    httpStatus: status,
    responseBytes: bytes,
    jobPayload: {
      status: status >= 200 && status < 300 ? 'TESTING' : 'DIAG_FAILED',
      intake: req.body,
      diagnosis: response.result || null,
      traceLog: response.traceLog || null
    }
  });
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  return res.send(bytes);
}
module.exports = { executeDurableDiagnosis };

'use strict';
const { executeDurableRpc } = require('./durable.diagnosis.rpc');

function toPgBytea(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('Expected response Buffer');
  return String.fromCharCode(92) + 'x' + buffer.toString('hex');
}

async function finishDurableDiagnosis(req, rpcClient, claim, { httpStatus, responseBytes, jobPayload }) {
  if (claim?.action !== 'EXECUTE' || typeof claim.operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claim.operationId) ||
      typeof claim.jobId !== 'string' || !claim.jobId.trim() ||
      !Number.isSafeInteger(claim.generation) || claim.generation < 1) throw new TypeError('Invalid durable claim');
  if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) throw new TypeError('Invalid HTTP status');
  if (!Buffer.isBuffer(responseBytes)) throw new TypeError('Response bytes required');
  if (!jobPayload || typeof jobPayload !== 'object' || Array.isArray(jobPayload)) throw new TypeError('Job payload required');
  if (Object.hasOwn(jobPayload, 'jobId') && jobPayload.jobId !== claim.jobId) {
    const err = new Error('Claimed job differs from terminal payload');
    err.code = 'DURABLE_JOB_MISMATCH';
    throw err;
  }
  const completed = httpStatus >= 200 && httpStatus < 300;
  const result = await executeDurableRpc(req, rpcClient, 'finish_diagnosis_operation', {
    p_operation: claim.operationId,
    p_generation: claim.generation,
    p_terminal: completed ? 'COMPLETED' : 'FAILED',
    p_job_status: completed ? 'TESTING' : 'DIAG_FAILED',
    p_job_payload: { ...jobPayload, jobId: claim.jobId },
    p_http_status: httpStatus,
    p_response_bytes: toPgBytea(responseBytes)
  });
  if (result?.error || result?.data !== true) {
    const err = new Error('Durable completion unavailable or fenced');
    err.code = 'DURABLE_FINISH_REJECTED';
    throw err;
  }
  return true;
}
module.exports = { toPgBytea, finishDurableDiagnosis };

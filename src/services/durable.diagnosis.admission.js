'use strict';

// Reusable, transport-independent durable admission phase. Does not execute AI.
// The caller must authenticate first and supply an authorized RPC adapter.
const crypto = require('node:crypto');
const { executeDurableRpc } = require('./durable.diagnosis.rpc');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}
function fingerprint(body) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(body))).digest('hex');
}
function operationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function unwrap(result) {
  if (result?.error) throw operationError('DURABLE_RPC_FAILED', 'Durable persistence unavailable');
  if (!Array.isArray(result?.data) || result.data.length !== 1) {
    throw operationError('DURABLE_RPC_INVALID_RESULT', 'Unexpected durable operation response');
  }
  return result.data[0];
}
async function claimOrRead(req, rpcClient, { key, jobId, body }) {
  if (typeof key !== 'string' || key.length < 16 || key.length > 200) {
    throw operationError('DURABLE_INVALID_KEY', 'Invalid idempotency key');
  }
  if (typeof jobId !== 'string' || !jobId.trim()) {
    throw operationError('DURABLE_INVALID_JOB', 'Invalid job identifier');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw operationError('DURABLE_INVALID_BODY', 'Invalid diagnosis payload');
  }
  const hash = fingerprint(body);
  const row = unwrap(await executeDurableRpc(req, rpcClient, 'claim_diagnosis_operation', {
    p_key: key, p_version: 1, p_fingerprint: hash, p_job_id: jobId,
    p_initial_job: { jobId, status: 'DIAGNOSING', intake: body }
  }));
  if (row.disposition === 'CLAIMED') {
    if (typeof row.operation_id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.operation_id) ||
        !Number.isSafeInteger(row.generation) || row.generation < 1 ||
        row.linked_job_id !== jobId) {
      throw operationError('DURABLE_RPC_INVALID_RESULT', 'Invalid durable claim identifiers');
    }
    return { action: 'EXECUTE', operationId: row.operation_id, generation: row.generation, jobId: row.linked_job_id };
  }
  if (row.disposition === 'CONFLICT') throw operationError('DURABLE_IDEMPOTENCY_CONFLICT', 'Idempotency key reused for different diagnosis');
  if (row.disposition === 'VERSION_RECHECK') throw operationError('DURABLE_FINGERPRINT_VERSION', 'Fingerprint version mismatch');
  const read = unwrap(await executeDurableRpc(req, rpcClient, 'read_diagnosis_operation', { p_key: key }));
  if (read.disposition === 'COMPLETED' || read.disposition === 'FAILED') {
    // Replay response bytes only in the HTTP layer after strict decoding.
    return { action: 'REPLAY', row: read };
  }
  if (read.disposition === 'PROCESSING' || read.disposition === 'UNRESOLVED') {
    return { action: 'PENDING', disposition: read.disposition };
  }
  throw operationError('DURABLE_STATE_INCONSISTENT', 'Durable claim/read state inconsistent');
}
module.exports = { fingerprint, claimOrRead };

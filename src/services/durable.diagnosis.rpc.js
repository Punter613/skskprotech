'use strict';

const { authorizedDurableShop } = require('../middleware/durable.shop.access');

// Server-only adapter. All durable RPC calls must pass through this boundary.
// Caller supplies an RPC transport (Supabase client or test double), never a shop.
const ALLOWED = new Set([
  'claim_diagnosis_operation',
  'heartbeat_diagnosis_operation',
  'finish_diagnosis_operation',
  'read_diagnosis_operation',
  'reconcile_diagnosis_operation'
]);

async function executeDurableRpc(req, rpcClient, name, params = {}) {
  const shop = authorizedDurableShop(req);
  if (!shop) {
    const error = new Error('Verified shop identity required for durable diagnosis');
    error.code = 'DURABLE_SHOP_AUTH_REQUIRED';
    throw error;
  }
  if (!ALLOWED.has(name)) {
    const error = new Error('Unsupported durable diagnosis RPC');
    error.code = 'DURABLE_RPC_NOT_ALLOWED';
    throw error;
  }
  if (!rpcClient || typeof rpcClient.rpc !== 'function') {
    throw new TypeError('Durable RPC transport is not configured');
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError('Durable RPC parameters must be an object');
  }
  // Never allow the caller to select the tenant, even via aliases.
  for (const field of ['p_shop', 'shop_id', 'shopId']) {
    if (Object.prototype.hasOwnProperty.call(params, field) && params[field] !== shop) {
      const error = new Error('Durable RPC tenant does not match verified identity');
      error.code = 'DURABLE_SHOP_MISMATCH';
      throw error;
    }
  }
  const { p_shop: _ignoredShop, shop_id: _ignoredShopId, shopId: _ignoredCamelShop, ...safeParams } = params;
  // Defense in depth: do not forward a tenant identifier embedded in a job
  // payload. The database functions must independently enforce this invariant.
  if (name === 'claim_diagnosis_operation' || name === 'finish_diagnosis_operation') {
    const field = name === 'claim_diagnosis_operation' ? 'p_initial_job' : 'p_job_payload';
    const payload = safeParams[field];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new TypeError('Durable job payload must be an object');
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'shopId') && payload.shopId !== shop) {
      const error = new Error('Durable job payload shop does not match verified identity');
      error.code = 'DURABLE_SHOP_MISMATCH';
      throw error;
    }
    if (name === 'claim_diagnosis_operation' &&
        Object.prototype.hasOwnProperty.call(payload, 'jobId') &&
        payload.jobId !== safeParams.p_job_id) {
      const error = new Error('Durable claim payload job does not match operation job');
      error.code = 'DURABLE_JOB_MISMATCH';
      throw error;
    }
    safeParams[field] = { ...payload, shopId: shop };
    if (name === 'claim_diagnosis_operation') {
      if (typeof safeParams.p_job_id !== 'string' || !safeParams.p_job_id.trim()) {
        throw new TypeError('Durable claim requires a job identifier');
      }
      safeParams[field].jobId = safeParams.p_job_id;
    }
  }
  return rpcClient.rpc(name, { ...safeParams, p_shop: shop });
}

module.exports = { executeDurableRpc };

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
  const { p_shop: _ignoredShop, shop_id: _ignoredShopId, shopId: _ignoredCamelShop, ...safeParams } = params;
  return rpcClient.rpc(name, { ...safeParams, p_shop: shop });
}

module.exports = { executeDurableRpc };

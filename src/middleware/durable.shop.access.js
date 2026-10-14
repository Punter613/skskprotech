'use strict';

// Gate for future durable diagnosis RPC routes. Never infer tenant identity
// from request bodies, query strings, headers, or unverified JWT contents.
function authorizedDurableShop(req) {
  if (String(process.env.SKSK_REQUIRE_AUTH || '').toLowerCase() !== 'true') return null;
  const auth = req?.auth;
  if (!auth || !['supabase_user', 'shop_key'].includes(auth.type)) return null;
  const principalShop = typeof auth.shopId === 'string' ? auth.shopId.trim() : '';
  const requestShop = typeof req.shopId === 'string' ? req.shopId.trim() : '';
  if (!principalShop || !requestShop || principalShop !== requestShop) return null;
  if (auth.type === 'supabase_user' && (!auth.userId || !auth.id)) return null;
  if (auth.type === 'shop_key' && !/^shop_key_[1-9][0-9]*$/.test(auth.id || '')) return null;
  return principalShop;
}

function requireDurableShop(req, res, next) {
  const shopId = authorizedDurableShop(req);
  if (!shopId) {
    return res.status(403).json({
      success: false,
      code: 'DURABLE_SHOP_AUTH_REQUIRED',
      error: 'Verified shop identity required for durable diagnosis'
    });
  }
  // The RPC adapter must use this server-derived value exclusively.
  req.durableShopId = shopId;
  return next();
}

module.exports = { authorizedDurableShop, requireDurableShop };

'use strict';

// Durable diagnosis uses a stable, verified shop namespace. Never derive it
// from a credential's position, user ID, client input or legacy shop_key_N.
function resolveDurableShopId(req) {
  const principal = req?.auth;
  if (!principal || typeof principal !== 'object') return null;
  if (principal.type !== 'supabase_user') return null;
  if (typeof principal.userId !== 'string' || !principal.userId.trim()) return null;
  if (typeof principal.shopId !== 'string') return null;
  const shopId = principal.shopId.trim();
  if (!shopId || shopId !== principal.shopId) return null;
  if (shopId.length > 128 || /[\x00-\x1f\x7f]/.test(shopId)) return null;
  return shopId;
}

// Must run after server-side token verification. This is intentionally NOT
// mounted while the 503 admission guard is in effect.
function requireDurableShopMembership(req, res, next) {
  if (!req?.auth) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="SKSK ProTech"');
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const shopId = resolveDurableShopId(req);
  if (!shopId) {
    return res.status(403).json({ success: false, error: 'Verified shop membership required' });
  }
  req.durableShopId = shopId;
  return next();
}

module.exports = { resolveDurableShopId, requireDurableShopMembership };

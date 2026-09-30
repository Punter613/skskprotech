/* SKSKSession: optional Supabase user-session adapter for the browser.
 *
 * This module is deliberately inert unless a page explicitly opts in with BOTH:
 *   <meta name="sksk-supabase-url" content="...">
 *   <meta name="sksk-supabase-anon-key" content="...">
 * and the Supabase browser SDK is already loaded.
 *
 * No production page opts in today. The existing SKSKAuth shop-key bridge, public
 * share URLs, customer/email feedback flows, and unauthenticated public resources
 * therefore keep their current behavior. Removing the opt-in meta tags is the
 * rollback once a page is enabled in the future.
 *
 * When enabled later, only a plain access-token string is handed to SKSKAuth via
 * setSessionProvider; SKSKAuth does not need to know about the Supabase SDK.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.SKSKSession = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const REFRESH_SKEW_SECONDS = 30;
  const GENERIC_SIGN_IN_ERROR = 'Sign-in failed. Check your email and password.';

  function meta(name) {
    const doc = root && root.document;
    const node = doc && doc.querySelector && doc.querySelector('meta[name="' + name + '"]');
    return node && String(node.content || '').trim();
  }

  function config() {
    return {
      url: meta('sksk-supabase-url'),
      anonKey: meta('sksk-supabase-anon-key')
    };
  }

  function isConfigured() {
    const cfg = config();
    return Boolean(cfg.url && cfg.anonKey);
  }

  function sdk() {
    return root && root.supabase;
  }

  function createClient() {
    if (!isConfigured()) return null;
    const lib = sdk();
    if (!lib || typeof lib.createClient !== 'function') return null;
    const cfg = config();
    return lib.createClient(cfg.url, cfg.anonKey);
  }

  function jwtExpiry(token) {
    try {
      const part = String(token || '').split('.')[1];
      if (!part) return 0;
      const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = root.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
      const payload = JSON.parse(decoded);
      return Number(payload.exp || 0);
    } catch (_) {
      return 0;
    }
  }

  function tokenFresh(token) {
    const exp = jwtExpiry(token);
    if (!exp) return Boolean(token);
    return exp > Math.floor(Date.now() / 1000) + REFRESH_SKEW_SECONDS;
  }

  async function accessToken(client) {
    if (!client || !client.auth) return '';
    const current = await client.auth.getSession();
    let token = current && current.data && current.data.session && current.data.session.access_token;
    if (tokenFresh(token)) return token || '';

    if (typeof client.auth.refreshSession === 'function') {
      const refreshed = await client.auth.refreshSession();
      token = refreshed && refreshed.data && refreshed.data.session && refreshed.data.session.access_token;
    }
    return token || '';
  }

  function install(client) {
    if (!client || !root || !root.SKSKAuth || typeof root.SKSKAuth.setSessionProvider !== 'function') {
      return false;
    }
    root.SKSKAuth.setSessionProvider(function () { return accessToken(client); });
    return true;
  }

  async function signIn(client, email, password) {
    if (!client || !client.auth || typeof client.auth.signInWithPassword !== 'function') {
      return { ok: false, error: GENERIC_SIGN_IN_ERROR };
    }
    try {
      const result = await client.auth.signInWithPassword({ email: String(email || '').trim(), password: String(password || '') });
      if (result && result.error) return { ok: false, error: GENERIC_SIGN_IN_ERROR };
      return { ok: true, session: result && result.data && result.data.session || null };
    } catch (_) {
      return { ok: false, error: GENERIC_SIGN_IN_ERROR };
    }
  }

  async function signOut(client) {
    if (client && client.auth && typeof client.auth.signOut === 'function') await client.auth.signOut();
  }

  function boot() {
    const client = createClient();
    if (!client) return { enabled: false, client: null };
    return { enabled: install(client), client: client };
  }

  return Object.freeze({
    REFRESH_SKEW_SECONDS,
    GENERIC_SIGN_IN_ERROR,
    config,
    isConfigured,
    createClient,
    accessToken,
    install,
    signIn,
    signOut,
    boot
  });
});

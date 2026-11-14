(function (global) {
  'use strict';

  const STORAGE_KEY = 'skskApiKey';
  const KEY_HEADER = 'X-SKSK-API-Key';
  // Server errors that mean "this credential carries no usable shop context".
  // The stored shop key cannot fix itself, so the user gets one re-auth
  // attempt instead of a dead-end denial.
  const SHOP_CONTEXT_ERRORS = new Set([
    'Authenticated shop context is required.',
    'Tenant override is not authorized.',
    'Shop membership required'
  ]);
  let sessionProvider = null;

  function getKey() {
    return global.sessionStorage.getItem(STORAGE_KEY) || '';
  }

  function setKey(value) {
    const key = String(value || '').trim();
    if (key) global.sessionStorage.setItem(STORAGE_KEY, key);
    else global.sessionStorage.removeItem(STORAGE_KEY);
    return key;
  }

  function clearKey() {
    global.sessionStorage.removeItem(STORAGE_KEY);
  }

  function setSessionProvider(provider) {
    sessionProvider = typeof provider === 'function' ? provider : null;
    return Boolean(sessionProvider);
  }

  async function sessionToken() {
    if (!sessionProvider) return '';
    try {
      return String(await sessionProvider() || '').trim();
    } catch (_) {
      return '';
    }
  }

  async function withAuthHeaders(headers) {
    const next = new Headers(headers || {});
    const token = await sessionToken();
    if (token) {
      next.set('Authorization', 'Bearer ' + token);
      next.delete(KEY_HEADER);
      return { headers: next, usedSession: true };
    }
    const key = getKey();
    if (key) next.set(KEY_HEADER, key);
    return { headers: next, usedSession: false };
  }

  async function promptForKey() {
    const entered = global.prompt(
      'SKSK shop access key\n\nTemporary browser bridge only — this is not per-user login.'
    );
    return setKey(entered);
  }

  async function request(url, options, state) {
    const auth = await withAuthHeaders(options && options.headers);
    const opts = { ...(options || {}), headers: auth.headers };
    const response = await global.fetch(url, opts);

    if (state && state.retried) return response;

    if (response.status === 401) {
      if (!await promptForKey()) return response;
      return request(url, options, { retried: true });
    }

    // A shop-context 403 means the request was denied for lack of a usable
    // shop identity. Session bearers are managed by the session provider, so
    // only re-prompt when the credential in play is the stored shop key.
    if (response.status === 403 && !auth.usedSession) {
      let errorText = '';
      try {
        errorText = String((await response.clone().json())?.error || '');
      } catch (_) { /* non-JSON error body */ }
      if (SHOP_CONTEXT_ERRORS.has(errorText)) {
        clearKey();
        if (!await promptForKey()) return response;
        return request(url, options, { retried: true });
      }
    }

    return response;
  }

  global.SKSKAuth = Object.freeze({
    getKey,
    setKey,
    clearKey,
    setSessionProvider,
    request
  });
})(window);

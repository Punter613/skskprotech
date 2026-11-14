(function (global) {
  'use strict';

  const STORAGE_KEY = 'skskApiKey';
  const KEY_HEADER = 'X-SKSK-API-Key';
  // The one recoverable shop-context failure: the request carried no usable
  // shop identity at all, so offering a fresh credential can fix it. This is
  // deliberately the ONLY reprompt trigger besides 401. A tenant-override
  // denial ("Tenant override is not authorized.") is a final authorization
  // decision and must never become a re-auth retry; other 403s are likewise
  // returned untouched. NOTE: the server currently distinguishes these cases
  // only by the error message text — there is no machine-readable error code
  // in the response body yet.
  const RECOVERABLE_SHOP_CONTEXT_ERROR = 'Authenticated shop context is required.';
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

    // A 403 carrying the missing-shop-context error means the request had
    // no usable shop identity; a fresh shop key can recover it. Session
    // bearers are managed by the session provider, so only re-prompt when
    // the credential in play is the stored shop key. Every other 403 —
    // including tenant-override denials — is final and returned untouched.
    if (response.status === 403 && !auth.usedSession) {
      let errorText = '';
      try {
        errorText = String((await response.clone().json())?.error || '');
      } catch (_) { /* non-JSON error body */ }
      if (errorText === RECOVERABLE_SHOP_CONTEXT_ERROR) {
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

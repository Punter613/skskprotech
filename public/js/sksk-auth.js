(function (global) {
  'use strict';

  const STORAGE_KEY = 'skskApiKey';
  const KEY_HEADER = 'X-SKSK-API-Key';
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
      return next;
    }
    const key = getKey();
    if (key) next.set(KEY_HEADER, key);
    return next;
  }

  async function request(url, options, state) {
    const opts = { ...(options || {}), headers: await withAuthHeaders(options && options.headers) };
    const response = await global.fetch(url, opts);

    if (response.status !== 401 || (state && state.retried)) return response;

    const entered = global.prompt(
      'SKSK shop access key\n\nTemporary browser bridge only — this is not per-user login.'
    );
    if (!setKey(entered)) return response;

    return request(url, options, { retried: true });
  }

  global.SKSKAuth = Object.freeze({
    getKey,
    setKey,
    clearKey,
    setSessionProvider,
    request
  });
})(window);

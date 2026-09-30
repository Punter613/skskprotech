(function (global) {
  'use strict';

  const STORAGE_KEY = 'skskApiKey';
  const KEY_HEADER = 'X-SKSK-API-Key';

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

  function withAuthHeaders(headers) {
    const next = new Headers(headers || {});
    const key = getKey();
    if (key) next.set(KEY_HEADER, key);
    return next;
  }

  async function request(url, options, state) {
    const opts = { ...(options || {}), headers: withAuthHeaders(options && options.headers) };
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
    request
  });
})(window);

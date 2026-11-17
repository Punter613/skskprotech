'use strict';

// Test-only child-process harness. The real api/server.js and requireApiAccess
// execute; ONLY the two upstream business routers are replaced with instrumented
// stubs. This does not validate live VIN decoding or Quick Ask retrieval.
const express = require('express');

let decodeCalls = 0;
let quickAskCalls = 0;
const internalKey = 'fixture-internal-secret-B-unique-9e41';
const incomingKey = 'fixture-incoming-secret-A-unique-8b72';
const tenant = 'shop_preview_canary';

function replaceModule(relative, exports) {
  const resolved = require.resolve(relative);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const vehicle = express.Router();
vehicle.post('/decode', (req, res) => {
  decodeCalls++;
  process.send?.({ type: 'call', route: 'decode', authenticated: req.shopId === tenant });
  res.json({ success: true, vehicle: { year: 2020, make: 'KIA', model: 'Optima', engine: '2.4L', marker: 'decode-marker', reflectedIncoming: incomingKey, reflectedInternal: internalKey } });
});
replaceModule('../../src/routes/vehicle', vehicle);

const quickAsk = express.Router();
quickAsk.post('/', (req, res) => {
  quickAskCalls++;
  process.send?.({ type: 'call', route: 'quick-ask', authenticated: req.shopId === tenant, consumed: req.body?.vehicle?.marker === 'decode-marker' });
  res.json({ status: 'SUCCESS', mode: 'stubbed', repairDiagnosisSource: 'quick-ask-marker', repairDiagnosisEvidence: [{ title: 'stub-reference' }], warnings: ['fixture-warning', incomingKey, internalKey] });
});
replaceModule('../../src/routes/quick.ask', quickAsk);

// The incoming A surface is a server-verified synthetic user session, not a
// second API key bound to the same shop. #220 forbids duplicate shop bindings.
// The real requireApiAccess middleware still performs the bearer verification.
replaceModule('../../src/auth/supabase.identity', {
  configured: () => true,
  verifySupabaseAccessToken: async key => key === incomingKey
    ? { type: 'user', id: 'fixture-user', shopId: tenant }
    : key === 'fixture-wrong-tenant-secret-D'
      ? { type: 'user', id: 'fixture-other-user', shopId: 'shop_other' } : null
});
replaceModule('../../src/services/db_keepawake', { startKeepAwakeLoop() {} });
replaceModule('../../src/workers/aiWorker', {});

Object.assign(process.env, {
  NODE_ENV: 'production',
  IS_PULL_REQUEST: 'true',
  SKSK_API_KEYS: internalKey,
  SKSK_SHOP_KEY_BINDINGS: JSON.stringify({ [internalKey]: tenant }),
  SKSK_PREVIEW_CANARY_API_KEY: internalKey
});
delete process.env.SKSK_SKIP_AUTH;

process.on('message', message => {
  if (message?.type === 'config') {
    if (message.internal === 'missing') delete process.env.SKSK_PREVIEW_CANARY_API_KEY;
    else if (message.internal === 'invalid') process.env.SKSK_PREVIEW_CANARY_API_KEY = 'fixture-invalid-internal-secret-C';
    else process.env.SKSK_PREVIEW_CANARY_API_KEY = internalKey;
    process.send?.({ type: 'configured' });
  }
  if (message?.type === 'counts') process.send?.({ type: 'counts', decodeCalls, quickAskCalls });
});
require('../../api/server');
(async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:' + process.env.PORT + '/health');
      if (response.status === 200) { process.send?.({ type: 'ready' }); return; }
    } catch { /* waiting for server.listen */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Fixture HTTP server failed to become ready');
})().catch(() => { process.exitCode = 1; });

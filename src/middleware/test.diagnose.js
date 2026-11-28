'use strict';

// A test key is NOT a shop identity. This gate accepts only a small, synthetic
// diagnostic intake and never grants the key access to jobs or commercial APIs.
const crypto = require('node:crypto');
const { configuredKeys, extractCredential } = require('./api.access');
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;
const DTC_PATTERN = /^[PCBU][0-3][0-9A-F]{3}$/i;
const INPUT_KEYS = new Set(['vin', 'vehicle', 'symptoms', 'customerStates', 'mechanicNotices', 'obdCodes', 'mileage']);
const VEHICLE_KEYS = new Set(['year', 'make', 'model', 'trim', 'engine']);

function sameKey(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireGuestDiagnosisKey(req, res, next) {
  if (process.env.SKSK_GUEST_DIAGNOSE_ENABLED !== 'true') {
    return res.status(503).json({ success: false, error: 'Guest diagnoses are not enabled' });
  }
  const keys = String(process.env.SKSK_GUEST_DIAGNOSE_KEYS || '').split(',').map(key => key.trim()).filter(Boolean);
  if (!keys.length) return res.status(503).json({ success: false, error: 'Guest access is not configured' });
  if (keys.some(key => configuredKeys().some(shopKey => sameKey(key, shopKey)))) {
    return res.status(503).json({ success: false, error: 'Guest key conflicts with shop access' });
  }
  const credential = extractCredential(req);
  const index = credential ? keys.findIndex(key => sameKey(credential, key)) : -1;
  if (index < 0) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="SKSK ProTech guest diagnosis"');
    return res.status(401).json({ success: false, error: 'Guest testing key required' });
  }
  req.auth = { type: 'guest_diagnose', id: `guest_key_${index + 1}` };
  return next();
}

function reject(res, message) {
  return res.status(400).json({ success: false, error: message });
}

function stringList(value, maxItems, maxChars) {
  return Array.isArray(value) && value.length <= maxItems &&
    value.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= maxChars);
}

function validateTestDiagnosis(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reject(res, 'A JSON object is required');
  if (Object.keys(body).some(key => !INPUT_KEYS.has(key))) return reject(res, 'Unsupported tester intake field');

  const vin = String(body.vin || '').trim().toUpperCase();
  if (body.vin !== undefined && (!VIN_PATTERN.test(vin) || typeof body.vin !== 'string')) {
    return reject(res, 'VIN must be 17 valid characters');
  }

  let vehicle = {};
  if (body.vehicle !== undefined) {
    if (!body.vehicle || typeof body.vehicle !== 'object' || Array.isArray(body.vehicle) ||
        Object.keys(body.vehicle).some(key => !VEHICLE_KEYS.has(key))) {
      return reject(res, 'Invalid vehicle fields');
    }
    for (const field of ['make', 'model', 'trim', 'engine']) {
      if (body.vehicle[field] !== undefined) {
        if (typeof body.vehicle[field] !== 'string' || body.vehicle[field].length > 60) return reject(res, 'Invalid vehicle fields');
        vehicle[field] = body.vehicle[field].trim();
      }
    }
    if (body.vehicle.year !== undefined) {
      const year = Number(body.vehicle.year);
      if (!Number.isInteger(year) || year < 1886 || year > new Date().getUTCFullYear() + 2) return reject(res, 'Invalid vehicle year');
      vehicle.year = year;
    }
  }
  if (!vin && !(vehicle.year && vehicle.make && vehicle.model)) {
    return reject(res, 'Provide a VIN or vehicle year, make, and model');
  }

  for (const field of ['symptoms', 'customerStates', 'mechanicNotices']) {
    if (body[field] !== undefined && !stringList(body[field], 4, 240)) return reject(res, `Invalid ${field}`);
  }
  if (body.obdCodes !== undefined &&
      (!stringList(body.obdCodes, 5, 5) || !body.obdCodes.every(code => DTC_PATTERN.test(code)))) {
    return reject(res, 'Invalid OBD codes');
  }
  if (![...(body.symptoms || []), ...(body.customerStates || []), ...(body.mechanicNotices || []), ...(body.obdCodes || [])].length) {
    return reject(res, 'Enter a symptom or an OBD code');
  }
  const mileage = body.mileage === undefined ? 0 : Number(body.mileage);
  if (!Number.isInteger(mileage) || mileage < 0 || mileage > 2_000_000) return reject(res, 'Invalid mileage');

  req.body = {
    vin,
    vehicle,
    mileage,
    symptoms: (body.symptoms || []).map(s => s.trim()),
    customerStates: (body.customerStates || []).map(s => s.trim()),
    mechanicNotices: (body.mechanicNotices || []).map(s => s.trim()),
    obdCodes: (body.obdCodes || []).map(s => s.trim().toUpperCase())
  };
  req.skskTesterMode = true;
  next();
}

// Deliberately process-local, conservative quotas. A public/large-scale beta
// needs a durable distributed quota and abuse protection before opening access.
function createTestDiagnosisQuota(options = {}) {
  const dailyMax = Math.max(1, Number(options.dailyMax || process.env.SKSK_TEST_DIAGNOSE_DAILY_MAX || 50));
  const perIpMax = Math.max(1, Number(options.perIpMax || process.env.SKSK_TEST_DIAGNOSE_PER_IP_MAX || 8));
  const maxInFlight = Math.max(1, Number(options.maxInFlight || process.env.SKSK_TEST_DIAGNOSE_MAX_IN_FLIGHT || 3));
  let day = '';
  let total = 0;
  let inFlight = 0;
  const perIp = new Map();

  return function testDiagnosisQuota(req, res, next) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (today !== day) { day = today; total = 0; perIp.clear(); }
    const ip = String(req.ip || 'unknown');
    const ipCount = perIp.get(ip) || 0;
    if (total >= dailyMax || ipCount >= perIpMax) {
      const seconds = Math.max(1, Math.ceil((Date.parse(`${today}T00:00:00Z`) + 86_400_000 - Date.now()) / 1000));
      res.setHeader('Retry-After', String(seconds));
      return res.status(429).json({ success: false, error: 'Tester daily quota reached; try again tomorrow' });
    }
    if (inFlight >= maxInFlight) {
      res.setHeader('Retry-After', '10');
      return res.status(429).json({ success: false, error: 'Tester slots are busy; try again shortly' });
    }

    total += 1;
    perIp.set(ip, ipCount + 1);
    inFlight += 1;
    let released = false;
    function release() { if (!released) { released = true; inFlight -= 1; } }
    res.once('finish', release);
    res.once('close', release);
    return next();
  };
}

module.exports = { requireGuestDiagnosisKey, validateTestDiagnosis, createTestDiagnosisQuota };

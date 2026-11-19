const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Backend database credential contract (fail closed).
//
// The backend client must run with a service-role credential. It never falls back
// to SUPABASE_ANON_KEY (that key is for the browser/auth identity flow only, see
// src/auth/supabase.identity.js). Canonical variable: SUPABASE_SERVICE_ROLE_KEY,
// which production already uses. SUPABASE_KEY stays accepted as a legacy alias,
// but only when it is a service-role credential, and never when it conflicts.
//
// Errors and logs name variables only; they never include key or URL values.

function decodeJwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch (_) {
    return null;
  }
}

function classifySupabaseKey(key) {
  if (typeof key !== 'string' || !key.trim()) return 'missing';
  const value = key.trim();
  if (value.startsWith('sb_secret_')) return 'service';
  if (value.startsWith('sb_publishable_')) return 'publishable';
  const role = decodeJwtRole(value);
  if (role === 'service_role') return 'service';
  if (role === 'anon' || role === 'authenticated') return 'anon';
  return 'unrecognized';
}

function isValidSupabaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch (_) {
    return false;
  }
}

function supabaseConfigRequired(env = process.env) {
  return env.NODE_ENV === 'production'
    || env.SKSK_REQUIRE_PERSISTENCE === 'true'
    || env.RENDER === 'true'
    || env.IS_PULL_REQUEST === 'true';
}

function configError(message) {
  const error = new Error(`[DB] ${message}`);
  error.code = 'SUPABASE_CONFIG_INVALID';
  return error;
}

// Pure: returns { configured, url, key, source } or { configured: false, error }.
function resolveSupabaseConfig(env = process.env) {
  const required = supabaseConfigRequired(env);
  const url = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const legacyKey = env.SUPABASE_KEY;
  const hasUrl = typeof url === 'string' && url.trim() !== '';
  const hasService = typeof serviceKey === 'string' && serviceKey.trim() !== '';
  const hasLegacy = typeof legacyKey === 'string' && legacyKey.trim() !== '';
  const hasAnon = typeof env.SUPABASE_ANON_KEY === 'string' && env.SUPABASE_ANON_KEY.trim() !== '';

  if (hasService && hasLegacy && serviceKey.trim() !== legacyKey.trim()) {
    return { configured: false, required, error: configError('SUPABASE_SERVICE_ROLE_KEY and SUPABASE_KEY are both set to different values; set only SUPABASE_SERVICE_ROLE_KEY') };
  }

  const source = hasService ? 'SUPABASE_SERVICE_ROLE_KEY' : (hasLegacy ? 'SUPABASE_KEY' : null);
  const key = hasService ? serviceKey.trim() : (hasLegacy ? legacyKey.trim() : null);

  if (!source) {
    if (!required && !hasUrl) return { configured: false, required };
    const why = hasAnon
      ? 'only SUPABASE_ANON_KEY is set; the backend requires SUPABASE_SERVICE_ROLE_KEY and never uses the anon key'
      : 'SUPABASE_SERVICE_ROLE_KEY is not set';
    return { configured: false, required, error: configError(why) };
  }

  const kind = classifySupabaseKey(key);
  if (kind !== 'service') {
    return { configured: false, required, error: configError(`${source} is not a service-role credential (${kind})`) };
  }
  if (!hasUrl) {
    return { configured: false, required, error: configError('SUPABASE_URL is not set') };
  }
  if (!isValidSupabaseUrl(url)) {
    return { configured: false, required, error: configError('SUPABASE_URL is not a valid https URL') };
  }
  return { configured: true, required, url: url.trim(), key, source };
}

const supabaseConfig = resolveSupabaseConfig(process.env);
if (supabaseConfig.error) {
  // Fail startup: any explicit-but-invalid config, or missing config where required.
  throw supabaseConfig.error;
}

let supabase = null;
if (supabaseConfig.configured) {
  supabase = createClient(supabaseConfig.url, supabaseConfig.key);
}

function assertSupabaseConfig(env = process.env) {
  const result = resolveSupabaseConfig(env);
  if (result.error) throw result.error;
  return { configured: result.configured, required: result.required, source: result.source || null };
}

const CURRENT_MANUAL_SCHEMA = 5;

function persistenceRequired() {
  return process.env.NODE_ENV === 'production' || process.env.SKSK_REQUIRE_PERSISTENCE === 'true';
}

async function probeDatabase() {
  if (!supabase) {
    return { ok: false, configured: false, error: 'Supabase is not configured' };
  }
  const startedAt = Date.now();
  try {
    const { error } = await supabase.from('service_jobs').select('job_id').limit(1);
    if (error) throw error;
    return { ok: true, configured: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - startedAt,
      error: error?.message || String(error)
    };
  }
}

function assertPersistenceConfigured() {
  if (persistenceRequired() && !supabase) {
    const error = new Error('Persistent storage is required but Supabase is not configured');
    error.code = 'PERSISTENCE_UNAVAILABLE';
    throw error;
  }
}

function normalizeDriveType(vehicle = {}) {
  const raw = String(vehicle.drivetrain || vehicle.driveType || vehicle.drive || '').toLowerCase();
  if (/\b4wd\b|\b4x4\b|four[ -]?wheel drive/.test(raw)) return '4wd';
  if (/\bawd\b|all[ -]?wheel drive/.test(raw)) return 'awd';
  if (/\bfwd\b|front[ -]?wheel drive/.test(raw)) return 'fwd';
  if (/\brwd\b|rear[ -]?wheel drive/.test(raw)) return 'rwd';
  if (/\b2wd\b|two[ -]?wheel drive/.test(raw)) return '2wd';
  return 'drive-unknown';
}

function buildVehicleCacheKey({ year, make, model, engine, drivetrain, driveType, drive }) {
  const driveKey = normalizeDriveType({ drivetrain, driveType, drive });
  return [year, make, model, engine || 'base', driveKey]
    .map(v => String(v || '').toLowerCase().trim().replace(/\s+/g, '-'))
    .join('|');
}

function normalizeManualContext(context = {}) {
  const values = [
    context.query,
    context.symptoms,
    ...(Array.isArray(context.mechanicNotices) ? context.mechanicNotices : [context.mechanicNotices]),
    ...(Array.isArray(context.obdCodes) ? context.obdCodes : [context.obdCodes]),
    ...(Array.isArray(context.keywords) ? context.keywords : [context.keywords])
  ]
    .filter(Boolean)
    .map(value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean)
    .sort();
  return [...new Set(values)].join('|');
}

function buildManualCacheKey(vehicle, context = {}) {
  const vehicleKey = buildVehicleCacheKey(vehicle);
  const normalizedContext = normalizeManualContext(context);
  if (!normalizedContext) return vehicleKey;
  const contextHash = crypto.createHash('sha1').update(normalizedContext).digest('hex').slice(0, 16);
  return `${vehicleKey}|ctx-${contextHash}`;
}

function escapeLikePattern(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function extractManualPathHint(manualData = {}) {
  const direct = String(manualData.resolved_url || manualData.resolvedUrl || '').trim();
  if (direct) return direct;

  for (const item of manualData.items || []) {
    const url = String(item?.url || '').trim();
    if (!url) continue;
    const marker = url.search(/\/Repair(?:%20| )and(?:%20| )Diagnosis\//i);
    if (marker >= 0) {
      return `${url.slice(0, marker)}/Repair%20and%20Diagnosis/`;
    }
  }
  return '';
}

async function getCachedManual(vehicle, context = {}) {
  if (!supabase) return null;
  const cacheKey = buildManualCacheKey(vehicle, context);

  try {
    const { data, error } = await supabase
      .from('scraped_manuals')
      .select('*')
      .eq('vehicle_key', cacheKey)
      .maybeSingle();

    if (error) {
      console.warn('[DB] getCachedManual lookup failed, treating as cache miss:', error.message);
      return null;
    }

    // Force one refresh of rows created by older scraper/cache schemas.
    if (data?.data?.schemaVersion !== CURRENT_MANUAL_SCHEMA) {
      console.log(`[DB] Legacy Lemon cache detected for ${cacheKey}; refreshing with schema v${CURRENT_MANUAL_SCHEMA}`);
      return null;
    }

    return data || null;
  } catch (err) {
    console.warn('[DB] getCachedManual threw, treating as cache miss:', err.message);
    return null;
  }
}

async function getCachedManualVehicleEvidence(vehicle, options = {}) {
  if (!supabase) return [];
  const vehicleKey = buildVehicleCacheKey(vehicle);
  const limit = Math.max(1, Math.min(25, Number(options.limit || 8)));
  const contextPattern = `${escapeLikePattern(vehicleKey)}|ctx-%`;

  try {
    const { data, error } = await supabase
      .from('scraped_manuals')
      .select('vehicle_key,data,scraped_at')
      .like('vehicle_key', contextPattern)
      .order('scraped_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[DB] getCachedManualVehicleEvidence lookup failed, treating as empty:', error.message);
      return [];
    }

    return (Array.isArray(data) ? data : [])
      .filter(row => row?.data?.schemaVersion === CURRENT_MANUAL_SCHEMA);
  } catch (err) {
    console.warn('[DB] getCachedManualVehicleEvidence threw, treating as empty:', err.message);
    return [];
  }
}

async function getCachedManualPathHint(vehicle, context = {}) {
  if (!supabase) return '';
  const cacheKey = buildManualCacheKey(vehicle, context);

  try {
    const { data, error } = await supabase
      .from('scraped_manuals')
      .select('data')
      .eq('vehicle_key', cacheKey)
      .maybeSingle();
    if (!error) {
      const exactHint = extractManualPathHint(data?.data || {});
      if (exactHint) return exactHint;
    }

    const vehicleRows = await getCachedManualVehicleEvidence(vehicle, { limit: 4 });
    for (const row of vehicleRows) {
      const hint = extractManualPathHint(row?.data || {});
      if (hint) return hint;
    }
    return '';
  } catch (_) {
    return '';
  }
}

async function saveScrapedManual(vehicle, manualData, context = {}) {
  if (!supabase) return null;
  const cacheKey = buildManualCacheKey(vehicle, context);

  try {
    const { error } = await supabase
      .from('scraped_manuals')
      .upsert({
        vehicle_key: cacheKey,
        year: vehicle.year || null,
        make: vehicle.make || null,
        model: vehicle.model || null,
        engine: vehicle.engine || null,
        data: manualData,
        scraped_at: new Date().toISOString()
      }, { onConflict: 'vehicle_key' });

    if (error) {
      console.warn('[DB] saveScrapedManual failed (non-fatal, continuing):', error.message);
    }
  } catch (err) {
    console.warn('[DB] saveScrapedManual threw (non-fatal, continuing):', err.message);
  }
}

module.exports = {
  supabase,
  resolveSupabaseConfig,
  assertSupabaseConfig,
  classifySupabaseKey,
  supabaseConfigRequired,
  getCachedManual,
  getCachedManualVehicleEvidence,
  getCachedManualPathHint,
  saveScrapedManual,
  buildVehicleCacheKey,
  buildManualCacheKey,
  normalizeManualContext,
  extractManualPathHint,
  escapeLikePattern,
  CURRENT_MANUAL_SCHEMA,
  normalizeDriveType,
  persistenceRequired,
  probeDatabase,
  assertPersistenceConfigured
};
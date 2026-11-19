'use strict';

// Fail-closed startup guard for Render pull request previews.
//
// Render previews inherit the parent service's environment by default, which
// previously handed previews the PRODUCTION Supabase URL and service-role key.
// This guard runs before Supabase clients are created or the HTTP server binds.
// In a preview it ALLOWS only the approved non-production test project and
// BLOCKS everything else: production, unknown projects, missing or malformed
// configuration. Outside previews it is a no-op, so production startup is
// unchanged.
//
// The allowlist is deliberately a code constant, not an environment variable:
// an inherited environment must never be able to widen it.

const APPROVED_PREVIEW_PROJECT_REFS = Object.freeze(['bzgdovasolhoslruyfev']);
const KNOWN_PRODUCTION_PROJECT_REFS = Object.freeze(['irwhynrausoqjokyaxbf']);

const KEY_ENV_NAMES = Object.freeze(['SUPABASE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY']);

function isPreviewEnvironment(env = process.env) {
  if (String(env.IS_PULL_REQUEST || '').trim().toLowerCase() === 'true') return true;
  // Defense in depth: Render names preview services "<parent>-pr-<number>".
  return /-pr-\d+$/i.test(String(env.RENDER_SERVICE_NAME || '').trim());
}

function projectRefFromUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return { ok: false, reason: 'SUPABASE_URL is missing' };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'SUPABASE_URL is malformed' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'SUPABASE_URL must use https' };
  if (url.username || url.password) return { ok: false, reason: 'SUPABASE_URL must not embed credentials' };
  if (url.port) return { ok: false, reason: 'SUPABASE_URL must not set a port' };
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname.toLowerCase());
  if (!match) return { ok: false, reason: 'SUPABASE_URL is not a recognised Supabase project host' };
  return { ok: true, ref: match[1] };
}

// Legacy Supabase keys are JWTs carrying the project ref. A key whose ref does
// not match the approved project is rejected. Keys in a non-JWT format cannot
// be attributed here; they only authenticate against the host the URL names,
// which the URL check already pins.
function jwtProjectRef(rawKey) {
  const parts = String(rawKey || '').trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload?.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
}

function evaluatePreviewDatabaseConfig(env = process.env) {
  if (!isPreviewEnvironment(env)) return { preview: false, allowed: true, reason: 'not a preview' };

  const parsed = projectRefFromUrl(env.SUPABASE_URL);
  if (!parsed.ok) return { preview: true, allowed: false, reason: parsed.reason };

  if (KNOWN_PRODUCTION_PROJECT_REFS.includes(parsed.ref)) {
    return { preview: true, allowed: false, reason: 'SUPABASE_URL points at the PRODUCTION project', ref: parsed.ref };
  }
  if (!APPROVED_PREVIEW_PROJECT_REFS.includes(parsed.ref)) {
    return { preview: true, allowed: false, reason: 'SUPABASE_URL points at an unapproved project', ref: parsed.ref };
  }

  for (const name of KEY_ENV_NAMES) {
    const keyRef = jwtProjectRef(env[name]);
    if (keyRef && keyRef !== parsed.ref) {
      const prod = KNOWN_PRODUCTION_PROJECT_REFS.includes(keyRef);
      return {
        preview: true,
        allowed: false,
        reason: `${name} belongs to ${prod ? 'the PRODUCTION project' : 'a different project'} than SUPABASE_URL`,
        ref: parsed.ref
      };
    }
  }

  return { preview: true, allowed: true, reason: 'approved preview project', ref: parsed.ref };
}

function enforcePreviewDatabaseGuard({ env = process.env, exit = code => process.exit(code), log = console } = {}) {
  const result = evaluatePreviewDatabaseConfig(env);
  if (!result.preview) return result;
  // Only the project ref (a public identifier) and the reason are logged; never URLs or keys.
  if (result.allowed) {
    log.log(`[PreviewGuard] Preview database approved (ref ${result.ref}).`);
    return result;
  }
  log.error(`[PreviewGuard] REFUSING TO START preview: ${result.reason}${result.ref ? ` (ref ${result.ref})` : ''}.`);
  exit(1);
  return result;
}

module.exports = {
  APPROVED_PREVIEW_PROJECT_REFS,
  KNOWN_PRODUCTION_PROJECT_REFS,
  isPreviewEnvironment,
  projectRefFromUrl,
  evaluatePreviewDatabaseConfig,
  enforcePreviewDatabaseGuard
};

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

/**
 * Builds a stable cache key for a vehicle so repeat lookups
 * (same year/make/model/engine) hit the same row.
 */
function buildVehicleCacheKey({ year, make, model, engine }) {
  return [year, make, model, engine || 'base']
    .map(v => String(v || '').toLowerCase().trim().replace(/\s+/g, '-'))
    .join('|');
}

/**
 * Checks scraped_manuals for a cached result for this vehicle.
 * Returns null on cache miss OR if Supabase isn't configured
 * (never throws - a cache lookup failing should never block a real scrape).
 */
async function getCachedManual(vehicle) {
  if (!supabase) return null;
  const cacheKey = buildVehicleCacheKey(vehicle);

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
    return data || null;
  } catch (err) {
    console.warn('[DB] getCachedManual threw, treating as cache miss:', err.message);
    return null;
  }
}

/**
 * Saves a freshly-scraped manual result so next time the same
 * vehicle is asked about, we hit the cache instead of scraping again.
 * Never throws - a failed cache write should never break the estimate flow.
 */
async function saveScrapedManual(vehicle, manualData) {
  if (!supabase) return null;
  const cacheKey = buildVehicleCacheKey(vehicle);

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

module.exports = { supabase, getCachedManual, saveScrapedManual, buildVehicleCacheKey };
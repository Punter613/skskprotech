const supabase = require('./db');

/**
 * Throws a lightweight query at Supabase to force the container to stay active.
 */
async function pokeSupabase() {
  if (!supabase) {
    console.log('[Keep-Awake] Supabase client not configured. Skipping poke.');
    return;
  }

  try {
    console.log('[Keep-Awake] Sending caffeine shot to Supabase...');
    const startTime = Date.now();

    const { data, error } = await supabase
      .from('_status_check_fallback')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const duration = Date.now() - startTime;
    console.log(`[Keep-Awake] Database responded in ${duration}ms. Supabase is awake!`);
  } catch (err) {
    console.error('[Keep-Awake] Failed to nudge Supabase:', err.message || err);
  }
}

/**
 * Starts an automated interval loop to kick the database every 45 minutes
 */
function startKeepAwakeLoop() {
  if (!supabase) return;

  const FORTY_FIVE_MINUTES = 2700000;

  setTimeout(pokeSupabase, 5000);
  setInterval(pokeSupabase, FORTY_FIVE_MINUTES);
}

module.exports = { startKeepAwakeLoop, pokeSupabase };
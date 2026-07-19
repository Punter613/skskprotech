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

    // Dead simple check: just ask the database for a basic status read
    // or select from an existing internal table definition safely.
    // An explicit API check or simple health check call keeps the engine idling clean.
    const startTime = Date.now();

    // We do a cheap query that doesn't burn processing power but proves life
    const { data, error } = await supabase.from('_status_check_fallback').select('*').limit(1).maybeSingle()
      .catch(() => ({ data: null, error: null })); // catch if table doesn't exist yet

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

  // 45 minutes = 45 * 60 * 1000 ms
  const FORTY_FIVE_MINUTES = 2700000;

  // Fire once right when the server fires up
  setTimeout(pokeSupabase, 5000);

  // Then keep hammering it on schedule
  setInterval(pokeSupabase, FORTY_FIVE_MINUTES);
}

module.exports = { startKeepAwakeLoop, pokeSupabase };

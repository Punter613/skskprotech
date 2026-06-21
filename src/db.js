const { createClient } = require('@supabase/supabase-js');

// 🔌 Hook into your factory system environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let db = null;
if (supabaseUrl && supabaseKey) {
  try {
    db = createClient(supabaseUrl, supabaseKey);
  } catch (initErr) {
    console.error("❌ DB Module failed to initialize Supabase:", initErr.message);
  }
}

module.exports = {
  // 🔍 Reads job status from the ai_jobs table for your frontend polling loop
  getJobById: async (id) => {
    if (!db) throw new Error("Database client not initialized");
    try {
      const { data, error } = await db
        .from('ai_jobs')
        .select('id, status, payload, result, created_at, finished_at')
        .eq('id', id)
        .maybeSingle(); // Returns the record or null safely if it doesn't exist

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[DB Query Error - getJobById]:', err.message);
      throw err;
    }
  },

  // 📝 Saves links pulled from your manual scraping operations
  insertScrapeItem: async (item) => {
    if (!db) return;
    try {
      const { error } = await db
        .from('scrape_items')
        .upsert({
          id: item.id,
          keyword: item.keyword,
          vin: item.vin,
          title: item.title,
          url: item.url,
          source: item.source,
          snippet: item.snippet,
          fitment: item.fitment,
          raw_meta: item.raw_meta,
          scraped_at: item.scraped_at
        }, { onConflict: 'url', ignoreDuplicates: true }); // Avoid duplicate key errors

      if (error) console.error('[DB Scrape Insertion Failure]:', error.message);
    } catch (err) {
      console.error('[DB Scrape Insertion Failure]:', err.message);
    }
  },

  // 📥 Logs a brand new estimate token transaction into the queue
  insertJob: async (job) => {
    if (!db) return;
    try {
      const { error } = await db
        .from('ai_jobs')
        .insert({
          id: job.id,
          type: job.type,
          payload: job.payload,
          status: 'queued',
          created_at: job.created_at
        });

      if (error) console.error('[DB Job Insertion Failure]:', error.message);
    } catch (err) {
      console.error('[DB Job Insertion Failure]:', err.message);
    }
  },

  // 💾 Saves the final completed AI estimation summary data back to Supabase
  updateJob: async (id, fields) => {
    if (!db) return;
    try {
      const { error } = await db
        .from('ai_jobs')
        .update({
          status: fields.status,
          result: fields.result,
          finished_at: fields.finished_at
        })
        .eq('id', id);

      if (error) console.error('[DB Job Update Failure]:', error.message);
    } catch (err) {
      console.error('[DB Job Update Failure]:', err.message);
    }
  }
};

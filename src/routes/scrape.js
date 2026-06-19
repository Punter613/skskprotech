const express = require('express');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const router = express.Router();

router.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let db = null;
if (supabaseUrl && supabaseKey) {
  try {
    db = createClient(supabaseUrl, supabaseKey);
    console.log("⚡ Supabase client successfully initialized for scraping cache.");
  } catch (initErr) {
    console.error("❌ Failed to parse Supabase initialization:", initErr.message);
  }
}

router.post('/', async (req, res) => {
  const keyword = String((req.body && req.body.keyword) || '').trim();

  if (!keyword) return res.status(400).json({ error: 'keyword required' });
  if (keyword.length > 200) return res.status(400).json({ error: 'keyword too long' });

  // 🎯 URL ASSEMBLY: Swap out 'lemon-manuals.la/search?q=' with the exact target path if different
  const targetUrl = `https://www.lemon-manuals.la/search?q=${encodeURIComponent(keyword)}`;
  
  // Hand the fully qualified absolute URL down to the Rust nth(1) slot
  const args = [targetUrl];
  
  const binaryPath = path.join(__dirname, '../../bin/lemon_scraper');
  const proc = spawn(binaryPath, args, { timeout: 120000 });

  let out = '';
  let err = '';

  proc.stdout.on('data', d => out += d.toString());
  proc.stderr.on('data', d => err += d.toString());

  proc.on('close', async (code) => {
    if (code !== 0) {
      console.error('scraper error', code, err);
      return res.status(502).json({ error: 'scraper failed', details: err.slice(0, 200) });
    }

    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch (e) {
      console.error('parse error', e, out);
      return res.status(500).json({ error: 'invalid scraper output' });
    }

    const normalized =
      parsed.items?.map(item => ({
        title: String(item.title || ''),
        url: String(item.url || ''),
        price: item.price ?? null,
        meta: item.meta || {},
      })) || [];

    if (normalized.length > 0 && db) {
      const targetDay = new Date().toISOString().slice(0, 10);

      try {
        const { error } = await db
          .from('scrapes')
          .upsert(
            {
              keyword,
              results: normalized,
              created_at: new Date().toISOString(),
            },
            { 
              onConflict: 'keyword,created_day' 
            }
          );

        if (error) {
          console.error('❌ Supabase upsert failed:', error.message);
        } else {
          console.log(`🔄 Saved/Upserted cache for: "${keyword}" on day [${targetDay}]`);
        }
      } catch (dbErr) {
        console.error('⚠️ Critical DB exception caught during cache save:', dbErr);
      }
    }

    return res.json({ keyword, results: normalized });
  });
});

module.exports = router;

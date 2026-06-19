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

// 🎯 ARGUMENT FIX: Accepts both base domain and keyword as distinct elements
function runScraperForUrl(baseDomain, keyword) {
  return new Promise((resolve, reject) => {
    const binaryPath = path.join(__dirname, '../../bin/lemon_scraper');
    
    // 🎯 PASSES BOTH POSITIONAL SLOTS: args[1] = URL, args[2] = Keyword
    const proc = spawn(binaryPath, [baseDomain, keyword], { timeout: 45000 });

    let out = '';
    let err = '';

    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(err || `Exit code ${code}`));
      }
      try {
        const parsed = JSON.parse(out);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Invalid JSON output from scraper: ${e.message}`));
      }
    });

    proc.on('error', (spawnErr) => reject(spawnErr));
  });
}

router.post('/', async (req, res) => {
  const keyword = String((req.body && req.body.keyword) || '').trim();

  if (!keyword) return res.status(400).json({ error: 'keyword required' });
  if (keyword.length > 200) return res.status(400).json({ error: 'keyword too long' });

  const mirrors = [
    'https://lemon-manuals.la',
    'https://lemon-manuals.org.ua',
    'https://lemon-manuals.gy'
  ];

  let scraperData = null;
  let executionError = null;
  let activeMirrorUsed = '';

  for (const baseDomain of mirrors) {
    try {
      console.log(`🔌 Attempting extraction route via: ${baseDomain} looking for "${keyword}"`);
      
      // Feed both pieces of fuel down to the binary wrapper
      scraperData = await runScraperForUrl(baseDomain, keyword);
      activeMirrorUsed = baseDomain;
      break; 
    } catch (err) {
      console.warn(`⚠️ Line failover tripped on ${baseDomain}: ${err.message}. Rotating lines...`);
      executionError = err;
    }
  }

  if (!scraperData) {
    return res.status(502).json({
      error: 'All distributed scraper mirrors failed to respond',
      details: executionError ? executionError.message : 'Unknown network failure'
    });
  }

  const normalized =
    scraperData.items?.map(item => ({
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
          { onConflict: 'keyword,created_day' }
        );

      if (error) {
        console.error('❌ Supabase upsert failed:', error.message);
      } else {
        console.log(`🔄 Saved/Upserted cache for: "${keyword}" on day [${targetDay}] via mirror [${activeMirrorUsed}]`);
      }
    } catch (dbErr) {
      console.error('⚠️ Critical DB exception caught during cache save:', dbErr);
    }
  }

  return res.json({ keyword, mirror: activeMirrorUsed, results: normalized });
});

module.exports = router;

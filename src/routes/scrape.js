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
    console.log("⚡ Supabase client initialized for deduplicated records.");
  } catch (initErr) {
    console.error("❌ Failed to initialize Supabase:", initErr.message);
  }
}

router.post('/', async (req, res) => {
  const url = String(req.body.url || '').trim();
  const keyword = String(req.body.keyword || 'specifications').trim();

  if (!url) return res.status(400).json({ error: 'url required' });
  if (url.length > 500) return res.status(400).json({ error: 'url too long' });

  const isValidMirror = 
    url.includes('lemon-manuals.la') || 
    url.includes('lemon-manuals.org.ua') || 
    url.includes('lemon-manuals.gy');

  if (!isValidMirror) {
    return res.status(400).json({ error: 'URL must belong to a verified lemon-manuals mirror domain' });
  }

  const binaryPath = path.join(__dirname, '../../bin/lemon_scraper');
  const args = [url];
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
      return res.status(500).json({ error: 'invalid scraper output layout' });
    }

    // Safely handles both flat text string arrays and structured object arrays
    const normalized = (parsed.items || parsed.matches || []).map(item => {
      if (typeof item === 'string') {
        return {
          title: item,
          url: parsed.url || url,
          price: null,
          meta: { extracted_at: new Date().toISOString() }
        };
      }
      return {
        title: item.title || '',
        url: item.url || parsed.url || url,
        price: item.price || null,
        meta: item.meta || { extracted_at: new Date().toISOString() }
      };
    });

    // 🎯 THE COMPOSITE FILTER: Only deduplicates if BOTH URL and Title are identical carbon copies
    const deduped = normalized.filter(
      (item, index, self) => index === self.findIndex(t => t.url === item.url && t.title === item.title)
    );

    if (deduped.length > 0 && db) {
      try {
        await db
          .from('scrapes')
          .insert({
            keyword: `URL_CRAWL - ${keyword}`,
            results: deduped,
            result_count: deduped.length,
            source: 'lemon_scraper_directory',
            created_at: new Date().toISOString()
          });
        console.log(`🔄 Saved ${deduped.length} unique deduplicated manual records to Supabase.`);
      } catch (dbErr) {
        console.error('⚠️ DB insertion exception caught during log update:', dbErr);
      }
    }

    return res.json({ 
      url: parsed.url || url,
      duration_ms: parsed.duration_ms || 0,
      results: deduped 
    });
  });
});

module.exports = router;

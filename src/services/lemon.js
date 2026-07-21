const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getCachedManual, saveScrapedManual } = require('../db');

/**
 * Invokes the Rust-based LEMON manual scraper for deep factory documentation.
 * Checks the database cache first - only actually scrapes on a cache miss,
 * then stores the fresh result so the same vehicle doesn't get re-scraped
 * next time. This is the foundation for the self-learning knowledge base:
 * the more vehicles get looked up, the more the cache covers, the less
 * scraping is needed over time.
 */
async function scrapeLEMONManuals(vehicle) {
  if (!vehicle || !vehicle.make || !vehicle.year || !vehicle.model) {
    return { items: [], error: 'Insufficient vehicle data for scraping' };
  }

  const cached = await getCachedManual(vehicle);
  if (cached && cached.data) {
    console.log(`[Scraper] Cache HIT for ${vehicle.year} ${vehicle.make} ${vehicle.model} - skipping live scrape`);
    return { ...cached.data, fromCache: true, cachedAt: cached.scraped_at };
  }

  console.log(`[Scraper] Cache MISS for ${vehicle.year} ${vehicle.make} ${vehicle.model} - scraping live`);
  const freshResult = await scrapeLive(vehicle);

  // Only cache genuinely successful scrapes - never cache an error/empty result,
  // or a bad scrape would get "stuck" and keep serving nothing forever.
  if (freshResult && !freshResult.error && freshResult.items?.length > 0) {
    await saveScrapedManual(vehicle, freshResult);
  }

  return { ...freshResult, fromCache: false };
}

/**
 * The actual live scrape - unchanged from before, just extracted so the
 * cache-check wrapper above can sit in front of it cleanly.
 */
async function scrapeLive(vehicle) {
  return new Promise((resolve) => {
    // Construct the target URL for lemon-manuals.la
    // Example: https://lemon-manuals.la/Hyundai/2005/Tucson%20V6-2.7L/Repair%20and%20Diagnosis/
    const make = encodeURIComponent(vehicle.make);
    const year = encodeURIComponent(vehicle.year);
    const model = encodeURIComponent(vehicle.model);
    const engine = vehicle.engine ? encodeURIComponent(vehicle.engine.replace(/\s+/g, '-')) : '';

    const baseUrl = `https://lemon-manuals.la/${make}/${year}/${model}${engine ? '-' + engine : ''}/Repair%20and%20Diagnosis/`;

    // Path to the Rust scraper binary
    const scraperPath = path.join(process.cwd(), 'tools', 'lemon_scraper', 'target', 'release', 'lemon_scraper');

    // Check if binary exists, fallback to cargo run if not (for dev)
    let command = `"${scraperPath}" "${baseUrl}"`;
    if (!fs.existsSync(scraperPath)) {
      console.warn('[Scraper] Release binary not found at', scraperPath, '- Falling back to cargo run');
      const projectRoot = path.join(process.cwd(), 'tools', 'lemon_scraper');
      command = `cd "${projectRoot}" && cargo run --release -- "${baseUrl}"`;
    }

    exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Scraper Error]:', error.message);
        return resolve({ items: [], error: error.message });
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (parseErr) {
        console.error('[Scraper Parse Error]: Failed to parse scraper output as JSON');
        // If it failed to parse, might be because of cargo output or other logs
        // Try to find the JSON part
        const jsonMatch = stdout.match(/\{"items":.*\}/);
        if (jsonMatch) {
          try {
            return resolve(JSON.parse(jsonMatch[0]));
          } catch (e) {}
        }
        resolve({ items: [], error: 'Failed to parse scraper output' });
      }
    });
  });
}

module.exports = { scrapeLEMONManuals };

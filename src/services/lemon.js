const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Invokes the Rust-based LEMON manual scraper for deep factory documentation.
 */
async function scrapeLEMONManuals(vehicle) {
  return new Promise((resolve) => {
    if (!vehicle || !vehicle.make || !vehicle.year || !vehicle.model) {
      return resolve({ items: [], error: 'Insufficient vehicle data for scraping' });
    }

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

const util = require('util');
const exec = util.promisify(require('child_process').exec);

async function scrapeLEMONManuals(vehicleInfo) {
  try {
    if (!vehicleInfo || !vehicleInfo.make || !vehicleInfo.model) {
      console.warn(`⚠️ [Scraper Bypass]: Incomplete vehicle info`);
      return null;
    }

    const { make, year, model, engine } = vehicleInfo;

    // Format make to Title Case (e.g., "HYUNDAI" -> "Hyundai")
    const formattedMake = make.charAt(0).toUpperCase() + make.slice(1).toLowerCase();

    let engineString = engine || '';
    if (engineString && !engineString.toUpperCase().startsWith('V') && engineString.includes('2.7')) {
      engineString = `V6-${engineString}`;
    }

    const modelEnc = encodeURIComponent(model);
    const engineEnc = engineString ? encodeURIComponent(engineString) : '';
    const vehiclePath = engineEnc ? `${modelEnc}%20${engineEnc}` : modelEnc;
    const baseURL = `https://lemon-manuals.la/${formattedMake}/${year}/${vehiclePath}/Repair%20and%20Diagnosis/`;

    console.log(`🔗 Scraper triggering for: ${baseURL}`);

    // ✅ FIX: Use absolute path for Render
    const scraperPath = process.env.LEMON_SCRAPER_PATH || './tools/lemon_scraper/target/release/lemon_scraper';
    const { stdout, stderr } = await exec(`${scraperPath} "${baseURL}"`);

    if (stderr) console.error('⚠️ [Scraper Warning]:', stderr);
    
    // Parse output - handle empty results
    const parsed = JSON.parse(stdout);
    if (!parsed.items || parsed.items.length === 0) {
      console.warn('⚠️ [Scraper Warning]: No items found');
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('❌ [Scraper Pipeline Error]:', err.message);
    return null;
  }
}

module.exports = { scrapeLEMONManuals };

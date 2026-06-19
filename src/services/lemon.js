const util = require('util');
const exec = util.promisify(require('child_process').exec);

async function scrapeLEMONManuals(vin) {
  try {
    const decodeResponse = await fetch('http://localhost:10000/api/estimateHeuristic/decode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin })
    });
    
    if (!decodeResponse.ok) throw new Error('VIN decoding failed');
    const { make, year, model, engine } = await decodeResponse.json();
    
    if (!make || !model) {
      console.warn(`⚠️ [Scraper Bypass]: Incomplete vehicle info for VIN ${vin}`);
      return null;
    }

    const modelEnc = encodeURIComponent(model);
    const engineEnc = engine ? encodeURIComponent(engine) : '';
    
    const vehiclePath = engineEnc ? `${modelEnc}%20${engineEnc}` : modelEnc;
    const baseURL = `https://lemon-manuals.la/${make.toLowerCase()}/${year}/${vehiclePath}/Repair%20and%20Diagnosis/`;
    
    console.log(`🔗 Backend triggering lemon_scraper for: ${baseURL}`);

    const { stdout, stderr } = await exec(`./tools/lemon_scraper/target/release/lemon_scraper "${baseURL}"`);
    
    if (stderr) console.error('⚠️ [Scraper Warning]:', stderr);
    
    return JSON.parse(stdout);
  } catch (err) {
    console.error('❌ [Scraper Pipeline Error]:', err.message);
    return null;
  }
}

module.exports = { scrapeLEMONManuals };

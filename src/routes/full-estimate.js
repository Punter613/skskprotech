const express = require('express');
const router = express.Router();

const { scrapeLEMONManuals } = require('../services/lemon');
const { groqChat } = require('../services/groq');
const { decodeVinNhtsa } = require('../services/vin');
const { extractJSON, uniqueStrings, clampNumber } = require('../services/estimateHelpers');
const { sanitizeEstimate, safeEstimate } = require('../services/estimateSanitizer');
const { findKnowledgeProcedure } = require('../services/procedure_lookup');

function validateRequestBody(body) {
  const allowed = new Set([
    'vin',
    'customerStates',
    'mechanicNotices',
    'obdCodes',
    'laborRate',
    'partsCost',
    'partType',
    'mileage',
    'customer',
    'history'
  ]);

  if (!body || typeof body !== 'object') return 'Request body must be an object';

  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      return `Unexpected field: ${key}`;
    }
  }

  // VIN Hardening: Must be 17 chars and alphanumeric
  if (!body.vin || String(body.vin).trim().length !== 17) return 'Valid 17-character VIN required';
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(body.vin)) return 'VIN contains invalid characters (I, O, Q are not allowed)';

  if (body.customerStates && !Array.isArray(body.customerStates)) return 'customerStates must be an array';
  if (body.mechanicNotices && !Array.isArray(body.mechanicNotices)) return 'mechanicNotices must be an array';
  if (body.obdCodes && !Array.isArray(body.obdCodes)) return 'obdCodes must be an array';
  if (body.history && !Array.isArray(body.history)) return 'history must be an array';

  // Deep array validation
  if (body.customerStates && body.customerStates.some(s => typeof s !== 'string')) return 'All customerStates must be strings';
  if (body.obdCodes && body.obdCodes.some(c => typeof c !== 'string')) return 'All obdCodes must be strings';

  return null;
}

function buildSystemPrompt(laborRate, partsCost, history, manualsContext) {
  const historyList = uniqueStrings(history);
  const historyStr = historyList.length > 0
    ? `FAILED REPAIR HISTORY:${historyList.map(h => `- ${h}`).join('')}CRITICAL RULE: Never suggest any item from FAILED REPAIR HISTORY. Assign 0% likelihood to those components and exclude them from diagnosis.`
    : '';

  return `You are a deterministic automotive diagnostic engine.

Rules:
- Never guess.
- Never include a component listed in FAILED REPAIR HISTORY.
- If data is insufficient, return a conservative fallback-style answer.
- Use only JSON.

Output shape:
{
  "priority": "high|medium|low",
  "diagnosis": "string",
  "estimatedHours": number,
  "laborCost": number,
  "partsCost": number,
  "total": number,
  "repairs": [string],
  "probability": [{"cause":"string","likelihood":number}],
  "knownIssues": [string],
  "repairSteps": [string],
  "proTips": [string],
  "additionalChecks": [string],
  "notes": "string",
  "deductiveReasoning": "string",
  "excludedComponents": [string],
  "recommendedInspection": [string]
}

Constraints:
- laborCost = estimatedHours * ${laborRate}
- total = laborCost + partsCost
- excludedComponents must list all failed repairs
- recommendedInspection must include specific measurements/tests
- If insufficient data, set priority to low and request measurements.

${manualsContext}${historyStr}`;
}

function getPartsEstimate(year, make, model, partType) {
  let basePrice = 50.0;
  const target = String(partType || '').toLowerCase();

  if (target.includes('pad')) basePrice = 35.0;
  else if (target.includes('rotor')) basePrice = 65.0;
  else if (target.includes('plug')) basePrice = 8.5;
  else if (target.includes('oil')) basePrice = 28.0;
  else if (target.includes('gasket')) basePrice = 22.0;
  else if (target.includes('filter')) basePrice = 15.0;
  else if (target.includes('belt')) basePrice = 35.0;
  else if (target.includes('hose')) basePrice = 25.0;
  else if (target.includes('bearing')) basePrice = 45.0;
  else if (target.includes('pump')) basePrice = 55.0;
  else if (target.includes('alternator')) basePrice = 85.0;
  else if (target.includes('starter')) basePrice = 75.0;
  else if (target.includes('axle')) basePrice = 120.0;
  else if (target.includes('joint')) basePrice = 65.0;
  else if (target.includes('arm')) basePrice = 85.0;
  else if (target.includes('converter')) basePrice = 450.0;
  else if (target.includes('gearbox')) basePrice = 350.0;
  else if (target.includes('transmission')) basePrice = 2800.0;

  return [
    {
      tier: 'Economy',
      brand: 'Duralast / Everyday Aftermarket',
      price: parseFloat((basePrice * 0.85).toFixed(2)),
      source: 'Retail Center',
      availability: 'In Stock (Local Store)',
      link: 'https://www.autozone.com',
      eta: 'Immediate Pick-up'
    },
    {
      tier: 'OEM / Factory Spec',
      brand: `${make} Genuine Certified`,
      price: parseFloat((basePrice * 1.4).toFixed(2)),
      source: 'eBay Motors',
      availability: 'Low Inventory',
      link: 'https://www.ebay.com/b/Auto-Parts-Accessories/6028/bn_1853100',
      eta: '2-Day Express Shipping'
    },
    {
      tier: 'Premium Performance',
      brand: 'Brembo / Bosch SevereDuty',
      price: parseFloat((basePrice * 1.95).toFixed(2)),
      source: 'Commercial Supply',
      availability: 'In Stock (Regional Hub)',
      link: 'https://www.napaauto.com',
      eta: 'Same-Day Delivery'
    }
  ];
}

router.post('/', async (req, res) => {
  console.log('FULL ESTIMATE BODY:', req.body);
  const startTime = Date.now();
  const validationError = validateRequestBody(req.body);

  if (validationError) {
    return res.status(400).json({
      success: false,
      error: validationError,
      deductiveReasoning: 'Request validation failed before diagnostic pipeline started'
    });
  }

  const {
    vin,
    customerStates = [],
    mechanicNotices = [],
    obdCodes = [],
    laborRate = 65,
    partsCost = 0,
    partType = '',
    mileage = 0,
    customer = {},
    history = []
  } = req.body;

  const laborRateNum = clampNumber(laborRate, 0);
  const partsCostNum = clampNumber(partsCost, 0);
  const cleanHistory = uniqueStrings(history);
  const logs = [];

  try {
    logs.push('[1/5] Decoding VIN...');
    const vehicle = await decodeVinNhtsa(vin);
    if (!vehicle || !vehicle.make) {
      return res.status(404).json({
        success: false,
        error: 'VIN decode failed - no factory records',
        deductiveReasoning: 'NHTSA database returned no match for this VIN'
      });
    }

    logs.push(`[1/5] OK ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.engine}`);

    logs.push('[2/5] Scraping LEMON manuals...');
    let tsbs = [];
    try {
      const scrapeResult = await scrapeLEMONManuals(vehicle);
      if (scrapeResult?.items?.length) {
        tsbs = scrapeResult.items
          .filter(item => item?.title && item?.url)
          .map(item => ({
            title: item.title,
            url: item.url,
            category: item.title.includes('Bulletin') ? 'TSB'
              : item.title.includes('Diagnostic') ? 'Diagnostic'
              : item.title.includes('Repair') ? 'Repair Procedure'
              : 'Manual'
          }));
        logs.push(`[2/5] OK Found ${tsbs.length} manual pages`);
      } else {
        logs.push('[2/5] WARN No manual pages found');
      }
    } catch (err) {
      logs.push(`[2/5] WARN Scraper failed: ${err.message}`);
    }

    logs.push('[3/5] Generating AI estimate...');
    const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim, vehicle.engine]
      .filter(Boolean)
      .join(' ');

    const manualsContext = tsbs.length > 0
      ? `RELEVANT FACTORY MANUAL SECTIONS:${tsbs.slice(0, 10).map(t => `- ${t.title} (\n${t.url})`).join('')}`
      : '';

    const systemPrompt = buildSystemPrompt(laborRateNum, partsCostNum, cleanHistory, manualsContext);

    const userPrompt = `Vehicle: ${vehicleStr}
VIN: ${vin}
Shop Rate: $${laborRateNum}/hr
OBD Codes: ${obdCodes.join(', ') || 'None'}
Customer Reports: ${customerStates.join(', ') || 'N/A'}
Mechanic Notices: ${mechanicNotices.join(', ') || 'N/A'}
Mileage: ${Number(mileage || 0).toLocaleString()}
${cleanHistory.length ? `Previous Failures: ${cleanHistory.join(', ')}` : ''}`;

    const aiResponse = await groqChat(systemPrompt, userPrompt);
    const rawJson = extractJSON(aiResponse);
    
    if (!rawJson) {
      throw new Error('AI engine failed to yield structured JSON payload');
    }

    logs.push('[4/5] Processing pricing tiers and knowledge lookups...');
    const processedEstimate = sanitizeEstimate(rawJson, laborRateNum, partsCostNum);
    
    // Inject marketplace tier estimations if a partType context exists
    const partsMarketplace = getPartsEstimate(vehicle.year, vehicle.make, vehicle.model, partType || processedEstimate.diagnosis);

    // Look up static service procedures if matching entries exist
    let localProcedure = null;
    try {
      localProcedure = await findKnowledgeProcedure(vehicle.make, processedEstimate.diagnosis || partType);
    } catch (err) {
      console.warn('Procedure metadata lookup skipped:', err.message);
    }

    logs.push('[5/5] Packaging complete package.');
    const durationMs = Date.now() - startTime;

    return res.json({
      success: true,
      metadata: {
        vin,
        vehicle: {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          engine: vehicle.engine,
          trim: vehicle.trim || 'Base'
        },
        durationMs,
        logs
      },
      estimate: processedEstimate,
      partsMarketplace,
      factoryProcedures: localProcedure ? [localProcedure] : [],
      manualReferences: tsbs
    });

  } catch (error) {
    console.error('[Full Estimate Route Exception]', error);
    return res.status(500).json({
      success: false,
      error: 'The diagnostic processing pipeline crashed unexpected.',
      message: error.message,
      logs
    });
  }
});


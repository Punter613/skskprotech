const express = require('express');
const router = express.Router();

// NEW ENGINE LOCATION
const fullEstimate = require('../../../engine/estimate/full-estimate');

router.post('/', async (req, res) => {
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
    
    const result = await fullEstimate(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
(Introduce AI orchestration layer with provider routing and decouple Groq from core pipeline)
  }
});


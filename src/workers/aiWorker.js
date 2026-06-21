const axios = require('axios');
const queue = require('../queue');
const db = require('../db');
const { lookupPart } = require('../services/partsLookup');

queue.process('ai-jobs', async (job) => {
  const dbJobId = job.data.id; 
  const { vin, keyword, fitment, items } = job.data.payload;

  console.log(`[Queue Worker] Commencing background analysis for Job UUID: ${dbJobId}`);

  const fetchPromises = (items || []).map(async (it) => {
    try {
      const html = await axios.get(it.url, { timeout: 4000 }).then(r => r.data);
      return { url: it.url, html };
    } catch (e) {
      return { url: it.url, html: '' };
    }
  });

  const pages = await Promise.all(fetchPromises);

  const extracted = pages.map(p => ({
    url: p.url,
    text: p.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000)
  }));

  let partsMarketContext = "No live commercial distributor parts info detected.";
  try {
    const marketCheck = await lookupPart(keyword);
    if (marketCheck) {
      partsMarketContext = `Verified Market Availability Matrix:\n- Source: ${marketCheck.source}\n- Unit Price: $${marketCheck.price}\n- ETA: ${marketCheck.pickup_eta || marketCheck.shipping_eta}\n- Order URL: ${marketCheck.order_url}`;
    }
  } catch (err) {
    console.log(`[Parts Engine Warning]: Supply channel skipped: ${err.message}`);
  }

  const prompt = `
You are a professional mobile mechanic estimator for SKSK ProTech.
Compile a flawless technical repair blueprint response matching the schema.

Vehicle Profile:
${fitment.year || '2005'} ${fitment.make || 'Hyundai'} ${fitment.model || 'Tucson'} ${fitment.engine || '2.7L'}
VIN: ${vin}
Target Component: ${keyword}

${partsMarketContext}

Scraped Repair Manual Data:
${extracted.map(e => `URL Reference: ${e.url}\nTEXT CAPTURED: ${e.text}`).join('\n\n')}

TASK:
1. Provide step-by-step labor tasks with mechanic hours.
2. List required parts with part numbers and unit prices matching market data.
3. Compute labor hours, labor rate, parts cost, and verified totals.
4. Provide a structural troubleshooting guide checklist.
5. Apply a fitment safety confidence level ranking to every part.

Return a raw JSON object string ONLY. Avoid conversational prose.
`;

  const aiRes = await axios.post(process.env.AI_URL, {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  const estimateOutput = aiRes.data;

  await db.updateJob(dbJobId, {
    status: 'done',
    result: estimateOutput,
    finished_at: new Date().toISOString()
  });

  console.log(`[Queue Worker] Successfully written payload for Job ID: ${dbJobId}`);
  return estimateOutput;
});

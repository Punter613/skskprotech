const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const queue = require('../queue');

function normalizeItem(raw, context) {
  return {
    id: uuidv4(),
    keyword: context.keyword || null,
    vin: context.vin || null,
    title: raw.title || '',
    url: raw.url || '',
    source: raw.url ? new URL(raw.url).hostname : 'unknown_source',
    snippet: raw.meta?.snippet || '',
    fitment: context.fitment || {},
    scraped_at: new Date().toISOString(),
    raw_meta: raw.meta || {}
  };
}

async function persistAndEnqueue(parsed, context) {
  const items = (parsed.items || []).map(r => normalizeItem(r, context));

  // Write crawled factory manual links directly to our audit tables
  for (const it of items) {
    await db.insertScrapeItem(it);
  }

  // Pack our core database tracking ID inside the job description
  const jobPayload = {
    id: uuidv4(), // 🎯 The true PostgreSQL Database tracking UUID
    type: 'generate_estimate',
    payload: {
      vin: context.vin,
      keyword: context.keyword,
      fitment: context.fitment,
      items: items.slice(0, 8)
    },
    created_at: new Date().toISOString()
  };

  // Log job to table and drop it directly down into the Bull Redis lane
  await db.insertJob(jobPayload);
  await queue.add('ai-jobs', jobPayload);

  return { jobId: jobPayload.id, count: items.length };
}

module.exports = { persistAndEnqueue };

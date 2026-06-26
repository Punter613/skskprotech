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
  // Wrap in try/catch so missing tables don't break the estimate flow
  for (const it of items) {
    try {
      await db.insertScrapeItem(it);
    } catch (insertError) {
      // If table doesn't exist, log but continue
      if (insertError.message?.includes('table') && insertError.message?.includes('does not exist')) {
        console.warn('[DB Scrape Insertion Failure]: Could not insert scrape_item (table missing). Continuing estimate flow.', insertError.message);
      } else {
        console.error('[DB Scrape Insertion Error]:', insertError.message);
      }
    }
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
  // Wrap in try/catch so missing ai_jobs table doesn't break the estimate flow
  try {
    await db.insertJob(jobPayload);
  } catch (jobError) {
    if (jobError.message?.includes('table') && jobError.message?.includes('does not exist')) {
      console.warn('[DB Job Insertion Failure]: Could not insert ai_job (table missing). Continuing estimate flow.', jobError.message);
    } else {
      console.error('[DB Job Insertion Error]:', jobError.message);
    }
  }

  // Still add to queue even if DB insert failed
  try {
    await queue.add('ai-jobs', jobPayload);
  } catch (queueError) {
    console.error('[Queue Add Error]:', queueError.message);
  }

  return { jobId: jobPayload.id, count: items.length };
}

module.exports = { persistAndEnqueue };

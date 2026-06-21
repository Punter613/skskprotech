const pool = require('../pool');

module.exports = {
  insertScrapeItem: async (item) => {
    try {
      await pool.query(`
        INSERT INTO scrape_items (id, keyword, vin, title, url, source, snippet, fitment, raw_meta, scraped_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (url) DO NOTHING
      `, [
        item.id, item.keyword, item.vin, item.title, item.url,
        item.source, item.snippet, item.fitment, item.raw_meta, item.scraped_at
      ]);
    } catch (err) {
      console.error('[DB Scrape Insertion Failure]:', err.message);
    }
  },

  insertJob: async (job) => {
    try {
      await pool.query(`
        INSERT INTO ai_jobs (id, type, payload, status, created_at)
        VALUES ($1,$2,$3,'queued',$4)
      `, [job.id, job.type, job.payload, job.created_at]);
    } catch (err) {
      console.error('[DB Job Insertion Failure]:', err.message);
    }
  },

  updateJob: async (id, fields) => {
    try {
      await pool.query(`
        UPDATE ai_jobs SET status=$2, result=$3, finished_at=$4 WHERE id=$1
      `, [id, fields.status, fields.result, fields.finished_at]);
    } catch (err) {
      console.error('[DB Job Update Failure]:', err.message);
    }
  }
};

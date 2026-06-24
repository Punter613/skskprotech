# Agent Instructions for SKSK ProTech

## Database Access
- Use `src/db.js` as the primary interface for Supabase.
- If you need the raw Supabase client, import it from `src/db.js` using `const { supabase } = require('./db')`.
- Do not create new Supabase client instances in other files.

## Testing
- Use `scripts/generate_random_test.js` to run randomized end-to-end tests on the `/api/full-estimate` pipeline.
- Use `tests/testForemanPipeline.js` for AI structure validation.

## Manual Scraping
- The Rust scraper is located in `tools/lemon_scraper`.
- Integration logic is in `src/services/lemon.js`.

## Knowledge Injection
- Add new repair protocols to `src/knowledge/repair.intelligence.library.js` or `src/knowledge/procedure.data.js`.
- Logic for matching procedures is in `src/services/procedure_lookup.js`.

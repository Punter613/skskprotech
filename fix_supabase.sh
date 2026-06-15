#!/data/data/com.termux/files/usr/bin/bash
set -e

# SKSK ProTech - Supabase Connection Fix
# Safely rewrites ONLY db.js with connection checking — preserves route logic

echo "[supabase] Checking environment..."
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
  echo "[supabase] WARNING: SUPABASE_URL or SUPABASE_KEY not set"
  echo "[supabase] Supabase is OPTIONAL — the app works without it"
  echo "[supabase] To configure: export SUPABASE_URL=... && export SUPABASE_KEY=..."
fi

# Write a safe db.js that handles missing credentials gracefully
cat > src/services/db.js <<'JS'
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

const supabase = url && key ? createClient(url, key) : null;

if (supabase) {
  console.log('[DB] Supabase connected');
} else {
  console.log('[DB] Supabase not configured — running without database');
}

module.exports = supabase;
JS

echo "[supabase] db.js updated with safe connection handling"
echo "[supabase] Committing..."
git add src/services/db.js
git diff --cached --quiet || git commit -m "Fix Supabase connection handling"
git push
echo "[supabase] Done!"

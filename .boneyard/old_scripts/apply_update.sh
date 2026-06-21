#!/data/data/com.termux/files/usr/bin/bash
set -e

# SKSK ProTech - Safe Update Script
# This script pulls latest code, installs deps, and restarts

echo "[update] Pulling latest code..."
git pull

echo "[update] Installing dependencies..."
npm install

echo "[update] Checking for .env..."
if [ ! -f .env ]; then
  echo "[update] WARNING: .env not found — copying from .env.example"
  cp .env.example .env
  echo "[update] Please edit .env with your API keys!"
fi

echo "[update] Verifying build..."
node -c server.js
echo "[update] Server syntax OK"

# Check for required env vars
echo "[update] Environment check:"
if [ -f .env ]; then
  grep -q "GROQ_API_KEY" .env && echo "  - GROQ_API_KEY: configured" || echo "  - GROQ_API_KEY: MISSING"
  grep -q "SUPABASE_URL" .env && echo "  - SUPABASE: configured" || echo "  - SUPABASE: optional"
  grep -q "STRIPE_SECRET_KEY" .env && echo "  - Stripe: configured" || echo "  - Stripe: optional (disabled)"
fi

echo "[update] Done! Start server with: npm start"

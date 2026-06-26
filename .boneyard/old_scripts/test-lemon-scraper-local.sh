#!/bin/bash
echo "========================================"
echo "Testing LEMON Scraper (Local Backend)"
echo "========================================"
echo ""

VIN="KM8JN12D05U054423"

echo -e "\n🔍 Step 1: VIN Decode"
curl -sS -X POST http://localhost:3000/api/estimateHeuristic/decode \
  -H "Content-Type: application/json" \
  -d '{"vin":"'"$VIN"'"}' | jq

echo -e "\n📊 Step 2: Generate Estimate with LEMON Manuals"
curl -sS -X POST http://localhost:3000/api/estimateHeuristic \
  -H "Content-Type: application/json" \
  -d '{"vin":"'"$VIN"'","symptoms":"smoke and odor from engine","obdCodes":["P0300","P0171"],"laborRate":65,"partsCost":80}' | jq

echo -e "\n✓ Test complete!"

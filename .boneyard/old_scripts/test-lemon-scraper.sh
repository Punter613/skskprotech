#!/bin/bash
echo "========================================"
echo "Testing LEMON Scraper Integration"
echo "========================================"

VIN="KM8JN12D05U054423"

echo -e "\n🔍 Step 1: VIN Decode"
curl -sS -X POST https://p613-backend.onrender.com/api/estimateHeuristic/decode \
  -H "Content-Type: application/json" \
  -d "{\"vin\":\"$VIN\"}" | jq

echo -e "\n📊 Step 2: Generate Estimate with LEMON Manuals"
PAYLOAD=$(cat <<JSON
{
  "vin": "$VIN",
  "customer": {
    "name": "Brian Shaffer",
    "phone": "3304318104",
    "email": "bshaffer613@gmail.com"
  },
  "laborRate": 65,
  "partsCost": 80,
  "symptoms": "smoke accompanying odor emanating from the engine compartment",
  "mechanicNotices": ["Smells like oil. Valve covers possibly."],
  "obdCodes": ["P0300", "P0171"]
}
JSON
)

curl -sS -X POST https://p613-backend.onrender.com/api/estimateHeuristic \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq

echo -e "\n✓ Test complete!"

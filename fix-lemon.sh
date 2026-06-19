#!/bin/bash
# SKSK ProTech - Complete Lemon Scraper Fix Script
set -e

echo "========================================"
echo "SKSK ProTech - LEMON Scraper Fix"
echo "========================================"
echo ""

# Step 1: Fix lemon.js port (10000 → 3000)
echo "✓ Step 1: Fixing lemon.js port..."
cd ~/skskprotech/src/routes
sed -i 's/localhost:10000/localhost:3000/g' lemon.js
echo "  ✓ lemon.js port fixed to localhost:3000"
echo ""

# Step 2: Rewrite estimate.js with Groq AI call
echo "✓ Step 2: Rewriting estimate.js with Groq AI..."

cat > estimate.js << 'EOFESTIMATE'
const express = require('express');
const router = express.Router();
const { scrapeLEMONManuals } = require('./lemon');
const { groqChat } = require('../services/groq');

router.post('/', async (req, res) => {
  try {
    const { vin, customer, laborRate, partsCost, symptoms, mechanicNotices, obdCodes } = req.body;

    const formattedCodes = Array.isArray(obdCodes) ? obdCodes : [];
    const formattedNotices = Array.isArray(mechanicNotices) ? mechanicNotices : [];

    console.log(`⚡ Processing estimate circuit for VIN: ${vin}`);

    let manualData = null;
    if (vin && vin.length === 17) {
      try {
        manualData = await scrapeLEMONManuals(vin);
      } catch (scrapeErr) {
        console.error('⚠️ [Scraper Bypass]: Continuing without manual data:', scrapeErr.message);
      }
    }

    const aiPrompt = `
Vehicle VIN: ${vin}
Scraped Factory Manual Snippets: ${manualData ? JSON.stringify(manualData) : 'None available'}
Symptoms reported: ${symptoms}
Mechanic Observations: ${formattedNotices.join(', ')}
Active Diagnostic Troubleshooting Codes: ${formattedCodes.join(', ')}

Generate a repair estimate with:
- Priority level (high/medium/low)
- Diagnosis
- Labor cost (based on ${laborRate}/hr)
- Parts cost (${partsCost})
- Total cost
- Repairs needed (array)
- Probability breakdown (cause + likelihood %)
- Known issues to watch for
- Repair procedure (step-by-step)
- Pro tips
- Additional checks
- Notes
- Estimated hours

Return as JSON only.
`;

    const estimateResult = await groqChat(aiPrompt);

    res.status(200).json({
      success: true,
      appliedRustPenalty: !!manualData,
      estimate: estimateResult,
      manuals: manualData
    });

  } catch (error) {
    console.error('❌ [Critical System Backfire]:', error.message);
    res.status(500).json({
      success: false,
      error: 'Estimate generation failed completely.',
      details: error.message
    });
  }
});

module.exports = router;
EOFESTIMATE

echo "  ✓ estimate.js rewritten with Groq AI call"
echo ""

# Step 3: Update test script to use local backend with airtight quoting
echo "✓ Step 3: Updating test script to use local backend..."
cd ~/skskprotech

cat > test-lemon-scraper-local.sh << 'EOFTESTLOCAL'
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
EOFTESTLOCAL

chmod +x test-lemon-scraper-local.sh
echo "  ✓ test-lemon-scraper-local.sh created with sealed JSON payloads"
echo ""

echo "========================================"
echo "✓ All Fixes Complete!"
echo "========================================"

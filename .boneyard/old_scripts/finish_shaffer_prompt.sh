#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================="
echo "🎯 Patching Shaffer Prompt Logic 🎯"
echo "=========================================="

# Use a safe Node replacement routine that reads the file cleanly
node -e '
const fs = require("fs");
let text = fs.readFileSync("src/routes/estimate.js", "utf8");

const oldTarget = "Vehicle Parameters: 2008 Ford F150. Shop Rate: $${laborRate}/hr. Multiplier: ${rustBeltMultiplier}x. Parts Target: $${partsCost}.";

const newTemplate = `Vehicle Parameters: 2008 Ford F150. Shop Rate: $${laborRate}/hr. Multiplier: ${rustBeltMultiplier}x. Parts Target: $${partsCost}.

CRITICAL PROTOCOL REQUIREMENT: If the Pre-Calculated Local Brain Diagnostics returns a "Shaffer Custom Extraction Protocol Required" modifier, you MUST explicitly override standard repair suggestions and instruct the mechanic to list these exact matching steps in the "repairSteps" array:
1. Attempt standard specialty extraction kits.
2. If tools slip, pull off the exhaust manifolds to establish absolute clear alignment.
3. Execute Shaffer Method: Fracture porcelain halfway down, run custom long tap into the fused shroud tip, insert all-thread with a top nut to lock the tap and a middle nut to pull the sleeve clear.
4. Clean the combustion chambers completely through the open manifold access to verify zero debris remains.`;

if (text.includes(oldTarget)) {
  text = text.replace(oldTarget, newTemplate);
  fs.writeFileSync("src/routes/estimate.js", text, "utf8");
  console.log("✅ Estimate route template successfully updated with Shaffer Protocol rules!");
} else if (text.includes("Shaffer Custom Extraction Protocol Required")) {
  console.log("⚠️ Route prompt template is already updated.");
} else {
  console.log("❌ Target placeholder string not found inside estimate.js. Checking file state...");
}
'

# Verify syntax is clear
node -c src/routes/estimate.js

# Sync and blast it live to the main server
git add src/routes/estimate.js
git commit -m "Fix estimate route instruction block to cleanly integrate custom 5.4L Triton extraction steps"
git push

echo "=========================================="
echo "🚀 SUCCESS! Shaffer Protocol Engine is Fully Active! 🚀"
echo "=========================================="

rm finish_shaffer_prompt.sh

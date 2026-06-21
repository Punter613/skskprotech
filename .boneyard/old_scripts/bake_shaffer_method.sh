#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================="
echo "🔧 Immortalizing the Shaffer Extraction Method 🔧"
echo "=========================================="

# 1. Pull down to ensure sync
git pull

# 2. Append the custom 5.4L Triton Spark Plug rule to the mapping array
node -e "
const fs = require('fs');
let content = fs.readFileSync('src/brain/symptom.mapping.js', 'utf8');

const customRule = \`
  {
    keywords: ['triton', '5.4l', 'spark plug', 'stuck', 'plugs'],
    title: 'Ford 3V Triton Spark Plug Fusing & Tip Separation',
    system: 'engine',
    confidence: 'high',
    possibleIssues: [
      'Lower metal shroud/tip separated from plug body and carbon-fused into the cylinder head wall.'
    ],
    appliedModifiers: [
      'Shaffer Custom Extraction Protocol Required',
      'Mandatory Labor Complexity Overhead Added'
    ],
    // Custom payload fields to feed Groq and force your exact procedure layout
    extractionProtocol: {
      phase1: 'Attempt standard specialty tool kits first (Note: High field failure rate due to tolerance issues).',
      phase2: 'If specialty tools fail, remove the exhaust manifolds to gain direct, square alignment and clear working room.',
      phase3: 'Execute Shaffer Method: Crush porcelain halfway to clear a path, run a long custom tap deep into the stuck metal shroud tip, slide down a length of all-thread configured with a dual-nut stack. Use the top nut to lock tight into the sleeve, and tighten the middle nut against a brace to draw the fused shroud straight up and out.',
      cleanup: 'Use open exhaust port accessibility to thoroughly clean and vacuum out any porcelain fragments or carbon grit before head reassembly.'
    }
  },
\`;

// Inject our custom rule right after the opening of the export array
if (!content.includes('Shaffer Custom Extraction Protocol')) {
  content = content.replace('module.exports = [', 'module.exports = [\n' + customRule);
  fs.writeFileSync('src/brain/symptom.mapping.js', content, 'utf8');
  console.log('✅ Shaffer Extraction Method successfully baked into the local brain!');
} else {
  console.log('⚠️ Shaffer Extraction Method already exists in mapping file.');
}
"

# 3. Update the backend prompt engine to explicitly read and format this custom protocol block
node -e "
const fs = require('fs');
let fileText = fs.readFileSync('src/routes/estimate.js', 'utf8');

const updatedPromptTemplate = \`Vehicle Parameters: 2008 Ford F150. Shop Rate: \\\\\${laborRate}/hr. Multiplier: \\\\\${rustBeltMultiplier}x. Parts Target: \\\\\${partsCost}. 

CRITICAL PROTOCOL REQUIREMENT: If the Pre-Calculated Local Brain Diagnostics returns a 'Shaffer Custom Extraction Protocol Required' modifier, you MUST explicitly override standard repair suggestions and instruct the mechanic to list the following steps in the 'repairSteps' array:
1. Attempt standard specialty extraction kits.
2. If tools slip, pull off the exhaust manifolds to establish absolute clear alignment.
3. Execute Shaffer Method: Fracture porcelain halfway down, run custom long tap into the fused shroud tip, insert all-thread with a top nut to lock the tap and a middle nut to pull the sleeve clear.
4. Clean the combustion chambers completely through the open manifold access to verify zero debris remains.\`;

if (!fileText.includes('Shaffer Custom Extraction Protocol Required')) {
  fileText = fileText.replace(/Vehicle Parameters: 2008 Ford F150\..*?\`/s, updatedPromptTemplate + '\`');
  fs.writeFileSync('src/routes/estimate.js', fileText, 'utf8');
  console.log('✅ Estimate route prompt updated to enforce custom extraction steps!');
}
"

# 4. Ship the updates up to main
git add src/brain/symptom.mapping.js src/routes/estimate.js
git commit -m "Bake the Shaffer Extraction Method into 5.4L Triton local diagnostic mapping array and prompt routing templates"
git push

echo "=========================================="
echo "🎉 SUCCESS! Your Custom Field Engineering Is Live! 🎉"
echo "=========================================="

rm bake_shaffer_method.sh

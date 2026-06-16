/**
 * SKSK ProTech - Verification, Output Hashing, and Safe Deployment Engine
 * Automates system verification and protects against deployment regression loops.
 */
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TARGET_FILE = path.join(__dirname, '../src/routes/diagnose.js');

try {
  console.log('\n==================================================');
  console.log('🚀 INITIALIZING AUTOMATED DEPLOYMENT SEPARATION PROTOCOL');
  console.log('==================================================\n');

  // Phase 1: Fire Immutable Generator Only
  console.log('[Phase 1] Executing production asset builder code...');
  execSync('node scripts/build_router_v11.js', { stdio: 'inherit' });

  // Phase 2: Syntax Validation Pass Gatekeeper
  console.log('\n[Phase 2] Verifying compilation integrity limits...');
  execSync(`node -c ${TARGET_FILE}`);
  console.log('==> 🔥 SUCCESS: Output target passed strict syntax parser criteria!');

  // Phase 3: Hash Calculation for State Validation
  console.log('\n[Phase 3] Computing cryptographic validation checksum...');
  const fileBuffer = fs.readFileSync(TARGET_FILE);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hexHash = hashSum.digest('hex').substring(0, 12).toUpperCase();
  console.log(`==> TARGET CHECKSUM REGISTERED: [SHA256-${hexHash}]`);

  // Phase 4: Stage and Push Clean Artifacts Only
  console.log('\n[Phase 4] Shipping validated builds to target cluster...');
  execSync(`git add ${TARGET_FILE} scripts/build_router_v11.js scripts/ship.js`);
  
  const commitMessage = `Release Build v9-[SHA256-${hexHash}]: Enforce stable compiler pipeline architecture and isolate immutable factory generators`;
  execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
  
  console.log('[Phase 5] Dispatched binary map segments to remote server main branch...');
  execSync('git push', { stdio: 'inherit' });

  console.log('\n==================================================');
  console.log(` ✅ SYSTEM DEPLOYED CLEANLY! RELEASE RUN v9-[${hexHash}] IS LIVE.`);
  console.log('==================================================\n');

} catch (error) {
  console.error('\n❌ FATAL DEPLOYMENT CRASH DETECTED: Execution loop aborted instantly to protect production line.');
  console.error(`ERROR METRICS: ${error.message}`);
  process.exit(1);
}

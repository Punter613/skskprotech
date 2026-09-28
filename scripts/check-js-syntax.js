'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['api', 'src', 'scripts', 'tests', 'public/js'];
const files = [];

function walk(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (target.endsWith('.js')) files.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target)) walk(path.join(target, entry));
}

roots.forEach(walk);
files.sort();

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}

if (failed) {
  console.error(`Syntax check failed for ${failed} JavaScript file(s).`);
  process.exit(1);
}
console.log(`Syntax check passed for ${files.length} JavaScript file(s).`);

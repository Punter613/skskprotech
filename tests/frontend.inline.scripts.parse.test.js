'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUBLIC = path.resolve(__dirname, '../public');

function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/\btype\s*=\s*["']?(?!text\/javascript|module["'\s>])/i.test(attrs) && !/type\s*=\s*["']?(text\/javascript)/i.test(attrs)) continue;
    const isModule = /\btype\s*=\s*["']?module/i.test(attrs);
    out.push({ code: match[2], isModule, line: html.slice(0, match.index).split('\n').length });
  }
  return out;
}

for (const file of fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'))) {
  test(`public/${file}: inline scripts parse`, () => {
    const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
    for (const { code, isModule, line } of inlineScripts(html)) {
      if (isModule) continue;
      assert.doesNotThrow(() => new vm.Script(code, { filename: `${file}:${line}` }), `${file} inline script at line ${line}`);
    }
  });
}

test('every public/js file parses', () => {
  const dir = path.join(PUBLIC, 'js');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    if (/^\s*(import|export)\s/m.test(code)) continue;
    assert.doesNotThrow(() => new vm.Script(code, { filename: file }), file);
  }
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','public');
test('served manifest has canonical install metadata and reachable assets',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 assert.equal(m.name,'SKSK ProTech'); assert.equal(m.short_name,'SKSK');
 assert.equal(m.start_url,'/'); assert.equal(m.scope,'/'); assert.equal(m.display,'standalone');
 assert.ok(m.icons.some(i=>i.sizes==='192x192'));
 assert.ok(m.icons.some(i=>i.sizes==='512x512'&&i.purpose==='any'));
 assert.ok(m.icons.some(i=>i.purpose==='maskable'));
 for(const i of m.icons) assert.ok(fs.existsSync(path.join(root,i.src.replace(/^\//,''))),i.src+' must exist in public');
 assert.ok(fs.existsSync(path.join(root,'sw.js')));
});

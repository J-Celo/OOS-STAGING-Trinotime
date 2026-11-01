import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const longToken=['sta','ging'].join('');
const shortToken=['s','t','g'].join('');
const forbiddenLong=new RegExp(longToken,'i');
const forbiddenShort=new RegExp(`\\b${shortToken}\\b`,'i');

function walk(dir){
  const out=[];
  for(const name of fs.readdirSync(dir)){
    if(name==='node_modules'||name==='.git')continue;
    const full=path.join(dir,name);const st=fs.statSync(full);
    if(forbiddenLong.test(name)||forbiddenShort.test(name))throw new Error(`Release filename contains a non-production channel token: ${path.relative(root,full)}`);
    if(st.isDirectory())out.push(...walk(full));else out.push(full);
  }
  return out;
}
for(const file of walk(root)){
  if(/\.(png|jpe?g|webp|ico|zip)$/i.test(file))continue;
  const text=fs.readFileSync(file,'utf8');
  if(forbiddenLong.test(text)||forbiddenShort.test(text))throw new Error(`Release text contains a non-production channel token: ${path.relative(root,file)}`);
}
const config=read('wrangler.jsonc');
assert(config.includes('"name": "oostrinotime"'));
assert(config.includes('"DEPLOYMENT_ENV": "production"'));
assert(config.includes('"FIREBASE_PROJECT_ID": "cwh-timeclock"'));
assert(config.includes('"bucket_name": "trinotime-chat-files"'));
const version=json('public/version.json'),manifest=json('public/manifest.json');
assert.equal(version.production_release,true);assert.equal(manifest.production_release,true);
assert.equal(version.build_fingerprint,'TT-2.0.3-SHIFT-METRICS-M2.9.5-PRODUCTION-20261007');
assert.equal(manifest.build_fingerprint,version.build_fingerprint);
for(const file of ['src/worker.js','src/deployment-guard.js','public/assets/js/j-b52f8ff97ca5.js','public/assets/js/j-agent-metrics-rc22.js','public/assets/js/j-confirmation-dashboard-rc21.js','public/assets/js/j-tracker-download-rc33.js']){
  const r=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});if(r.status!==0)throw new Error(`${file} syntax check failed:\n${r.stderr||r.stdout}`);
}
for(const file of ['tracker/coverage-background.js','tracker/confirmation-background.js','tracker/coverage.js','tracker/confirmation.js','tracker/popup.js']){
  const full=path.join(root,'..',file);const r=spawnSync(process.execPath,['--check',full],{encoding:'utf8'});if(r.status!==0)throw new Error(`${file} syntax check failed:\n${r.stderr||r.stdout}`);
}
console.log('PASS production preflight: channel cleanup, production resources, release metadata, and JavaScript syntax');

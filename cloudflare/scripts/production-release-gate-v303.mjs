// TrinoTime OOS v3.0.4 owner-controlled production source gate.
// Runs without network/deployments, reads no live employee records, and never writes Firebase.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=(p)=>readFileSync(resolve(root,p),'utf8');
const cfg=JSON.parse(read('wrangler.jsonc'));
const ver=JSON.parse(read('public/version.json'));
const app=JSON.parse(read('public/manifest.json'));
const ext=JSON.parse(read('../tracker/manifest.json'));
const html=read('public/index.html'),worker=read('src/worker.js');
assert.equal(cfg.name,'oostrinotime');
assert.equal(cfg.vars?.DEPLOYMENT_ENV,'production');
assert.equal(cfg.vars?.FIREBASE_PROJECT_ID,'cwh-timeclock');
assert.equal(cfg.r2_buckets?.find(b=>b.binding==='CHAT_FILES')?.bucket_name,'trinotime-chat-files');
assert.equal(cfg.triggers?.crons?.length??0,0,'Automatic production sync must remain disabled');
assert.equal(ver.version,'3.0.4');
assert.equal(app.version,'3.0.4');
assert.equal(ver.build_fingerprint,app.build_fingerprint);
assert.match(ver.build_fingerprint,/^TT-3\.0\.4-PRODUCTION-UX18P46-/);
assert(html.includes(ver.build_fingerprint));
assert(worker.includes(ver.build_fingerprint));
assert(html.includes('meta name="trinotime-release-status" content="production"'));
assert(!existsSync(resolve(root,'wrangler.staging.jsonc')),'No staging Wrangler configuration');
assert(!existsSync(resolve(root,'../firebase.json')),'No Firebase rules deploy configuration');
assert(!existsSync(resolve(root,'../tracker-cws-v2.3.4')),'No obsolete Tracker source archive');
assert(!cfg.vars?.TT_GOOGLE_SHEETS_MANUAL_SYNC_ENABLED);
assert(worker.includes("if(env.DEPLOYMENT_ENV==='production') throw Error('PRODUCTION_SHEETS_HARD_HOLD')"));
assert(worker.includes("fail(409,'PRODUCTION_SHEETS_HARD_HOLD'"));
assert(!/oostrinotime-staging-qa\.trinoadmin\.workers\.dev|trinotime-staging-qa/i.test(html+read('wrangler.jsonc')));
assert(!/TrinoTime-QC-Tracker-v2\.2\./.test(html+worker));
assert(!/j-staging-pilot-reliability-ux12\.js|j-staging-dashboard-freshness-ux9\.js/.test(html));
assert(!/c-staging-brand-icon-ux17p2\.css/.test(html));
assert(html.includes("c-production-agent-layout-ux18p10.css"));
assert(!/tt-staging-freshness|TrinoTimeStagingFreshness/.test(html));
assert.deepEqual(ext.content_scripts[1]?.matches,['https://oos.trinotime.com/*']);
assert.equal(ext.version,'2.3.10');
assert(ext.host_permissions.includes('https://oos.trinotime.com/*'));
assert(!JSON.stringify(ext).includes('staging-qa'));
const bytes=readFileSync(resolve(root,'public/downloads/TrinoTime-QC-Tracker-v2.3.10.zip'));
const sha=createHash('sha256').update(bytes).digest('hex');
const meta=JSON.parse(read('public/downloads/qc-tracker-current.json'));
assert.equal(meta.channel,'production');assert.equal(meta.version,ext.version);assert.equal(meta.sha256,sha);
assert(worker.includes(sha));
for(const asset of ['assets/css/c-brand-icon-ux17p2.css','assets/css/c-coaching-side-ux8.css',
 'assets/js/j-pilot-reliability-ux12.js','assets/js/j-dashboard-freshness-ux9.js', 'assets/css/c-production-agent-layout-ux18p10.css']){
 assert(existsSync(resolve(root,'public',asset)),`Missing production feature asset ${asset}`);
 assert(html.includes(asset),`Production feature asset not loaded: ${asset}`);
}
assert(html.includes('assets/js/j-unified-smart-floating-dock-v2.js'));
assert(!html.includes('j-staging-smart-floating-dock-v2.js'));
for(const activeFile of ['public/assets/js/j-pilot-reliability-ux12.js','public/assets/js/j-dashboard-freshness-ux9.js',
'public/assets/js/j-5a9b0d9aeabc.js','public/assets/js/j-1e287a103932.js']){
 const content=read(activeFile);
 assert(!/oostrinotime-staging-qa\.trinoadmin\.workers\.dev/.test(content),`Staging endpoint in ${activeFile}`);
}
console.log('PASS production release gate v3.0.4: production identity, Firebase/R2, Sheets hard hold,\n      role-scoped feature assets, no staging config/endpoints, Tracker v2.3.10 download SHA');
console.log('HOLD: deployment, real production accounts and live Tracker acknowledgment remain owner-controlled and unverified.');

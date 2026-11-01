// No-network release-candidate validation only; NEVER deploys or uses workforce data.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const dir=resolve(import.meta.dirname,'..');
const read=(p)=>readFileSync(resolve(dir,p),'utf8');
const worker=read('src/worker.js'),html=read('public/index.html');
const conf=JSON.parse(read('wrangler.jsonc'));
assert.equal(conf.name,'oostrinotime');
assert.equal(conf.vars.DEPLOYMENT_ENV,'production');
assert.equal(conf.vars.FIREBASE_PROJECT_ID,'cwh-timeclock');
assert.equal(conf.r2_buckets?.find(b=>b.binding==='CHAT_FILES')?.bucket_name,'trinotime-chat-files');
assert.ok(!conf.triggers?.crons?.length,'Production candidate must not have automatic cron');
assert.ok(!conf.vars.TT_GOOGLE_SHEETS_MANUAL_SYNC_ENABLED,'Production manual write flag must be OFF');
for(const route of ['/api/workforce/store-plans/*','/api/workforce/store-exports/*','/api/workforce/workspace-read','/api/workforce/login-directory','/api/workforce/login-directory/*'])
 assert.ok(conf.assets.run_worker_first.includes(route),'Worker route missing '+route);
for(const ep of ['/api/workforce/store-plans/','/api/workforce/store-exports/','/api/workforce/login-directory','/api/workforce/workspace-read'])
 assert.ok(worker.includes(ep),'Backend handler missing '+ep);
assert.ok(worker.includes("fail(409,'PRODUCTION_SHEETS_HARD_HOLD'"),'Google sync must be hard blocked');
assert.ok(worker.includes("if(env.DEPLOYMENT_ENV==='production') throw Error('PRODUCTION_SHEETS_HARD_HOLD')"));
assert.ok(worker.includes('async function handleStoreOpsExportApi'));
for(const f of ['assets/js/j-staging-store-operations-hub-v1.js','assets/js/j-staging-store-export-sync-v1.js',
  'assets/js/j-staging-compact-workspaces-v1.js','assets/js/j-store-plan-manager-phase1.js',
  'assets/js/j-store-queue-core-phase1.js']){
 assert.ok(existsSync(resolve(dir,'public',f)),f+' missing');
 assert.ok(html.includes(f),f+' not referenced in UI');
}
const t=JSON.parse(readFileSync(resolve(dir,'../tracker/manifest.json'),'utf8'));
assert.equal(t.version,'2.3.10');
assert.equal(t.name,'TrinoTime QC Tracker');
assert.ok(t.host_permissions.includes('https://oos.trinotime.com/*'));
assert.ok(!t.host_permissions.some(x=>x.includes('staging-qa')));
const report=JSON.parse(read('public/downloads/qc-tracker.json'));
const zip=readFileSync(resolve(dir,'public/downloads/TrinoTime-QC-Tracker-v2.3.10.zip'));
assert.equal(report.sha256,createHash('sha256').update(zip).digest('hex'));
assert.equal(report.environment,'PRODUCTION');
assert.ok(!existsSync(resolve(dir,'wrangler.staging.jsonc')),'Staging deploy config must not ship');
assert.ok(!existsSync(resolve(dir,'../firebase.json')),'No automatic Firebase Rules deployment config');
console.log('PASS — full staging Store Operations UI/routes + production identity + Google hard hold + staging-feature tracker (source-only)');
console.log('HOLD — real production account / browser / chat / attendance acceptance not verified');

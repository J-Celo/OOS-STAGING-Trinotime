/** Offline regression: staging Google Sheets pilot must be explicitly enabled.
 * No Google/Firebase calls, no real employee data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const load=path=>fs.readFileSync(fileURLToPath(new URL(path,import.meta.url)),'utf8');
const worker=load('../src/worker.js');
const cfg=JSON.parse(load('../wrangler.staging.jsonc'));
assert.equal(cfg.name,'oostrinotime-staging-qa');
assert.equal(cfg.vars.DEPLOYMENT_ENV,'staging');
assert.equal(cfg.vars.FIREBASE_PROJECT_ID,'trinotime-staging-qa');
assert.equal(cfg.r2_buckets.find(v=>v.binding==='CHAT_FILES')?.bucket_name,'trinotime-chat-files-staging');
assert(cfg.assets.run_worker_first.includes('/api/workforce/store-exports/*'));
assert(!JSON.stringify(cfg).includes('TT_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON'),'Credentials must not appear in tracked config');

const start=worker.indexOf('async function handleStoreOpsExportApi(');
const end=worker.indexOf('// END TT_STORE_OPS_EXPORT_V1',start);
assert(start>0&&end>start);
const source=worker.slice(start,end);
let writes=0, snapshots=0;
const fake={
  URL,Request,console,
  fail:(status,code,message)=>{const err=new Error(message);err.code=code;err.status=status;throw err;},
  json:value=>value,
  assertDeploymentIsolationServer:()=>{},
  storePlanManagerServer:async()=>({role:'team_leader',name:'Fixture TL',pod:'pod-A',uid:'test-uid'}),
  storePlanPodTargetServer:async(_env,_actor,pod)=>({pod,podLabel:'Fixture POD'}),
  googleConfigured:(env)=>Boolean(env.creds),
  sheetUrl:()=> 'https://docs.google.com/spreadsheets/d/test/example',
  firebaseAdminGet:async()=>null,
  storeSheetStatusPath:()=>'/testing',
  coverageDateKeyServer:x=>x,
  storeOpsTodayIsoServer:()=> '2026-10-18',
  enforceRate:()=>{},
  parseBody:async()=>({pod:'pod-A'}),
  storeOpsSnapshotServer:async()=>{snapshots++;return {pod:'pod-A',date:'2026-10-18',performance:{jobRowsTruncated:false}};},
  storeOpsSyncSheetServer:async()=>{writes++;return {syncedAt:'test',rows:{Overview:1}};},
  podSheetMap:()=>({'pod-A':'1abcdefghijklmnopqrstuvwxyZABCDEFGHIJ'}),
};
vm.createContext(fake);
vm.runInContext(source+'\nglobalThis.exports={api:handleStoreOpsExportApi,cron:scheduledStoreSheetsSync};',fake);
const uri=route=>new URL('https://staging.test/api/workforce/store-exports'+route);
async function status(env){return fake.exports.api({method:'GET'},env,uri('/status?pod=pod-A'));}
async function sync(env){return fake.exports.api({method:'POST'},env,uri('/sync-now?pod=pod-A'));}
const base={DEPLOYMENT_ENV:'staging',creds:true,TT_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON:'configured',TT_GOOGLE_SHEETS_POD_MAP_JSON:'configured'};
let s=await status(base);assert.equal(s.configured,true);assert.equal(s.manualEnabled,false);assert.equal(s.automaticEnabled,false);
await assert.rejects(sync(base),{code:'STORE_SHEET_PILOT_NOT_APPROVED'});assert.equal(writes,0);assert.equal(snapshots,0);
await fake.exports.cron({},base,{});assert.equal(writes,0);
const manual={...base,TT_GOOGLE_SHEETS_MANUAL_SYNC_ENABLED:'approved'};
s=await status(manual);assert.equal(s.manualEnabled,true);assert.equal(s.automaticEnabled,false);
await sync(manual);assert.equal(writes,1);
await fake.exports.cron({},manual,{});assert.equal(writes,1);
const cron={...manual,TT_GOOGLE_SHEETS_CRON_ENABLED:'approved'};
s=await status(cron);assert.equal(s.automaticEnabled,true);
const absent={...cron,DEPLOYMENT_ENV:'production'};
await fake.exports.cron({},absent,{});assert.equal(writes,1,'production cron must not send staging data');

const begin=worker.indexOf('async function storeOpsSyncSheetServer(');
const stop=worker.indexOf('async function handleStoreOpsExportApi(',begin);
assert(begin>0&&stop>begin);
const checkCtx={
 fail:fake.fail,storeSheetStatusPath:()=>'/testing',
 writePodSheet:async()=>{throw Error('must not call Google when report is truncated')},
 firebaseAdminGet:async()=>null,
 firebaseAdminSet:async()=>{throw Error('must not write status for truncated report')},
};
vm.createContext(checkCtx);
vm.runInContext(worker.slice(begin,stop)+'\nglobalThis.sync=storeOpsSyncSheetServer;',checkCtx);
await assert.rejects(checkCtx.sync({}, {pod:'pod-A',performance:{jobRowsTruncated:true}}),{code:'STORE_SHEET_PARTIAL_REPORT'});
const {podSheetMap,snapshotTables}=await import('../src/store-ops-google-core.js');
const id1='1abcdefghijklmnopqrstuvwxyZABCDEFGHIJ',id2='1zyxwvutsrqponmlkjihgfedcbaABCDEFGHIJKL';
assert.deepEqual(Object.entries(podSheetMap({TT_GOOGLE_SHEETS_POD_MAP_JSON:JSON.stringify({'pod-A':id1,'pod-B':id2})})).map(x=>x[0]),['pod-A','pod-B']);
assert.throws(()=>podSheetMap({TT_GOOGLE_SHEETS_POD_MAP_JSON:JSON.stringify({'pod-A':id1,'pod-B':id1})}),/must not be shared/);
const tabs=snapshotTables({podLabel:'Fixture POD',date:'2026-10-18',period:'7d',generatedAt:'fixture',performance:{jobs:[{date:'2026-10-18',storeName:'=bad',jobId:'J1',agent:'Fixture Agent'}],stores:[],trends:[]},queue:{entries:[]},dispatch:{}});
assert.equal(tabs['Job Ledger'][1][2],"'=bad",'spreadsheet formula payload is escaped');
assert.deepEqual(Object.keys(tabs),['Overview','Store Queue','Store Performance','Job Ledger','History']);
assert(load('../public/assets/js/j-staging-store-export-sync-v1.js').includes('sync.disabled=d.manualEnabled!==true'));
console.log('PASS — Google Sheets per-POD mapping, secure opt-in, manual vs Cron gating, production isolation, partial-ledger refusal, formula escaping, Worker-first routing, and UI opt-in.');

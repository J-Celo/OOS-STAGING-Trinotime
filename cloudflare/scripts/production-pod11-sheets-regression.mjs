// Offline, no-network regression tests for the production-only OOS POD 11 pilot.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRc2StoreExportsApi } from '../src/rc2-store-exports-api.js';
import { podSheetMap, podSheetEnabled, podSheetUrl, snapshotTables } from '../src/rc2-google-sheets-pod.js';
const SHEET='12vO25JLIIIRTBo8tIJaHQzrJOZJz3V89g9MB9sfGrgo';
const mapping=JSON.stringify({'POD 11':SHEET});
const base={DEPLOYMENT_ENV:'production',TT_GOOGLE_SHEETS_POD_MAP_JSON:mapping,
  TT_GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON:'offline-test-no-credentials'};
const approved={...base,TT_PRODUCTION_POD11_RELEASE_APPROVED:'approved',
  TT_GOOGLE_SHEETS_MANUAL_SYNC_ENABLED:'approved'};
let actor={uid:'admin1',role:'admin',name:'Administrator',pod:''};
let jobPod='POD 11',writes=0,writerCalls=0,reads=0,checks=0,changeTL=false,revokeTL=false;
const roster={entries:{
  p11:{role:'agent',name:'Agent Eleven',pod:'POD 11',active:true,podLabel:'POD 11'},
  p10:{role:'agent',name:'Agent Ten',pod:'POD 10',active:true,podLabel:'POD 10'},
  albertsons:{role:'agent',name:'Albertsons Agent',pod:'Albertsons · POD 11',active:true}
}};
const storage=new Map();
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code})};
const deps={
  requireWorkforceAttendanceActor:async()=>actor,
  canonicalWorkforceMemberServer:async()=>({role:revokeTL?'agent':'team_leader',name:actor.name,
    pod:changeTL?'POD 10':actor.pod,active:!revokeTL}),
  canonicalWorkforceAuthorizationRosterServer:async()=>roster,
  fbEncodeKeyServer:value=>Buffer.from(String(value)).toString('base64url'),
  firebaseAdminGet:async(_env,path)=>{reads++;return storage.get(path)||null},
  firebaseAdminSet:async(_env,path,value)=>{writes++;storage.set(path,value)},
  storeIntelReportServer:async(_req,_env,url)=>{
    assert.equal(url.pathname,'/api/workforce/metrics/stores');
    if(actor.role==='admin')assert.equal(url.searchParams.get('pod'),'POD 11');
    else assert.equal(url.searchParams.has('pod'),false);
    return {jobs:[{pod:jobPod,jobId:'JOB_SAFE',submitted:2}],stores:[],trends:[],
      selectedPod:actor.role==='admin'?'POD 11':'',viewer:{pod:actor.pod},
      jobRowsTruncated:false};
  },
  coverageDateKeyServer:date=>date,
  manilaDateKeyServer:()=>'2026-10-18',
  parseBody:request=>request.json(),
  enforceRate:()=>{},
  writePodSheet:async(_env,pod,snapshot)=>{
    writerCalls++;assert.equal(pod,'POD 11');assert.equal(snapshot.pod,'POD 11');
    return {syncedAt:'2026-10-18T12:00:00Z',rows:{Overview:10}};
  },
  fail,json:(value,status=200)=>new Response(JSON.stringify(value),{status})
};
const api=createRc2StoreExportsApi(deps);
function call(path,env=base,method='GET',payload){
  const url=new URL('https://test.invalid/api/workforce/store-exports'+path);
  const opt={method,...(payload?{headers:{'content-type':'application/json'},
    body:JSON.stringify(payload)}:{})};
  return api(new Request(url,opt),env,url);
}
const rejects=(promise,code)=>assert.rejects(promise,error=>error.code===code);
async function test(name,fn){await fn();checks++;console.log('PASS',name)}
await test('POD 11-only mapping and prohibited Albertsons mapping',async()=>{
  assert.deepEqual(Object.keys(podSheetMap(base)),['POD 11']);
  assert.throws(()=>podSheetMap({...base,TT_GOOGLE_SHEETS_POD_MAP_JSON:
    JSON.stringify({'POD 11':SHEET,'Albertsons · POD 11':'A'.repeat(30)})}),/only the verified/);
  assert.throws(()=>podSheetMap({...base,TT_GOOGLE_SHEETS_POD_MAP_JSON:
    JSON.stringify({'POD 11':'A'.repeat(30)})}),/only the verified/);
});
await test('approval, production environment and cron-off gates',async()=>{
  assert.equal(podSheetEnabled(base,'POD 11'),false);
  assert.equal(podSheetEnabled({...approved,TT_GOOGLE_SHEETS_POD_MAP_JSON:''},'POD 11'),true);
  assert.equal(podSheetEnabled({...base,TT_GOOGLE_SHEETS_POD_MAP_JSON:''},'POD 11'),false);
  assert.equal(podSheetEnabled({...approved,DEPLOYMENT_ENV:'staging'},'POD 11'),false);
  assert.equal(podSheetEnabled({...approved,TT_GOOGLE_SHEETS_CRON_ENABLED:'approved'},'POD 11'),false);
  assert.equal(podSheetEnabled(approved,'POD 11'),true);
  assert.equal(podSheetEnabled(approved,'POD 10'),false);
});
await test('Admin may see only the one pilot POD',async()=>{
  const data=await(await call('/pods')).json();
  assert.deepEqual(data.pods.map(p=>p.pod),['POD 11']);
});
await test('Agent, other-POD TL and changed TL denied',async()=>{
  actor={uid:'agent',role:'agent',name:'Agent Eleven',pod:'POD 11'};
  await rejects(call('/pods'),'STORE_PLAN_MANAGER_REQUIRED');
  actor={uid:'tl10',role:'team_leader',name:'Lead Ten',pod:'POD 10'};
  await rejects(call('/pods'),'PRODUCTION_PILOT_POD_SCOPE');
  actor={uid:'tl11',role:'team_leader',name:'Lead Eleven',pod:'POD 11'};
  changeTL=true;await rejects(call('/pods'),'STORE_PLAN_MANAGER_POD_CHANGED');
  changeTL=false;
  revokeTL=true;await rejects(call('/pods'),'STORE_PLAN_MANAGER_POD_CHANGED');
  revokeTL=false;
  const data=await(await call('/pods')).json();assert.equal(data.pods.length,1);
  actor={uid:'admin1',role:'admin',name:'Administrator',pod:''};
});
await test('Admin cannot request another POD or leak its Sheet link',async()=>{
  await rejects(call('/status?pod=POD%2010',approved),'STORE_PLAN_POD_SCOPE_FORBIDDEN');
  await rejects(call('/status?pod=Albertsons%20%C2%B7%20POD%2011',approved),'STORE_PLAN_POD_SCOPE_FORBIDDEN');
  const disabled=await(await call('/status?pod=POD%2011')).json();
  assert.equal(disabled.configured,false);
  assert.equal(disabled.mapped,true);
  assert.equal(disabled.spreadsheetUrl,podSheetUrl(base,'POD 11'));
  // A read-only link needs no Cloudflare mapping setup and cannot enable sync.
  const noMap={...base,TT_GOOGLE_SHEETS_POD_MAP_JSON:''};
  const mapped=await(await call('/status?pod=POD%2011',noMap)).json();
  assert.equal(mapped.mapped,true);
  assert.equal(mapped.configured,false);
  assert.equal(mapped.spreadsheetUrl,podSheetUrl(noMap,'POD 11'));
  assert.equal(podSheetEnabled(noMap,'POD 11'),false);
  const active=await(await call('/status?pod=POD%2011',approved)).json();
  assert.equal(active.spreadsheetUrl,podSheetUrl(approved,'POD 11'));
});
await test('Read-only snapshot rejects cross-POD source rows',async()=>{
  const x=await(await call('/snapshot?pod=POD%2011')).json();
  assert.equal(x.pod,'POD 11');assert.equal(x.performance.jobs[0].pod,'POD 11');
  jobPod='POD 10';
  await rejects(call('/snapshot?pod=POD%2011'),'STORE_SHEET_SCOPE_MISMATCH');
  jobPod='POD 11';
});
await test('Disabled manual sync performs no storage or external writes',async()=>{
  const prior=[reads,writes,writerCalls];
  await rejects(call('/sync-now',base,'POST',{pod:'POD 11'}),'PRODUCTION_POD11_SYNC_HOLD');
  assert.deepEqual([reads,writes,writerCalls],prior);
  await rejects(call('/sync-now',{...approved,TT_PRODUCTION_POD11_RELEASE_APPROVED:''},'POST',
    {pod:'POD 11',TT_PRODUCTION_POD11_RELEASE_APPROVED:'approved'}),'PRODUCTION_POD11_SYNC_HOLD');
});
await test('Production pilot sync is Admin-only, even after approval',async()=>{
  actor={uid:'tl11',role:'team_leader',name:'Lead Eleven',pod:'POD 11'};
  await rejects(call('/sync-now',approved,'POST',{pod:'POD 11'}),'PRODUCTION_POD11_SYNC_HOLD');
  actor={uid:'admin1',role:'admin',name:'Administrator',pod:''};
});
await test('Even fully configured Admin sync is hard-disabled in read-only release',async()=>{
  const before=[reads,writes,writerCalls];
  await rejects(call('/sync-now',approved,'POST',{pod:'POD 11'}),'PRODUCTION_POD11_SYNC_HOLD');
  await rejects(call('/sync-now',{...approved,TT_GOOGLE_SHEETS_CRON_ENABLED:'approved'},'POST',
    {pod:'POD 11'}),'PRODUCTION_POD11_SYNC_HOLD');
  assert.deepEqual([reads,writes,writerCalls],before);
});
await test('Spreadsheet text stays inert',async()=>{
  const table=snapshotTables({pod:'POD 11',date:'2026-10-18',period:'day',
    queue:{entries:[{store:'=INJECT()',order:1,plannedJobs:1,jobIds:[]}]},
    performance:{jobs:[{agent:'-agent',pod:'POD 11'}]},dispatch:{}});
  assert.ok(table['Store Queue'][1][1].startsWith("'="));
  assert.ok(table['Job Ledger'][1][3].startsWith("'-"));
});
await test('Production report viewer is bound, read-only and syntax-valid',async()=>{
  const script=readFileSync(new URL('../public/assets/js/j-production-pod11-reports.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/assets/css/c-production-pod11-reports.css',import.meta.url),'utf8');
  new Script(script,{filename:'j-production-pod11-reports.js'});
  for(const tab of ['Overview','Store Queue','Store Performance','Job Ledger','History'])
    assert.ok(script.includes(tab),'Missing pilot tab: '+tab);
  assert.ok(script.includes('trinotime:store-context'));
  assert.ok(script.includes('current?.panel?.isConnected'),'Must survive Metrics refresh');
  assert.ok(script.includes('X-TT-Metrics-Expected-Role'));
  assert.ok(script.includes('docs\\.google\\.com'));
  assert.ok(!script.includes('/sync-now'),'Pilot UI must not initiate production writes');
  assert.ok(html.includes('j-production-pod11-reports.js'));
  assert.ok(html.includes('c-production-pod11-reports.css'));
  assert.ok(css.includes('.tt-pod11-tabs'));
});
console.log('PASS — '+checks+' production POD 11 synthetic tests; no network and no Google writes');

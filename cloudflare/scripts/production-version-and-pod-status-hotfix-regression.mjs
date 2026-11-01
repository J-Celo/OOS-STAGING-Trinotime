// No-network regression. No Firebase access, no live workforce records.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html'),manifest=JSON.parse(read('../public/manifest.json'));
const version=JSON.parse(read('../public/version.json'));
const sw=read('../public/sw.js'),worker=read('../src/worker.js');
const ui=read('../public/assets/js/j-staging-store-export-sync-v1.js');
assert.equal(version.version,'3.0.4');assert.equal(manifest.version,'3.0.4');
assert.equal(manifest.display_version,'V 3.0.4');
assert.ok(html.includes('meta name="trinotime-display-version" content="3.0.4"'));
assert.ok(html.includes('<title>OOS TrinoTime · V 3.0.4</title>'));
assert.ok(!html.includes('2.0.3'),'Old production version must not be presented as current');
assert.ok(sw.includes("TRINOTIME_SW_VERSION = '3.0.4'"));
for (const val of [html,sw,worker,JSON.stringify(manifest)]) assert.ok(val.includes(version.build_fingerprint));
assert.ok(ui.includes('d.noActiveAgents===true'),'UI must show a safe unavailable-report message');
assert.ok(worker.includes("fail(409,'PRODUCTION_SHEETS_HARD_HOLD'"),'Google writes must be disabled');
const begin=worker.indexOf('async function handleStoreOpsExportApi(');
const end=worker.indexOf('async function scheduledStoreSheetsSync(',begin);
assert(begin>0&&end>begin);
const c=vm.createContext({URL,Request,Response,console,
 storePlanManagerServer:async(req,env)=>env.actor,
 storePlanPodTargetServer:async(_env,actor,pod)=>{
   if(actor.role==='team_leader'&&pod!==actor.pod)throw Object.assign(new Error('Forbidden'),{code:'STORE_PLAN_POD_SCOPE_FORBIDDEN'});
   if(pod==='POD 2')throw Object.assign(new Error('No Agents'),{code:'STORE_PLAN_POD_SCOPE_FORBIDDEN'});
   return {pod,podLabel:pod};
 },
 googleConfigured:()=>false,
 json:value=>value,
 fail:(status,code,message)=>{throw Object.assign(new Error(message),{status,code})},
});
vm.runInContext(worker.slice(begin,end)+'\nglobalThis.handle=handleStoreOpsExportApi;',c);
const tl={role:'team_leader',pod:'POD 2',name:'Authorized TL'};
const admin={role:'admin',pod:''};
const url=x=>new URL('https://example.invalid/api/workforce/store-exports/'+x);
const result=await c.handle({method:'GET'}, {DEPLOYMENT_ENV:'production',actor:tl},url('status?pod=POD+2'));
assert.equal(result.ok,true);assert.equal(result.pod,'POD 2');assert.equal(result.noActiveAgents,true);
assert.equal(result.configured,false);assert.equal(result.spreadsheetUrl,null);assert.equal(result.manualEnabled,false);
await assert.rejects(c.handle({method:'GET'},{actor:tl},url('status?pod=POD+3')),err=>err.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
await assert.rejects(c.handle({method:'GET'},{actor:admin},url('status?pod=POD+2')),err=>err.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
await assert.rejects(c.handle({method:'POST',url:'https://example.invalid'},{actor:tl,DEPLOYMENT_ENV:'production'},url('sync-now?pod=POD+2')),err=>err.code==='PRODUCTION_SHEETS_HARD_HOLD');
console.log('PASS — coherent 3.0.4 surfaces + POD 2 own-role status fallback with no Google data exposure + cross-POD denies + hard write hold');

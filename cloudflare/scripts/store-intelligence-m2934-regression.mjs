import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const observer = read('../tracker/store-intelligence.js');
const worker = read('src/worker.js');
const coverage = read('../tracker/coverage-background.js');
const confirmation = read('../tracker/confirmation-background.js');
const index = read('public/index.html');
const panel = read('public/assets/js/j-store-intelligence-m2934.js');
const manifest = JSON.parse(read('../tracker/manifest.json'));
const storeRow = (text, cellText=text) => ({textContent:text,querySelectorAll: selector=>selector.includes(':scope')?[{textContent:cellText}]:[],querySelector:()=>null});
const sent=[];
const c=vm.createContext({
  console,
  document:{readyState:'complete',documentElement:{},querySelectorAll:()=>[
     storeRow('JOB_266468058 Chemist Warehouse - Preston - Home Co. DC NEEDS REVIEW 10/8/2026'),
     storeRow('JOB_266467978 Chemist Warehouse - Miranda NEEDS REVIEW 10/8/2026'),
     storeRow('JOB_266468111 JOB_266468112 Chemist Warehouse - Wrong Pair')
  ], addEventListener(){}},
  chrome:{runtime:{sendMessage:msg=>{sent.push(msg);return Promise.resolve()}}},
  setTimeout:fn=>{fn();return 1},
  window:{addEventListener(){}},
  MutationObserver:class{observe(){}},
  Promise
});
vm.runInContext(observer,c);
assert.equal(sent.length,2,'Both workflows receive store observations');
for(const message of sent){
 assert.deepEqual([...message.stores.map(r=>r.jobId)],['JOB_266468058','JOB_266467978']);
 assert.equal(message.stores[0].storeName,'Chemist Warehouse - Preston - Home Co. DC');
 assert.equal(message.stores[1].storeName,'Chemist Warehouse - Miranda');
 assert.equal(message.stores[0].source,'augmoto-job-row');
}
assert(!sent.some(m=>m.stores.some(r=>r.jobId==='JOB_266468111')),'Ambiguous multi-Job rows are ignored');
assert(manifest.version==='2.2.32' && manifest.content_scripts[0].js.includes('store-intelligence.js'));
assert(coverage.includes('rememberObservedStores(message.stores)')&&confirmation.includes('rememberObservedStores(message.stores)'));
for(const file of [coverage,confirmation]){
 assert(file.includes('storeNameFromMap(core,j.jobId,j.storeName)'));
 assert(file.includes('storeNameFromMap(core,v.jobId,v.storeName)'));
 assert(file.includes('source:\'augmoto-job-row\''));
 assert(file.includes('if (!changed) return {ok:true,changed:0}'));
}
assert(worker.includes("if (path === '/stores' && request.method === 'GET') return json(await storeIntelReportServer(request,env,url,'coverage'))"));
assert(worker.includes("if (path === '/stores' && request.method === 'GET') return json(await storeIntelReportServer(request,env,url,'confirmation'))"));
assert(worker.includes("if(path==='/stores'&&request.method==='GET')return json(await storeIntelReportServer(request,env,url,'metrics'))"));
assert(worker.includes('storeName:storeIntelSafeNameServer(source.storeName)'),'Store names sanitized at Worker boundary');
assert(worker.includes("const scoped=await coverageVisibleAgentsServer(env,actor)"),'Stores are scoped by server-authorized workforce roster');
assert(worker.includes('if(pod&&role!==\'admin\')fail(403'),'Only Admin can change POD scope');
assert(panel.includes('function paint(workflow)') && panel.includes('role') && panel.includes('Cache-Control')===false);
assert(index.includes('j-store-intelligence-m2934.js')&&index.includes('c-store-intelligence-m2934.css'));

// Exercise Worker store reporting across Admin / Team Leader / Agent scope.
const date = new Date().toISOString().slice(0,10);
const w = vm.createContext({URL,Headers,Request,Response,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,structuredClone,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
requireWorkforceAttendanceActor=async req=>req.actor;
coverageVisibleAgentsServer=async (env,actor)=>({agents: (actor.role==='admin'?env.agents:actor.role==='team_leader'?env.agents.filter(a=>a.pod===actor.pod):env.agents.filter(a=>a.name===actor.name))});
coverageActorKeyServer=(role,name)=>name.toLowerCase();
firebaseAdminGet=async(env,path)=>env.data[path]||null;
globalThis.storeIntelTest={ report:storeIntelReportServer, safe:storeIntelSafeNameServer, job:coverageSanitizeJobServer, task:confirmationSanitizeTaskServer};`,w);
const env={agents:[{name:'Zenitsu Agatsuma',pod:'pod-1'},{name:'Tanjiro Kamado',pod:'pod-1'},{name:'Kanao Tsuyuri',pod:'pod-2'}],data:{}};
const row=(name,pod,jobId,storeName,submitted)=>({name,pod,jobId,storeName,submitted,activeMs:120000});
env.data[`workforceCoverage/v1/jobs/${date}`]={
 'zenitsu agatsuma':{a:row('Zenitsu Agatsuma','pod-1','JOB_266468058','Chemist Warehouse - Preston - Home Co. DC',5)},
 'tanjiro kamado':{b:row('Tanjiro Kamado','pod-1','JOB_266467978','Chemist Warehouse - Miranda',3)},
 'kanao tsuyuri':{c:row('Kanao Tsuyuri','pod-2','JOB_266467662','',7)}
};
env.data[`workforceConfirmation/v1/jobs/${date}`]={
 'zenitsu agatsuma':{a:row('Zenitsu Agatsuma','pod-1','JOB_266468058','Chemist Warehouse - Preston - Home Co. DC',2)}
};
const req=(role,name,pod)=>({actor:{role,name,pod},headers:new Headers()});
const url=(wf,params='')=>new URL(`https://example.com/api/workforce/${wf}/stores?date=${date}${params}`);
const admin=await w.storeIntelTest.report(req('admin','Admin',''),env,url('metrics'),'metrics');
assert.equal(admin.stores.length,4);
assert.equal(admin.knownJobs,3);
assert.equal(admin.unknownJobs,1);
assert.equal(admin.stores.find(r=>r.workflow==='coverage'&&r.storeName.includes('Preston')).submitted,5);
assert.equal(admin.stores.find(r=>r.workflow==='confirmation').submitted,2);
assert(!admin.stores.some(r=>Object.hasOwn(r,'grade')),'Store report never fabricates store grade');
const leader=await w.storeIntelTest.report(req('team_leader','Leader','pod-1'),env,url('coverage'),'coverage');
assert.equal(leader.stores.length,2);
const agent=await w.storeIntelTest.report(req('agent','Zenitsu Agatsuma','pod-1'),env,url('coverage'),'coverage');
assert.equal(agent.stores.length,1);
await assert.rejects(w.storeIntelTest.report(req('team_leader','Leader','pod-1'),env,url('coverage','&pod=pod-2'),'coverage'));
await assert.rejects(w.storeIntelTest.report(req('agent','Zenitsu Agatsuma','pod-1'),env,url('coverage','&agent=Kanao%20Tsuyuri'),'coverage'));
assert.equal(w.storeIntelTest.safe('<img onerror=x>'),'');
assert.equal(w.storeIntelTest.job({jobId:'JOB_266468058',storeName:' Chemist Warehouse - Preston  '}).storeName,'Chemist Warehouse - Preston');
assert.equal(w.storeIntelTest.task({jobId:'JOB_266468058',taskIndex:2,storeName:'Chemist Warehouse - Preston'}).storeName,'Chemist Warehouse - Preston');
// Exercise both extension store-map writers against a simulated active shift.
for (const wf of ['coverage','confirmation']) {
 const code=wf==='coverage'?coverage:confirmation;
 assert(!code.includes('SUMMARY_['),'no dynamic key may replace SUMMARY_PENDING_KEY');
 const chunk=code.slice(code.indexOf('function storeNameFromMap'),code.indexOf('async function readCore()'));
 const reportDate='2026-10-08',jobId='JOB_266468058',storeName='Chemist Warehouse - Preston - Home Co. DC';
 const dateData={summary:{submitted:7,clientSequence:19},jobs:{[jobId]:{jobId,submitted:7}},tasks:{[jobId+'|1']:{jobId,taskIndex:1,submitted:true}}};
 const core={data:{dates:{[reportDate]:dateData}},pending:{[reportDate]:[]}};
 const storage={};const prefix=wf==='coverage'?'cat':'cft';let syncCalls=0;
 const sandbox=vm.createContext({console,Date,CAT:{storeNames:'catStoreNamesV1',data:'catData',pendingTasks:'catPending'},CFT:{storeNames:'cftStoreNamesV1',data:'cftData',pendingTasks:'cftPending'},queue:async fn=>fn(),readCore:async()=>({...core,storeNames:storage[prefix+'StoreNamesV1']||{}}),shiftIsActive:()=>true,reportDateForCore:()=>reportDate,ensureDate:(data,key)=>data.dates[key],num:x=>Math.max(0,Math.floor(Number(x)||0)),pendingAdd:(pending,key,value)=>(pending[key]??=[]).push(value),SUMMARY_PENDING_KEY:'__summary__',scheduleSyncSoon:()=>syncCalls++,chrome:{storage:{local:{set:async patch=>Object.assign(storage,patch)}}}});
 vm.runInContext(chunk+'\n;globalThis.storeTest={rememberObservedStores,storeNameFromMap}',sandbox);
 const result=await sandbox.storeTest.rememberObservedStores([{jobId,storeName,source:'augmoto-job-row'}]);
 assert.equal(result.changed,1);assert.equal(dateData.summary.submitted,7,'Store metadata must not touch task counts');
 assert.equal(dateData.summary.clientSequence,20,'Store change advances same-shift sequence once');
 assert.equal(dateData.jobs[jobId].storeName,storeName);assert.equal(dateData.tasks[jobId+'|1'].storeName,storeName);
 assert(core.pending[reportDate].includes('__summary__')&&core.pending[reportDate].includes(jobId+'|1'));
 assert.equal(storage[prefix+'StoreNamesV1'][jobId].storeName,storeName);assert.equal(syncCalls,1);
 const conflict=await sandbox.storeTest.rememberObservedStores([{jobId,storeName:'Chemist Warehouse - Miranda',source:'augmoto-job-row'}]);
 assert.equal(conflict.changed,0,'Conflicting store must never silently reassign a job');
}
console.log('PASS M2.9.34 Store Intelligence: DOM row source detection, filter isolation, ambiguous-row denial, v2.2.32 Tracker mapping, signed role/POD/Agent scope, store-safe job/task persistence, Coverage/Confirmation/Metrics store reports, no invented grades.');

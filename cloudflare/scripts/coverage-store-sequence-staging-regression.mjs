// Offline only: COVERAGE flexible sequencing, no live Augmoto, Firebase or production calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {validateCoverageSequenceStores, classifyCoverageSequenceTask, coverageSequenceSnapshotAt, coverageStoreKey, COVERAGE_SEQUENCE_GRACE_MS, COVERAGE_SEQUENCE_TTL_MS} from '../src/coverage-store-sequence-policy.js';
import {storePlanDate, validateStorePlanEntries, canManageStorePlan, storePlanIdentityKey} from '../src/store-plan-policy.js';
const now=Date.now(),first=now-65*60000,switched=now-20*60000;
const A='Chemist Warehouse - Rooty Hill',B='Chemist Warehouse - Charlestown',C='Chemist Warehouse - Box Hill';
const history=[{workflow:'coverage',revision:1,stores:[A,B],effectiveAtMs:first,expiresAtMs:first+COVERAGE_SEQUENCE_TTL_MS,endedAtMs:switched},
 {workflow:'coverage',revision:2,stores:[B,C],effectiveAtMs:switched,expiresAtMs:switched+COVERAGE_SEQUENCE_TTL_MS}];
const row={workflow:'coverage',known:true,mappingStatus:'observed',storeName:A};
const task=(s,e)=>({submitted:true,startedAt:s,endedAt:e});
const check=(store,start,end)=>classifyCoverageSequenceTask({task:task(start,end),mapping:{...row,storeName:store},timeline:history,nowMs:now});
assert.deepEqual(validateCoverageSequenceStores([A,B]),[A,B]);
assert.throws(()=>validateCoverageSequenceStores([A,A.toUpperCase()]));
assert.throws(()=>validateCoverageSequenceStores([A,'Unknown Store']));
assert.throws(()=>validateCoverageSequenceStores(Array.from({length:13},(_,i)=>'Chemist Warehouse - Store '+i)));
assert.equal(coverageSequenceSnapshotAt(history,first-1000),null);
assert.equal(check(A,first+10000,first+30000).status,'in-sequence');
assert.equal(check(B,switched+3000,switched+5000).status,'in-sequence');
assert.equal(check(A,switched-9000,switched+2*60000).status,'authorized-transition');
assert.equal(check(A,switched-9000,switched+11*60000).status,'review-needed');
assert.equal(check(A,switched+2000,switched+6000).status,'review-needed');
assert.equal(check(A,first-2000,first+5000).status,'insufficient-evidence');
assert.equal(check(C,switched-5000,switched+5000).status,'insufficient-evidence');
assert.equal(classifyCoverageSequenceTask({task:task(switched+2000,switched+6000),mapping:{...row,known:false,mappingStatus:'conflict'},timeline:history}).status,'mapping-conflict');
assert.equal(classifyCoverageSequenceTask({task:task(switched+2000,switched+6000),mapping:{...row,known:false,mappingStatus:'unknown'},timeline:history}).status,'mapping-required');
assert.equal(classifyCoverageSequenceTask({task:task(0,0),mapping:row,timeline:history}).status,'insufficient-evidence');
assert.equal(classifyCoverageSequenceTask({task:{...task(switched+2000,switched+6000),submitted:false},mapping:row,timeline:history}).status,'not-eligible');
const ui=fs.readFileSync(new URL('../public/assets/js/j-store-plan-manager-phase1.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
assert(ui.includes('Coverage · All Stores')&&ui.includes('data-coverage-all-stores-refresh'));
assert(ui.includes('renderCoverageAllStores')&&ui.includes('ensureCurrentSession(state)'));
assert(!ui.includes('No jobs available')||ui.includes('This does not mean no jobs are available.'));
assert(/j-store-plan-manager-phase1\.js\?v=[a-z0-9-]+20261022/.test(html),'Coverage module linked with a dated cache-safe version');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const ctx=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,
 storePlanDate,validateStorePlanEntries,canManageStorePlan,storePlanIdentityKey,validateCoverageSequenceStores,classifyCoverageSequenceTask,coverageStoreKey,COVERAGE_SEQUENCE_GRACE_MS,COVERAGE_SEQUENCE_TTL_MS,
 createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
const db=new Map();
const roster={Alice:{role:'agent',name:'Alice',pod:'POD 1',active:true},Bob:{role:'agent',name:'Bob',pod:'POD 2',active:true},Lea:{role:'team_leader',name:'Lea',pod:'POD 1',active:true}};
requireWorkforceAttendanceActor=async(req,env)=>env.actor;
canonicalWorkforceMemberServer=async(env,role,name)=>{const m=roster[name];return m&&m.active&&m.role===role?m:null;};
canonicalWorkforceAuthorizationRosterServer=async()=>({entries:roster});
coverageVisibleAgentsServer=async(env,actor)=>({agents:Object.values(roster).filter(m=>m.role==='agent'&&(actor.role==='admin'||m.pod===actor.pod))});
coverageActorKeyServer=(_,name)=>name.toLowerCase();
fbEncodeKeyServer=x=>x;
firebaseAdminGet=async(env,path)=>db.get(path)||null;
firebaseAdminGetWithEtag=async(env,path)=>({value:db.get(path)||null,etag:'etag-'+(db.get(path)?.revision||0)});
firebaseAdminSetIfMatch=async(env,path,value,etag)=>{if(etag!=='etag-'+(db.get(path)?.revision||0))return {committed:false};db.set(path,value);return {committed:true};};
enforceRate=()=>{};
globalThis.cov={handleWorkforceStorePlansApi,db,roster};`,ctx);
const {handleWorkforceStorePlansApi:handler,db}=ctx.cov;
const admin={role:'admin',name:'Admin',uid:'admin1',pod:''};
const tl={role:'team_leader',name:'Lea',uid:'tl1',pod:'POD 1'};
const agent={role:'agent',name:'Alice',uid:'agent1',pod:'POD 1'};
async function call(actor,path,method='GET',body){
 const url=new URL('https://staging.test/api/workforce/store-plans/'+path);
 const request=new Request(url,{method,body:body?JSON.stringify(body):undefined,headers:body?{'Content-Type':'application/json'}:{}});
 const res=await handler(request,{actor},url);return res.json();
}
assert.equal((await call(tl,'coverage-sequence?pod=POD%201')).workflow,'coverage');
await assert.rejects(call(agent,'coverage-sequence?pod=POD%201'),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
await assert.rejects(call(tl,'coverage-sequence?pod=POD%202'),e=>e.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
await assert.rejects(call(tl,'coverage-sequence','PUT',{pod:'POD 2',workflow:'coverage',stores:[A],expectedRevision:0}),e=>e.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
await assert.rejects(call(tl,'coverage-sequence','PUT',{pod:'POD 1',workflow:'confirmation',stores:[A],expectedRevision:0}),e=>e.code==='COVERAGE_SEQUENCE_ONLY');
await assert.rejects(call(tl,'coverage-sequence','PUT',{pod:'POD 1',workflow:'coverage',stores:[A,A],expectedRevision:0}),e=>e.code==='COVERAGE_SEQUENCE_STORES_INVALID');
const published=await call(tl,'coverage-sequence','PUT',{pod:'POD 1',workflow:'coverage',stores:[A,B],expectedRevision:0});
assert.equal(published.active,true);assert.equal(published.stores.length,2);assert.equal(published.revision,1);
await assert.rejects(call(admin,'coverage-sequence','PUT',{pod:'POD 1',workflow:'coverage',stores:[C],expectedRevision:0}),e=>e.code==='COVERAGE_SEQUENCE_CHANGED');
const updated=await call(tl,'coverage-sequence','PUT',{pod:'POD 1',workflow:'coverage',stores:[B,C],expectedRevision:1});
assert.equal(updated.revision,2);
const record=db.get('workforceStorePlans/v1/coverageSequence/pod:POD 1');
assert.equal(record.history.length,1);assert.equal(record.history[0].stores[0],A);assert(record.history[0].endedAtMs<=Date.now());
assert(![...db.keys()].some(k=>/confirmation/i.test(k)),'No Confirmation writes permitted');
// Fake persisted task evidence, case (1) mapped within approved Coverage stores.
const reportDate='2026-10-22',taskStart=now-8000,taskEnd=now-2000;
record.effectiveAtMs=now-20000;db.set('workforceStorePlans/v1/coverageSequence/pod:POD 1',record);
db.set('workforceCoverage/v1/jobs/'+reportDate,{'alice':{'a':{name:'Alice',pod:'POD 1',jobId:'JOB_1234',storeName:B,submitted:1,activeMs:6000,firstSeenAt:taskStart,lastSeenAt:taskEnd}}});
db.set('workforceCoverage/v1/tasks/'+reportDate+'/alice',{'a':{name:'Alice',pod:'POD 1',jobId:'JOB_1234',taskIndex:1,submitted:true,startedAt:taskStart,endedAt:taskEnd}});
// Confirmation with same Job ID exists, must never be evaluated or written.
db.set('workforceConfirmation/v1/jobs/'+reportDate,{'alice':{'a':{name:'Alice',pod:'POD 1',jobId:'JOB_1234',storeName:C,submitted:15}}});
const confirmSnapshot=JSON.stringify(db.get('workforceConfirmation/v1/jobs/'+reportDate));
const coverageSnapshot=JSON.stringify(db.get('workforceCoverage/v1/jobs/'+reportDate));
const review=await call(tl,'coverage-sequence/review?pod=POD%201&date='+reportDate);
assert.equal(review.workflow,'coverage');assert.equal(review.summary['in-sequence'],1);
assert.equal(review.summary['review-needed'],0);assert.equal(review.rows.length,1);
assert.equal(review.rows[0].jobId,'JOB_1234');assert.equal(review.countsChanged,false);
assert.equal(JSON.stringify(db.get('workforceConfirmation/v1/jobs/'+reportDate)),confirmSnapshot);
assert.equal(JSON.stringify(db.get('workforceCoverage/v1/jobs/'+reportDate)),coverageSnapshot);
await assert.rejects(call(agent,'coverage-sequence/review?pod=POD%201&date='+reportDate),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
await assert.rejects(call(tl,'coverage-sequence/review?pod=POD%202&date='+reportDate),e=>e.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
// All Stores V1, using the existing read-only Coverage report and evaluator.
const allStores=await call(tl,'coverage-sequence/all-stores?pod=POD%201&date='+reportDate);
assert.equal(allStores.kind,'coverage-all-stores-v1');
assert.equal(allStores.workflow,'coverage');
assert.equal(allStores.pod,'POD 1');
assert.equal(allStores.overview.authorizedStores,2);
assert.equal(allStores.overview.observedStores,1);
assert.equal(allStores.overview.submittedTasks,1);
assert.equal(allStores.overview.reviewTasks,0);
assert.equal(allStores.overview.unmappedJobs,0);
assert.equal(allStores.stores.find(s=>s.name===B).authorizedNow,true);
assert.equal(allStores.stores.find(s=>s.name===B).submitted,1);
assert.equal(allStores.stores.find(s=>s.name===C).observed,false);
assert(!allStores.stores.some(s=>s.name===A&&s.observed));
assert(!allStores.stores.some(s=>s.name==='Chemist Warehouse - POD 2'));
await assert.rejects(call(agent,'coverage-sequence/all-stores?pod=POD%201&date='+reportDate),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
await assert.rejects(call(tl,'coverage-sequence/all-stores?pod=POD%202&date='+reportDate),e=>e.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
// Unknown Coverage jobs stay unclassified, with counts retained and no invented store name.
const covJobRoot=db.get('workforceCoverage/v1/jobs/'+reportDate);
covJobRoot.alice.b={name:'Alice',pod:'POD 1',jobId:'JOB_5678',storeName:'',submitted:2,activeMs:7000};
const covTaskRoot=db.get('workforceCoverage/v1/tasks/'+reportDate+'/alice');
covTaskRoot.b={name:'Alice',pod:'POD 1',jobId:'JOB_5678',taskIndex:2,submitted:true,startedAt:taskStart,endedAt:taskEnd};
// An entirely different POD and Confirmation record must never be included.
covJobRoot.bob={a:{name:'Bob',pod:'POD 2',jobId:'JOB_9999',storeName:'Chemist Warehouse - POD 2',submitted:43,activeMs:100000}};
const frozenDb=new Map([...db.entries()].map(([k,v])=>[k,JSON.stringify(v)]));
const withUnknown=await call(tl,'coverage-sequence/all-stores?pod=POD%201&date='+reportDate);
assert.equal(withUnknown.overview.unmappedJobs,1);
assert.equal(withUnknown.overview.submittedTasks,3);
assert.equal(withUnknown.sequence.summary['mapping-required'],1);
assert.equal(withUnknown.sequence.summary['review-needed'],0);
assert(withUnknown.incomplete.some(e=>e.status==='unknown'&&e.submitted===2));
assert(!withUnknown.stores.some(e=>e.name.includes('POD 2')));
assert(!withUnknown.stores.some(e=>e.name===C&&e.observed));
for(const [key,value] of frozenDb)assert.equal(JSON.stringify(db.get(key)),value,`Read-only all-stores mutated ${key}`);
// A verified Coverage job outside the current TL-approved list is observed,
// but a REVIEW flag requires actual submitted task timing, not today's list alone.
covJobRoot.alice.c={name:'Alice',pod:'POD 1',jobId:'JOB_8765',storeName:'Chemist Warehouse - Not Assigned',submitted:1,activeMs:4000};
covTaskRoot.c={name:'Alice',pod:'POD 1',jobId:'JOB_8765',taskIndex:3,submitted:true,startedAt:taskStart,endedAt:taskEnd};
const outside=await call(tl,'coverage-sequence/all-stores?pod=POD%201&date='+reportDate);
assert.equal(outside.overview.reviewTasks,1);
assert.equal(outside.overview.submittedTasks,4);
assert.equal(outside.sequence.summary['review-needed'],1);
const outsideStore=outside.stores.find(e=>e.name==='Chemist Warehouse - Not Assigned');
assert.equal(outsideStore.authorizedNow,false);
assert.equal(outsideStore.observed,true);
assert.equal(outsideStore.reviewTasks,1);
// Do not promote placeholder strings to verified stores even when a source
// falsely advertises them as observed; this must remain mapping-required.
covJobRoot.alice.d={name:'Alice',pod:'POD 1',jobId:'JOB_7777',storeName:'Unknown Store',submitted:1,activeMs:4000};
covTaskRoot.d={name:'Alice',pod:'POD 1',jobId:'JOB_7777',taskIndex:4,submitted:true,startedAt:taskStart,endedAt:taskEnd};
const placeholder=await call(tl,'coverage-sequence/all-stores?pod=POD%201&date='+reportDate);
assert.equal(placeholder.overview.unmappedJobs,2);
assert.equal(placeholder.sequence.summary['mapping-required'],2);
assert.equal(placeholder.overview.reviewTasks,1);
assert(!placeholder.stores.some(s=>s.name==='Unknown Store'));
const paused=await call(tl,'coverage-sequence','PUT',{pod:'POD 1',workflow:'coverage',stores:[],expectedRevision:2});
assert.equal(paused.active,false);
console.log('PASS Coverage Sequence V1 + All Stores V1: flexible authorization, stale-revision protection, TL/POD isolation, transition grace, unknown/conflict isolation, read-only Coverage task review, Confirmation untouched.');

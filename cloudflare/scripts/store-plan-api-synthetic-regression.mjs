/* Isolated synthetic Worker route test; no Firebase network or deployment. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {storePlanDate,validateStorePlanEntries,canManageStorePlan,storePlanIdentityKey} from '../src/store-plan-policy.js';
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,
  createRemoteJWKSet:()=>({}),storePlanDate,validateStorePlanEntries,canManageStorePlan,storePlanIdentityKey});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
const testMemory=new Map();
const directory={
 Alice:{role:'agent',name:'Alice',pod:'POD 1',active:true},
 Bob:{role:'agent',name:'Bob',pod:'POD 2',active:true},
 Deactivated:{role:'agent',name:'Deactivated',pod:'POD 1',active:false},
 Lea:{role:'team_leader',name:'Lea',pod:'POD 1',active:true},
},actorMemory={actor:null};
requireWorkforceAttendanceActor=async(req,env)=>env.actor;
canonicalWorkforceMemberServer=async(env,role,name)=>{const found=directory[name];return found&&found.active&&found.role===role?found:null;};
canonicalWorkforceAuthorizationRosterServer=async()=>({entries:directory});
coverageRequireBridgeActorServer=async(req,env)=>{if(!req.headers.get('x-tt-coverage-bridge'))fail(401,'COVERAGE_BRIDGE_REQUIRED','Connect Agent Tracker.');return env.bridge;};
confirmationRequireBridgeActorServer=async(req,env)=>{if(!req.headers.get('x-tt-confirmation-bridge'))fail(401,'CONFIRMATION_BRIDGE_REQUIRED','Connect Agent Tracker.');return env.bridge;};
firebaseAdminGet=async(env,path)=>testMemory.get(path)||null;
firebaseAdminGetWithEtag=async(env,path)=>({value:testMemory.get(path)||null,etag:'etag-'+(testMemory.get(path)?.revision||0)});
firebaseAdminSetIfMatch=async(env,path,value,etag)=>{if(etag!=='etag-'+(testMemory.get(path)?.revision||0))return {committed:false};testMemory.set(path,value);return {committed:true};};
enforceRate=()=>{};
globalThis.testStorePlan={handleWorkforceStorePlansApi,testMemory,directory};`,c);
const {handleWorkforceStorePlansApi:handler,testMemory,directory}=c.testStorePlan;
const admin={role:'admin',name:'Administrator',uid:'admin-1',pod:''};
const tl={role:'team_leader',name:'Lea',pod:'POD 1',uid:'tl-1'};
const agent={role:'agent',name:'Alice',pod:'POD 1',uid:'agent-1'};
const date=new Date().toISOString().slice(0,10);
async function call(actor,path,{method='GET',data,bridge}={}){
  const url=new URL(`https://staging.example/api/workforce/store-plans/${path}`);
  if(!url.searchParams.has('date'))url.searchParams.set('date',date);
  const headers=bridge?{[bridge.kind==='confirmation'?'x-tt-confirmation-bridge':'x-tt-coverage-bridge']:'fixture'}:{};
  const req=new Request(url.toString(),{method,headers,body:data?JSON.stringify(data):undefined});
  const result=await handler(req,{actor,bridge},url);
  return result.json();
}
const alice='Alice',entries=[{order:1,store:'Preston',plannedJobs:2,jobIds:['JOB_10001']},{order:2,store:'Miranda',plannedJobs:1,jobIds:[]}];
assert.deepEqual((await call(admin,'agents')).agents.map(a=>a.name).sort(),['Alice','Bob']);
assert.deepEqual((await call(tl,'agents')).agents.map(a=>a.name),['Alice']);
await assert.rejects(call(agent,'agents'),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
await assert.rejects(call(tl,'agent?agentName=Bob'),e=>e.code==='STORE_PLAN_SCOPE_FORBIDDEN');
await assert.rejects(call(tl,'agent?agentName=Deactivated'),e=>e.code==='STORE_PLAN_SCOPE_FORBIDDEN');
await assert.rejects(call({...tl,pod:'POD 2'},'agents'),e=>e.code==='STORE_PLAN_MANAGER_POD_CHANGED');
await assert.rejects(call(agent,'agent?agentName=Alice',{method:'PUT',data:{agentName:alice,entries,expectedRevision:0}}),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
const saved=await call(tl,'agent',{method:'PUT',data:{agentName:alice,entries,expectedRevision:0}});
assert.equal(saved.revision,1);assert.equal(saved.assigned,true);assert.equal(saved.updatedBy,'Lea');
await assert.rejects(call(admin,'agent',{method:'PUT',data:{agentName:alice,entries,expectedRevision:0}}),e=>e.code==='STORE_PLAN_CHANGED');
assert.equal((await call(tl,'agent?agentName=Alice')).entries[0].store,'Preston');
assert.equal((await call(admin,'agent?agentName=Alice')).revision,1);
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}})).entries[0].store,'Preston');
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Bob',pod:'POD 2'}})).assigned,false);
await assert.rejects(call(agent,'mine'),e=>e.code==='STORE_PLAN_BRIDGE_REQUIRED');
const cleared=await call(admin,'agent',{method:'PUT',data:{agentName:alice,entries:[],expectedRevision:1}});
assert.equal(cleared.assigned,false);assert.equal(cleared.revision,2);
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}})).assigned,false);
const key=[...testMemory.keys()][0];assert.match(key,/workforceStorePlans\/v1\/agentDates/);
assert.equal(testMemory.get(key).history.length,1);

// POD-wide queue: any member of the same POD inherits the same plan (including new members).
const addAgent=(name,pod)=>{directory[name]={role:'agent',name,pod,active:true};};
addAgent('Amy','POD 1');
const tlPods=await call(tl,'pods');
assert.deepEqual(tlPods.pods.map(x=>x.pod),['POD 1']);
assert.deepEqual((await call(admin,'pods')).pods.map(x=>x.pod).sort(),['POD 1','POD 2']);
await assert.rejects(call(agent,'pods'),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
await assert.rejects(call(tl,'pod?pod=POD%202'),e=>e.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
await assert.rejects(call(tl,'pod',{method:'PUT',data:{pod:'POD 2',entries,expectedRevision:0}}),e=>e.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
await assert.rejects(call(agent,'pod',{method:'PUT',data:{pod:'POD 1',entries,expectedRevision:0}}),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
const shared=await call(tl,'pod',{method:'PUT',data:{pod:'POD 1',entries,expectedRevision:0}});
assert.equal(shared.revision,1);assert.equal(shared.assigned,true);assert.equal(shared.pod,'POD 1');
await assert.rejects(call(admin,'pod',{method:'PUT',data:{pod:'POD 1',entries,expectedRevision:0}}),e=>e.code==='STORE_PLAN_CHANGED');
assert.equal((await call(tl,'pod?pod=POD%201')).entries[0].store,'Preston');
const al=await call(agent,'mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}});
const am=await call(agent,'mine',{bridge:{role:'agent',name:'Amy',pod:'POD 1'}});
assert.equal(al.scope,'pod');assert.equal(al.source,'pod');assert.equal(al.entries[0].store,'Preston');
assert.equal(am.entries[0].store,'Preston','new POD members automatically inherit the same plan');
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Bob',pod:'POD 2'}})).assigned,false);
// Old per-Agent override must not split a POD once a POD-wide plan exists.
const mira=[{order:1,store:'Alexandria',plannedJobs:1,jobIds:[]}];
await call(admin,'agent',{method:'PUT',data:{agentName:'Alice',entries:mira,expectedRevision:2}});
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}})).entries[0].store,'Preston');
// Clearing a POD plan restores the old Agent fallback for Alice, not for Amy.
const clearedPod=await call(admin,'pod',{method:'PUT',data:{pod:'POD 1',entries:[],expectedRevision:1}});
assert.equal(clearedPod.revision,2);assert.equal(clearedPod.assigned,false);
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}})).entries[0].store,'Alexandria');
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Amy',pod:'POD 1'}})).assigned,false);
// Reassign POD and move the Agent to a different POD: no previous-POD queue leakage.
await call(admin,'pod',{method:'PUT',data:{pod:'POD 1',entries,expectedRevision:2}});
directory.Amy={...directory.Amy,pod:'POD 2'};
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Amy',pod:'POD 2'}})).assigned,false);
assert.equal((await call(agent,'mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}})).scope,'pod');
assert.equal(testMemory.size,2,'one shared POD record, one legacy Agent record, and no per-POD agent copies');


// Live dispatch is an authorized instruction only, never an actual Augmoto job observation.
const dispatchBody=(pod,workflow,store,expectedRevision)=>({pod,workflow,store,expectedRevision});
assert.equal((await call(tl,'dispatch?pod=POD%201')).active,false);
await assert.rejects(call(agent,'dispatch?pod=POD%201'),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
await assert.rejects(call(tl,'dispatch?pod=POD%202'),e=>e.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
await assert.rejects(call(tl,'dispatch',{method:'PUT',data:dispatchBody('POD 2','coverage','Cobram',0)}),e=>e.code==='STORE_PLAN_POD_SCOPE_FORBIDDEN');
await assert.rejects(call(agent,'dispatch',{method:'PUT',data:dispatchBody('POD 1','coverage','Cobram',0)}),e=>e.code==='STORE_PLAN_MANAGER_REQUIRED');
await assert.rejects(call(tl,'dispatch',{method:'PUT',data:dispatchBody('POD 1','coverage','',0)}),e=>e.code==='STORE_DISPATCH_STORE_INVALID');
await assert.rejects(call(tl,'dispatch',{method:'PUT',data:dispatchBody('POD 1','other','Cobram',0)}),e=>e.code==='STORE_DISPATCH_WORKFLOW_INVALID');
await assert.rejects(call(tl,'dispatch',{method:'PUT',data:dispatchBody('POD 1','standby','Cobram',0)}),e=>e.code==='STORE_DISPATCH_STORE_INVALID');
const firstDispatch=await call(tl,'dispatch',{method:'PUT',data:dispatchBody('POD 1','coverage','Chemist Warehouse - Cobram',0)});
assert.equal(firstDispatch.active,true);assert.equal(firstDispatch.revision,1);assert.equal(firstDispatch.workflow,'coverage');
assert.equal((await call(agent,'dispatch/mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}})).store,'Chemist Warehouse - Cobram');
assert.equal((await call(agent,'dispatch/mine',{bridge:{kind:'confirmation',role:'agent',name:'Alice',pod:'POD 1'}})).workflow,'coverage','confirmation-only bridge sees the same POD dispatch');
assert.equal((await call(agent,'dispatch/mine',{bridge:{role:'agent',name:'Bob',pod:'POD 2'}})).active,false);
await assert.rejects(call(agent,'dispatch/mine'),e=>e.code==='STORE_DISPATCH_BRIDGE_REQUIRED');
await assert.rejects(call(admin,'dispatch',{method:'PUT',data:dispatchBody('POD 1','confirmation','Miranda',0)}),e=>e.code==='STORE_DISPATCH_CHANGED');
const secondDispatch=await call(tl,'dispatch',{method:'PUT',data:dispatchBody('POD 1','confirmation','Miranda',1)});
assert.equal(secondDispatch.workflow,'confirmation');assert.equal(secondDispatch.revision,2);
assert.equal(secondDispatch.history[0].workflow,'coverage');
assert.equal((await call(agent,'dispatch/mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}})).workflow,'confirmation');
// An expired dispatch cannot misleadingly continue as a live current instruction.
const dispatchKey=[...testMemory.keys()].find(k=>k.includes('podDispatch'));
const latest=testMemory.get(dispatchKey);
testMemory.set(dispatchKey,{...latest,expiresAtMs:Date.now()-1});
const expired=await call(agent,'dispatch/mine',{bridge:{kind:'confirmation',role:'agent',name:'Alice',pod:'POD 1'}});
assert.equal(expired.active,false);assert.equal(expired.expired,true);
const standby=await call(tl,'dispatch',{method:'PUT',data:dispatchBody('POD 1','standby','',2)});
assert.equal(standby.active,false);assert.equal(standby.revision,3);
assert.equal((await call(agent,'dispatch/mine',{bridge:{role:'agent',name:'Alice',pod:'POD 1'}})).active,false);
// POD move is resolved from the signed bridge's CURRENT verified roster in production,
// and the dispatch endpoint never accepts a caller-supplied POD target for Agents.
assert.equal(testMemory.size,3,'dispatch adds exactly one POD-scoped record and never copies it to Agents');
console.log('PASS Phase 3: dispatch workflow switch, shared POD visibility, cross-POD denial, Agent write denial, bridge denial, revision, standby, history (synthetic).');
console.log('PASS Phase 2 API: legacy Agent plans, POD-wide inheritance, cross-POD denial, revocation, transfer, CAS, clear/fallback (synthetic).');

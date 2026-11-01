import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const coverageBg=fs.readFileSync(new URL('../fixtures/TrinoTime-QC-Tracker-v2.2.32.zip',import.meta.url));
const trackerSource=fs.readFileSync(new URL('../../tracker/coverage-background.js',import.meta.url),'utf8');
const confirmationSource=fs.readFileSync(new URL('../../tracker/confirmation-background.js',import.meta.url),'utf8');
const popup=fs.readFileSync(new URL('../../tracker/popup.js',import.meta.url),'utf8');

for(const needle of [
  "WORKFORCE_TRACKER_SHIFT_ROOT = 'workforceTrackerShift/v1'",
  "status: record.logOut ? 'completed' : 'active'",
  "shift.status!=='active'||!shift.sessionId",
  "shiftSessionId:shift.sessionId",
  "shiftGeneration:shift.generation||0",
  "trackerShiftResetCurrentServer",
  "generationBefore",
  "generationAfter"
]) assert(worker.includes(needle),`Worker missing shift-session invariant: ${needle}`);
for(const [name,source] of [['Coverage',trackerSource],['Confirmation',confirmationSource]]){
  assert(source.includes("status === 'active'")||source.includes("status==='active'"),`${name} must gate mutations on active Time In shift`);
  assert(source.includes('shiftSessionId'),`${name} sync must bind server session id`);
  assert(source.includes('shiftGeneration'),`${name} sync must bind reset generation`);
  assert(source.includes('shift-state'),`${name} must refresh authoritative Time In/Time Out state`);
}
assert(popup.includes('cat-reset-current-shift'),'Main popup must expose synchronized Reset Current Shift');
assert(popup.includes('recorded in TrinoTime audit history'),'Reset confirmation must disclose audit behavior');
assert(coverageBg.length>0,'Bundled Tracker zip must exist');

const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
const __store=new Map();
firebaseAdminGet=async(env,path)=>__store.has(path)?structuredClone(__store.get(path)):null;
firebaseAdminGetWithEtag=async(env,path)=>({value:__store.get(path)||null,etag:"fixture"});
firebaseAdminSetIfMatch=async(env,path,value)=>{if(__store.has(path))return {committed:false,value:__store.get(path)};__store.set(path,value);return {committed:true,value};};
firebaseAdminSet=async(env,path,value)=>{__store.set(path,structuredClone(value));};
firebaseAdminPatch=async(env,root,updates)=>{for(const [path,value] of Object.entries(updates)){if(value===null)__store.delete(path);else __store.set(path,structuredClone(value));}};
globalThis.structuredClone=globalThis.structuredClone||((v)=>JSON.parse(JSON.stringify(v)));
globalThis.test={
 persist:trackerShiftPersistAttendanceServer,
 reset:trackerShiftResetCurrentServer,
 publicShift:trackerShiftPublicServer,
 actorKey:coverageActorKeyServer,
 store:__store,
 setResolver:(fn)=>{trackerShiftResolveForActorServer=fn;}
};`,c);

const parsed={family:'agent',key:'att:10/6/2026|Tanjiro Kamado',date:'10/6/2026',name:'Tanjiro Kamado'};
const timeIn='2026-10-06T22:00:00.000Z';
const active=await c.test.persist({},parsed,{timeIn,pod:'pod2',_rev:1,_mutationId:'in-1'});
assert.equal(active.status,'active');assert.equal(active.locked,false);assert.equal(active.reportDate,'2026-10-06');
const actorKey=c.test.actorKey('agent','Tanjiro Kamado');
const dailyC=`workforceCoverage/v1/daily/2026-10-06/${actorKey}`;
const dailyF=`workforceConfirmation/v1/daily/2026-10-06/${actorKey}`;
c.test.store.set(dailyC,{submitted:225,activeMs:18000000,trackerState:'active',shiftSessionId:active.sessionId,shiftGeneration:0});
c.test.store.set(dailyF,{interval1:80,interval2:90,interval3:55,submitted:225,trackerState:'active',shiftSessionId:active.sessionId,shiftGeneration:0});
const completed=await c.test.persist({},parsed,{timeIn,logOut:'2026-10-07T06:00:00.000Z',pod:'pod2',_rev:2,_mutationId:'out-1'});
assert.equal(completed.status,'completed');assert.equal(completed.locked,true);
assert.equal(c.test.store.get(dailyC).shiftLocked,true);assert.equal(c.test.store.get(dailyC).trackerState,'offline');assert.equal(c.test.store.get(dailyC).submitted,225);
assert.equal(c.test.store.get(dailyF).shiftLocked,true);assert.equal(c.test.store.get(dailyF).submitted,225);
assert([...c.test.store.keys()].some(k=>k.startsWith(`workforceTrackerShift/v1/sessions/${actorKey}/`)&&k.endsWith('/coverage')),'Time Out must archive final Coverage totals');

// A later Time In creates a fresh session; no midnight/6AM/scheduled-end reset is involved.
const next=await c.test.persist({},parsed,{timeIn:'2026-10-07T20:00:00.000Z',pod:'pod2',_rev:3,_mutationId:'in-2'});
assert.equal(next.status,'active');assert.notEqual(next.sessionId,completed.sessionId);

// Manual reset is active-shift-only, server-audited, and bumps generation so stale local data cannot come back.
c.test.store.set(`workforceCoverage/v1/daily/${next.reportDate}/${actorKey}`,{submitted:50,shiftSessionId:next.sessionId,shiftGeneration:0});
c.test.store.set(`workforceConfirmation/v1/daily/${next.reportDate}/${actorKey}`,{interval1:50,submitted:50,shiftSessionId:next.sessionId,shiftGeneration:0});
const actor={name:'Tanjiro Kamado',pod:'pod2',uid:'u1',role:'agent'};
c.test.setResolver(async()=>({...next,generation:0,status:'active',locked:false}));
const reset=await c.test.reset(new Request('https://fixture.test/reset',{method:'POST'}),{},actor);
assert.equal(reset.shift.generation,1);assert.equal(reset.shift.status,'active');
assert.equal(c.test.store.has(`workforceCoverage/v1/daily/${next.reportDate}/${actorKey}`),false);
assert.equal(c.test.store.has(`workforceConfirmation/v1/daily/${next.reportDate}/${actorKey}`),false);
assert([...c.test.store.keys()].some(k=>k.startsWith(`workforceTrackerShift/v1/resets/${actorKey}/`)),'Manual reset audit record missing');



async function exerciseCoverageLocalSession(){
  const store={catShiftSessionV1:{sessionId:'local-a',generation:0,status:'active',locked:false,reportDate:'2026-10-06'}};
  const chrome={storage:{local:{get:async keys=>{if(Array.isArray(keys)){const o={};for(const k of keys)o[k]=structuredClone(store[k]);return o;}if(typeof keys==='string')return{[keys]:structuredClone(store[keys])};return structuredClone(store);},set:async v=>Object.assign(store,structuredClone(v)),remove:async k=>{for(const x of Array.isArray(k)?k:[k])delete store[x];}}},alarms:{create(){},onAlarm:{addListener(){}}},runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(){}}},tabs:{query:async()=>[]},scripting:{executeScript:async()=>[]}};
  const cx=vm.createContext({chrome,console,Date,Intl,URL,crypto:webcrypto,setTimeout:()=>1,clearTimeout(){},fetch:async()=>{throw new Error('unexpected fetch')},structuredClone});
  let src=trackerSource;src=src.slice(0,src.indexOf('chrome.runtime.onInstalled.addListener'))+`globalThis.test={applyEvent,context,adopt:async(raw,summary)=>queue(async()=>{const core=await readCore();const result=adoptShiftIntoCoverageCore(core,raw,summary);await persistCoverageShiftCore(core);return result;})};})();`;
  vm.runInContext(src,cx);
  const base={date:'2026-10-06',jobId:'JOB_LOCAL',taskIndex:1,totalTasks:3,timestamp:Date.now(),trackerState:'active'};
  await cx.test.applyEvent({...base,eventId:'start',type:'task-start'});await cx.test.applyEvent({...base,eventId:'create-1',type:'created'});
  assert.equal((await cx.test.context()).summary.created,1);
  await cx.test.adopt({sessionId:'local-a',generation:0,status:'completed',locked:true,reportDate:'2026-10-06',endedAt:new Date().toISOString()},{created:1,submitted:4,trackerState:'offline'});
  const frozen=await cx.test.applyEvent({...base,eventId:'create-after-out',type:'created'});assert.equal(frozen.frozen,true);assert.equal((await cx.test.context()).summary.created,1);
  await cx.test.adopt({sessionId:'local-b',generation:0,status:'active',locked:false,reportDate:'2026-10-07'},null);assert.equal((await cx.test.context()).summary.created,0);
  const baseB={...base,date:'2026-10-07',eventId:'start-b',type:'task-start'};await cx.test.applyEvent(baseB);await cx.test.applyEvent({...baseB,eventId:'create-b',type:'created'});assert.equal((await cx.test.context()).summary.created,1);
  await cx.test.adopt({sessionId:'local-b',generation:1,status:'active',locked:false,reportDate:'2026-10-07',resetAt:new Date().toISOString()},null);assert.equal((await cx.test.context()).summary.created,0);
}

async function exerciseConfirmationLocalSession(){
  const store={cftShiftSessionV1:{sessionId:'cft-a',generation:0,status:'active',locked:false,reportDate:'2026-10-06'},cftSettingsV2:{reportDate:'2026-10-06'}};
  const chrome={storage:{local:{get:async keys=>{if(Array.isArray(keys)){const o={};for(const k of keys)o[k]=structuredClone(store[k]);return o;}if(typeof keys==='string')return{[keys]:structuredClone(store[keys])};return structuredClone(store);},set:async v=>Object.assign(store,structuredClone(v)),remove:async k=>{for(const x of Array.isArray(k)?k:[k])delete store[x];}}},alarms:{create(){},onAlarm:{addListener(){}}},runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(){}}},tabs:{query:async()=>[]},scripting:{executeScript:async()=>[]}};
  const cx=vm.createContext({chrome,console,Date,Intl,URL,crypto:webcrypto,setTimeout:()=>1,clearTimeout(){},fetch:async()=>{throw new Error('unexpected fetch')},structuredClone});
  let src=confirmationSource;src=src.slice(0,src.indexOf('chrome.runtime.onInstalled.addListener'))+`globalThis.test={applyEvent,context,adopt:async(raw,summary)=>queue(async()=>{const core=await readCore();const result=adoptShiftIntoConfirmationCore(core,raw,summary);await persistConfirmationShiftCore(core);return result;})};})();`;
  vm.runInContext(src,cx);
  const base={date:'2026-10-06',jobId:'JOB_CFT',taskIndex:1,totalTasks:2,timestamp:Date.now(),trackerState:'active'};
  await cx.test.applyEvent({...base,eventId:'start',type:'task-start'});await cx.test.applyEvent({...base,eventId:'pending',type:'submit-pending'});await cx.test.applyEvent({...base,eventId:'confirmed',type:'submit-confirmed'});assert.equal((await cx.test.context()).summary.interval1,1);
  await cx.test.adopt({sessionId:'cft-a',generation:0,status:'completed',locked:true,reportDate:'2026-10-06'},{interval1:1,interval2:0,interval3:0,submitted:1,trackerState:'offline'});const frozen=await cx.test.applyEvent({...base,eventId:'after-out',type:'submit-confirmed'});assert.equal(frozen.frozen,true);assert.equal((await cx.test.context()).summary.interval1,1);
  await cx.test.adopt({sessionId:'cft-b',generation:0,status:'active',locked:false,reportDate:'2026-10-07'},null);assert.equal((await cx.test.context()).summary.submitted,0);
}
await exerciseCoverageLocalSession();
await exerciseConfirmationLocalSession();

console.log('PASS v2.2.21 shift sessions: Time In starts session, Time Out locks/archives final totals, next Time In starts fresh, Reset Current Shift is audited + generation-bound');

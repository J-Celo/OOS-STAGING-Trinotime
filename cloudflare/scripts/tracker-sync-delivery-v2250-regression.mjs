import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const worker=read('../src/worker.js');
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const shift={sessionId:'sync-fixture',generation:1,status:'active',reportDate:date};
const server=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
coverageRequireBridgeActorServer=confirmationRequireBridgeActorServer=async()=>({name:'Fixture Agent',pod:'fixture',uid:'fixture',tokenId:'fixture',bridge:{deviceId:'fixture-device'}});
trackerShiftResolveForActorServer=async env=>env.shift;
trackerShiftWorkflowSnapshotServer=async env=>env.previous||null;
firebaseAdminPatch=async(env,root,updates)=>{for(const [key,val]of Object.entries(updates)){env.records[key]=val;if(key.includes('/daily/'))env.previous=val;}};
globalThis.handlers={coverage:coverageSyncServer,confirmation:confirmationSyncServer};`,server);
function setup(workflow,count=170){
 const key=workflow==='coverage'?'CAT':'CFT';
 const source=read('../../tracker/'+workflow+'-background.js');
 const jobs={},tasks={};
 for(let i=1;i<=count;i++){const jobId='JOB_'+String(i).padStart(5,'0');jobs[jobId]={jobId,submitted:1,totalTasks:1};tasks[jobId+'|1']={jobId,taskIndex:1,totalTasks:1,submitted:true,interval:1};}
 let state={settings:{syncEnabled:true,dailyGoal:300,reportDate:date},shift:{...shift},bridge:{token:'fixture-token',baseUrl:'https://fixture.invalid',deviceId:'fixture-device'},data:{dates:{[date]:{summary:{submitted:count,interval1:count,interval2:0,interval3:0,currentInterval:1,clientSequence:count},jobs,tasks}}},pending:{[date]:[...Object.keys(tasks),'summary']},sync:{},storeNames:{}};
 const env={shift:{...shift},records:{},previous:null};let mode='ok',hook=null,requests=[];let writes=Promise.resolve();const timers=[];
 const constants={data:'data',pendingTasks:'pending',bridge:'bridge',settings:'settings',shift:'shift',sync:'sync'};
 const ctx=vm.createContext({console,Date,Number,Math,JSON,String,Boolean,Array,Object,Set,Error,Promise,AbortController,
  [key]:constants,SUMMARY_PENDING_KEY:'summary',recoveryInProgress:false,syncWakeTimer:null,syncInFlight:null,syncFollowUpRequested:false,syncBackoffUntil:0,syncFailureCount:0,lastSyncAttemptAt:0,
  setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout:()=>{},
  readCore:async()=>structuredClone(state),queue:fn=>{writes=writes.then(fn,fn);return writes;},
  shiftIsActive:c=>c.shift.status==='active',reportDateForCore:c=>c.shift.reportDate,
  num:v=>Math.max(0,Math.floor(Number(v)||0)),epochMs:v=>Math.max(0,Math.floor(Number(v)||0)),
  ensureDate:(data,d)=>data.dates[d],storeNameFromMap:()=>'',syncSummarySnapshot:s=>({...s}),
  pendingAdd:(p,d,k)=>{p[d]??=[];if(!p[d].includes(k))p[d].push(k)},diag:async()=>{},
  chrome:{storage:{local:{get:async()=>({}),set:async obj=>{for(const [k,v]of Object.entries(obj))state[k]=structuredClone(v)}}}},
  fetch:async(url,options)=>{
    if(mode==='hang')return new Promise((_,reject)=>options.signal?.addEventListener('abort',()=>reject(new Error('aborted'))));
    if(mode==='offline')throw new Error('offline');
    if(mode==='unauthorized')return Response.json({message:'unauthorized'},{status:401});
    if(url.endsWith('/shift-state')){if(hook)await hook();return Response.json({ok:true,shift:env.shift,summary:env.previous});}
    const body=JSON.parse(options.body);requests.push(body);
    const result=await server.handlers[workflow](new Request(url,options),env);
    if(hook)await hook();
    if(mode==='lost-ack')throw new Error('response lost after commit');
    if(mode==='malformed')return Response.json({ok:true});
    return Response.json(result);
  },
 });
 ctx[workflow==='coverage'?'adoptShiftIntoCoverageCore':'adoptShiftIntoConfirmationCore']=(core,s)=>{core.shift=s;return{shift:s,day:core.data.dates[date],identityChanged:false}};
 ctx[workflow==='coverage'?'persistCoverageShiftCore':'persistConfirmationShiftCore']=async core=>{state=structuredClone(core)};
 // Real sync code and refresh path, with transport/storage simulated.
 let start=source.indexOf('// Sync transport v2.2.50');if(start<0)start=source.indexOf('function scheduleSyncSoon(');
 const end=source.indexOf(workflow==='coverage'?'async function adjustSubmitted(':'async function adjustInterval(',start);
 vm.runInContext(source.slice(start,end),ctx);
 const refreshStart=source.indexOf('async function refreshShiftState('),refreshEnd=source.indexOf(workflow==='coverage'?'async function resetCurrentShift(':'async function handleTrinoTimeSessionEnding(',refreshStart);
 vm.runInContext(source.slice(refreshStart,refreshEnd),ctx);
 return {ctx,env,timers,requests,get state(){return state},setMode:v=>mode=v,setHook:v=>hook=v};
}
for(const workflow of ['coverage','confirmation']){
 const f=setup(workflow);
 for(let i=0;i<5&&f.state.pending[date].length;i++)await f.ctx.syncDirty(false);
 assert.equal(f.state.pending[date].length,0,workflow+': drains more than 150 tasks without new user activity');
 assert.equal(Object.keys(f.env.records).filter(k=>k.includes('/jobs/')).length,170,workflow+': syncs jobs beyond first 80');
 assert.equal(Object.keys(f.env.records).filter(k=>k.includes('/tasks/')).length,170);
 assert.equal(f.env.previous.submitted,170);
 console.log('PASS',workflow,'multi-batch backlog and >80 jobs');
}
for(const workflow of ['coverage','confirmation']){
  // Server committed, client lost response: retry preserves cumulative counts.
  const lost=setup(workflow,3);lost.setMode('lost-ack');
  assert.equal((await lost.ctx.syncDirty()).ok,false);
  assert.ok(lost.state.pending[date].length);assert.equal(lost.env.previous.submitted,3);
  lost.setMode('ok');await lost.ctx.syncDirty();
  assert.equal(lost.state.pending[date].length,0);assert.equal(lost.env.previous.submitted,3);
  assert.ok(lost.requests[1].clientSequence>lost.requests[0].clientSequence);
  // No acknowledgment / HTTP error can clear pending records.
  for(const failure of ['offline','unauthorized','malformed']){
    const f=setup(workflow,2);f.setMode(failure);const result=await f.ctx.syncDirty();
    assert.equal(result.ok,false);assert.ok(f.state.pending[date].length);
    assert.equal(f.state.data.dates[date].summary.submitted,2);
    f.setMode('ok');assert.equal((await f.ctx.syncDirty()).ok,true);assert.equal(f.state.pending[date].length,0);
  }
  // New work while fetch is in flight must remain dirty after its older ACK.
  const concurrent=setup(workflow,1);
  concurrent.setHook(()=>{
    const day=concurrent.state.data.dates[date];day.summary.clientSequence++;day.summary.activeMs=100;
    day.tasks['JOB_00001|1'].activeMs=100;
  });
  await concurrent.ctx.syncDirty();assert.ok(concurrent.state.pending[date].includes('JOB_00001|1'));
  concurrent.setHook(null);await concurrent.ctx.syncDirty();assert.equal(concurrent.state.pending[date].length,0);
  assert.equal(concurrent.env.previous.activeMs,100);
  // Responses from a previous connection may not restore it or clear new work.
  for(const change of ['disconnect','reconnect','shift']){
    const f=setup(workflow,1);f.setHook(()=>{
      if(change==='disconnect')f.state.bridge=null;
      if(change==='reconnect')f.state.bridge.token='new-token';
      if(change==='shift')f.state.shift.sessionId='new-shift';
      f.state.sync={state:'new-context'};
    });
    assert.equal((await f.ctx.syncDirty()).contextChanged,true);
    assert.ok(f.state.pending[date].length);assert.equal(f.state.sync.state,'new-context');
    if(change==='disconnect')assert.equal(f.state.bridge,null);
    if(change==='reconnect')assert.equal(f.state.bridge.token,'new-token');
  }
  const refresh=setup(workflow,1);refresh.setHook(()=>{refresh.state.bridge.token='new-token';refresh.state.shift.sessionId='new-shift';});
  await assert.rejects(refresh.ctx.refreshShiftState(),e=>e.code==='TRACKER_CONTEXT_CHANGED');
  assert.equal(refresh.state.shift.sessionId,'new-shift');
  // Explicit timer dispatch: a stalled HTTP request cannot pin syncInFlight.
  const hung=setup(workflow,1);hung.setMode('hang');const attempt=hung.ctx.syncDirty();
  for(let i=0;i<20&&!hung.timers.some(t=>t.ms===20000);i++)await new Promise(r=>setImmediate(r));
  const deadline=hung.timers.find(t=>t.ms===20000);assert.ok(deadline);deadline.fn();
  assert.equal((await attempt).ok,false);assert.equal(hung.ctx.syncInFlight,null);assert.ok(hung.state.pending[date].length);
  hung.setMode('ok');assert.equal((await hung.ctx.syncDirty()).ok,true);
  // Never increment through a genuine newer-server conflict to overwrite it.
  const conflict=setup(workflow,1);
  conflict.env.previous={deviceId:'fixture-device',shiftSessionId:shift.sessionId,shiftGeneration:1,clientSequence:100,submitted:100,interval1:100};
  await conflict.ctx.syncDirty();const seq=conflict.state.data.dates[date].summary.clientSequence;
  assert.equal((await conflict.ctx.syncDirty()).conflict,true);assert.equal(conflict.state.data.dates[date].summary.clientSequence,seq);
  assert.equal(conflict.env.previous.submitted,100);assert.ok(conflict.state.pending[date].length);
  console.log('PASS',workflow,'lost ACK, outages/auth/malformed ACK, concurrent edits, reconnect/disconnect/shift guards, timeout, stale-server conflict preservation');
  // Execute the original adoption/archive functions against an older server summary.
  const source=read('../../tracker/'+workflow+'-background.js');
  const archive=vm.createContext({Date,Number,Math,String,Boolean,Array,Object,JSON,
    num:v=>Math.max(0,Math.floor(Number(v)||0)),epochMs:v=>Number(v)||0,dateKey:()=>date,
    ensureDate:(data,d)=>data.dates[d],blankSummary:()=>({}),blankDate:()=>({summary:{},jobs:{},tasks:{}}),
    trackerState:(s,f)=>s||f,normalizeIntervalAdjustments:s=>{s.submitted=(s.interval1||0)+(s.interval2||0)+(s.interval3||0)},
  });
  vm.runInContext(source.slice(source.indexOf('function cleanShift('),source.indexOf('function localOwnerIdentity(')),archive);
  const core=structuredClone(setup(workflow,10).state);
  const adopt=archive[workflow==='coverage'?'adoptShiftIntoCoverageCore':'adoptShiftIntoConfirmationCore'];
  adopt(core,{...shift,status:'completed'},{submitted:3,interval1:3,clientSequence:3});
  const saved=Object.values(core.data.shiftArchivesV1)[0];
  assert.equal(saved.day.summary.submitted,10,'Archive retains original UNSYNCED totals before applying server snapshot');
  assert.equal(saved.unacknowledgedKeys.length,11);assert.equal(saved.requiresManualReconciliation,true);
  assert.equal(core.pending[date].length,0,'Closed shift is not automatically replayed');
  console.log('PASS',workflow,'original local totals and dirty records preserved in shift archive');
}
for(const workflow of ['coverage','confirmation']){
  const f=setup(workflow,1),title=workflow==='coverage'?'Coverage':'Confirmation';
  const source=read('../../tracker/'+workflow+'-background.js');
  f.ctx.TRINOTIME='https://fixture.invalid';f.ctx.dateKey=()=>date;
  f.ctx.ensureDevice=async()=> 'fixture-device';
  f.ctx.chrome.tabs={query:async()=>[{id:1,url:'https://fixture.invalid/',active:true}]};
  f.ctx.URL=URL;f.ctx.chrome.scripting={executeScript:async()=>[{result:{pair:{ok:true,bridgeToken:'reconnected',deviceId:'fixture-device',actor:{name:'Fixture Agent'},shift}}}]};
  f.ctx['prepare'+title+'Identity']=async()=>({identity:'fixture agent',ownerChanged:false});
  f.ctx.localSummaryHasActivity=()=>true;f.ctx.syncDirty=async()=>({ok:true});
  f.setHook(()=>{
    // Arrives while pairing's fallback shift-state request is awaiting a response.
    f.state.data.dates[date].summary.submitted=9;
    f.state.data.dates[date].summary.interval1=9;
    f.state.data.dates[date].summary.clientSequence=9;
    f.state.data.dates[date].tasks['JOB_00001|1'].activeMs=999;
  });
  const start=source.indexOf('async function pairTrinoTime(');
  const end=workflow==='coverage'?source.indexOf('// Explicit two-factor',start):source.indexOf('async function trackerRecoveryCall',start);
  vm.runInContext(source.slice(start,end),f.ctx);
  assert.equal((await f.ctx.pairTrinoTime()).ok,true);
  assert.equal(f.state.data.dates[date].summary.submitted,9);
  assert.equal(f.state.data.dates[date].tasks['JOB_00001|1'].activeMs,999);
  assert.equal(f.state.bridge.token,'reconnected');
  console.log('PASS',workflow,'reconnect preserves work recorded while waiting for server');
}

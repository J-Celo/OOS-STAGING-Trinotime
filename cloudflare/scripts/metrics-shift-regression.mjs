import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {OOS_QA_INDEPENDENT_POD,oosQaManifestCurrent,resolveOosCoverageBetaQas} from '../src/oos-coverage-beta-qas.js';
const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const c=vm.createContext({URL,URLSearchParams,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({}),OOS_QA_INDEPENDENT_POD,oosQaManifestCurrent,resolveOosCoverageBetaQas});
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
const store=new Map();
firebaseAdminGet=async(env,path)=>store.get(path)||null;
firebaseAdminGetWithEtag=async(env,path)=>({value:store.get(path)||null,etag:'fixture'});
firebaseAdminSetIfMatch=async(env,path,value)=>{if(store.has(path))return {committed:false,value:store.get(path)};store.set(path,value);return {committed:true,value};};
firebaseAdminPatch=async(env,path,updates)=>{for(const [k,v] of Object.entries(updates))store.set(k,v);};
qcMetricsHistoryReadServer=async(env,key,limit)=>Array.from(store.entries()).filter(([k])=>k.startsWith(QC_METRICS_SHIFTS_PATH+'/'+key+'/')).map(([,v])=>v).sort((a,b)=>b.startedAtMs-a.startedAtMs).slice(0,limit);
requireWorkforceAttendanceActor=async(request,env)=>env.actor;
coverageVisibleAgentsServer=async(env,actor)=>({state:{podDirectory:{entries:[]}},agents:env.agents});
globalThis.t={handle:handleWorkforceMetricsApi,store,snapshot:qcMetricsSnapshotServer,finalize:qcMetricsFinalizeServer,shifts:qcMetricsShiftsServer,archive:trackerShiftArchiveWorkflowsServer,key:coverageActorKeyServer,encode:fbEncodeKeyServer};`,c);
const t=c.t,agent={role:'agent',name:'One',pod:'p1'},other={role:'agent',name:'Two',pod:'p2'},key=t.key('agent','One');
const shift={sessionId:'s1',generation:0,status:'active',reportDate:'2026-10-06',startedAt:'2026-10-06T15:00:00Z',startedAtMs:1791298800000,name:'One',pod:'p1'};
const raw={shiftSessionId:'s1',shiftGeneration:0,pod:'p1',submitted:10,efficiencyTaskCount:10,efficiencyActiveMs:100000,created:4,blurred:3,productMatched:6,deleted:2,serverUpdatedAtMs:1};
const targets={[t.encode('p1')]:{coverage:{'2026-10-01':{secondsPerTask:10}}}};
t.store.set('workforceMetrics/v1/targets',targets);
const snap=t.snapshot(shift,agent,raw,null,targets,'POD 1');assert.equal(snap.rows[0].grade,'A');assert.equal(snap.rows[0].productMatched,6);assert.equal(snap.rows[1].grade,null);
assert.equal(t.snapshot(shift,agent,{...raw,shiftSessionId:'old'},null,targets,'POD 1').rows[0].submitted,0);
assert.equal(t.snapshot({...shift,generation:1},agent,raw,null,targets,'POD 1').rows[0].submitted,0);
const completed={...shift,status:'completed',endedAt:'2026-10-07T04:00:00Z'};
const frozen=await t.finalize({},completed,key,raw,null);assert(frozen.locked);targets[t.encode('p1')].coverage['2026-10-01'].secondsPerTask=99;
assert.equal((await t.finalize({},completed,key,{...raw,submitted:500},null)).rows[0].submitted,10);assert.equal(frozen.rows[0].target.secondsPerTask,10);
t.store.set('workforceTrackerShift/v1/current/'+key,completed);
const state={podDirectory:{entries:[{id:'p1',name:'POD 1'}]}},url=new URL('https://test/shifts?range=current');
const current=await t.shifts({},url,agent,'agent',state,[agent],['p1']);assert.equal(current.rows[0].submitted,10);assert.equal(current.rows[0].grade,'A');
// Locked snapshots remain immutable in storage; earlier >100% indexes are capped on outbound reads only.
frozen.rows[0].efficiencyPercent=200;
const previous=await t.shifts({},url,agent,'agent',state,[agent],['p1']);
assert.equal(previous.rows[0].efficiencyPercent,100,'older score displays max 100%');
assert.equal(frozen.rows[0].efficiencyPercent,200,'stored locked scorecard remains untouched');
await assert.rejects(t.shifts({},new URL('https://test/shifts?agent=Two'),agent,'agent',state,[agent],['p1']),e=>e.code==='METRICS_AGENT_OUT_OF_SCOPE');
await assert.rejects(t.shifts({},new URL('https://test/shifts?range=30'),{role:'admin'},'admin',state,[agent,other],['p1','p2']),e=>e.code==='METRICS_SELECT_AGENT');
assert.equal((await t.shifts({},new URL('https://test/shifts?range=7'),agent,'agent',state,[agent],['p1'])).shifts.length,1);
const legacy={...completed,sessionId:'legacy'};t.store.set('workforceTrackerShift/v1/current/'+key,legacy);t.store.set('workforceTrackerShift/v1/sessions/'+key+'/'+t.encode('legacy')+'/coverage/summary',{...raw,shiftSessionId:'legacy'});
const old=await t.shifts({},url,agent,'agent',state,[agent],['p1']);assert.equal(old.shifts[0].targetSnapshot,false);assert.equal(old.rows[0].submitted,10);assert.equal(old.rows[0].grade,null);
// Archive isolation: wrong-session daily data cannot be credited to a new shift.
t.store.set('workforceCoverage/v1/daily/2026-10-06/'+key,{...raw,shiftSessionId:'different'});
await t.archive({}, {...completed,sessionId:'s2'},key);
const s2=Array.from(t.store.values()).find(v=>v?.schemaVersion===2&&v.sessionId==='s2');assert.equal(s2.rows[0].submitted,0);
// Replay cannot repopulate the already finalized empty shift from a later daily record.
t.store.set('workforceCoverage/v1/daily/2026-10-06/'+key,{...raw,shiftSessionId:'s2'});await t.archive({}, {...completed,sessionId:'s2'},key);assert.equal(s2.rows[0].submitted,0);
console.log('PASS shift Metrics: generation/session isolation, immutable targets/counts, legacy ungraded, bounded history selection, out-of-scope denial, archive isolation/replay');

// M2: scope/POD summaries must be independent of the ten-Agent roster page.
const manyAgents=Array.from({length:15},(_,i)=>({role:'agent',name:`Agent ${String(i+1).padStart(2,'0')}`,pod:i<12?'p1':'p2'}));
const aggregateTargets={
 [t.encode('p1')]:{coverage:{'2026-10-01':{secondsPerTask:10}}},
 [t.encode('p2')]:{coverage:{'2026-10-01':{secondsPerTask:10}}}
};
t.store.set('workforceMetrics/v1/targets',aggregateTargets);
const aggregateShiftRoot={},aggregateCoverageRoot={};
for(const [i,a] of manyAgents.entries()){
 const actorKey=t.key('agent',a.name),sessionId=`agg-${i+1}`;
 const shiftRow={sessionId,generation:0,status:'active',reportDate:'2026-10-06',startedAt:'2026-10-06T12:00:00Z',startedAtMs:1791288000000+i,name:a.name,pod:a.pod};
 const coverageRow={shiftSessionId:sessionId,shiftGeneration:0,pod:a.pod,submitted:1,efficiencyTaskCount:1,efficiencyActiveMs:10000,activeMs:10000,idleMs:0,awayMs:0,awayTimingAvailable:true,serverUpdatedAtMs:100+i};
 aggregateShiftRoot[actorKey]=shiftRow;aggregateCoverageRoot[actorKey]=coverageRow;
 t.store.set('workforceTrackerShift/v1/current/'+actorKey,shiftRow);
 t.store.set('workforceCoverage/v1/daily/2026-10-06/'+actorKey,coverageRow);
}
t.store.set('workforceTrackerShift/v1/current',aggregateShiftRoot);
t.store.set('workforceCoverage/v1/daily/2026-10-06',aggregateCoverageRoot);
t.store.set('workforceConfirmation/v1/daily/2026-10-06',{});
const aggregateState={podDirectory:{entries:[{id:'p1',name:'POD 1'},{id:'p2',name:'POD 2'}]}};
const aggregateResult=await t.shifts({},new URL('https://test/shifts?range=current'),{role:'admin',name:'Admin',pod:''},'admin',aggregateState,manyAgents,['p1','p2']);
assert.equal(aggregateResult.shifts.length,10,'visible shift cards remain paginated');
assert.equal(aggregateResult.rows.length,20,'visible roster has two workflow rows per paginated Agent');
assert.equal(aggregateResult.nextOffset,10);
assert.equal(aggregateResult.aggregate.overall.agents,15,'scope summary covers all authorized Agents');
assert.equal(aggregateResult.aggregate.overall.totalSubmitted,15,'scope totals include Agents outside page 1');
assert.equal(aggregateResult.aggregate.overall.grade,'A');
assert.equal(aggregateResult.aggregate.pods.length,2);
assert.equal(aggregateResult.aggregate.pods.find(p=>p.pod==='p1').summary.totalSubmitted,12);
assert.equal(aggregateResult.aggregate.pods.find(p=>p.pod==='p2').summary.totalSubmitted,3);
const tlScope=manyAgents.filter(a=>a.pod==='p1');
const tlAggregate=await t.shifts({},new URL('https://test/shifts?range=current'),{role:'team_leader',name:'TL',pod:'p1'},'team_leader',aggregateState,tlScope,['p1']);
assert.equal(tlAggregate.shifts.length,10);
assert.equal(tlAggregate.aggregate.overall.agents,12,'TL full-POD summary includes Agents beyond page 1');
assert.equal(tlAggregate.aggregate.overall.totalSubmitted,12);
assert.match(aggregateResult.historyNote,/all authorized Agents/i);
console.log('PASS Shift Metrics M2: full-scope and POD summaries are server-authoritative and independent of ten-Agent roster pagination');
// Test bounded scope-aggregate math without DOM: earned time is capped per workflow.
const ui=fs.readFileSync(new URL('../public/assets/js/j-agent-metrics-rc22.js',import.meta.url),'utf8');
const aggregate=ui.slice(ui.indexOf('function capScore('),ui.indexOf('function duration('));
const calc=vm.runInNewContext('(function(){const gradeFor=s=>s===null?"NA":s>=100?"A":"F";'+aggregate+';return summarize;})()');
const result=calc([{name:'One',submitted:1,measuredTasks:1,measuredActiveMs:1000,target:{secondsPerTask:10},efficiencyPercent:1000},{name:'One',submitted:1,measuredTasks:1,measuredActiveMs:100000,target:{secondsPerTask:10},efficiencyPercent:10}]);
assert(Math.abs(result.efficiency-11000/101000*100)<1e-8, 'high performer is capped before averaging');
assert.equal(calc([{measuredTasks:1,measuredActiveMs:1000,target:null,efficiencyPercent:null}]).efficiency,null);
console.log('PASS mixed-workflow earned-time weighting and missing-target ungraded aggregate');

// New endpoints retain canonical scope before reading any requested reset records.
const auditUrl=new URL('https://test/api/workforce/metrics/reset-audit?agent=Two&session=s1');
await assert.rejects(t.handle(new Request(auditUrl),{actor:agent,agents:[agent]},auditUrl),e=>e.code==='METRICS_AGENT_OUT_OF_SCOPE');
const ownAudit=new URL('https://test/api/workforce/metrics/reset-audit?agent=One&session=s1');
await assert.rejects(t.handle(new Request(ownAudit),{actor:agent,agents:[agent]},ownAudit),e=>e.code==='METRICS_SHIFT_OUT_OF_SCOPE');
console.log('PASS reset audit rejects out-of-scope Agent and unknown shift');

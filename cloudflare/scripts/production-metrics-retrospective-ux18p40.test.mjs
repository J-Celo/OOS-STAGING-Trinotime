/** UX18P40: owner-approved Oct 28 retrospective display; no Firebase writes. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const src=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/assets/js/j-agent-metrics-rc22.js',import.meta.url),'utf8');
const c=vm.createContext({console,URL,URLSearchParams,Request,Response,Headers,TextEncoder,TextDecoder,crypto:webcrypto,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(src.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
const store=new Map();let writes=0;
firebaseAdminGet=async(_env,key)=>store.get(key)||null;
firebaseAdminGetWithEtag=async(_env,key)=>({value:store.get(key)||null,etag:'etag'});
firebaseAdminSetIfMatch=async()=>{writes++;throw Error('No writes allowed during retrospective reads');};
qcMetricsHistoryReadServer=async(_env,key,limit)=>Array.from(store.entries()).filter(([k])=>k.startsWith(QC_METRICS_SHIFTS_PATH+'/'+key+'/')).map(([,v])=>v).slice(0,limit);
globalThis.t={project:qcMetricsRetrospectiveShiftServer,resolve:qcMetricTargetServer,summary:qcMetricSummaryServer,shifts:qcMetricsShiftsServer,aggregate:qcMetricAggregateServer,store,getWrites:()=>writes,encode:fbEncodeKeyServer,key:coverageActorKeyServer,shiftKey:qcMetricsShiftKeyServer};`,c);
const t=c.t;
const dir={entries:[{id:'pod0',name:'POD 0',active:true},{id:'pod1',name:'POD 1',active:true}]};
const shift=(date,rows,overrides={})=>({schemaVersion:2,sessionId:'sid',pod:'pod0',name:'Bacanto',locked:true,status:'completed',startedAt:`${date}T01:00:00Z`,startedAtMs:Date.parse(`${date}T01:00:00Z`),endedAt:`${date}T10:00:00Z`,rows,...overrides});
const row=(job,seconds=70.47,count=176)=>({name:'Bacanto',pod:'pod0',job,shiftSessionId:'sid',shiftStatus:'completed',submitted:count,measuredTasks:count,measuredActiveMs:count*seconds*1000,secondsPerTask:seconds,target:null,efficiencyPercent:null,grade:null});
for(const date of ['2026-10-28','2026-10-29','2026-10-30']){
 const original=shift(date,[row('coverage'),row('confirmation',39.88,215)]),jsonBefore=JSON.stringify(original);
 const output=t.project(original,null,dir);
 assert.equal(output.rows[0].grade,'B',`${date}: 70/70.47 is just below 100%, B`);
 assert.equal(output.rows[1].grade,'A',`${date}: 70/39.88 >= 100% capped to A`);
 assert.equal(output.rows[0].target.effectiveDate,'2026-10-28');
 assert.equal(output.rows[0].gradeSource,'retrospective');
 assert.equal(output.hasRetrospectiveGrade,true);
 assert.equal(t.summary(output.rows).retrospectiveCount,2);
 assert.equal(t.summary(output.rows).grade,'B','combined grade includes both workflows');
 assert.equal(JSON.stringify(original),jsonBefore,'original frozen snapshot never mutated');
}
const old=shift('2026-10-27',[row('coverage')]);assert.equal(t.project(old,null,dir),old,'before Oct 28 remains untouched');
const existing=shift('2026-10-28',[{...row('coverage'),target:{secondsPerTask:60},grade:'C',efficiencyPercent:60}]);assert.equal(t.project(existing,null,dir),existing,'existing frozen grades cannot be revised');
const saved={[t.encode('pod0')]:{coverage:{'2026-10-28':{secondsPerTask:60,pod:'pod0'}},confirmation:{'2026-10-30':{secondsPerTask:80,pod:'pod0'}}}};
assert.equal(t.project(shift('2026-10-28',[row('coverage')]),saved,dir).rows[0].target.secondsPerTask,60,'effective saved target overrides default');
assert.equal(t.project(shift('2026-10-29',[row('confirmation')]),saved,dir).rows[0].target.secondsPerTask,70,'future saved target cannot override October 29');
assert.equal(t.project(shift('2026-10-30',[row('confirmation')]),saved,dir).rows[0].target.secondsPerTask,80,'saved target applies from October 30');
for(const invalid of [
 shift('2026-10-28',[{...row('coverage'),measuredTasks:0}]),
 shift('2026-10-28',[{...row('coverage'),measuredActiveMs:0}]),
 shift('2026-10-28',[{...row('coverage'),submitted:2}]),
 shift('2026-10-28',[{...row('coverage'),shiftSessionId:'different'}]),
 shift('2026-10-28',[{...row('coverage'),pod:'anotherPod'}]),
 shift('2026-10-28',[{...row('coverage'),job:'unknown'}]),
 shift('2026-10-28',[row('coverage')],{endedAt:null,startedAt:null,startedAtMs:0}),
 shift('2026-10-28',[row('coverage')],{locked:false}),
 ])assert.equal(t.project(invalid,null,dir),invalid,'never project unreliable or unlocked evidence');
const missing=shift('2026-10-28',[{...row('coverage'),measuredTasks:0}]);assert.equal(t.summary(t.project(missing,null,dir).rows).grade,null);
// The Current/latest UI aggregate must use the *same* projected snapshots, including outside page one.
const roster=Array.from({length:12},(_,i)=>({name:'Agent '+i,pod:'pod0'}));
const root={};const store=t.store;
for(const agent of roster){
 const key=t.key('agent',agent.name),completed={sessionId:`sid-${agent.name}`,pod:'pod0',name:agent.name,locked:true,status:'completed',reportDate:'2026-10-28',startedAt:'2026-10-28T01:00:00Z',startedAtMs:Date.parse('2026-10-28T01:00:00Z'),endedAt:'2026-10-28T10:00:00Z'};
 root[key]=completed;
 store.set('workforceMetrics/v2/shifts/'+key+'/'+t.shiftKey(completed),shift('2026-10-28',[{...row('coverage',70,1),name:agent.name,shiftSessionId:completed.sessionId}],{sessionId:completed.sessionId,name:agent.name}));
}
store.set('workforceTrackerShift/v1/current',root);
const state={podDirectory:dir};
const current=await t.shifts({},new URL('https://test/shifts?range=current'),{role:'admin',name:'Admin',pod:''},'admin',state,roster,['pod0']);
assert.equal(current.rows.length,10,'visible roster stays paginated to ten agents');
assert.equal(current.aggregate.overall.retrospectiveCount,12,'all 12 valid historical grades represented in scope summary');
assert.equal(current.aggregate.pods[0].jobs.coverage.grade,'A');
assert.equal(current.nextOffset,10);
assert.equal((await t.shifts({},new URL('https://test/shifts?range=7'),{role:'agent',name:'Agent 0',pod:'pod0'},'agent',state,[roster[0]],['pod0'])).rows[0].grade,'A','locked history read projection included');
assert.equal(t.getWrites(),0,'no firebase write during projection, aggregates or history');
assert.match(ui,/r\.gradeSource==='retrospective'/,'UI flags projected grades');
assert.match(ui,/original lock unchanged/i);
assert.match(ui,/Retrospective grade included/,'POD summaries disclose projection');
console.log('PASS UX18P40: Oct28/29/30 default, effective saved overrides, immutable scorecards, trusted timing + session + dates, scoped current/history projections, full-POD aggregation, explicit provenance, zero Firebase writes');

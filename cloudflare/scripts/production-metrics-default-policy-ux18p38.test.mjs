/** UX18P38: test real Worker resolver and grade calculation offline; do not touch Firebase. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const base=new URL('../',import.meta.url);
const worker=fs.readFileSync(new URL('src/worker.js',base),'utf8');
const ui=fs.readFileSync(new URL('public/assets/js/j-agent-metrics-rc22.js',base),'utf8');
const html=fs.readFileSync(new URL('public/index.html',base),'utf8');
const c=vm.createContext({console,URL,URLSearchParams,TextEncoder,TextDecoder,Buffer,fetch:async()=>{},crypto:globalThis.crypto,atob,btoa,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
globalThis.t={resolve:qcMetricTargetServer,encode:fbEncodeKeyServer,snapshot:qcMetricsSnapshotServer,summary:qcMetricSummaryServer,aggregate:qcMetricAggregateServer};`,c);
const t=c.t;
const dir={entries:[{id:'pod0',name:'POD 0',active:true},{id:'pod1',name:'POD 1',active:true},{id:'qateam',name:'OOS Coverage Beta QAs',active:true}]};
for(const pod of ['pod0','POD 0','pod1','POD 1','qateam','brand new team']){
 for(const job of ['coverage','confirmation']){
  const actual=t.resolve(null,pod,job,'2026-10-30',dir);
  assert.equal(actual?.secondsPerTask,70,`${pod} ${job} starts at 70 without saved config`);
  assert.equal(actual?.source,'default');
  assert.equal(t.resolve({},pod,job,'2026-10-31',dir).secondsPerTask,70);
  assert.equal(t.resolve({},pod,job,'2026-10-28',dir)?.secondsPerTask,70,'owner-approved October 28 applies');
  assert.equal(t.resolve({},pod,job,'2026-10-29',dir)?.secondsPerTask,70,'October 29 now applies');
  assert.equal(t.resolve({},pod,job,'2026-10-27',dir),null,'policy cannot predate October 28');
 }
}
assert.equal(t.resolve({},'pod0','not-a-job','2026-10-30',dir),null);
assert.equal(t.resolve({},'','coverage','2026-10-30',dir),null);
const targets={
 [t.encode('pod0')]:{coverage:{'2026-10-25':{secondsPerTask:60,pod:'pod0'}},confirmation:{'2026-11-01':{secondsPerTask:45,pod:'pod0'}}},
 [t.encode('pod1')]:{confirmation:{'2026-10-30':{secondsPerTask:82,pod:'pod1'}}}
};
assert.equal(t.resolve(targets,'POD 0','coverage','2026-10-30',dir).secondsPerTask,60,'prior saved target overrides policy');
assert.equal(t.resolve(targets,'pod0','coverage','2026-10-30',dir).source,'saved');
assert.equal(t.resolve(targets,'pod0','confirmation','2026-10-30',dir).secondsPerTask,70,'future-dated saved target cannot override early');
assert.equal(t.resolve(targets,'pod0','confirmation','2026-11-01',dir).secondsPerTask,45,'future saved target begins on effective date');
assert.equal(t.resolve(targets,'pod1','confirmation','2026-10-31',dir).secondsPerTask,82,'each job and POD are independent');
const agent={name:'Agent',pod:'pod1'},shift={sessionId:'sid',generation:0,status:'active',reportDate:'2026-10-30',startedAt:'2026-10-30T02:00:00Z',startedAtMs:1793325600000};
const cov={shiftSessionId:'sid',shiftGeneration:0,pod:'pod1',submitted:2,efficiencyTaskCount:2,efficiencyActiveMs:140000};
const conf={shiftSessionId:'sid',shiftGeneration:0,pod:'pod1',submitted:1,efficiencyTaskCount:1,efficiencyActiveMs:70000};
const snap=t.snapshot(shift,agent,cov,conf,null,'POD 1',dir,'2026-10-30');
assert.equal(snap.rows[0].grade,'A');assert.equal(snap.rows[1].grade,'A');
assert.equal(t.summary(snap.rows).grade,'A','combined has policy targets for both measured workflows');
const completed={...shift,status:'completed',endedAt:'2026-10-30T10:00:00Z'};
const legacy=t.snapshot(completed,agent,cov,conf,null,'POD 1',dir,'',false);
assert.equal(legacy.rows[0].target,null,'legacy frozen reports do not receive new fallback');
assert.equal(legacy.rows[0].grade,null);
const groups=t.aggregate([...snap.rows],{podDirectory:dir});
assert.equal(groups.pods[0].jobs.coverage.grade,'A');
assert.equal(groups.pods[0].jobs.confirmation.grade,'A');
assert.match(ui,/filter==='all'\?item\.summary:item\.jobs\?\.\[filter\]/,'POD comparison honors selected workflow');
assert.match(ui,/Automatic policy: 70s\/task/,'default labeled accurately in Admin UI');
assert.match(worker,/resolved\.source!=='saved'/,'custom save cannot verify against mere policy fallback');
assert.match(html,/default-target-policy-ux18p38=20261030/,'cache bust for changed Metrics script');
console.log('PASS UX18P38: global 70s Coverage+Confirmation policy, saved overrides, effective dates, scope aggregates, immutable legacy, UI labels, readback and cache bust');

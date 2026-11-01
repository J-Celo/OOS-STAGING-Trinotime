import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const trackerDir=new URL('../../tracker/',import.meta.url);
const coverage=fs.readFileSync(new URL('coverage.js',trackerDir),'utf8');
let bg=fs.readFileSync(new URL('coverage-background.js',trackerDir),'utf8');
const worker=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../public/assets/js/j-coverage-dashboard-rc20.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/assets/css/c-coverage-dashboard-v1.css',import.meta.url),'utf8');
const must=(ok,msg)=>{assert.ok(ok,msg);console.log('PASS — '+msg)};

must(coverage.includes("countFrom(text, 'Out of Stock Confirmed')"),'Tracker reads Augmoto Out of Stock Confirmed (N) as Product Match authority');
must(coverage.includes("emitAction('product-matched')")&&coverage.includes("emitAction('product-match-remove')"),'Tracker emits add/remove Product Match events');
must(coverage.includes('current.productMatched === null')&&coverage.includes('sameCandidate'),'Product Match baselines first task observation and requires stable DOM state');
must(coverage.includes('NET surviving match credit'),'Product Match anti-inflation retraction is documented in runtime source');
must(coverage.includes('${summary.productMatched || 0}'),'Coverage HUD renders Product Match');

// Exercise the real background aggregation logic.
bg=bg.replace(/\}\)\(\);\s*$/, 'globalThis.__test={applyEvent};\n})();');
const store={
  catShiftSessionV1:{sessionId:'shift-match-test',generation:0,status:'active',reportDate:'2026-10-06',startedAtMs:Date.now()-1000},
  catSettingsV2:{enabled:true,dailyGoal:300,syncEnabled:true},catPendingTaskKeysV2:{},catCoverageDataV2:{schemaVersion:2,dates:{}},catRecentEventsV2:[]
};
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const local={async get(keys){if(Array.isArray(keys)){const o={};for(const k of keys)o[k]=clone(store[k]);return o;}if(typeof keys==='string')return {[keys]:clone(store[keys])};if(keys&&typeof keys==='object'){const o={};for(const [k,d] of Object.entries(keys))o[k]=store[k]===undefined?clone(d):clone(store[k]);return o;}return clone(store);},async set(obj){for(const [k,v] of Object.entries(obj))store[k]=clone(v);},async remove(keys){for(const k of (Array.isArray(keys)?keys:[keys]))delete store[k];}};
const noop={addListener(){}};
const chrome={storage:{local},runtime:{onInstalled:noop,onStartup:noop,onMessage:noop},alarms:{create(){},onAlarm:noop},tabs:{query:async()=>[]},scripting:{executeScript:async()=>{}}};
const ctx={chrome,fetch:async()=>{throw new Error('unexpected fetch')},setTimeout,clearTimeout,Intl,Date,Math,JSON,console,crypto:webcrypto,URL,Response,Request,TextEncoder,TextDecoder};
vm.createContext(ctx);vm.runInContext(bg,ctx,{filename:'coverage-background.js'});
const {applyEvent}=ctx.__test;let seq=0;
const evt=(type,task=1)=>({eventId:`pm-${++seq}`,type,timestamp:Date.now()+seq,jobId:'JOB_PM',taskIndex:task,totalTasks:4,trackerState:'active',lastActivityAt:Date.now()});
await applyEvent(evt('task-start'));
for(let i=0;i<5;i++)await applyEvent(evt('product-matched'));
let day=store.catCoverageDataV2.dates['2026-10-06'];
assert.equal(day.summary.productMatched,5);assert.equal(day.tasks['JOB_PM|1'].productMatched,5);assert.equal(day.jobs.JOB_PM.productMatched,5);
await applyEvent(evt('product-match-remove'));
day=store.catCoverageDataV2.dates['2026-10-06'];
assert.equal(day.summary.productMatched,4,'5 matches then one delete/unmatch => net Product Match 4');
assert.equal(day.tasks['JOB_PM|1'].productMatched,4);
await applyEvent(evt('task-start',2));await applyEvent(evt('product-match-remove',2));
day=store.catCoverageDataV2.dates['2026-10-06'];
assert.equal(day.summary.productMatched,4,'removing a pre-existing/baseline match on another task cannot steal prior credit');
assert.equal(day.tasks['JOB_PM|2'].productMatched,0,'Product Match is clamped at zero per task');
console.log('PASS — Background Product Match net-count anti-inflation behavior');

// Exercise actual Worker sanitizers / dashboard row serialization.
const sandbox=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`\nglobalThis.pmtest={coverageSanitizeSummaryServer,coverageSanitizeJobServer,coverageSanitizeTaskServer,coverageDashboardRowServer};`,sandbox);
const sum=sandbox.pmtest.coverageSanitizeSummaryServer({productMatched:4,created:2,blurred:1,deleted:1,noMatch:0,submitted:3,clientSequence:9});
assert.equal(sum.productMatched,4);
const job=sandbox.pmtest.coverageSanitizeJobServer({jobId:'JOB_PM',productMatched:4});assert.equal(job.productMatched,4);
const task=sandbox.pmtest.coverageSanitizeTaskServer({jobId:'JOB_PM',taskIndex:1,productMatched:4});assert.equal(task.productMatched,4);
const row=sandbox.pmtest.coverageDashboardRowServer({name:'Zenitsu Agatsuma',employeeId:'1',pod:'p'},sum,'POD 1');assert.equal(row.productMatched,4);
console.log('PASS — Worker preserves Product Match in summary/job/task/dashboard records');

must(worker.includes("['created','blurred','deleted','noMatch','productMatched','activeMs'"),'Coverage totals and POD aggregates include Product Match');
must(client.includes('<th>Product Match</th>')&&client.includes("metric('Product Match'")&&client.includes("drawerMetric('Product Match'"),'TrinoTime Coverage UI exposes Product Match in cards/table/drawer');
must(client.includes('M ${fmtInt(t.productMatched)}'),'Task drill-down exposes per-task Product Match');
must(css.includes('repeat(9,minmax(0,1fr))')&&css.includes('min-width:1420px'),'Coverage layout expanded for the added metric without removing horizontal-scroll behavior');
console.log('PASS v2.2.29 Product Match regression');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// Offline-only release acceptance. Runs the extension's actual event-ledger
// functions against an isolated in-memory Chrome storage mock. No network.
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../tracker');
const read=name=>fs.readFileSync(path.join(base,name),'utf8');
const manifest=JSON.parse(read('manifest.json'));
let checked=0;
const check=(name,condition)=>{assert.ok(condition,name);console.log(`PASS ${++checked} ${name}`);};
check('candidate is Chrome Manifest V3',manifest.manifest_version===3);
check('candidate has expected version 2.2.63',manifest.version==='2.2.63');
check('system-wide idle permission added without new hosts',JSON.stringify(manifest.permissions)==='["storage","tabs","scripting","alarms","idle"]');
check('host permissions remain scoped to isolated staging hosts',JSON.stringify(manifest.host_permissions)===JSON.stringify(['https://labeling-tools.augmoto.com/*','https://oostrinotime-staging-qa.trinoadmin.workers.dev/*']));
check('background service worker unchanged entrypoint',manifest.background.service_worker==='background.js');
const declared=new Set([manifest.action.default_popup,manifest.background.service_worker,...Object.values(manifest.icons),...manifest.content_scripts.flatMap(c=>c.js)]);
check('all referenced extension assets exist',[...declared].every(file=>fs.existsSync(path.join(base,file))));
check('no broadening to all_urls or production environment',!JSON.stringify(manifest).includes('<all_urls>')&&!JSON.stringify(manifest).includes('https://oos.trinotime.com'));
for(const workflow of ['coverage','confirmation']){
 const source=read(workflow+'-background.js');
 check(`${workflow}: persistent data and pending key retained`,source.includes(workflow==='coverage'?'catPendingTaskKeysV2':'cftPendingTaskKeysV2'));
 check(`${workflow}: automatic background alarm retained`,source.includes(`'${workflow==='coverage'?'cat':'cft'}-sync'`)&&source.includes('onInstalled.addListener')&&source.includes('onStartup.addListener'));
 check(`${workflow}: shift-bound, guarded sync retained`,source.includes('TRACKER_SEQUENCE_CONFLICT')&&source.includes('shiftSessionId')&&source.includes('shiftGeneration'));
 check(`${workflow}: no blanket storage wipe`,!source.includes('chrome.storage.local.clear('));
}
check('Confirmation click-only event does not itself count',read('confirmation.js').includes("event('submit-pending',p)")&&read('confirmation.js').includes("event('submit-confirmed'"));
check('Coverage requires guarded verification before confirmation',read('coverage.js').includes('function confirmPendingSubmit(')&&read('coverage.js').includes('function submitPending('));

function sliceFunction(source,name,next){
 const start=source.indexOf(`async function ${name}(`),end=source.indexOf(`\n${next}`,start);
 assert(start>=0&&end>start,`Unable to load actual ${name} implementation`);
 return source.slice(start,end);
}
async function workflowLedger(workflow){
 const isCoverage=workflow==='coverage',file=workflow+'-background.js',source=read(file);
 const key=isCoverage?'CAT':'CFT';
 const snippet=sliceFunction(source,'applyEvent','async function '+(isCoverage?'reconcileNoMatchState':'leaveMode'));
 const today='2026-10-31',session={status:'active',sessionId:'TEST_SHIFT',generation:2,reportDate:today};
 const blankSummary=()=>({submitted:0,interval1:0,interval2:0,interval3:0,currentInterval:1,clientSequence:0,efficiencyTaskCount:0,efficiencyActiveMs:0,pendingSubmission:false});
 let persistent={data:{dates:{}},pending:{},recent:[],attempts:[]};
 let writeFails=false,writeCount=0,syncCount=0,legacyCount=0;
 let chain=Promise.resolve();
 const state=()=>structuredClone(persistent);
 const store={get:async key=>typeof key==='string'?{[key]:state()[key]}:Object.fromEntries(key.map(k=>[k,state()[k]])),set:async patch=>{
   if(writeFails)throw new Error('Synthetic storage write unavailable');
   const next=state();Object.assign(next,structuredClone(patch));persistent=next;writeCount++;
 }};
 const mkTask=(d,jobId,ti,tt,ts)=>{
   const id=jobId+'|'+ti;
   if(!d.tasks[id])d.tasks[id]={jobId,taskIndex:ti,totalTasks:tt,submitted:false,efficiencyMs:0,status:'active',interval:1};
   return d.tasks[id];
 };
 const common={console,Date,Number,Math,String,Boolean,Array,Object,Set,Promise,Error,
   [key]:{data:'data',recent:'recent',pendingTasks:'pending',submitAttempts:'attempts'},
   chrome:{storage:{local:store}},SUMMARY_PENDING_KEY:'__summary__',
   readCore:async()=>({...state(),shift:structuredClone(session)}),
   shiftIsActive:core=>core.shift.status==='active'&&!!core.shift.sessionId,
   reportDateForCore:()=>today,
   ensureDate:(data,date)=>{
     data.dates??={};data.dates[date]??={summary:blankSummary(),jobs:{},tasks:{},updatedAt:0};return data.dates[date];
   },
   ensureJob:(d,jobId,tt)=>d.jobs[jobId]??={jobId,totalTasks:tt,submitted:0,lastTask:0},
   ensureTask:mkTask,taskKey:(jobId,ti)=>jobId+'|'+ti,
   num:(value,max=Number.MAX_SAFE_INTEGER)=>Math.max(0,Math.min(Number(value)||0,max)),
   epochMs:value=>Number(value)||0,trackerState:()=> 'active',
   applyPresenceFields:()=>{},
   pendingAdd:(pending,date,item)=>{pending[date]??=[];if(!pending[date].includes(item))pending[date].push(item);},
   queue:fn=>{chain=chain.then(fn,fn);return chain;},
   prune:()=>{},scheduleSyncSoon:()=>syncCount++,
   appendLegacySubmission:async()=>legacyCount++,
   activeAttemptOwner:()=> 'fixture-owner',
   normalizeIntervalAdjustments:s=>{s.submitted=(s.interval1||0)+(s.interval2||0)+(s.interval3||0);},
   MANAGED_IDLE_MS:300000,MAX_RECENT_EVENTS:2000,
 };
 const context=vm.createContext(common);
 vm.runInContext(snippet+'\nglobalThis.runEvent=applyEvent;',context);
 const e=(type,id,job='JOB_FIXTURE',task=1)=>({type,eventId:id,jobId:job,taskIndex:task,totalTasks:2,timestamp:Date.now(),id:id});
 const count=()=>persistent.data.dates[today]?.summary?.submitted||0;
 const intervalCount=()=>persistent.data.dates[today]?.summary?.interval1||0;
 const call=event=>context.runEvent(event);
 await call(e('submit-pending','s1-pending'));
 check(`${workflow}: pending click does not increment`,count()===0&&intervalCount()===0);
 await call(e('submit-confirmed','s1-confirmed'));
 check(`${workflow}: first verified completion increments exactly once`,count()===1&&(isCoverage||intervalCount()===1));
 await call(e('submit-confirmed','s1-confirmed'));
 check(`${workflow}: replay of same event ID is idempotent`,count()===1&&(isCoverage||intervalCount()===1));
 await call(e('submit-confirmed','new-id-same-task'));
 check(`${workflow}: new ID for already submitted task does not inflate count`,count()===1&&(isCoverage||intervalCount()===1));
 await call(e('skip-confirmed','skip-second','JOB_FIXTURE',2));
 check(`${workflow}: Skip does not increment`,count()===1);
 const accepted=await call(e('submit-confirmed','s2-confirmed','JOB_OTHER',1));
 check(`${workflow}: distinct verified task increments`,accepted.ok===true&&count()===2&&(isCoverage||intervalCount()===2));
 check(`${workflow}: pending records are retained for synchronization`,persistent.pending[today].length>0);
 check(`${workflow}: durable storage contains original verified tasks`,persistent.data.dates[today].tasks['JOB_FIXTURE|1'].submitted&&persistent.data.dates[today].tasks['JOB_OTHER|1'].submitted);
 const before=JSON.stringify(persistent);writeFails=true;
 await assert.rejects(call(e('submit-confirmed','s3-fail','JOB_FAIL',1)),/storage write unavailable/);
 check(`${workflow}: failed storage write does not persist unverified count`,JSON.stringify(persistent)===before);
 writeFails=false;await call(e('submit-confirmed','s3-fail','JOB_FAIL',1));
 check(`${workflow}: original event can be replayed safely after write recovers`,count()===3);
 session.status='completed';const previous=JSON.stringify(persistent);
 const frozen=await call(e('submit-confirmed','s4-locked','JOB_LOCKED',1));
 check(`${workflow}: completed shift rejects new count`,frozen.frozen===true&&JSON.stringify(persistent)===previous);
 check(`${workflow}: background sync scheduler remains automatic`,syncCount>=1&&syncCount===writeCount);
 return {writeCount,syncCount,legacyCount};
}
for(const wf of ['coverage','confirmation'])await workflowLedger(wf);
console.log(`PASS v2.2.63 offline release readiness: ${checked} checks; synthetic storage only, no live Augmoto, Firebase or employee records`);

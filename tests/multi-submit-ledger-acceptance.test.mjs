import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Exercises actual content script code in a mocked page; no Augmoto/network.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../tracker');
const src=readFileSync(path.join(root,'confirmation.js'),'utf8');
function cut(a,b){const i=src.indexOf(a),j=src.indexOf(b,i);assert(i>=0&&j>i,`${a} missing`);return src.slice(i,j);}
const code=cut('  function storePending()', '  function build()') + cut('  async function captureExplicitConfirmationSubmit()', '  // A keyboard Enter/form submit');
let now=Date.now(), sequence=0, visible={jobId:'JOB_ONE',taskIndex:1,totalTasks:10};
let text='JOB_ONE - tasks: 1/10', events=[],attempts=[],stored={}, failPending=false, failConfirm=false, delayConfirmReply=false;
let storageFail=false, timers=[];
const shift={status:'active',sessionId:'SHIFT_1',generation:3,reportDate:'2026-11-02'};
const date=shift.reportDate, taskCounts=new Map(), confirmedIDs=new Set(), pendingIDs=new Set();
class Clock extends Date {static now(){return now;}}
const ctx=vm.createContext({
  Date:Clock, Number, String, Boolean, Array, Object, Set, Promise, Math, Error, JSON,
  PENDING:'cft-pending-submit-v1',BACKLOG:'cft-submit-ledger-v1',BACKLOG_LIMIT:48,
  PAGE_INSTANCE_ID:'DOC_ONE',pending:null,receiptBacklog:[],backlogProcessing:false,skipIntent:null,
  shiftState:{...shift},context:{today:date},message:'',
  route:()=>true,header:()=>visible,reportDate:()=>date,
  document:{body:{get innerText(){return text;},get textContent(){return text;}}},
  window:{TrinoTimeQCEfficiency:{flush:()=>Promise.resolve()}},
  crypto:{randomUUID:()=>`ID_${++sequence}`},
  sessionStorage:{setItem:(k,v)=>{if(storageFail)throw Error('storage full');stored[k]=v;},removeItem:k=>{if(storageFail)throw Error('storage full');delete stored[k];}},
  render:()=>{},scan:()=>{},setTimeout:fn=>{timers.push(fn);},
  send:async(type,extra)=>{
    if(type!=='cft-event')return {ok:true};
    const e=extra.event; events.push(e);
    if(e.type==='submit-pending'){
      if(failPending)return {ok:false,error:'simulated service worker timeout'};
      pendingIDs.add(e.id);return {ok:true,date};
    }
    if(e.type==='submit-confirmed'){
      if(failConfirm)return {ok:false,error:'simulated storage write rejection'};
      if(!pendingIDs.has(e.id))return {ok:false,error:'no pending receipt'};
      confirmedIDs.add(e.id);taskCounts.set(`${e.jobId}|${e.taskIndex}`,1);
      if(delayConfirmReply)return {ok:false,error:'ACK lost after durable save'};
    }
    return {ok:true,date};
  },
});
vm.runInContext(code,ctx);
const emitted=t=>events.filter(x=>x.type===t);
const total=()=>[...taskCounts.values()].reduce((a,b)=>a+b,0);
const setTask=(i,job='JOB_ONE')=>{visible={jobId:job,taskIndex:i,totalTasks:10};text=`${job} - tasks: ${i}/10`;};
let passed=0;async function check(name,fn){await fn();passed++;console.log(`PASS ${String(passed).padStart(2)} ${name}`);}
await check('first trusted Submit saves an ID but counts no task by itself',async()=>{
 await ctx.captureExplicitConfirmationSubmit(); assert.equal(ctx.pending.taskIndex,1);
 assert.equal(total(),0);assert.equal(emitted('submit-pending').length,1);
 assert.ok(stored['cft-pending-submit-v1']);
});
await check('repeated Submit on same task never creates second pending ID',async()=>{
 await ctx.captureExplicitConfirmationSubmit();assert.equal(sequence,1);
});
await check('next task can Submit while first remains pending',async()=>{
 now+=1000;setTask(2);await ctx.captureExplicitConfirmationSubmit();
 assert.equal(ctx.pending.taskIndex,2);assert.equal(ctx.receiptBacklog.length,1);
 assert.equal(ctx.receiptBacklog[0].id,'ID_1');assert.equal(ctx.pending.id,'ID_2');
 assert.equal(total(),0);
});
await check('durable backlog confirms earlier task once and leaves second pending',async()=>{
 await ctx.drainSubmissionLedger();assert.equal(total(),1);assert.equal(taskCounts.get('JOB_ONE|1'),1);
 assert.equal(ctx.receiptBacklog.length,0);assert.equal(ctx.pending.id,'ID_2');
});
await check('rapid third Submit retains second task while first stays counted',async()=>{
 now+=300;setTask(3);await ctx.captureExplicitConfirmationSubmit();
 assert.equal(ctx.receiptBacklog.length,1);assert.equal(ctx.receiptBacklog[0].id,'ID_2');
 assert.equal(ctx.pending.id,'ID_3');assert.equal(total(),1);
});
await check('second task confirmation does not duplicate first',async()=>{
 await ctx.drainSubmissionLedger();assert.equal(total(),2);assert.equal(ctx.pending.id,'ID_3');
});
await check('lost server response retains original queued ID for retry',async()=>{
 now+=350;setTask(4);await ctx.captureExplicitConfirmationSubmit();
 delayConfirmReply=true;await ctx.drainSubmissionLedger();assert.equal(total(),3);
 assert.equal(ctx.receiptBacklog.length,1);assert.equal(ctx.receiptBacklog[0].id,'ID_3');
});
await check('retry is idempotent despite previously committed count',async()=>{
 delayConfirmReply=false;await ctx.drainSubmissionLedger();assert.equal(total(),3);
 assert.equal(ctx.receiptBacklog.length,0);assert.equal(ctx.pending.id,'ID_4');
 const receipts=emitted('submit-confirmed').filter(e=>e.id==='ID_3');
 assert.equal(receipts.length,2);assert.equal(new Set(receipts.map(x=>x.eventId)).size,1);
});
await check('background failure keeps queued receipt rather than losing it',async()=>{
 now+=500;setTask(5);await ctx.captureExplicitConfirmationSubmit();
 failConfirm=true;await ctx.drainSubmissionLedger();assert.equal(ctx.receiptBacklog.length,1);assert.equal(total(),3);
 failConfirm=false;await ctx.drainSubmissionLedger();assert.equal(total(),4);assert.equal(ctx.receiptBacklog.length,0);
});
await check('failed pending receipt cannot produce a confirmed count',async()=>{
 now+=500;setTask(6);failPending=true;
 await ctx.captureExplicitConfirmationSubmit();assert.equal(ctx.pending.ready,false);
 now+=500;setTask(7);await ctx.captureExplicitConfirmationSubmit();
 await ctx.drainSubmissionLedger();assert.equal(total(),5);assert.equal(ctx.receiptBacklog.length,1);
 failPending=false;await ctx.drainSubmissionLedger();assert.equal(total(),6);
});
await check('skip on the previous task blocks promotion to queue',async()=>{
 now+=400;ctx.skipIntent={jobId:'JOB_ONE',taskIndex:7,at:now};setTask(8);
 const previous=ctx.pending.id;await ctx.captureExplicitConfirmationSubmit();
 assert.equal(ctx.pending.id,previous);assert.equal(ctx.receiptBacklog.length,0);
 ctx.skipIntent=null;
});
await check('visible validation failure blocks promotion',async()=>{
 text='JOB_ONE - tasks: 8/10 submission failed';
 await ctx.captureExplicitConfirmationSubmit();assert.equal(ctx.pending.taskIndex,7);
 text='JOB_ONE - tasks: 8/10';
});
await check('task moving backward does not justify count',async()=>{
 setTask(1);await ctx.captureExplicitConfirmationSubmit();assert.equal(ctx.pending.taskIndex,7);
});
await check('cross-document old click cannot claim a same-document transition',async()=>{
 ctx.pending.pageInstanceId='OLD_DOC';setTask(8);await ctx.captureExplicitConfirmationSubmit();
 assert.equal(ctx.pending.taskIndex,7);ctx.pending.pageInstanceId='DOC_ONE';
});
await check('shift switch prevents old pending receipt from being promoted',async()=>{
 ctx.shiftState={...shift,sessionId:'SHIFT_2'};await ctx.captureExplicitConfirmationSubmit();
 assert.equal(ctx.pending.taskIndex,7);ctx.shiftState={...shift};
});
await check('storage write failure cannot discard first pending ID',async()=>{
 storageFail=true;await ctx.captureExplicitConfirmationSubmit();assert.equal(ctx.pending.taskIndex,7);
 assert.equal(ctx.receiptBacklog.length,0);storageFail=false;
});
await check('large ledger never silently evicts existing receipts',async()=>{
 ctx.receiptBacklog=Array.from({length:48},(_,i)=>({id:'OLD_'+i}));
 await ctx.captureExplicitConfirmationSubmit();assert.equal(ctx.pending.taskIndex,7);
 assert.equal(ctx.receiptBacklog.length,48);ctx.receiptBacklog=[];
});
await check('persisted observed transition survives reload and still needs server receipt',async()=>{
 ctx.pending=null;now+=1000;ctx.receiptBacklog=[{
   id:'SURVIVE',jobId:'JOB_900',taskIndex:1,totalTasks:5,date,
   startedAt:now-700,shiftSessionId:shift.sessionId,shiftGeneration:shift.generation,
   observedNext:{jobId:'JOB_900',taskIndex:2},ready:false,pageInstanceId:'OLD_DOC'
 }];ctx.storePending();
 assert.ok(stored['cft-submit-ledger-v1']);await ctx.drainSubmissionLedger();
 assert.equal(taskCounts.get('JOB_900|1'),1);assert.equal(ctx.receiptBacklog.length,0);
});
await check('mismatched prior-shift backlog is quarantined, not replayed',async()=>{
 ctx.receiptBacklog=[{id:'DIFFERENT',jobId:'JOB_ONE',taskIndex:9,totalTasks:10,date,
  startedAt:now-700,shiftSessionId:'OTHER',shiftGeneration:3,observedNext:{jobId:'JOB_ONE',taskIndex:10},ready:true}];
 const before=total();await ctx.drainSubmissionLedger();assert.equal(total(),before);
 assert.equal(ctx.receiptBacklog.length,1);ctx.receiptBacklog=[];
});
await check('current pending and backlog always use separate stable IDs',async()=>{
 assert.notEqual(emitted('submit-pending')[0].id,emitted('submit-pending')[1].id);
 assert.equal(confirmedIDs.size,total());
});
console.log(`PASS multi-Submit ledger: ${passed} synthetic scenarios; no Augmoto or real accounts`);

// Confirm late queued receipts cannot move the active task backward.
const bg=readFileSync(path.join(root,'confirmation-background.js'),'utf8');
const from=bg.indexOf('async function applyEvent(event) {'),to=bg.indexOf('async function leaveMode()',from);
assert(from>=0&&to>from);
let saved={shift:{...shift},data:{dates:{}},pending:{},recent:[]};
const bc=vm.createContext({
 Date:Clock,Number,String,Boolean,Math,Array,Object,Set,Promise,
 queue:fn=>fn(),readCore:async()=>structuredClone(saved),shiftIsActive:c=>c.shift.status==='active',
 reportDateForCore:c=>c.shift.reportDate,
 ensureDate:(data,d)=>data.dates[d]??={summary:{currentInterval:1,interval1:0,interval2:0,interval3:0,clientSequence:0,currentJob:'',currentTask:0},jobs:{},tasks:{}},
 ensureJob:(day,j)=>day.jobs[j]??={jobId:j,submitted:0,lastTask:0},
 ensureTask:(day,j,i)=>day.tasks[j+'|'+i]??={jobId:j,taskIndex:i,submitted:false},
 applyPresenceFields:()=>{},prune:()=>{},scheduleSyncSoon:()=>{},
 pendingAdd:(p,d,k)=>{p[d]??=[];if(!p[d].includes(k))p[d].push(k);},
 taskKey:(j,i)=>j+'|'+i,num:v=>Math.max(0,Math.floor(Number(v)||0)),epochMs:v=>Number(v)||0,
 normalizeIntervalAdjustments:s=>{s.submitted=(s.interval1||0)+(s.interval2||0)+(s.interval3||0);return s;},
 MAX_RECENT_EVENTS:4000,SUMMARY_PENDING_KEY:'__summary__',MANAGED_IDLE_MS:300000,
 chrome:{storage:{local:{set:async o=>{saved.data=structuredClone(o.data);saved.pending=structuredClone(o.pending);saved.recent=structuredClone(o.recent);}}}},
 CFT:{data:'data',pendingTasks:'pending',recent:'recent'}
});
vm.runInContext(bg.slice(from,to),bc);
const bEvent=(type,id,task)=>({type,id,eventId:id+'-'+type,jobId:'JOB_BACK',taskIndex:task,totalTasks:10,date,shiftSessionId:shift.sessionId,shiftGeneration:shift.generation,timestamp:now});
await bc.applyEvent(bEvent('task-start','task-A',1));
await bc.applyEvent(bEvent('submit-pending','SUB_A',1));
await bc.applyEvent(bEvent('task-start','task-B',2));
await bc.applyEvent(bEvent('submit-pending','SUB_B',2));
await check('background tracks two pending tasks without losing current header',async()=>{
 const s=saved.data.dates[date].summary;
 assert.equal(s.currentTask,2);assert.equal(s.pendingSubmission,true);
});
await bc.applyEvent(bEvent('submit-confirmed','SUB_A',1));
await check('late older confirmation preserves current Task 2 header',async()=>{
 const s=saved.data.dates[date].summary;
 assert.equal(s.currentTask,2);assert.equal(s.interval1,1);
});
await check('late older confirmation keeps newer task pending flag',async()=>{
 assert.equal(saved.data.dates[date].summary.pendingSubmission,true);
});
await bc.applyEvent(bEvent('submit-confirmed','SUB_B',2));
await bc.applyEvent(bEvent('submit-confirmed','SUB_A',1));
await check('both task counts settle once and pending flag clears safely',async()=>{
 const s=saved.data.dates[date].summary;
 assert.equal(s.interval1,2);assert.equal(s.pendingSubmission,false);
});
await bc.applyEvent(bEvent('submit-pending','LATE_PENDING',1));
await check('late pending receipt never reopens an already verified Confirmation task',async()=>{
 const day=saved.data.dates[date];
 assert.equal(day.summary.pendingSubmission,false);
 assert.equal(day.summary.interval1,2);
 assert.equal(day.tasks['JOB_BACK|1'].status,'submitted');
});
console.log(`PASS multi-Submit and background integration: ${passed} synthetic checks total`);

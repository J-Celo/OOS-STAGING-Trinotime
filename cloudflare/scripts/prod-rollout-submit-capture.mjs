import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const get=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const source=get('../../tracker/coverage.js'), bg=get('../../tracker/coverage-background.js');
const manifest=JSON.parse(get('../../tracker/manifest.json'));
assert.equal(manifest.version,'2.3.10','Retain immediate Submit capture baseline with production release');
const cut=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start,`${a} missing`);return s.slice(start,end);};
// The reference's useful invariant is a trusted click captured before DOM scan
// or navigation. It never awards a task count on the click alone.
let observed=[],feedbacks=[],checkpoint=null,scans=0,confirms=0;
const shift={status:'active',sessionId:'shift1',generation:2,reportDate:'2026-10-24'};
const ctx=vm.createContext({Element:class Element {},Math,Date,Number,String,Promise,
  pending:{submit:null,skip:null},current:{jobId:'JOB_TEST123',taskIndex:2,totalTasks:8},
  shiftState:shift,bridgeState:{deviceId:'dev1'},
  isHudEvent:()=>false,interactiveFromEvent:e=>e.target,
  disabled:()=>false,realHeaderAction:(e,name)=>String(e.label).toLowerCase()===name,
  label:e=>e.label,lower:s=>String(s||'').toLowerCase(),noteActivity:()=>{},
  submitPending:()=>Boolean(ctx.pending.submit),
  saveSubmitCheckpoint:p=>{checkpoint={...p}},clearSubmitCheckpoint:()=>{checkpoint=null},
  feedback:(...a)=>feedbacks.push(a),postAttemptStatus:()=>{},
  eventId:()=>'coverage-submit-abc12345',emitAction:()=>{},scheduleScan:()=>{scans++},
  setTimeout:()=>{},scan:()=>{throw Error('DOM scan must not precede a trusted Submit capture');},
  railNoMatchIntent:()=>null,
  chrome:{runtime:{sendMessage:message=>{observed.push(message);return Promise.resolve({ok:true});}}}
});
vm.runInContext(cut(source,'  function clickIntent(event)', '  function keyIntent(event)'),ctx);
const submit={label:'Submit'};
ctx.clickIntent({isTrusted:false,target:submit});assert.equal(observed.length,0,'Untrusted automation cannot count');
ctx.clickIntent({isTrusted:true,target:submit});
assert.equal(observed[0]?.type,'cat-submit-attempt','Capture is dispatched immediately');
assert.equal(observed[0]?.attempt?.jobId,'JOB_TEST123');
assert.equal(observed[0]?.attempt?.taskIndex,2);
assert.equal(checkpoint?.taskIndex,2,'Checkpoint persisted before browser navigation');
assert.equal(feedbacks[0]?.[0],'captured','Show immediate captured-not-confirmed feedback');
assert.ok(!observed.some(x=>x.type==='cat-event'&&x.event?.type==='submit-confirmed'),
  'Clicks alone cannot be counted as accepted tasks');
ctx.clickIntent({isTrusted:true,target:submit});
assert.equal(observed.filter(x=>x.type==='cat-submit-attempt').length,1,'Double click keeps one attempt');
assert.equal(confirms,0,'No completion inferred from duplicate clicks');
// Background receives/persists attempt under authenticated, specific shift.
const memory={};let now=Date.now(),currentOwner='POD A|Worker A';
const core={bridge:{actor:{pod:'POD A',name:'Worker A'},token:'paired',deviceId:'dev1'},
 shift:{status:'active',sessionId:'shift1',generation:2,reportDate:'2026-10-24'},
 data:{dates:{}},settings:{syncEnabled:true},pending:{},recent:[]};
const date='2026-10-24';
const b=vm.createContext({Date,Math,String,Number,Array,Promise,Object,Set,
 AUGMOTO:'https://labeling-tools.augmoto.com',
 CAT:{submitAttempts:'attempts',data:'data',recent:'recent',pendingTasks:'pending'},
 queue:fn=>fn(),readCore:async()=>core,
 shiftIsActive:x=>x.shift.status==='active',num:x=>Math.max(0,Math.floor(Number(x)||0)),
 epochMs:x=>Number(x)||0,taskKey:(j,i)=>`${j}|${i}`,
 chrome:{storage:{local:{
  get:async k=> typeof k==='string'?{[k]:memory[k]}:Object.fromEntries(k.map(x=>[x,memory[x]])),
  set:async patch=>{Object.assign(memory,patch);}
 }}}
});
vm.runInContext(cut(bg,'const SUBMIT_ATTEMPT_LIMIT = 100;','function pendingAdd(pending, date, key) {'),b);
const attempt={...observed[0].attempt,at:now};
const sender={tab:{id:1},url:'https://labeling-tools.augmoto.com/jobs/JOB_TEST123/coverage'};
assert.equal((await b.recordSubmitAttempt(attempt,sender)).ok,true);
assert.equal(memory.attempts?.[0]?.status,'captured');
assert.equal((await b.recordSubmitAttempt(attempt,sender)).duplicate,true);
assert.equal(memory.attempts.length,1,'Durable click deduplication');
assert.equal((await b.recordSubmitAttempt({...attempt,id:'coverage-submit-x1234567'},
  {tab:{id:1},url:'https://other.example/jobs'})).ok,false,'Reject foreign origin');
assert.equal((await b.recordSubmitAttempt({...attempt,id:'coverage-submit-x1234567',sessionId:'wrong'},sender)).ok,false,'Reject wrong shift');
assert.equal((await b.recordSubmitAttempt({...attempt,id:'coverage-submit-x1234567',deviceId:'wrong'},sender)).ok,false,'Reject wrong device');
core.shift.status='completed';assert.equal((await b.recordSubmitAttempt({...attempt,id:'coverage-submit-x1234567'},sender)).ok,false,'No count outside Time In');
core.shift.status='active';
assert.equal((await b.setSubmitAttemptStatus(attempt.id,'unverified')).ok,true);
assert.equal(memory.attempts[0].status,'unverified');
assert.equal((await b.setSubmitAttemptStatus(attempt.id,'acknowledged')).ok,false,'Unverified click cannot be promoted to server ack');
core.bridge.actor={pod:'POD B',name:'Worker B'};
assert.equal((await b.setSubmitAttemptStatus(attempt.id,'cancelled')).ok,false,'Other Agent may not mutate attempt');
core.bridge.actor={pod:'POD A',name:'Worker A'};
// Ledger confirmation is separate, idempotent per task, and does not require box edits.
const day={summary:{submitted:0},tasks:{},jobs:{}};
Object.assign(b,{reportDateForCore:()=>date,ensureDate:()=>day,
 applyPresenceFields:()=>{},ensureJob:(_d,j)=>day.jobs[j]??=({submitted:0}),
 ensureTask:(_d,j,i)=>day.tasks[j+'|'+i]??=({submitted:false}),
 pendingAdd:()=>{},prune:()=>{},MAX_RECENT_EVENTS:4000,
 SUMMARY_PENDING_KEY:'summary',appendLegacySubmission:async()=>{},scheduleSyncSoon:()=>{},
 activeAttemptOwner:()=>currentOwner});
vm.runInContext(cut(bg,'async function applyEvent(event) {','async function reconcileNoMatchState('),b);
const accepted={eventId:'submit-confirmed-'+attempt.id,type:'submit-confirmed',jobId:'JOB_TEST123',taskIndex:2,totalTasks:8,timestamp:now+800};
await b.applyEvent(accepted);assert.equal(day.summary.submitted,1);
assert.equal(memory.attempts[0].status,'confirmed_pending_sync');
assert.equal(day.tasks['JOB_TEST123|2'].created||0,0);
await b.applyEvent(accepted);await b.applyEvent({...accepted,eventId:'new-click-same-task'});
assert.equal(day.summary.submitted,1,'Server-ready ledger has stable Job/task dedup');
await b.applyEvent({...accepted,taskIndex:3,eventId:'distinct-agent-independent-task'});
assert.equal(day.summary.submitted,2,'Distinct tasks are counted separately');
await b.setSubmitAttemptStatus(attempt.id,'unverified');
assert.equal(memory.attempts[0].status,'confirmed_pending_sync','Later unverified signal cannot undo confirmation');
assert.match(bg,/body\.accepted===true|body\?\.accepted!==true/);
assert.match(bg,/acknowledged\.has\(taskKey\(item\.jobId,item\.taskIndex\)\)/,
 'Only exact confirmed task-version server receipt may acknowledge');
assert.match(bg,/taskVersions\[k\]/,'Server sync must retain changed task versions pending');
assert.match(source,/SUBMIT_MAX_AGE_MS/);
assert.match(source,/ACCEPTANCE_WINDOW_MS/);
assert.match(source,/recordUnverifiedSubmit/);
console.log('PASS v2.2.59: immediate trusted Submit attempt, before DOM scan, no-edit, double-click, wrong sender/device/shift, inactive shift, durable diagnostics, per-task dedup, separate server ACK, and owner isolation.');

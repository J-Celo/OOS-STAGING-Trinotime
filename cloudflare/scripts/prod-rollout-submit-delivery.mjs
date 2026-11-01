import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const get = path => fs.readFileSync(new URL(path,import.meta.url),'utf8');
const coverage=get('../../tracker/coverage.js');
const bg=get('../../tracker/coverage-background.js');
const part=(s,a,b)=>{const x=s.indexOf(a),y=s.indexOf(b,x);assert.ok(x>=0&&y>x,a);return s.slice(x,y)};
const manifest=JSON.parse(get('../../tracker/manifest.json'));
assert.equal(manifest.version,'2.3.10','Retain immediate Submit capture baseline with production release');
// A stalled or rejected efficiency queue must never prevent the actual
// accepted submission reaching the durable extension ledger.
let messages=[],flushCount=0;
const ctx=vm.createContext({Promise,window:{TrinoTimeQCEfficiency:{flush:()=>{flushCount++;return new Promise(()=>{});}}},
  confirmationRoute:()=>false,submitPending:()=>true,
  chrome:{runtime:{sendMessage:m=>{messages.push(m);return Promise.resolve({ok:true});}}}});
vm.runInContext(part(coverage,'  async function send(', '  function hasOpenTask('),ctx);
const receipt={type:'cat-event',event:{type:'submit-confirmed',confirmedBy:'submit-to-jobs-transition'}};
const response=await Promise.race([ctx.send(receipt.type,{event:receipt.event}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Submit event waited for stalled efficiency')),100))]);
assert.ok(messages.some(m=>m.event?.type==='submit-confirmed'), 'Submit event must be sent synchronously, even when efficiency hangs');
assert.equal(response.ok,true);
assert.equal(flushCount,1);
ctx.window.TrinoTimeQCEfficiency.flush=()=>Promise.reject(new Error('simulated metrics transport failure'));
await ctx.send('cat-event',{event:{type:'submit-confirmed',confirmedBy:'augmoto-success-notice'}});
assert.equal(messages.length,2,'Efficiency failures do not block acceptance receipts');
await ctx.send('cat-event',{event:{type:'task-start'}});
assert.equal(messages.length,3,'Normal task events still transmit');
ctx.confirmationRoute=()=>true;
await ctx.send('cat-event',{event:{type:'task-start'}});
assert.equal(messages.length,3,'Coverage routine events are still excluded on Confirmation');
// Replay/dedup and late efficiency sample run through actual background handlers.
const day={summary:{submitted:0},jobs:{},tasks:{}};
const core={recent:[],data:{},pending:{}};
let localWrites=0;
const b=vm.createContext({Date,Number,String,Math,Set,Object,Array,
 queue:fn=>fn(),readCore:async()=>core,shiftIsActive:()=>true,epochMs:x=>Number(x)||0,
 num:x=>Math.max(0,Number(x)||0),reportDateForCore:()=> '2026-10-23',
 ensureDate:()=>day,applyPresenceFields:()=>{},ensureJob:(_d,j)=>day.jobs[j]??=({submitted:0}),
 ensureTask:(_d,j,t)=>day.tasks[j+'|'+t]??=({submitted:false,startedAt:1000}),
 pendingAdd:()=>{},taskKey:(j,t)=>j+'|'+t,
 SUMMARY_PENDING_KEY:'summary',prune:()=>{},MAX_RECENT_EVENTS:4000,
 CAT:{data:'data',recent:'recent',pendingTasks:'pending'},
 chrome:{storage:{local:{set:async()=>{localWrites++;}}}},
 appendLegacySubmission:async()=>{},scheduleSyncSoon:()=>{}});
vm.runInContext(part(bg,'async function applyEvent(', 'async function reconcileNoMatchState(')+
 part(bg,'async function applyEfficiencyTime(', 'async function applyPresence('),b);
const event={type:'submit-confirmed',eventId:'accepted-1',jobId:'JOB_TEST1',taskIndex:1,totalTasks:3,timestamp:2000};
await b.applyEvent(event);
assert.equal(day.summary.submitted,1,'Count receipt immediately');
await b.applyEvent(event);
await b.applyEvent({...event,eventId:'same-task-new-click'});
assert.equal(day.summary.submitted,1,'No duplicate task count');
const measured={eventId:'eff-1',jobId:'JOB_TEST1',taskIndex:1,totalTasks:3,timestamp:1900,activeMs:500};
await b.applyEfficiencyTime(measured);
assert.equal(day.summary.efficiencyTaskCount,1,'First late sample counts task efficiency');
assert.equal(day.summary.efficiencyActiveMs,500);
await b.applyEfficiencyTime(measured);
assert.equal(day.summary.efficiencyActiveMs,500,'Replayed efficiency does not double-count');
await b.applyEfficiencyTime({...measured,eventId:'eff-2',activeMs:400});
assert.equal(day.summary.efficiencyActiveMs,900,'Distinct final measurement is attributed once');
assert.equal(day.summary.efficiencyTaskCount,1);
await b.applyEfficiencyTime({...measured,eventId:'eff-too-late',timestamp:5001,activeMs:500});
assert.equal(day.summary.efficiencyActiveMs,900,'Stale efficiency cannot inflate an accepted task');
await b.applyEvent({...event,eventId:'accepted-2',taskIndex:2,timestamp:6000});
assert.equal(day.summary.submitted,2,'Distinct task receives its own count');
assert.ok(localWrites>=4,'Ledger persisted locally');
console.log('PASS v2.2.58: accepted receipt precedes stalled metrics, failure-safe delivery, late efficiency bounded/deduped, no-edit submissions, distinct tasks and Confirmation isolation.');

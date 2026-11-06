import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const source = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../tracker/confirmation.js'),'utf8');
function cut(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,`Missing source section ${a}`);return source.slice(i,j);}
const helperCode=cut('  function storePending()', '  function build()');
const scanCode=cut('  async function scan()', '  function confirmationControlLabel');
const modeCode=cut("  document.addEventListener('tt-qc-mode-change'", '  let scanWake=null, lastMutationScanAt=0;');
let now=Date.now(),serial=0,events=[],calls=[],queueVisible=true,navType='navigate',active=true,mode='none';
const date='2026-10-31', id='check-'+(serial++), shift={status:'active',sessionId:'SHIFT_X',generation:7,reportDate:date};
const pendingFor=(overrides={})=>({id:'submission-unique-1',jobId:'JOB_7788',taskIndex:2,totalTasks:9,date,
  startedAt:now-1200,ready:false,shiftSessionId:'SHIFT_X',shiftGeneration:7,...overrides});
const handlers={};
class FakeDate extends Date {static now(){return now;}}
const session={};
const ctx=vm.createContext({
  Date:FakeDate,Number,String,Boolean,Array,Object,Set,Promise,Math,Error,
  pending:pendingFor(),receiptBacklog:[],backlogProcessing:false,BACKLOG:'test-backlog',BACKLOG_LIMIT:48,shiftState:shift,context:{today:date},skipIntent:null,
  queueReceiptRecoveryAt:0,queueReceiptRecoveryBusy:false, busy:false,
  lastTick:now,message:'',lastAnnouncedJob:'',current:{jobId:'',taskIndex:0,totalTasks:0},
  lastInteraction:now,missingHeaderSince:0,resumePresence:null,presenceInitialized:false,liveHeader:null,
  shiftState:shift,reportDate:()=>date,route:()=>active&&mode==='confirmation',
  performance:{getEntriesByType:()=>[{type:navType}]},
  document:{body:{get innerText(){return queueVisible?'Confirmation Jobs Filters Store Jobs NEEDS REVIEW':'';}},
    querySelectorAll:()=>[],addEventListener:(name,fn)=>handlers[name]=fn},
  window:{TrinoTimeQCEfficiency:{flush:()=>Promise.resolve()}},
  sessionStorage:{setItem:(k,v)=>session[k]=v,removeItem:k=>delete session[k]},
  PENDING:'test-pending',
  send:async(type,payload)=>{
    calls.push({type,payload});
    if(type==='cft-event'){
      const ev=payload.event; events.push(ev);
      if(ev.type==='submit-pending' && ctx.failAck)return {ok:false,error:'network'};
      return {ok:true,date};
    }
    return {ok:true};
  },
  header:()=>null,render:()=>{},clearIdleBoundary:()=>{},
  tick:()=>{},sendStatus:()=>{},hasOpenTask:()=>false,
  recordPresenceTime:()=>{},updateActivityOwner:()=>{},render:()=>{},refresh:async()=>{},presenceState:'paused',
  lastAnnouncedJob:'',MANAGED_IDLE_MS:300000,
  crypto:{randomUUID:()=>`event-${serial++}`},
  recentConfirmationSubmitPending:null,
});
vm.runInContext(helperCode+scanCode+modeCode,ctx);
let passed=0;
async function check(title,fn){await fn();passed++; console.log(`PASS ${String(passed).padStart(2)} ${title}`);}
const count=(t)=>events.filter(e=>e.type===t).length;
const reset=(p=pendingFor())=>{ctx.pending=p;ctx.receiptBacklog=[];ctx.backlogProcessing=false;events=[];calls=[];ctx.skipIntent=null;ctx.failAck=false;ctx.queueReceiptRecoveryBusy=false;ctx.queueReceiptRecoveryAt=0;queueVisible=true;mode='none';navType='navigate';active=true;};
await check('pre-fix failure reproduced: unacknowledged stored intent cannot satisfy verification',async()=>{
  reset();assert.equal(ctx.verifiedConfirmationIntent(ctx.pending),false);
  assert.equal(ctx.recentConfirmationSubmitPending(),false);
});
await check('same-tab full navigation re-acknowledges the ORIGINAL pending ID',async()=>{
  reset();await ctx.scan();assert.equal(count('submit-pending'),1);assert.equal(events[0].eventId,'submission-unique-1-submit-pending');
  assert.equal(count('submit-confirmed'),1);assert.equal(events[1].confirmedBy,'verified-confirmation-queue');
  assert.equal(ctx.pending,null);assert.equal(session['test-pending'],undefined);
});
await check('second scan never duplicates submitted count',async()=>{
  await ctx.scan();assert.equal(count('submit-confirmed'),1);
});
await check('no queue: intent remains uncounted',async()=>{
  reset();queueVisible=false;await ctx.scan();assert.equal(count('submit-confirmed'),0);assert.equal(count('submit-pending'),0);
});
await check('reloaded document cannot promote an intent',async()=>{
  reset();navType='reload';await ctx.scan();assert.equal(count('submit-confirmed'),0);assert.equal(count('submit-pending'),0);
});
await check('back/forward navigation cannot promote an intent',async()=>{
  reset();navType='back_forward';await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('shift ID mismatch cannot promote an intent',async()=>{
  reset(pendingFor({shiftSessionId:'OTHER_SHIFT'}));await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('shift generation mismatch cannot promote an intent',async()=>{
  reset(pendingFor({shiftGeneration:6}));await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('date mismatch cannot promote an intent',async()=>{
  reset(pendingFor({date:'2026-10-30'}));await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('stale intent expires with a cancellation, not a count',async()=>{
  reset(pendingFor({startedAt:now-92000}));await ctx.scan();assert.equal(count('submit-confirmed'),0);
  assert.equal(count('submit-cancelled'),1);assert.equal(ctx.pending,null);
});
await check('invalid click without ID cannot create a receipt',async()=>{
  reset(pendingFor({id:''}));await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('error page never creates a receipt',async()=>{
  reset();Object.defineProperty(ctx.document.body,'innerText',{configurable:true,get(){return 'Confirmation Jobs Filters Store Jobs submission failed';}});
  await ctx.scan();assert.equal(count('submit-confirmed'),0);
  Object.defineProperty(ctx.document.body,'innerText',{configurable:true,get(){return queueVisible?'Confirmation Jobs Filters Store Jobs NEEDS REVIEW':'';}});
});
await check('background rejection cannot create a count',async()=>{
  reset();ctx.failAck=true;await ctx.scan();assert.equal(count('submit-confirmed'),0);assert.equal(ctx.pending.ready,false);
});
await check('explicit Skip intent blocks queue counting',async()=>{
  reset();ctx.skipIntent={jobId:'JOB_7788',taskIndex:2,at:now-300};await ctx.scan();
  assert.equal(count('submit-confirmed'),0);
});
await check('mode change to none preserves a bounded unacknowledged click',async()=>{
  reset();handlers['tt-qc-mode-change']({detail:{previous:'confirmation',mode:'none'}});
  assert.ok(ctx.pending && ctx.pending.id==='submission-unique-1');
});
await check('mode change to Coverage discards pending Confirmation intent',async()=>{
  reset();handlers['tt-qc-mode-change']({detail:{previous:'confirmation',mode:'coverage'}});
  assert.equal(ctx.pending,null);
});
await check('no double acceptance when receipt is already ready',async()=>{
  reset(pendingFor({ready:true}));await ctx.scan();assert.equal(count('submit-pending'),0);
  assert.equal(count('submit-confirmed'),1);
});
console.log(`PASS confirmation queue receipt race regression: ${passed} synthetic scenarios; no Augmoto or production operations`);

// Exercise the existing persisted Confirmation task ledger—not an invented
// counter implementation—under the idempotent pending/confirmed event pair.
const bg=readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../tracker/confirmation-background.js'),'utf8');
function bgCut(a,b){const i=bg.indexOf(a),j=bg.indexOf(b,i);assert(i>=0&&j>i,`Missing background section ${a}`);return bg.slice(i,j);}
let durable={shift:{status:'active',sessionId:'SHIFT_X',generation:7,reportDate:date},data:{dates:{}},pending:{},recent:[]};
let failWrite=false;
const makeBlank=()=>({summary:{interval1:0,interval2:0,interval3:0,submitted:0,currentInterval:1,clientSequence:0},jobs:{},tasks:{}});
const bc=vm.createContext({
  Date:FakeDate,Number,String,Math,Boolean,Set,Object,Array,Promise,
  queue:fn=>fn(),readCore:async()=>structuredClone(durable),shiftIsActive:c=>c.shift.status==='active',
  reportDateForCore:c=>c.shift.reportDate,
  ensureDate:(data,d)=>data.dates[d]??=makeBlank(),
  ensureJob:(day,j)=>day.jobs[j]??={jobId:j,submitted:0,lastTask:0},
  ensureTask:(day,j,i)=>day.tasks[`${j}|${i}`]??={jobId:j,taskIndex:i,submitted:false},
  applyPresenceFields:()=>{},prune:()=>{},scheduleSyncSoon:()=>{},
  pendingAdd:(items,d,key)=>{items[d]??=[];if(!items[d].includes(key))items[d].push(key);},
  taskKey:(j,i)=>`${j}|${i}`,num:v=>Math.max(0,Math.floor(Number(v)||0)),
  epochMs:v=>Math.max(0,Number(v)||0),normalizeIntervalAdjustments:s=>{s.submitted=(s.interval1||0)+(s.interval2||0)+(s.interval3||0);return s;},
  MAX_RECENT_EVENTS:4000,SUMMARY_PENDING_KEY:'__summary__',MANAGED_IDLE_MS:300000,
  chrome:{storage:{local:{set:async update=>{
    if(failWrite)throw Error('synthetic write failure');
    if(update['data'])durable.data=structuredClone(update['data']);
    if(update['recent'])durable.recent=structuredClone(update['recent']);
    if(update['pending'])durable.pending=structuredClone(update['pending']);
  }}}},CFT:{data:'data',recent:'recent',pendingTasks:'pending'}
});
vm.runInContext(bgCut('async function applyEvent(event) {','async function leaveMode()'),bc);
const job='JOB_7788',task=2;
const bevent=(type,eventId)=>({type,eventId,jobId:job,taskIndex:task,totalTasks:9,date,timestamp:now,shiftSessionId:'SHIFT_X',shiftGeneration:7});
await bc.applyEvent(bevent('submit-pending','submission-unique-1-submit-pending'));
await bc.applyEvent(bevent('submit-pending','submission-unique-1-submit-pending'));
assert.equal(durable.data.dates[date].summary.submitted,0,'Pending receipt never counts');
passed++;console.log(`PASS ${String(passed).padStart(2)} duplicate pending receipts do not inflate count`);
await bc.applyEvent(bevent('submit-confirmed','submission-unique-1-submit-confirmed'));
await bc.applyEvent(bevent('submit-confirmed','submission-unique-1-submit-confirmed'));
await bc.applyEvent(bevent('submit-confirmed','submission-unique-1-submit-confirmed-another-id'));
assert.equal(durable.data.dates[date].summary.submitted,1,'One task cannot count twice');
assert.equal(durable.data.dates[date].tasks[`${job}|${task}`].submitted,true);
assert(durable.pending[date].includes(`${job}|${task}`),'Pending server-sync ledger preserved');
passed++;console.log(`PASS ${String(passed).padStart(2)} repeated confirmations count once and preserve dirty sync task`);
const before=structuredClone(durable);
failWrite=true;
await assert.rejects(bc.applyEvent(bevent('submit-confirmed','unique-second-task')));
assert.deepEqual(durable,before,'Failed storage writes must not persist new count');
passed++;console.log(`PASS ${String(passed).padStart(2)} failed local storage write does not silently persist an extra count`);
// The actual click listener must not arm Confirmation from synthetic events.
const clickSrc=cut("  document.addEventListener('click',async e=>{",'  async function captureExplicitConfirmationSubmit()');
let captured=0,clickListener,noted=0;
const clickButton={disabled:false,getAttribute:()=>null,closest:()=>null,
  innerText:'Submit',textContent:'Submit',value:'',};
const clickCtx=vm.createContext({ID:'cft-confirmation-staging-hud',
  document:{addEventListener:(_name,fn)=>{clickListener=fn;}},
  noteActivity:()=>noted++,route:()=>true,
  confirmationControlLabel:()=> 'submit',isConfirmationSubmitControl:()=>true,
  captureExplicitConfirmationSubmit:async()=>captured++,pending:null,skipIntent:null,
});
vm.runInContext(clickSrc,clickCtx);
await clickListener({isTrusted:false,target:{closest:()=>clickButton}});
assert.equal(captured,0);assert.equal(noted,0);
passed++;console.log(`PASS ${String(passed).padStart(2)} untrusted scripted clicks cannot arm Confirmation Submit`);
await clickListener({isTrusted:true,target:{closest:sel=>sel.startsWith('#')?null:clickButton}});
assert.equal(captured,1);assert.equal(noted,1);
passed++;console.log(`PASS ${String(passed).padStart(2)} trusted user click still captures explicit Submit`);
console.log(`PASS Phase 2 Confirmation reliability total: ${passed} synthetic checks (no real employee records)`);

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Test the actual content-script implementation with a mocked Augmoto DOM and
// the existing background event contract. No production access or API calls.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(path.join(root,'confirmation.js'),'utf8');
const cut=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i);assert.ok(i>=0&&j>i,`Missing ${a}`);return source.slice(i,j);};
const helpers=cut('  function storePending()', '  function build()');
const scanCode=cut('  async function scan()', '  function confirmationControlLabel');
const now=Date.now(),date='2026-10-31';
const shift={status:'active',sessionId:'SESSION_ID',generation:2,reportDate:date};
let liveHeader=null,screenText='',failAck=false,failWrite=false;
let writes=[],events=[],stored={},scanCount=0;
const intent=(o={})=>({id:'persisted-intent-A',jobId:'JOB_105',taskIndex:2,totalTasks:5,
  date,startedAt:now-1000,ready:false,shiftSessionId:shift.sessionId,shiftGeneration:shift.generation,
  pageInstanceId:'DOC_A',...o});
const ctx=vm.createContext({
  Date:NumberDate,Math,Number,String,Boolean,Array,Object,Set,Promise,Error,
  PAGE_INSTANCE_ID:'DOC_A',PENDING:'pending',pending:intent(),
  shiftState:shift,context:{today:date},skipIntent:null,
  busy:false,queueReceiptRecoveryAt:0,queueReceiptRecoveryBusy:false,
  transitionReceiptRecoveryAt:0,transitionReceiptRecoveryBusy:false,
  current:{jobId:'JOB_105',taskIndex:2,totalTasks:5},lastAnnouncedJob:'JOB_105|2|5',
  lastTick:now,lastInteraction:now,missingHeaderSince:0,resumePresence:null,presenceInitialized:false,
  liveHeader:null,message:'',MANAGED_IDLE_MS:300000,reportDate:()=>date,
  route:()=>true,header:()=>liveHeader,
  document:{body:{get innerText(){return screenText;},get textContent(){return screenText;}},querySelectorAll:()=>[],},
  performance:{getEntriesByType:()=>[{type:'navigate'}]},
  window:{TrinoTimeQCEfficiency:{flush:()=>Promise.resolve()}},
  sessionStorage:{setItem:(k,v)=>stored[k]=v,removeItem:k=>delete stored[k]},
  crypto:{randomUUID:()=>`RANDOM-${++scanCount}`},
  send:async(type,payload={})=>{
    if(type==='cft-event'){
      const event=payload.event;
      events.push(event);
      if(event.type==='submit-pending'&&failAck)return {ok:false,error:'background unavailable'};
      if(event.type==='submit-confirmed'&&failWrite)return {ok:false,error:'storage write failed'};
      return {ok:true,date};
    }
    return {ok:true};
  },
  initPresenceFromContext:()=>{},render:()=>{},tick:()=>{},clearIdleBoundary:()=>{},
  emitPresence:()=>{},computePresenceState:()=> 'active',scheduleIdleBoundary:()=>{},
  hasOpenTask:()=>true,phtDate:()=>date,
  refresh:async()=>{},
});
function NumberDate(...args){return new Date(...args);} // Date.now is patched below
NumberDate.now=()=>now;
vm.runInContext(helpers+scanCode,ctx);
let passed=0;
async function check(title,fn){await fn();console.log('PASS',++passed,title);}
function reset(options={}){
  ctx.pending=intent(options);ctx.context={today:date};ctx.shiftState={...shift};ctx.skipIntent=null;
  ctx.current={jobId:'JOB_105',taskIndex:2,totalTasks:5};ctx.lastAnnouncedJob='JOB_105|2|5';
  ctx.transitionReceiptRecoveryAt=0;ctx.transitionReceiptRecoveryBusy=false;
  ctx.queueReceiptRecoveryAt=0;ctx.queueReceiptRecoveryBusy=false;
  liveHeader={jobId:'JOB_105',taskIndex:3,totalTasks:5};screenText='JOB_105 - tasks: 3/5';
  failAck=false;failWrite=false;stored={};events=[];
}
const count=t=>events.filter(e=>e.type===t).length;
await check('successful task transition re-acknowledges persisted intent and counts once',async()=>{
  reset();await ctx.scan();assert.equal(count('submit-pending'),1);assert.equal(count('submit-confirmed'),1);
  assert.equal(events.find(e=>e.type==='submit-pending').eventId,'persisted-intent-A-submit-pending');
  assert.equal(events.find(e=>e.type==='submit-confirmed').eventId,'persisted-intent-A-submit-confirmed');
  assert.equal(ctx.pending,null);
});
await check('second scan cannot count twice',async()=>{await ctx.scan();assert.equal(count('submit-confirmed'),1);});
await check('no transition cannot acknowledge',async()=>{
  reset();liveHeader={jobId:'JOB_105',taskIndex:2,totalTasks:5};await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('older task index cannot acknowledge',async()=>{
  reset();liveHeader={jobId:'JOB_105',taskIndex:1,totalTasks:5};await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('different document never re-acknowledges an intent',async()=>{
  reset({pageInstanceId:'OLD_DOCUMENT'});await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('no page-instance proof never promotes old pending',async()=>{
  reset({pageInstanceId:''});await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('shift session mismatch blocks count',async()=>{
  reset({shiftSessionId:'ANOTHER_SHIFT'});await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('shift generation mismatch blocks count',async()=>{
  reset({shiftGeneration:1});await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('report date mismatch blocks count',async()=>{
  reset({date:'2026-10-30'});await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('explicit Skip blocks count',async()=>{
  reset();ctx.skipIntent={jobId:'JOB_105',taskIndex:2,at:now-500};await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('visible submission failure blocks count',async()=>{
  reset();screenText='JOB_105 - tasks: 3/5 submission failed';await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('background pending rejection blocks count and keeps unverified intent',async()=>{
  reset();failAck=true;await ctx.scan();assert.equal(count('submit-confirmed'),0);assert.equal(ctx.pending.ready,false);
});
await check('confirmation write rejection cannot count or discard evidence',async()=>{
  reset();failWrite=true;await ctx.scan();assert.equal(count('submit-confirmed'),1);
  assert.equal(ctx.pending.id,'persisted-intent-A'); // event attempted, not acknowledged
});
await check('retry reuses same confirmed ID after storage recovers',async()=>{
  failWrite=false;await ctx.scan();assert.equal(count('submit-confirmed'),2);
  assert.equal(new Set(events.filter(e=>e.type==='submit-confirmed').map(e=>e.eventId)).size,1);
  assert.equal(ctx.pending,null);
});
await check('pending acknowledgment failure cannot count by itself',async()=>{
  reset();failAck=true;liveHeader={jobId:'JOB_105',taskIndex:2,totalTasks:5};await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('stale intent beyond 90 seconds cannot be recovered',async()=>{
  reset({startedAt:now-100000});await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('invalid task index cannot be recovered',async()=>{
  reset({taskIndex:0});await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
await check('inactive shift cannot be recovered',async()=>{
  reset();ctx.shiftState={...shift,status:'completed'};await ctx.scan();assert.equal(count('submit-confirmed'),0);
});
console.log(`PASS automatic near-instant recovery: ${passed} synthetic checks; no real Augmoto or employee records`);

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../tracker');
const source=readFileSync(path.join(root,'coverage.js'),'utf8');
function part(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);assert(i>=0&&j>i,`missing ${a}`);return source.slice(i,j);}
const code=part('  function persistCoverageBacklog()', '  function recordUnverifiedSubmit(')+part('  function coverageSubmitLabel(', '  function clickIntent(event) {');
let now=Date.now(),sequence=0,visible={jobId:'JOB_11',taskIndex:1,totalTasks:9},text='JOB_11 - tasks: 1/9';
let storageFail=false,ackLost=false,serverFail=false, timers=[],events=[],accepted=new Set(),confirmed=new Set();
let storage={},passed=0;
const shift={status:'active',sessionId:'SHIFT_TEST',generation:2,reportDate:'2026-11-02'};
class Clock extends Date{static now(){return now;}}
class Element{}
const submit=new Element();submit.getBoundingClientRect=()=>({left:900,top:80,right:980,width:80,height:28});
submit.closest=()=>null;submit.getAttribute=()=>null;submit.value='';
const c=vm.createContext({
  Element,Date:Clock,Math,Number,String,Boolean,Array,Object,Promise,RegExp,JSON,Set,Error,
  innerWidth:1400,innerHeight:900,clean:v=>String(v||'').replace(/\s+/g,' ').trim(),
  label:()=> 'Submit',lower:v=>String(v||'').toLowerCase(),disabled:()=>false,nearbyHeaderControl:()=>true,
  current:{jobId:'JOB_11',taskIndex:1,totalTasks:9},pending:{submit:null,skip:null},
  shiftState:{...shift},bridgeState:{deviceId:'DEVICE_1'},
  PAGE_INSTANCE_ID:'PAGE_ACTIVE',COVERAGE_BACKLOG_KEY:'catVerifiedSubmitLedgerV1',COVERAGE_BACKLOG_LIMIT:48,
  coverageBacklog:[],coverageBacklogBusy:false,submitCheckpoint:null,ACCEPTANCE_WINDOW_MS:45000,
  REJECTED_NOTICE:/submission failed|unable to submit|failed to submit|required field/i,
  sessionStorage:{setItem:(key,val)=>{if(storageFail)throw Error('storage blocked');storage[key]=val;},removeItem:key=>{if(storageFail)throw Error('storage blocked');delete storage[key];}},
  document:{body:{get innerText(){return text;},get textContent(){return text;}},querySelectorAll:()=>[submit]},
  headerState:()=>visible,submitPending:()=>Boolean(c.pending.submit),
  checkpointMatchesShift:()=>true,saveSubmitCheckpoint:p=>{c.submitCheckpoint={...p};},
  eventId:()=>`CAPTURE_${++sequence}`,feedback:()=>{},emitAction:()=>{},scheduleScan:()=>{},
  setTimeout:fn=>{timers.push(fn);},
  send:async(type,{event}={})=>{
    if(type!=='cat-event')return {ok:true};
    events.push(event);
    if(serverFail)throw Error('service worker offline');
    if(event.type==='submit-confirmed'){
      confirmed.add(`${event.jobId}|${event.taskIndex}`);accepted.add(event.eventId);
      if(ackLost)throw Error('ACK lost after durable save');
    }
    return {ok:true};
  },
  chrome:{runtime:{sendMessage:async()=>({ok:true})}}
});
vm.runInContext(code,c);
const check=(label,assertion)=>{assertion();passed++;console.log('PASS',passed,label);};
function next(i,job='JOB_11'){visible={jobId:job,taskIndex:i,totalTasks:9};text=`${job} - tasks: ${i}/9`;}
const count=()=>confirmed.size;
check('first genuine Submit captures stable attempt without counting click',()=>{
 assert.equal(c.captureCoverageSubmit(submit),true);assert.equal(sequence,1);assert.equal(count(),0);
 assert.equal(c.pending.submit.taskIndex,1);
});
check('duplicate Submit on same task gets no second ID',()=>{assert.equal(c.captureCoverageSubmit(submit),true);assert.equal(sequence,1);});
check('advance to next task then Submit independently before old ACK',()=>{
 now+=400;next(2);assert.equal(c.captureCoverageSubmit(submit),true);
 assert.equal(c.pending.submit.taskIndex,2);assert.equal(sequence,2);assert.equal(c.coverageBacklog.length,1);
 assert.ok(storage.catVerifiedSubmitLedgerV1);assert.equal(count(),0);
});
await c.drainCoverageSubmitLedger();
check('old successful task counts once, new task remains pending',()=>{assert.equal(count(),1);assert.equal(c.pending.submit.taskIndex,2);assert.equal(c.coverageBacklog.length,0);});
check('rapid third task stores task 2 independently',()=>{now+=400;next(3);c.captureCoverageSubmit(submit);assert.equal(sequence,3);assert.equal(c.coverageBacklog.length,1);});
ackLost=true;await c.drainCoverageSubmitLedger();
check('background ACK loss retains same previous receipt',()=>{assert.equal(count(),2);assert.equal(c.coverageBacklog.length,1);assert.equal(c.pending.submit.taskIndex,3);});
ackLost=false;await c.drainCoverageSubmitLedger();
check('retry of accepted receipt is idempotent',()=>{assert.equal(count(),2);assert.equal(c.coverageBacklog.length,0);assert.equal(events.at(-1).eventId,events.at(-2).eventId);});
check('a new Submit cannot promote previous task if validation failed',()=>{
 now+=400;next(4);text+=' submission failed';assert.equal(c.captureCoverageSubmit(submit),false);
 assert.equal(sequence,3);assert.equal(c.pending.submit.taskIndex,3);text='JOB_11 - tasks: 4/9';
});
check('trusted Skip of previous task blocks promotion',()=>{
 c.pending.skip={jobId:'JOB_11',taskIndex:3,at:now};assert.equal(c.captureCoverageSubmit(submit),false);
 assert.equal(sequence,3);c.pending.skip=null;
});
check('moving backward does not prove a prior Submit',()=>{
 next(1);assert.equal(c.captureCoverageSubmit(submit),false);assert.equal(sequence,3);
});
check('stale attempt beyond acceptance window remains unverified',()=>{
 next(4);now+=46000;assert.equal(c.captureCoverageSubmit(submit),false);
 assert.equal(sequence,3);now-=46000;
});
check('old document receipt cannot authorize new task transition',()=>{
 c.pending.submit.pageInstanceId='OTHER_DOC';assert.equal(c.captureCoverageSubmit(submit),false);
 c.pending.submit.pageInstanceId='PAGE_ACTIVE';
});
check('shift change prevents the old receipt being promoted',()=>{
 c.shiftState={...shift,sessionId:'OTHER_SHIFT'};assert.equal(c.captureCoverageSubmit(submit),false);
 c.shiftState={...shift};
});
check('sessionStorage write failure retains previous intent and refuses new task',()=>{
 storageFail=true;assert.equal(c.captureCoverageSubmit(submit),false);
 assert.equal(c.pending.submit.taskIndex,3);assert.equal(c.coverageBacklog.length,0);storageFail=false;
});
check('bounded ledger never evicts earlier unresolved submissions',()=>{
 c.coverageBacklog=Array.from({length:48},(_,i)=>({id:`OLD_${i}`}));
 assert.equal(c.captureCoverageSubmit(submit),false);assert.equal(c.coverageBacklog.length,48);c.coverageBacklog=[];
});
check('real next task is captured after safeguards clear',()=>{
 assert.equal(c.captureCoverageSubmit(submit),true);assert.equal(sequence,4);
 assert.equal(c.coverageBacklog.length,1);assert.equal(c.pending.submit.taskIndex,4);
});
serverFail=true;await c.drainCoverageSubmitLedger();
check('temporary background failure retains retryable task ID',()=>{assert.equal(c.coverageBacklog.length,1);assert.equal(count(),2);});
serverFail=false;await c.drainCoverageSubmitLedger();
check('recovered background counts task 3 without dropping task 4',()=>{assert.equal(count(),3);assert.equal(c.coverageBacklog.length,0);assert.equal(c.pending.submit.taskIndex,4);});
check('prior-shift ledger is quarantined rather than credited',()=>{
 c.coverageBacklog=[{id:'OLDER',jobId:'JOB_X',taskIndex:1,totalTasks:9,
   date:shift.reportDate,sessionId:'ANOTHER_SHIFT',generation:2,deviceId:'DEVICE_1',observedNext:{jobId:'JOB_X',taskIndex:2}}];
});
await c.drainCoverageSubmitLedger();
check('quarantined old shift task remains uncounted',()=>{assert.equal(count(),3);assert.equal(c.coverageBacklog.length,1);});
console.log(`PASS Coverage multi-submit continuity: ${passed} synthetic checks (no Augmoto activity)`);

const bg=readFileSync(path.join(root,'coverage-background.js'),'utf8');
const from=bg.indexOf('async function applyEvent(event) {'),end=bg.indexOf('async function reconcileNoMatchState',from);
assert(from>=0&&end>from);
let saved={data:{dates:{}},pending:{},recent:[],attempts:[]};
const bc=vm.createContext({
 Date:Clock,Number,String,Boolean,Math,Array,Object,Set,Promise,
 queue:f=>f(),readCore:async()=>({...structuredClone(saved),shift:{...shift}}),shiftIsActive:v=>v.shift.status==='active',
 reportDateForCore:()=>shift.reportDate,
 ensureDate:(data,d)=>data.dates[d]??={summary:{submitted:0,clientSequence:0,currentJob:'',currentTask:0},jobs:{},tasks:{}},
 ensureJob:(day,j)=>day.jobs[j]??={jobId:j,submitted:0,lastTask:0},
 ensureTask:(day,j,i)=>day.tasks[j+'|'+i]??={jobId:j,taskIndex:i,submitted:false},
 applyPresenceFields:()=>{},prune:()=>{},scheduleSyncSoon:()=>{},appendLegacySubmission:async()=>{},
 pendingAdd:(p,d,k)=>{p[d]??=[];if(!p[d].includes(k))p[d].push(k);},
 taskKey:(j,i)=>j+'|'+i,num:v=>Math.max(0,Math.floor(Number(v)||0)),epochMs:v=>Number(v)||0,
 MANAGED_IDLE_MS:300000,MAX_RECENT_EVENTS:4000,SUMMARY_PENDING_KEY:'__summary__',activeAttemptOwner:()=> 'TEST_OWNER',
 chrome:{storage:{local:{get:async()=>({attempts:[]}),set:async patch=>{for(const [k,v]of Object.entries(patch))saved[k]=structuredClone(v);}}}},
 CAT:{data:'data',pendingTasks:'pending',recent:'recent',submitAttempts:'attempts'}
});
vm.runInContext(bg.slice(from,end),bc);
const evt=(type,id,task)=>({type,eventId:id,jobId:'JOB_BG',taskIndex:task,totalTasks:9,timestamp:now});
await bc.applyEvent(evt('task-start','START_1',1));
await bc.applyEvent(evt('submit-pending','PENDING_1',1));
await bc.applyEvent(evt('task-start','START_2',2));
await bc.applyEvent(evt('submit-pending','PENDING_2',2));
check('background keeps Task 2 active before older receipt arrives',()=>{
 const s=saved.data.dates[shift.reportDate].summary;
 assert.equal(s.currentTask,2);assert.equal(s.pendingSubmission,true);
});
await bc.applyEvent(evt('submit-confirmed','CONFIRMED_1',1));
check('late Task 1 receipt updates its task without rewinding current header',()=>{
 const s=saved.data.dates[shift.reportDate].summary;
 assert.equal(s.currentTask,2);assert.equal(s.submitted,1);
});
check('late Task 1 receipt does not clear Task 2 pending status',()=>{
 const s=saved.data.dates[shift.reportDate].summary;
 assert.equal(s.pendingSubmission,true);
});
await bc.applyEvent(evt('submit-confirmed','CONFIRMED_2',2));
await bc.applyEvent(evt('submit-confirmed','CONFIRMED_1',1));
check('both tasks settle once, pending cleared only after both accepted',()=>{
 const s=saved.data.dates[shift.reportDate].summary;
 assert.equal(s.submitted,2);assert.equal(s.pendingSubmission,false);assert.equal(s.currentTask,2);
});
await bc.applyEvent(evt('submit-pending','DELAYED_PENDING_TASK_1',1));
check('delayed pending message cannot reopen an already submitted task',()=>{
 const day=saved.data.dates[shift.reportDate],s=day.summary;
 assert.equal(s.submitted,2);assert.equal(s.pendingSubmission,false);
 assert.equal(day.tasks['JOB_BG|1'].status,'submitted');assert.equal(day.tasks['JOB_BG|1'].submitPending,false);
});
console.log(`PASS Coverage total: ${passed} synthetic checks; no production records touched`);

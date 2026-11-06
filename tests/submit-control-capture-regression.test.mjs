import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const base=path.resolve(import.meta.dirname,existsSync(path.resolve(import.meta.dirname,'../tracker/coverage.js'))?'../tracker':'../extension');
const coverage=readFileSync(path.join(base,'coverage.js'),'utf8');
const confirmation=readFileSync(path.join(base,'confirmation.js'),'utf8');
function between(code,begin,end){const i=code.indexOf(begin),j=code.indexOf(end,i);assert(i>=0&&j>i,begin);return code.slice(i,j);}
const coverageCode=between(coverage,'  function persistCoverageBacklog()', '  function recordUnverifiedSubmit(')+between(coverage,'  function coverageSubmitLabel(', '  function clickIntent(event) {');
const confirmationCode=between(confirmation,'  function confirmationControlLabel(', '  document.addEventListener(\'click\'');
let tests=0;
async function check(label,run){await run();console.log('PASS',++tests,label);}
class Element {}
function button(name,{x=900,y=55,toolbar=false,near=false,dialog=false,aria='',width=90,height=30}={}){
 const b=new Element();b.name=name;b.value='';b.innerText=name;b.textContent=name;
 b.getAttribute=k=>k==='aria-label'?aria:null;
 b.getBoundingClientRect=()=>({left:x,top:y,right:x+width,width,height});
 b.closest=selector=>{
  if(selector.includes('dialog')&&dialog)return {};
  if(selector.includes('header,')&&toolbar)return {};
  if(selector.includes('skip')&&near)return {};
  return null;
 };
 b.toolbar=toolbar;b.near=near;return b;
}
const mk=()=>({attempts:[],checkpoints:[],statuses:[],events:[],scans:[],counts:0});
function sandbox(buttons){
 const out=mk();let key=0;
 const c=vm.createContext({
  Element,Date,Number,String,Boolean,Array,Object,Promise,Math,RegExp,innerWidth:1400,innerHeight:900,
  clean:v=>String(v||'').replace(/\s+/g,' ').trim(),label:el=>el.name,
  lower:v=>String(v||'').toLowerCase(),disabled:el=>el.disabled===true,
  nearbyHeaderControl:(el)=>el.near,
  current:{jobId:'JOB_111',taskIndex:3,totalTasks:5},
  shiftState:{status:'active',sessionId:'sess',generation:1,reportDate:'2026-11-02'},
  bridgeState:{deviceId:'device'},pending:{submit:null,skip:null},
  PAGE_INSTANCE_ID:'DOC_X',COVERAGE_BACKLOG_LIMIT:48,coverageBacklog:[],coverageBacklogBusy:false,
  COVERAGE_BACKLOG_KEY:'catVerifiedSubmitLedgerV1',ACCEPTANCE_WINDOW_MS:45000,REJECTED_NOTICE:/submission failed|unable to submit|required field/i,
  submitCheckpoint:null,checkpointMatchesShift:()=>true,
  sessionStorage:{setItem:()=>{},removeItem:()=>{}},
  headerState:()=>c.visible,visible:{jobId:'JOB_111',taskIndex:3,totalTasks:5},
  send:async()=>({ok:true}),
  submitPending:()=>Boolean(c.pending.submit),
  eventId:()=>`attempt-${++key}`,
  saveSubmitCheckpoint:a=>{out.checkpoints.push({...a});c.submitCheckpoint={...a};},
  feedback:(status,id)=>out.statuses.push([status,id]),
  emitAction:()=>out.events.push('submit-pending'),
  scheduleScan:delay=>out.scans.push(delay),
  chrome:{runtime:{sendMessage:msg=>{out.attempts.push(msg);return Promise.resolve({ok:true});}}},
  setTimeout:()=>{},
  document:{body:{innerText:'JOB_111 - tasks: 3/5'},querySelectorAll:()=>buttons}
 });
 vm.runInContext(coverageCode,c);
 return {c,out};
}
await check('Coverage unique task Submit is detected without incrementing any count',()=>{
 const real=button('Submit');const {c,out}=sandbox([real]);assert.equal(c.captureCoverageSubmit(real),true);
 assert.equal(out.attempts.length,1);assert.equal(out.attempts[0].type,'cat-submit-attempt');
 assert.equal(out.events[0],'submit-pending');assert.equal(out.counts,0);
});
await check('Coverage Submit can be captured from live task header before first scanner paint',()=>{
 const real=button('Submit');const {c,out}=sandbox([real]);
 c.current={jobId:'',taskIndex:0,totalTasks:0};
 assert.equal(c.captureCoverageSubmit(real),true);
 assert.equal(out.attempts.length,1);
 assert.equal(c.pending.submit.taskIndex,3);
});
await check('Coverage duplicate unrelated Submit does not suppress unique task toolbar Submit',()=>{
 const task=button('Submit',{toolbar:true}),other=button('Submit',{x:30,y:400});
 const {c,out}=sandbox([task,other]);assert.equal(c.captureCoverageSubmit(task),true);assert.equal(c.captureCoverageSubmit(other),false);
 assert.equal(out.attempts.length,1);
});
await check('Coverage duplicate active Submit controls remain ambiguous and uncounted',()=>{
 const a=button('Submit',{toolbar:true}),b=button('Submit',{toolbar:true,x:800});const {c,out}=sandbox([a,b]);
 assert.equal(c.captureCoverageSubmit(a),false);assert.equal(out.attempts.length,0);
});
await check('Coverage submit task accessible text supported',()=>{
 const a=button('Submit task',{toolbar:true});const {c,out}=sandbox([a]);assert.equal(c.captureCoverageSubmit(a),true);assert.equal(out.attempts.length,1);
});
await check('Coverage Save/Submit unrelated dialog does not arm receipt',()=>{
 const a=button('Submit',{dialog:true});const {c,out}=sandbox([a]);assert.equal(c.captureCoverageSubmit(a),false);assert.equal(out.attempts.length,0);
});
await check('Coverage invalid user controls never arm submission',()=>{
 const a=button('Cancel');const {c,out}=sandbox([a]);assert.equal(c.captureCoverageSubmit(a),false);assert.equal(out.attempts.length,0);
});
await check('Coverage click and native submit cannot create two attempts for one task',()=>{
 const a=button('Submit');const {c,out}=sandbox([a]);assert.equal(c.captureCoverageSubmit(a),true);
 assert.equal(c.captureCoverageSubmit(a),true);assert.equal(out.attempts.length,1);
});
await check('Coverage shift must be active before Submit intent',()=>{
 const a=button('Submit');const {c,out}=sandbox([a]);c.shiftState.status='completed';
 assert.equal(c.captureCoverageSubmit(a),false);assert.equal(out.attempts.length,0);
});
await check('Coverage source has a trusted form-submit capture listener',()=>{
 assert.match(coverage,/document\.addEventListener\('submit', event =>/);
 assert.match(coverage,/event\?\.isTrusted === false \|\| !event\.submitter/);
 assert.match(coverage,/captureCoverageSubmit\(event\.submitter\)/);
});
const confirmationContext=vm.createContext({String,Boolean,Array,RegExp});
vm.runInContext(confirmationCode,confirmationContext);
await check('Confirmation accessible Submit label works despite icon-only text',()=>{
 const b={innerText:'✓',textContent:'✓',value:'',getAttribute:k=>k==='aria-label'?'Submit':null};
 assert.equal(confirmationContext.isConfirmationSubmitControl(b),true);
});
await check('Confirmation accepts supported exact Submit variants',()=>{
 const b={innerText:'Submit task',textContent:'Submit task',value:'',getAttribute:()=>null};
 assert.equal(confirmationContext.isConfirmationSubmitControl(b),true);
});
await check('Confirmation rejects Submit history / form Save controls',()=>{
 for(const txt of ['Submit history','Submit failed','Save','Submit results','Submit settings']) {
  const b={innerText:txt,textContent:txt,value:'',getAttribute:()=>null};
  assert.equal(confirmationContext.isConfirmationSubmitControl(b),false,txt);
 }
});
await check('Confirmation still checks trusted action and active shift',()=>{
 assert.match(confirmation,/if\(e\?\.isTrusted===false\)return/);
 assert.match(confirmation,/shiftState\?\.status!=='active'/);
 assert.match(confirmation,/event\('submit-confirmed'/);
});
console.log(`PASS Submit capture reliability: ${tests} synthetic checks; no real Augmoto calls or employee data`);

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync(new URL('../../tracker/coverage.js',import.meta.url),'utf8');
assert.match(code,/const ACCEPTANCE_WINDOW_MS = 45 \* 1000/);
assert.match(code,/catUnverifiedSubmissionsV1/);
assert.match(code,/queueConfirmedAt/);
assert.match(code,/p\.confirming=true/);
const manifest=JSON.parse(fs.readFileSync(new URL('../../tracker/manifest.json',import.meta.url),'utf8'));
assert.equal(manifest.version,'2.3.10','Retain immediate Submit capture baseline with production release');
const popup=fs.readFileSync(new URL('../../tracker/popup.js',import.meta.url),'utf8');
assert.match(popup,/Submission detection needs review/);
assert.match(popup,/item\.shiftSessionId===shift\.sessionId/);
let now=1000000, calls=[], resolution={ok:true};
const rect=(top=180,left=720)=>({width:110,height:36,top,left,right:left+110});
const submit={text:'Submit',getBoundingClientRect:()=>rect()};
const dialogSubmit={text:'Submit',getBoundingClientRect:()=>rect(260,720)};
class MockElement {}
Object.setPrototypeOf(submit,MockElement.prototype);Object.setPrototypeOf(dialogSubmit,MockElement.prototype);
const elements=[submit];
const ctx=vm.createContext({
  Number,String,Array,Math,Boolean,Element:MockElement,Date:{now:()=>now},
  current:{jobId:'JOB_123',taskIndex:1,totalTasks:3},shiftState:{status:'active'},
  innerWidth:1200,innerHeight:800,pending:{submit:null},
  lower:v=>String(v).trim().toLowerCase(),label:el=>el.text,disabled:()=>false,nearbyHeaderControl:()=>false,
  document:{querySelectorAll:()=>elements},
  clean:v=>String(v).trim(),settings:{enabled:true},
  submitCheckpoint:{schemaVersion:2,kind:'explicit-coverage-submit',id:'s1',jobId:'JOB_123',taskIndex:1,totalTasks:3,pressedAt:now,date:'2026-10-23',sessionId:'s',generation:1,deviceId:'d',queueEligible:true},
  SUBMIT_MAX_AGE_MS:90000,ACCEPTANCE_WINDOW_MS:45000,
  bridgeState:{deviceId:'d'},performance:{getEntriesByType:()=>[{type:'navigate'}]},
  REJECTED_NOTICE:/submission failed/i,
  location:{pathname:'/jobs'},scheduleScan:()=>{},confirmationRoute:()=>false,
  send:(_type,payload)=>{calls.push(payload.event);return Promise.resolve(resolution)},
  clearSubmitCheckpoint:()=>{},saveSubmitCheckpoint:()=>{},phtDate:()=> '2026-10-23',lastInteraction:now,MANAGED_IDLE_MS:300000
});
const part=(start,end)=>{const a=code.indexOf(start),b=code.indexOf(end,a);assert.ok(a>=0&&b>a,start);return code.slice(a,b)};
vm.runInContext(part('  function realHeaderAction(', '  function clickIntent(')+part('  function checkpointMatchesShift','  function saveSubmitCheckpoint')+part('  function submitPending()',"  document.addEventListener('tt-qc-mode-change'"),ctx);
assert.equal(ctx.realHeaderAction(submit,'submit'),true,'Single top-right blue Submit recognized without Skip/Exit neighbor');
elements.push(dialogSubmit);
assert.equal(ctx.realHeaderAction(submit,'submit'),false,'Two Submit buttons are ambiguous');
elements.pop();
const low=Object.assign(new MockElement(),{text:'Submit',getBoundingClientRect:()=>rect(480,720)});
assert.equal(ctx.realHeaderAction(low,'submit'),false,'Unrelated lower form Submit rejected');
ctx.shiftState.status='completed';assert.equal(ctx.realHeaderAction(submit,'submit'),false,'Locked shift cannot use sole-button fallback');
ctx.shiftState={status:'active',reportDate:'2026-10-23',sessionId:'s',generation:1};
elements.length=0; // The stable Jobs screen has no task Submit control.
function seed(at=now){ctx.pending.submit={id:'s1',jobId:'JOB_123',taskIndex:1,totalTasks:3,at,queueEligible:true};ctx.submitCheckpoint={...ctx.submitCheckpoint,pressedAt:at,queueConfirmedAt:0};}
const queue='Filters Store Jobs (10) NEEDS REVIEW IN PROGRESS';
seed(now-30000);assert.equal(ctx.observeSubmitToJobs(queue),false);
now+=800;assert.equal(ctx.observeSubmitToJobs(queue),true,'Task accepted after 30 seconds gets a verified transition');
await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);
seed(now-46000);assert.equal(ctx.observeSubmitToJobs(queue),false,'No 46-second stale inferred submission');
seed(now-20000);assert.equal(ctx.confirmPendingSubmit('task-advance'),true,'No-edit task-advance permitted within window');
await new Promise(r=>setImmediate(r));assert.equal(calls.length,2);
seed();assert.equal(ctx.confirmPendingSubmit('submit-to-jobs-transition'),false,'Bare click must not count');
console.log('PASS Coverage v2.2.57: unique blue Submit, locked/ambiguous controls, no edits, delayed acceptance, stale rejection and click-only protection.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'../..');
const worker=fs.readFileSync(path.join(root,'cloudflare/src/worker.js'),'utf8');
const beg=worker.indexOf('const TRACKER_SEQUENCE_PROOF_MAX_JOBS=120;');
const end=worker.indexOf('async function coverageSyncServer(request, env)',beg);
assert(beg>=0&&end>beg,'server safe-resume proof exists');
const code=worker.slice(beg,end);
let state={};
const server={
  deviceId:'same-device',shiftSessionId:'active-session',shiftGeneration:2,clientSequence:42,
  syncPayloadDigest:'a'.repeat(64),submitted:2,created:2,blurred:2,deleted:0,noMatch:0,
  activeMs:2000,idleMs:0,awayMs:0,elapsedMs:4000,productMatched:0,efficiencyTaskCount:0,
  efficiencyActiveMs:0,submittedManualAdjustment:0
};
const shift={status:'active',sessionId:'active-session',generation:2,reportDate:'2026-10-29'};
const row=(jobId,taskIndex,created=1)=>({jobId,taskIndex,submitted:true,created,blurred:1,deleted:0,noMatch:0,productMatched:0,activeMs:1000,idleMs:0,awayMs:0,elapsedMs:1100,shiftSessionId:shift.sessionId,shiftGeneration:shift.generation});
const acceptedTasks=[row('JOB_42',1),row('JOB_42',2)];
const acceptedJobs=[{jobId:'JOB_42',submitted:2,created:2,blurred:2,deleted:0,noMatch:0,productMatched:0,activeMs:2000,idleMs:0,awayMs:0,elapsedMs:2200,shiftSessionId:shift.sessionId,shiftGeneration:shift.generation}];
const received={deviceId:'same-device',shiftSessionId:shift.sessionId,shiftGeneration:shift.generation,
  summary:{...server,clientSequence:13,submitted:3,created:3,blurred:3,activeMs:3100,elapsedMs:6000},
  jobs:[{...acceptedJobs[0],submitted:3,created:3,blurred:3}],
  tasks:[...acceptedTasks,row('JOB_42',3)]};
const denial=(status,code)=>{const e=new Error(code);e.status=status;e.code=code;throw e};
const ctx={
  cleanText:v=>String(v||''),parseBody:async()=>received,coverageRequireBridgeActorServer:async()=>({bridge:{deviceId:'same-device'}}),confirmationRequireBridgeActorServer:async()=>({bridge:{deviceId:'same-device'}}),
  trackerShiftResolveForActorServer:async()=>shift,trackerShiftWorkflowSnapshotServer:async()=>server,
  trackerRecoveryDataServer:async()=>({jobs:acceptedJobs,tasks:acceptedTasks}),
  coverageSanitizeSummaryServer:v=>v,confirmationSanitizeSummaryServer:v=>v,
  coverageSanitizeJobServer:v=>v,confirmationSanitizeJobServer:v=>v,
  coverageSanitizeTaskServer:v=>v,confirmationSanitizeTaskServer:v=>v,
  fail:denial
};
vm.createContext(ctx);vm.runInContext(code,ctx);
const check=async()=>ctx.trackerSequenceResumeProofServer(null,{},'coverage');
assert.equal((await check()).safeToResume,true,'same device + all accepted tasks + monotonic totals can resume');
received.tasks=[row('JOB_42',1),row('JOB_42',3)];
assert.equal((await check()).reason,'LEDGER_REVIEW_REQUIRED','lost accepted task must never overwrite server');
received.tasks=[...acceptedTasks,row('JOB_42',3)];
received.summary.submitted=1;
assert.equal((await check()).reason,'SERVER_COUNTS_AHEAD','server counts ahead must block');
received.summary.submitted=3;
received.deviceId='different';
await assert.rejects(check(),e=>e.code==='TRACKER_SEQUENCE_DEVICE_INVALID');
received.deviceId='same-device';
state='bad';server.syncPayloadDigest='';
assert.equal((await check()).reason,'SERVER_RECOVERY_OR_LEGACY_DIGEST','legacy digest must block');
server.syncPayloadDigest='a'.repeat(64);
server.recoveryPending=true;
assert.equal((await check()).reason,'SERVER_RECOVERY_OR_LEGACY_DIGEST','pending recovery cannot be bypassed');
server.recoveryPending=false;
received.tasks=Array.from({length:351},(_,i)=>row('JOB_42',i+1));
assert.equal((await check()).reason,'LOCAL_LEDGER_LIMIT','oversized local ledger blocked before writes');
received.tasks=[...acceptedTasks,row('JOB_42',3)];
const updated=worker.match(/if\(body.sequenceResumeExpected!==undefined\|\|body.sequenceResumeDigest!==undefined\)[\s\S]*?TRACKER_SEQUENCE_RESUME_CHANGED/g)||[];
assert.equal(updated.length,2,'both workflows reject changed server sequences');
for (const wf of ['coverage','confirmation']) {
 const file=fs.readFileSync(path.join(root,'tracker',`${wf}-background.js`),'utf8');
 assert.match(file,/async function trackerSequenceResumeSafe\(core\)/,'client contains proof');
 assert.match(file,/if\(body\?\.stale===true\)\{\s*const resumed=await trackerSequenceResumeSafe/,'client attempts safe proof on stale sequence');
 assert.match(file,/sequenceResumeExpected:core\.sync\.sequenceResumeExpected/,'client binds following sync to server accepted sequence');
 assert.match(file,/sequenceProofCheckedAt.*Date\.now/,'client rate-limits proofs');
 assert.match(file,/TRACKER_SEQUENCE_CONFLICT/,'unsafe conflict remains blocked');
}
console.log('PASS: sequence proof checks device, shift, server ledger, monotonic counts, pending recovery, missing tasks, resource caps, both workflow bindings');

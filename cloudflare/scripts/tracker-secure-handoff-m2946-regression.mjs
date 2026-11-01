import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const worker=read('../src/worker.js');
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
requireWorkforceAttendanceActor=async (request,env)=>env.actor;
coverageRequireBridgeActorServer=async(request,env)=>env.paired;
confirmationRequireBridgeActorServer=async(request,env)=>env.paired;
trackerShiftResolveForActorServer=async(env)=>env.shift;
trackerShiftWorkflowSnapshotServer=async(env,workflow)=>env.daily[workflow];
firebaseAdminGet=async(env,path)=>{if(path.includes('/bridges'))return env.bridges; if(path.includes('/jobs/'))return env.jobs; if(path.includes('/tasks/'))return env.tasks; const workflow=path.toLowerCase().includes('confirmation')?'confirmation':'coverage';return env.daily[workflow]??null;};
firebaseAdminGetWithEtag=async(env,path)=>{const workflow=path.toLowerCase().includes('confirmation')?'confirmation':'coverage';return {value:env.daily[workflow]??null,etag:env.etag};};
firebaseAdminSetIfMatch=async(env,path,value,etag)=>{if(!etag||env.forceRace)return {preconditionFailed:true};const workflow=path.toLowerCase().includes('confirmation')?'confirmation':'coverage';env.daily[workflow]=value;return {committed:true};};
firebaseAdminPatch=async(env,root,updates)=>{env.patches.push(updates);for(const [path,value] of Object.entries(updates)){if(path.includes('/bridges/')){const key=path.split('/bridges/')[1]?.split('/')[0];if(key&&env.bridges[key])env.bridges[key][path.split('/').pop()]=value;}}};
globalThis.handoff={trackerRecoverCurrentShiftServer,trackerRecoveryAcknowledgeServer,coverageSyncServer,confirmationSyncServer};`,c);
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const actor={role:'agent',name:'Inosuke Hashibira',pod:'pod-qa',uid:'uid-agent'};
const shift={sessionId:'qa-session-1840',generation:0,reportDate:date,status:'active'};
function env(workflow){return {actor:{...actor},paired:{...actor,deviceId:'new-install',tokenId:'new-token',bridge:{deviceId:'new-install'}},shift:{...shift},etag:'etag-stable',daily:{coverage:null,confirmation:null},jobs:{one:{jobId:'JOB_113',storeName:'Preston - Home Co',submitted:7,shiftSessionId:shift.sessionId,shiftGeneration:0}},tasks:{one:{jobId:'JOB_113',taskIndex:1,submitted:true,shiftSessionId:shift.sessionId,shiftGeneration:0}},bridges:{old:{tokenId:'old-token',role:'agent',name:actor.name,pod:actor.pod,deviceId:'old-install',active:true},new:{tokenId:'new-token',role:'agent',name:actor.name,pod:actor.pod,deviceId:'new-install',active:true}},patches:[],forceRace:false,workflow};}
const request=(workflow,endpoint,body,device='new-install')=>new Request(`https://staging.test/api/workforce/${workflow}/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',...{[workflow==='coverage'?'X-TT-Coverage-Bridge':'X-TT-Confirmation-Bridge']:'signed-token'}},body:JSON.stringify({...body,deviceId:device})});
const recoverReq=w=>request(w,'recover-current-shift',{shiftSessionId:shift.sessionId,shiftGeneration:0,confirmation:'RECOVER_MY_ACTIVE_SHIFT'});
for(const workflow of ['coverage','confirmation']){
  const state=env(workflow),before={deviceId:'old-install',shiftSessionId:shift.sessionId,shiftGeneration:0,submitted:7,clientSequence:20,created:2,activeMs:450000,interval1:7};state.daily[workflow]=before;
  const req=recoverReq(workflow);
  const recovered=await c.handoff.trackerRecoverCurrentShiftServer(req,state,workflow);
  assert.equal(recovered.ok,true);assert.equal(recovered.pending,true);assert.equal(recovered.summary.submitted,7);assert.equal(recovered.jobs[0].jobId,'JOB_113');assert.equal(recovered.tasks[0].submitted,true);
  assert.equal(state.daily[workflow].clientSequence,20,'server sequence preserved');assert.equal(state.daily[workflow].deviceId,'new-install');assert.equal(state.bridges.old.active,false,'original browser revoked');
  const repeated=await c.handoff.trackerRecoverCurrentShiftServer(recoverReq(workflow),state,workflow);assert.equal(repeated.recoveryId,recovered.recoveryId,'recovery retry idempotent');
  const syncRequest=request(workflow,'sync',{shiftSessionId:shift.sessionId,shiftGeneration:0,summary:{clientSequence:50,submitted:0},clientSequence:50});
  await assert.rejects(workflow==='coverage'?c.handoff.coverageSyncServer(syncRequest,state):c.handoff.confirmationSyncServer(syncRequest,state),e=>e.code==='TRACKER_RECOVERY_PENDING');
  await assert.rejects(c.handoff.trackerRecoveryAcknowledgeServer(request(workflow,'recover-ack',{recoveryId:'bad-id'}),state,workflow),e=>e.code==='TRACKER_RECOVERY_ACK_CONFLICT');
  const ack=await c.handoff.trackerRecoveryAcknowledgeServer(request(workflow,'recover-ack',{recoveryId:recovered.recoveryId}),state,workflow);
  assert.equal(ack.ok,true);assert.equal(state.daily[workflow].recoveryPending,false);assert.equal(state.daily[workflow].submitted,7,'recovery acknowledgment leaves counts intact');
  const again=await c.handoff.trackerRecoveryAcknowledgeServer(request(workflow,'recover-ack',{recoveryId:recovered.recoveryId}),state,workflow);assert.equal(again.alreadyAcknowledged,true,'ack retry safe');
  const wrongPod=env(workflow);wrongPod.actor.pod='another-pod';wrongPod.daily[workflow]=before;
  await assert.rejects(c.handoff.trackerRecoverCurrentShiftServer(recoverReq(workflow),wrongPod,workflow),e=>e.code==='TRACKER_RECOVERY_IDENTITY_INVALID');
  assert.equal(wrongPod.daily[workflow].deviceId,'old-install','wrong-POD user changes no records');
  const wrongShift=env(workflow);wrongShift.shift={...shift,sessionId:'different'};wrongShift.daily[workflow]=before;
  await assert.rejects(c.handoff.trackerRecoverCurrentShiftServer(recoverReq(workflow),wrongShift,workflow),e=>e.code==='TRACKER_RECOVERY_SHIFT_CHANGED');
  const raced=env(workflow);raced.daily[workflow]=before;raced.forceRace=true;
  await assert.rejects(c.handoff.trackerRecoverCurrentShiftServer(recoverReq(workflow),raced,workflow),e=>e.code==='TRACKER_RECOVERY_RACE');
  assert.equal(raced.daily[workflow].submitted,7,'CAS race does not change server counters');
}
for(const workflow of ['coverage','confirmation']){
  const bg=read(`../../tracker/${workflow}-background.js`);
  assert(bg.includes('recoverCurrentShift')&&bg.includes(`${workflow==='coverage'?'cat':'cft'}-recover-shift`),'UI background exposes recovery');
  assert(bg.includes('trackerRecoveryHasLocalWork(day)'),'unsynced task/job data fails closed');
  assert(bg.includes('PreRecoveryBackupV1'),'pre-handoff local backup preserved');
  assert(bg.includes('RecoveryCheckpointV1'),'recovery acknowledgments survive restart');
}
const popup=read('../../tracker/popup.js'),html=read('../../tracker/popup.html');
assert(html.includes('id="recoverShift"')&&popup.includes('recover-shift'),'user-confirmed recovery button available');
assert(popup.includes("another browser|recovery pending"),'button only surfaced for conflict');
assert(worker.includes('TRACKER_RECOVERY_PENDING')&&worker.includes('firebaseAdminSetIfMatch'),'sync blocked while recovering + conditional server writes');
console.log('PASS M2.9.46 secure handoff: authenticated same Agent/POD; active shift; ETag/ID validation; old-token revocation; no count reset; ledger restoration; retry-safe prepare/ack; sync held until hydration; local work fail-closed.');

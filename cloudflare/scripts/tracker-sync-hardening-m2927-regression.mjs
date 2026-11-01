import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const c=vm.createContext({URL,Request,Response,Headers,console,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,createRemoteJWKSet:()=>({})});
vm.runInContext(source.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {').replace('export class ChatRealtimeHub','class ChatRealtimeHub')+`
canonicalWorkforceMemberServer=async(env)=>env.member;
firebaseAdminGet=async(env,path)=>path.includes('/bridges/')?env.bridge:(env.previous||null);
firebaseAdminPatch=async(env,root,updates)=>{env.updates=updates;};
trackerShiftResolveForActorServer=async(env)=>({sessionId:'shift-sync',generation:2,status:'active',locked:false,reportDate:env.shiftDate,startedAt:new Date().toISOString()});
trackerShiftWorkflowSnapshotServer=async(env)=>env.previous||null;
globalThis.test={coverageSyncServer,confirmationSyncServer,signCompactToken,trackerWorkflowRecordHasActivityServer};`,c);

const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const baseEnv={shiftDate:date,CHAT_SESSION_SECRET:'fixture-only-not-a-production-secret',member:{name:'Tanjiro Kamado',pod:'demon',role:'agent'}};

async function tokenFor(purpose,deviceId='browser-one'){
  const env={...baseEnv,bridge:{name:'Tanjiro Kamado',pod:'demon',deviceId,active:true,expiresAtMs:Date.now()+3600000}};
  const payload={name:'Tanjiro Kamado',pod:'demon',role:'agent',tokenId:'test-token',deviceId};
  return {env,token:await c.test.signCompactToken(env,payload,purpose,3600000)};
}

{
  const {env,token}=await tokenFor('workforce-coverage-bridge-v1');
  const requestBody={shiftSessionId:'shift-sync',shiftGeneration:2,deviceId:'browser-one',clientSequence:3,summary:{clientSequence:3,created:1,activeMs:1000,trackerState:'active'}};
  const req=body=>new Request('https://fixture.test/api/workforce/coverage/sync',{method:'POST',headers:{'content-type':'application/json','X-TT-Coverage-Bridge':token},body:JSON.stringify(body)});
  await c.test.coverageSyncServer(req(requestBody),env);
  assert.ok(env.updates && Object.keys(env.updates).some(k=>k.includes('/daily/')),'Coverage normal sync writes daily record');

  const conflictEnv={...env,updates:null,previous:{deviceId:'other-browser',clientSequence:4,created:1,submitted:0,shiftSessionId:'shift-sync',shiftGeneration:2}};
  await assert.rejects(c.test.coverageSyncServer(req(requestBody),conflictEnv),e=>e.code==='COVERAGE_DEVICE_CONFLICT');

  const staleEnv={...env,updates:null,previous:{deviceId:'browser-one',clientSequence:5,created:1,shiftSessionId:'shift-sync',shiftGeneration:2}};
  const stale=await c.test.coverageSyncServer(req({...requestBody,clientSequence:0,summary:{clientSequence:0}}),staleEnv);
  assert.equal(stale.stale,true,'Coverage sequence zero must not overwrite newer server sequence');
  assert.equal(stale.acceptedSequence,5);
  assert.equal(staleEnv.updates,null,'Coverage stale sync must not write');
}

{
  const {env,token}=await tokenFor('workforce-confirmation-bridge-v1');
  const requestBody={shiftSessionId:'shift-sync',shiftGeneration:2,deviceId:'browser-one',clientSequence:3,summary:{clientSequence:3,interval1:0,interval2:0,interval3:0,activeMs:1000,currentInterval:1,trackerState:'active'}};
  const req=body=>new Request('https://fixture.test/api/workforce/confirmation/sync',{method:'POST',headers:{'content-type':'application/json','X-TT-Confirmation-Bridge':token},body:JSON.stringify(body)});
  await c.test.confirmationSyncServer(req(requestBody),env);
  assert.ok(env.updates && Object.keys(env.updates).some(k=>k.includes('/daily/')),'Confirmation normal sync writes daily record');

  const conflictEnv={...env,updates:null,previous:{deviceId:'other-browser',clientSequence:4,submitted:0,activeMs:1000,shiftSessionId:'shift-sync',shiftGeneration:2}};
  await assert.rejects(c.test.confirmationSyncServer(req(requestBody),conflictEnv),e=>e.code==='CONFIRMATION_DEVICE_CONFLICT');

  const staleEnv={...env,updates:null,previous:{deviceId:'browser-one',clientSequence:5,activeMs:1000,shiftSessionId:'shift-sync',shiftGeneration:2}};
  const stale=await c.test.confirmationSyncServer(req({...requestBody,clientSequence:0,summary:{clientSequence:0,currentInterval:1}}),staleEnv);
  assert.equal(stale.stale,true,'Confirmation sequence zero must not overwrite newer server sequence');
  assert.equal(stale.acceptedSequence,5);
  assert.equal(staleEnv.updates,null,'Confirmation stale sync must not write');
}

assert.equal(c.test.trackerWorkflowRecordHasActivityServer({clientSequence:1},'coverage'),true);
assert.equal(c.test.trackerWorkflowRecordHasActivityServer({activeMs:1},'confirmation'),true);
assert.equal(c.test.trackerWorkflowRecordHasActivityServer({},'coverage'),false);

console.log('PASS M2.9.27 Tracker sync hardening: Coverage + Confirmation reject cross-device active-shift overwrites and sequence-zero stale replays.');

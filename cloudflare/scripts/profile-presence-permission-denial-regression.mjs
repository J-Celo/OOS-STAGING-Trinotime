import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const assets = path.resolve('public/assets/js');
for (const asset of ['j-5a9b0d9aeabc.js','j-b52f8ff97ca5.js']) {
  const raw = fs.readFileSync(path.join(assets,asset),'utf8');
  const begin = raw.indexOf('        let profilePresenceListenerRetryTimer = null;');
  const end = raw.indexOf('        function syncProfilePresenceIdentity() {',begin);
  assert(begin > 0 && end > begin, `${asset}: presence listener source not found`);
  let uid = 'tl-1', deniedFn, successFn, subscriptions=0, refreshes=0, reports=0, scheduled=0;
  const timers = new Set();
  const ctx = {
    PROFILE_PRESENCE_ROOT:'agentPresence',
    fbDb: {ref(name){ assert.equal(name,'agentPresence');return {on(event,ok,error){assert.equal(event,'value');subscriptions++;successFn=ok;deniedFn=error;},off(){}};}},
    firebase:{auth:()=>({currentUser:{get uid(){return uid;}}})},
    workforceFirebaseIdentityTransitionEpoch:10,
    workforceFirebaseIdentityTransitionActive:false,
    workforceRealtimeIdentityReady:()=>true,
    isAdmin:false, isTeamLeader:true, agentSessionAuthenticated:false,
    firebaseLiveFailures:{presence:null},
    firebaseLiveBindingCurrent:given=>given===uid,
    scheduleFirebaseLiveRecovery:()=>{throw new Error('unexpected recovery')},
    isFirebaseLivePermissionError:e=>/permission[-_ ]denied|unauthorized/i.test(String(e?.code||'')+' '+String(e?.message||'')),
    profilePresenceAvailable:false, profilePresence:{}, profilePresenceErrorReported:false,
    profilePresenceListenerAttached:false, profilePresenceListenerRef:null, profilePresenceListenerValueHandler:null,
    profilePresenceBindingEpoch:0,
    reportAppError:()=>reports++, scheduleProfilePresenceUiRefresh:()=>refreshes++,
    socketReportedConnected:false,
    setTimeout:fn=>{scheduled++;const handle={fn};timers.add(handle);return handle;},
    clearTimeout:handle=>timers.delete(handle),
    document:{visibilityState:'visible'},
    console
  };
  vm.createContext(ctx);
  vm.runInContext(raw.slice(begin,end)+'\n globalThis.presenceApi = { ensureProfilePresenceListener, detachProfilePresenceListener };',ctx);
  ctx.presenceApi.ensureProfilePresenceListener();
  assert.equal(subscriptions,1);
  deniedFn({code:'PERMISSION_DENIED',message:'permission_denied at /agentPresence'});
  for(let i=0;i<10;i++)ctx.presenceApi.ensureProfilePresenceListener(true);
  assert.equal(subscriptions,1,`${asset}: same-identity denial should stop further reads`);
  assert.equal(reports,0,`${asset}: denied optional presence should not be reported as application failure`);
  assert.equal(scheduled,0,`${asset}: denied reads must not retry`);
  uid='tl-2'; ctx.presenceApi.ensureProfilePresenceListener();
  assert.equal(subscriptions,2,`${asset}: new signed-in identity must recheck access`);
  successFn({val:()=>({alpha:{session:{online:true}}})});
  assert.equal(ctx.profilePresenceAvailable,true);
  assert(refreshes>=2);
  console.log(`PASS ${asset}: 403 fail-closed, no infinite retries, new identity can rebind`);
}

// Login-gate companion: an optional online counter must not retry rejected
// full-root reads every 1.8 seconds while Firebase rules prohibit them.
{
  const raw=fs.readFileSync(path.join(assets,'j-e61c24a3f6ce.js'),'utf8');
  const begin=raw.indexOf('  function bindFirebaseTelemetry() {');
  const end=raw.indexOf('  function init() {',begin);
  assert(begin>0 && end>begin,'gate telemetry source missing');
  let uid='tl-1', errors=[], count=0, retries=0;
  const state={timeBound:true,presenceBound:false,presenceDeniedUid:null,presenceReady:false,presence:null};
  const db={ref(name){assert.equal(name,'agentPresence'); return {on(type,onValue,onError){assert.equal(type,'value');count++;errors.push(onError);}};}};
  const fb={apps:[{}],auth:()=>({currentUser:{get uid(){return uid;}}}), database:()=>db};
  const ctx={state,window:{firebase:fb},renderPresence:()=>{},markPresenceUnavailable:()=>{state.presenceReady=false;state.presence=null;},scheduleFirebaseRetry:()=>retries++};
  vm.createContext(ctx);
  vm.runInContext(raw.slice(begin,end)+'\n globalThis.bindIt=bindFirebaseTelemetry;',ctx);
  ctx.bindIt();
  assert.equal(count,1);
  errors.at(-1)({code:'PERMISSION_DENIED',message:'permission_denied'});
  for(let i=0;i<10;i++)ctx.bindIt();
  assert.equal(count,1,'gate must not retry denied reads for same identity');
  assert.equal(retries,0);
  uid='tl-2'; ctx.bindIt();
  assert.equal(count,2,'gate should allow a newly authenticated identity');
  console.log('PASS portal telemetry: no repeated denied reads; new identity can check');
}

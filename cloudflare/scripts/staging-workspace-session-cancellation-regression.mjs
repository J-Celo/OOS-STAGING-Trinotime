// STAGING RC2: Superseded workspace response must stay fail-closed, without
// being reported as a Firebase outage; current-session failures stay visible.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read=(name)=>readFileSync(new URL('../public/assets/js/'+name,import.meta.url),'utf8');
for(const file of ['j-5a9b0d9aeabc.js','j-b52f8ff97ca5.js']){
 const source=read(file);
 const handlerStart=source.indexOf('        function handleStorageError(error, source) {');
 const handlerEnd=source.indexOf('        function deepJsonEqual(a, b)',handlerStart);
 assert.ok(handlerStart>=0&&handlerEnd>handlerStart,file+' error handler');
 const ctx={lastConnectionError:null,workforceAuthoritySessionExpiredNoticeAt:0,Date,
  reported:[],status:[],isWorkforceAuthorityAuthenticationError:()=>false,
  isLikelyConnectivityError:(e)=>e.code==='network/disconnected',
  reportAppError(...args){this.reported.push(args)},
  setLiveConnectionState(...args){this.status.push(args)}
 };
 ctx.reportAppError=(...args)=>ctx.reported.push(args);
 ctx.setLiveConnectionState=(...args)=>ctx.status.push(args);
 vm.createContext(ctx);
 vm.runInContext(source.slice(handlerStart,handlerEnd)+'\nglobalThis.reportStorage=handleStorageError;',ctx);
 ctx.reportStorage(Object.assign(new Error('Workspace session changed.'),{code:'live/read-cancelled'}),'read-failed');
 assert.equal(ctx.reported.length,0,'superseded session should not be logged');
 assert.equal(ctx.status.length,0,'superseded session must not look offline');
 assert.equal(ctx.lastConnectionError,null,'superseded session must not poison connection status');
 ctx.reportStorage(Object.assign(new Error('Forbidden'),{code:'permission_denied'}),'read-failed');
 assert.equal(ctx.reported.length,1,'permission errors must not be hidden');
 ctx.reportStorage(Object.assign(new Error('offline'),{code:'network/disconnected'}),'read-failed');
 assert.equal(ctx.status.length,1,'genuine network failure must update connection indicator');
 assert.equal(ctx.lastConnectionError.code,'network/disconnected');
 assert.match(source,/if\(identity!==workspaceReadIdentity\(\)\|\|epoch!==firebaseKvBindingEpoch\)throw Object\.assign\(new Error\('Workspace session changed\.'/,'existing session-identity safety fence retained');
 const hydrationStart=source.indexOf('        // A startup directory request can finish during login, role, or POD');
 const hydrationEnd=source.indexOf('        void hydrateWorkforceDirectoriesFromStorage();',hydrationStart);
 assert.ok(hydrationStart>=0&&hydrationEnd>hydrationStart,file+' hydration');
 const hydrationSource=source.slice(hydrationStart,hydrationEnd);
 const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {resolve,promise};};
 {
   let identity='guest', epoch=1;
   const podPending=deferred();let podApplied=0,leaderApplied=0,refreshes=0;
   const c={firebaseKvBindingEpoch:epoch,fbReady:Promise.resolve(),fbConnected:true,
      workspaceReadIdentity:()=>identity,
      withTimeout:(promise)=>promise,
      POD_DIRECTORY_KEY:'pods',TEAM_LEADER_DIRECTORY_KEY:'leaders',
      appStorage:{get:async(key)=>key==='pods'?podPending.promise:'leaders-data'},
      applyPodDirectoryState:()=>podApplied++,applyTeamLeaderDirectoryState:()=>leaderApplied++,
      refreshPodDirectoryDependentViews:()=>refreshes++,refreshTeamLeaderDirectoryDependentViews:()=>refreshes++,
      podDirectoryServerConfirmed:false,
   };
   vm.createContext(c);
   vm.runInContext(hydrationSource+'\nglobalThis.runHydrate=hydratePodDirectoryFromStorage;',c);
   const job=c.runHydrate();await Promise.resolve();await Promise.resolve();
   identity='agent:jhan';c.firebaseKvBindingEpoch=2;
   podPending.resolve('guest-pods-data');
   assert.equal(await job,false,'old identity must be discarded');
   assert.equal(podApplied,0,'old POD data must never reach the UI');
   assert.equal(leaderApplied,0);
   assert.equal(refreshes,0,'old context should not cause a view flicker');
 }
 {
   const c={firebaseKvBindingEpoch:7,fbReady:Promise.resolve(),fbConnected:true,
      workspaceReadIdentity:()=> 'agent:valid',withTimeout:(promise)=>promise,
      POD_DIRECTORY_KEY:'pods',TEAM_LEADER_DIRECTORY_KEY:'leaders',
      appStorage:{get:async(key)=>key==='pods'?'verified-pods':'verified-leaders'},
      applied:[],applyPodDirectoryState:(v)=>c.applied.push(v),applyTeamLeaderDirectoryState:(v)=>c.applied.push(v),
      refreshPodDirectoryDependentViews:()=>{},refreshTeamLeaderDirectoryDependentViews:()=>{},podDirectoryServerConfirmed:false,
   };
   vm.createContext(c);
   vm.runInContext(hydrationSource+'\nglobalThis.runHydrate=hydrateWorkforceDirectoriesFromStorage;',c);
   await c.runHydrate();
   assert.deepEqual(c.applied,['verified-pods','verified-leaders'],'verified current session must still hydrate');
 }
}
console.log('PASS — Staging session cancellation stays silent and fail-closed; real faults still reported; startup directory reads are identity/epoch fenced');

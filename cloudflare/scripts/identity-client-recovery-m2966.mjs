import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../public/assets/js/j-b52f8ff97ca5.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('        async function identityRenamePendingKey()'),source.indexOf('        function refreshRosterDependentViews()'));
let passed=0;
function fixture({local=new Map(),api,pending=0,admin=false}={}){
  let calls=0,token='original-synthetic-session',refreshes=0;
  const localStorage={getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
  const c={crypto:webcrypto,TextEncoder,Uint8Array,Array,String,JSON,Error,Promise,Date,localStorage,
    isAdmin:admin,firebase:{auth:()=>({currentUser:{uid:'synthetic-admin'}})},workforceSecuritySessionToken:()=>token,
    safeLocalGet:localStorage.getItem,safeLocalSet:localStorage.setItem,safeLocalRemove:localStorage.removeItem,
    currentEmployee:'Old Agent',agentSessionName:'Old Agent',agentSessionPod:'A',historyEmpName:'Old Agent',profileSelectedAgent:'Old Agent',
    beginWorkforceFirebaseIdentityTransition:()=>1,finishWorkforceFirebaseIdentityTransition(){},rosterAuthoritySnapshotPromise:null,scheduleAuthoritySnapshotPromise:null,leaveAuthoritySnapshotPromise:null,overtimeAuthoritySnapshotPromise:null,
    applyScheduleAuthoritySnapshot:async()=>{},applyLeaveAuthoritySnapshot:async()=>{},applyOvertimeAuthoritySnapshot:async()=>{},governanceLoadAnnouncements:async()=>{},personnelLoadSpeedTests:async()=>{},
    employees:[{name:'Old Agent',pod:'A'}],firebaseKvBindingEpoch:1,firebaseFullSnapshotEpoch:1,workspaceReadJob:{},rosterAuthoritySnapshotCache:{},rosterAuthoritySnapshotLoadedAt:1,credentialSecurityListLoadedAt:1,agentSecurityStateCache:new Map(),
    syncAgentSessionLockUi(){},agentAuthStorageKey:v=>v,TrinoPermissions:{require(){}},getPendingSyncSummary:()=>({total:pending,punchEvents:pending}),createMutationToken:()=>webcrypto.randomUUID(),
    rememberWorkforceSecuritySession:t=>{token=t;return true;},rosterAuthoritySnapshot:async()=>{refreshes++;},loadAllFromFirebaseOnce:async()=>{},publishUpdate(){},refreshRosterDependentViews(){},
    securityApiRequest:async(path,options)=>{calls++;assert.equal(path,'identity/rename');assert.equal(options.admin,admin);return api?api(options.body):{ok:true,operationId:options.body.operationId,name:options.body.newName,pod:options.body.pod,securitySessionToken:admin?null:'renewed-session',securitySessionExpiresAt:new Date(Date.now()+60000).toISOString()};}
  };
  vm.createContext(c);vm.runInContext(code,c);
  return {c,local,calls:()=>calls,token:()=>token,refreshes:()=>refreshes};
}
async function test(name,fn){await fn();passed++;console.log('PASS',name);}
await test('dialog sends one operation and updates session and UI identity',async()=>{const f=fixture();await f.c.performRename('Old Agent','New Agent');assert.equal(f.calls(),1);assert.equal(f.c.agentSessionName,'New Agent');assert.equal(f.c.currentEmployee,'New Agent');assert.equal(f.token(),'renewed-session');assert.equal(f.local.size,0);assert.equal(f.c.firebaseKvBindingEpoch,2);});
await test('pending punches prevent submission and remain intact',async()=>{const f=fixture({pending:1});await assert.rejects(f.c.performRename('Old Agent','New Agent'));assert.equal(f.calls(),0);assert.equal(f.local.size,0);});
await test('lost response retains the same operation ID for retry',async()=>{let first,attempt=0;const f=fixture({api:async b=>{if(!attempt++){first=b.operationId;throw Error('lost response');}assert.equal(b.operationId,first);return {ok:true,operationId:b.operationId,name:b.newName,pod:b.pod,securitySessionToken:'renewed'};}});await assert.rejects(f.c.performRename('Old Agent','New Agent'));assert.equal(f.local.size,1);await f.c.performRename('Old Agent','New Agent');assert.equal(f.local.size,0);});
await test('browser restart recovers the saved operation',async()=>{const f=fixture({api:async()=>{throw Error('offline');}});await assert.rejects(f.c.performRename('Old Agent','New Agent'));const saved=JSON.parse([...f.local.values()][0]);const next=fixture({local:f.local,api:async b=>{assert.equal(b.operationId,saved.operationId);return {ok:true,operationId:b.operationId,name:b.newName,pod:b.pod,securitySessionToken:'renewed'};}});assert.equal(await next.c.recoverPendingIdentityRename(),true);assert.equal(next.c.agentSessionName,'New Agent');});
await test('unrelated rename cannot replace pending recovery request',async()=>{const f=fixture({api:async()=>{throw Error('offline');}});await assert.rejects(f.c.performRename('Old Agent','New Agent'));const prior=[...f.local.values()][0];await assert.rejects(f.c.performRename('Old Agent','Different Agent'));assert.equal([...f.local.values()][0],prior);assert.equal(f.calls(),1);});
await test('local persistence failure prevents server mutation',async()=>{const f=fixture();f.c.localStorage.setItem=()=>{throw Error('quota');};await assert.rejects(f.c.performRename('Old Agent','New Agent'));assert.equal(f.calls(),0);});
await test('unconfirmed receipt keeps recovery request',async()=>{const f=fixture({api:async()=>({ok:true,name:'Wrong',operationId:'wrong'})});await assert.rejects(f.c.performRename('Old Agent','New Agent'));assert.equal(f.local.size,1);assert.equal(f.c.agentSessionName,'Old Agent');});
await test('Admin rename uses Admin authorization',async()=>{const f=fixture({admin:true});await f.c.performRename('Old Agent','New Agent');assert.equal(f.calls(),1);});
await test('automatic session refresh attempts rename recovery before ordinary refresh',async()=>{const start=source.indexOf('async function refreshWorkforceSecuritySessionIfNeeded('),end=source.indexOf('async function currentFirebaseSecurityToken(',start),refresh=source.slice(start,end);assert(refresh.indexOf('recoverPendingIdentityRename()')<refresh.indexOf("securityApiRequest('session/refresh'"));});
await test('new dialog performs no browser history deletion or split credential/profile migration',async()=>{assert(!code.includes('appStorage.delete'));assert(!code.includes('secureCredentialRename'));assert(!code.includes('profileAuthorityRename'));assert(!code.includes('saveEmployees'));});
console.log(`${passed} client recovery tests passed (VM; no browser or external service).`);
